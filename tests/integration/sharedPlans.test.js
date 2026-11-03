import { largePlannerDay } from '../fixtures/plannerV3.js';
import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth, appId } from '../../src/services/firebase.js';
import { createPlanPayload, rebuildPlanDays } from '../../src/domain/sharedPlans.js';
import { createSharedPlan, loadSharedPlan, buildSharedPlanUrl, buildEmbeddedPlanUrl } from '../../src/services/sharedPlanRepository.js';
import { DEFAULT_SCHEDULE_I18N } from '../../src/locale.js';

let environment, uid;
const path = id => `artifacts/${appId}/sharedPlans/${id}`;
const registryPath = id => `artifacts/${appId}/shareOwners/${id}`;
const fixture = () => ({ ...createPlanPayload([structuredClone(DEFAULT_SCHEDULE_I18N.zh[0])], { name: '公開計畫' }), v: 2 });
const nextId = () => globalThis.crypto.randomUUID().replaceAll('-', '');
function rawBatch(context, id, payload = fixture(), change = () => {}) {
  const firestore = context.firestore(), rows = rebuildPlanDays(payload);
  const records = [[registryPath(id), { uid, createdAt: serverTimestamp() }],
    [path(id), { v: 2, name: payload.name, dayCount: payload.days.length, createdAt: serverTimestamp() }]];
  payload.days.forEach((day, index) => {
    const parent = `${path(id)}/days/${index}`;
    records.push([parent, { index, name: day.name, offset: day.offset, routine: day.items.map(item => item.id), sessionType: rows[index].sessionType }]);
    day.items.forEach((item, slot) => records.push([`${parent}/doses/${slot}`, structuredClone(item)]));
  });
  change(records);
  const batch = writeBatch(firestore); records.forEach(([path, data]) => batch.set(doc(firestore, path), data));
  return batch.commit();
}
before(async () => {
  environment = await initializeTestEnvironment({ projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'demo-fitness-planner', firestore: { rules: await readFile('firestore.rules', 'utf8') } });
  uid = (await signInAnonymously(auth)).user.uid;
});
beforeEach(async () => { await environment.clearFirestore(); if (!auth.currentUser) uid = (await signInAnonymously(auth)).user.uid; });
after(async () => { await signOut(auth); await environment.cleanup(); });

test('a real short link anonymously reconstructs the exact bounded public copy and hides the registry', async () => {
  const payload = fixture(), id = await createSharedPlan(uid, payload);
  assert.match(id, /^[a-f0-9]{32}$/);
  const anonymous = environment.unauthenticatedContext().firestore();
  const header = (await assertSucceeds(getDoc(doc(anonymous, path(id))))).data();
  assert.deepEqual(Object.keys(header).sort(), ['createdAt', 'dayCount', 'name', 'v']);
  await assertFails(getDoc(doc(anonymous, registryPath(id))));
  await assertFails(getDoc(doc(environment.authenticatedContext('stranger').firestore(), registryPath(id))));
  await assertFails(getDocs(collection(anonymous, `artifacts/${appId}/sharedPlans`)));
  await assertFails(getDocs(collection(anonymous, `artifacts/${appId}/shareOwners`)));
  await assertFails(getDocs(collection(anonymous, `${path(id)}/days`)));
  await assertSucceeds(getDocs(query(collection(anonymous, `${path(id)}/days`), limit(28))));
  await assertFails(getDocs(query(collection(anonymous, `${path(id)}/days`), limit(29))));
  await assertSucceeds(getDocs(query(collection(anonymous, `${path(id)}/days/0/doses`), limit(8))));
  await assertFails(getDocs(query(collection(anonymous, `${path(id)}/days/0/doses`), limit(9))));
  await signOut(auth); assert.deepEqual(await loadSharedPlan(id), payload);
  const location = { origin: 'https://example.test', pathname: '/planner/', search: '?secret=key', hash: '#old' };
  assert.equal(buildSharedPlanUrl(id, location), `https://example.test/planner/#plan=${id}`);
  assert.ok(buildEmbeddedPlanUrl(payload, location).startsWith('https://example.test/planner/#program='));
});

test('28 days and 224 doses with eight preparation sets commit in 254 writes within rule budgets', async () => {
  const routine = Array.from({ length: 8 }, (_, index) => `bf_B0${index + 1}`);
  const prescriptions = routine.map(id => ({ id, phase: 'strength', sets: 2, value: '6', unit: 'reps', restSeconds: 60, perSide: false,
    preparation: { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: false, instruction: 'PRIVATE_INSTRUCTION' } }));
  const payload = { ...createPlanPayload(Array.from({ length: 28 }, (_, offset) => ({ offset, routine, prescriptions })), { name: 'Four weeks' }), v: 2 };
  const id = await createSharedPlan(uid, payload);
  assert.deepEqual(await loadSharedPlan(id), payload);
  assert.equal(JSON.stringify(payload).includes('PRIVATE_INSTRUCTION'), false);
});

test('signed-out and foreign users cannot publish copies for another owner', async () => {
  await assertFails(rawBatch(environment.unauthenticatedContext(), nextId()));
  await assertFails(rawBatch(environment.authenticatedContext('stranger'), nextId()));
  await assert.rejects(createSharedPlan('stranger', fixture()), /SESSION_CHANGED/);
});

test('public headers, days and doses reject private fields, unknown IDs and unsafe prescriptions atomically', async () => {
  const context = environment.authenticatedContext(uid);
  const mutations = [
    records => { records[1][1].health = 'private'; },
    records => { records[2][1].actualWeight = 80; },
    records => { records[3][1].uid = 'private'; },
    records => { records[3][1].weight = 80; },
    records => { records[3][1].id = 'private-custom'; },
    records => { records[3][1].sets = 6; },
    records => { records[3][1].value = '0'; },
    records => { records[3][1].value = '8–4'; },
    records => { records[3][1].preparation = { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: false, instruction: 'private' }; },
  ];
  for (const change of mutations) {
    const id = nextId(); await assertFails(rawBatch(context, id, fixture(), change));
    assert.equal((await getDoc(doc(environment.unauthenticatedContext().firestore(), path(id)))).exists(), false);
  }
});

test('public documents are immutable and even their owner cannot fill missing slots after publication', async () => {
  const id = await createSharedPlan(uid, fixture()), context = environment.authenticatedContext(uid), firestore = context.firestore();
  await assertFails(setDoc(doc(firestore, path(id)), { v: 2, name: 'Overwrite', dayCount: 1, createdAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(firestore, `${path(id)}/days/0/doses/0`)));
  const item = fixture().days[0].items[0];
  await assertFails(setDoc(doc(firestore, `${path(id)}/days/0/doses/7`), item));
  await assertFails(setDoc(doc(environment.authenticatedContext('stranger').firestore(), `${path(id)}/days/0/doses/7`), item));
  await assertFails(setDoc(doc(firestore, registryPath(id)), { uid, createdAt: serverTimestamp() }));
});

test('eight-slot bounds, sequence and power constraints are enforced by public rules', async () => {
  const context = environment.authenticatedContext(uid);
  await assertFails(rawBatch(context, nextId(), fixture(), records => { records.push([records[3][0].replace('/doses/0', '/doses/8'), records[3][1]]); }));
  const jumping = createPlanPayload([{ routine: ['bf_E03'] }], { name: 'Jump' });
  await assertFails(rawBatch(context, nextId(), jumping, records => { records[3][1].phase = 'strength'; }));
  await assertFails(rawBatch(context, nextId(), jumping, records => { Object.assign(records[3][1], { sets: 5, value: '6', perSide: true }); }));
  const sequence = createPlanPayload([{ routine: ['bf_A13'] }], { name: 'Sequence' });
  await assertFails(rawBatch(context, nextId(), sequence, records => { records[3][1].value = '1'; }));
});

test('loading fails closed for incomplete or cross-document inconsistent public copies', async () => {
  const context = environment.authenticatedContext(uid), id = nextId();
  await assertSucceeds(rawBatch(context, id, fixture(), records => { records.pop(); }));
  await assert.rejects(loadSharedPlan(id), /INVALID_PLAN_SHARE/);
  await assert.rejects(loadSharedPlan('bad/id'), /INVALID_PLAN_SHARE/);
});


test('v3 28-day 672-dose public copy publishes through bounded checkpoints and round-trips all 24 items', async () => {
  const payload = createPlanPayload(Array.from({ length: 28 }, (_, offset) => ({ ...largePlannerDay(), date: undefined, offset })), { name: 'Independent exercises' });
  assert.equal(payload.v, 3); assert.equal(payload.days[0].items.length, 24);
  const id = await createSharedPlan(uid, payload);
  const anonymous = environment.unauthenticatedContext().firestore();
  const header = (await assertSucceeds(getDoc(doc(anonymous, path(id))))).data();
  assert.equal(header.status, 'complete'); assert.equal(header.completedDays, 28);
  assert.deepEqual(await loadSharedPlan(id), payload);
  assert.equal((await getDocs(query(collection(anonymous, `${path(id)}/days/0/doses`), limit(14)))).size, 14);
});

test('v3 interrupted publication is unreadable; incomplete checkpoints, foreign publishers and mutation fail', async () => {
  const firestore = environment.authenticatedContext(uid).firestore(), anonymous = environment.unauthenticatedContext().firestore();
  const id = nextId(), payload = createPlanPayload([largePlannerDay()], { name: 'Interrupted' });
  const initial = writeBatch(firestore);
  initial.set(doc(firestore, registryPath(id)), { uid, createdAt: serverTimestamp() });
  initial.set(doc(firestore, path(id)), { v: 3, name: payload.name, dayCount: 1, status: 'building', completedDays: 0, createdAt: serverTimestamp() });
  await assertSucceeds(initial.commit());
  await assertFails(getDoc(doc(anonymous, path(id))));
  await assertFails(getDocs(query(collection(anonymous, `${path(id)}/days`), limit(28))));
  const day = payload.days[0], parent = `${path(id)}/days/0`;
  await assertSucceeds(setDoc(doc(firestore, parent), { index: 0, name: day.name, offset: 0, routine: day.items.map(item => item.id), sessionType: 'training' }));
  await assertFails(getDoc(doc(anonymous, parent)));
  await assertFails(getDocs(query(collection(anonymous, `${parent}/doses`), limit(14))));
  await assertFails(updateDoc(doc(firestore, path(id)), { completedDays: 1, status: 'complete' }));
  await assertFails(setDoc(doc(firestore, `${parent}/doses/proof0`), { v: 3, count: 6 }));
  await assertFails(setDoc(doc(environment.authenticatedContext('stranger').firestore(), `${parent}/doses/0`), { v: 3, items: day.items.slice(0, 2) }));
  const wrong = structuredClone(day.items.slice(0, 2)); wrong[0].id = 'private-custom';
  await assertFails(setDoc(doc(firestore, `${parent}/doses/0`), { v: 3, items: wrong }));
  await assertSucceeds(setDoc(doc(firestore, `${parent}/doses/4`), { v: 3, items: day.items.slice(8, 10) }));
  const batch = writeBatch(firestore);
  for (let slot = 0; slot < 12; slot++) if (slot !== 4) batch.set(doc(firestore, `${parent}/doses/${slot}`), { v: 3, items: day.items.slice(slot * 2, slot * 2 + 2) });
  batch.set(doc(firestore, `${parent}/doses/proof0`), { v: 3, count: 6 });
  batch.set(doc(firestore, `${parent}/doses/proof1`), { v: 3, count: 6 });
  batch.update(doc(firestore, path(id)), { completedDays: 1, status: 'complete' });
  await assertSucceeds(batch.commit());
  assert.deepEqual(await loadSharedPlan(id), payload);
  await assertFails(updateDoc(doc(firestore, `${parent}/doses/0`), { items: day.items.slice(2, 4) }));
  await assertFails(setDoc(doc(firestore, `${parent}/doses/12`), { v: 3, items: day.items.slice(0, 2) }));
});

test('v3 checkpoints cannot skip or replay days, reuse earlier proofs, or publish missing dose fields', async () => {
  const firestore = environment.authenticatedContext(uid).firestore(), id = nextId();
  const payload = createPlanPayload([0, 1].map(offset => ({ ...largePlannerDay(), date: undefined, offset })), { name: 'Two immutable days' });
  const header = doc(firestore, path(id)), initial = writeBatch(firestore);
  initial.set(doc(firestore, registryPath(id)), { uid, createdAt: serverTimestamp() });
  initial.set(header, { v: 3, name: payload.name, dayCount: 2, status: 'building', completedDays: 0, createdAt: serverTimestamp() });
  await initial.commit();
  const addDay = async (index, includeDoses = true) => {
    const day = payload.days[index], parent = `${path(id)}/days/${index}`, batch = writeBatch(firestore);
    batch.set(doc(firestore, parent), { index, name: day.name, offset: index, routine: day.items.map(item => item.id), sessionType: 'training' });
    if (includeDoses) {
      for (let slot = 0; slot < 12; slot++) batch.set(doc(firestore, `${parent}/doses/${slot}`), { v: 3, items: day.items.slice(slot * 2, slot * 2 + 2) });
      for (let group = 0; group < 2; group++) batch.set(doc(firestore, `${parent}/doses/proof${group}`), { v: 3, count: 6 });
      batch.update(header, { completedDays: index + 1, status: index === 1 ? 'complete' : 'building' });
    }
    await batch.commit();
  };
  await addDay(0);
  await assertFails(updateDoc(header, { completedDays: 0, status: 'building' }));
  await assertFails(updateDoc(header, { completedDays: 2, status: 'complete' }));
  await assertFails(setDoc(doc(firestore, `${path(id)}/days/0/doses/12`), { v: 3, items: payload.days[0].items.slice(0, 2) }));
  await assertFails(setDoc(doc(firestore, `${path(id)}/days/0/doses/proof0`), { v: 3, count: 6 }));
  await addDay(1, false);
  await assertFails(updateDoc(header, { completedDays: 2, status: 'complete' }));
  await assertFails(setDoc(doc(firestore, `${path(id)}/days/1/doses/proof0`), { v: 3, count: 6 }));
  for (const field of ['id', 'phase', 'sets', 'value', 'unit', 'restSeconds', 'perSide']) {
    const items = structuredClone(payload.days[1].items.slice(8, 10)); delete items[0][field];
    await assertFails(setDoc(doc(firestore, `${path(id)}/days/1/doses/4`), { v: 3, items }));
  }
});
