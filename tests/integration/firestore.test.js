import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, query, orderBy, documentId, limit, setDoc } from 'firebase/firestore';
import { GoogleAuthProvider, linkWithCredential, signInAnonymously, signInWithCredential, signOut } from 'firebase/auth';
import { auth } from '../../src/services/firebase.js';
import { userDoc, userCollection, weekHistoryQuery, captureGuestData, setCompletion, saveFeedback, savePlan, saveMeasurement, importGuestData } from '../../src/services/repository.js';
import { LEGACY_DEFAULT_SCHEDULE_I18N, EXERCISES_I18N } from '../../src/locale.js';

const week = '2026-W40';
const plan = { conclusion: 'test', schedule: LEGACY_DEFAULT_SCHEDULE_I18N.zh, source: 'manual' };
let environment;
let uid;
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-fitness-planner', firestore: { rules: await readFile('firestore.rules', 'utf8') } });
  uid = (await signInAnonymously(auth)).user.uid;
});
beforeEach(async () => { await environment.clearFirestore(); });
after(async () => { await signOut(auth); await environment.cleanup(); });

test('anonymous owners can read/write their records; strangers and signed-out users cannot', async () => {
  await assertSucceeds(setDoc(userDoc(uid, 'metrics', '2026-10-13'), { date: '2026-10-13', weight: 70 }));
  const path = `artifacts/my-fitness-app-yp/users/${uid}/metrics/2026-10-13`;
  await assertFails(getDoc(doc(environment.authenticatedContext('stranger').firestore(), path)));
  await assertFails(setDoc(doc(environment.authenticatedContext('stranger').firestore(), path), { date: '2026-10-13', weight: 90 }));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), path)));
});
test('server rules reject invalid measurements, difficulty, unknown fields and malformed progress/plans', async () => {
  for (const fields of [{ weight: -1 }, { bodyFat: 101 }, { age: 20.5 }, { weight: 70, admin: true }]) {
    await assertFails(setDoc(userDoc(uid, 'metrics', '2026-10-13'), { date: '2026-10-13', ...fields }));
  }
  await assertFails(setDoc(userDoc(uid, 'profile', 'settings'), { difficultyLevel: 3 }));
  await assertFails(setDoc(userDoc(uid, 'progress', week), { completed: { day1_thoracic: 'yes' } }));
  await assertFails(setDoc(userDoc(uid, 'plans', week), { conclusion: 'bad', schedule: [] }));
});
test('owner collection queries and missing settings documents can be read', async () => {
  for (const group of ['progress', 'plans']) await assertSucceeds(getDocs(weekHistoryQuery(uid, group, 104, week)));
  await assertSucceeds(getDocs(query(userCollection(uid, 'metrics'), orderBy('date', 'desc'), limit(365))));
  await assertSucceeds(getDocs(query(userCollection(uid, 'progress'), orderBy(documentId()), limit(1))));
  await assertSucceeds(getDoc(userDoc(uid, 'profile', 'settings')));
  await assertSucceeds(getDoc(userDoc(uid, 'exercises', 'custom')));
});
test('concurrent completion writes retain both fields', async () => {
  await Promise.all([
    setCompletion(uid, week, 1, 'thoracic', true, EXERCISES_I18N.zh.thoracic, plan.schedule),
    setCompletion(uid, week, 1, 'single_dl', true, EXERCISES_I18N.zh.single_dl, plan.schedule),
  ]);
  const result = (await getDoc(userDoc(uid, 'progress', week))).data();
  assert.equal(result.completed.day1_thoracic, true);
  assert.equal(result.completed.day1_single_dl, true);
  assert.match(result.completedAt.day1_thoracic, /^\d{4}-\d{2}-\d{2}$/);
});
test('feedback repeats and replacement update profile and progress consistently', async () => {
  await saveFeedback(uid, week, 1);
  await saveFeedback(uid, week, 1);
  assert.equal((await getDoc(userDoc(uid, 'profile', 'settings'))).data().difficultyLevel, 2);
  await saveFeedback(uid, week, 0);
  assert.equal((await getDoc(userDoc(uid, 'profile', 'settings'))).data().difficultyLevel, 1);
  assert.equal((await getDoc(userDoc(uid, 'progress', week))).data().feedbackValue, 0);
});
test('plan saving preserves completed history; persisted restore keeps it after reload', async () => {
  await setCompletion(uid, week, 1, 'thoracic', true, EXERCISES_I18N.zh.thoracic, plan.schedule);
  const modified = { ...plan, schedule: plan.schedule.map(day => ({ ...day, routine: day.routine.filter(id => id !== 'thoracic') })) };
  await savePlan(uid, week, modified, plan, false, 0);
  let current = (await getDoc(userDoc(uid, 'plans', week))).data();
  assert.deepEqual(current.previous.schedule, plan.schedule);
  assert.equal((await getDoc(userDoc(uid, 'progress', week))).data().completed.day1_thoracic, true);
  await savePlan(uid, week, null, plan, true, current.revision);
  current = (await getDoc(userDoc(uid, 'plans', week))).data();
  assert.deepEqual(current.schedule, plan.schedule);
  assert.deepEqual((await getDoc(userDoc(uid, 'progress', week))).data().scheduleSnapshot, plan.schedule);
});
test('a rejected plan write rolls back the progress snapshot and stale revisions cannot overwrite', async () => {
  await savePlan(uid, week, plan, plan, false, 0);
  const before = (await getDoc(userDoc(uid, 'progress', week))).data();
  await assert.rejects(savePlan(uid, week, { ...plan, forbidden: true }, plan, false, 1));
  assert.deepEqual((await getDoc(userDoc(uid, 'progress', week))).data(), before);
  await assert.rejects(savePlan(uid, week, plan, plan, false, 0), /PLAN_CHANGED/);
  assert.equal((await getDoc(userDoc(uid, 'plans', week))).data().revision, 1);
});
test('AI doses and empty recovery days persist, restore, and reject invalid prescriptions', async () => {
  const prescribed = { ...plan, schedule: plan.schedule.map(day => ({ ...day, routine: [], prescriptions: [] })) };
  prescribed.schedule[0].routine = ['thoracic'];
  prescribed.schedule[0].prescriptions = [{ id: 'thoracic', sets: 1, value: '5', unit: 'minutes', restSeconds: 0, perSide: false }];
  await savePlan(uid, week, prescribed, plan, false, 0);
  assert.deepEqual((await getDoc(userDoc(uid, 'plans', week))).data().schedule, prescribed.schedule);
  const wrong = structuredClone(prescribed); wrong.schedule[0].prescriptions[0].sets = -1;
  await assert.rejects(savePlan(uid, week, wrong, plan, false, 1));
  assert.equal((await getDoc(userDoc(uid, 'plans', week))).data().revision, 1);
  await savePlan(uid, week, plan, plan, false, 1);
  await savePlan(uid, week, null, plan, true, 2);
  assert.deepEqual((await getDoc(userDoc(uid, 'plans', week))).data().schedule, prescribed.schedule);
});
test('partial measurement updates preserve previously recorded fields', async () => {
  await saveMeasurement(uid, { date: '2026-10-13', weight: 70, bodyFat: 18 });
  await saveMeasurement(uid, { date: '2026-10-13', weight: 72 });
  const values = (await getDoc(userDoc(uid, 'metrics', '2026-10-13'))).data();
  assert.deepEqual(values, { date: '2026-10-13', weight: 72, bodyFat: 18 });
});
test('guest import can be retried without replacing existing measurements or losing completed work', async () => {
  await saveMeasurement(uid, { date: '2026-10-13', weight: 80 });
  await setDoc(userDoc(uid, 'progress', week), { completed: { day1_thoracic: false, day2_pull_up: true } });
  const records = [
    { group: 'metrics', id: '2026-10-13', data: { date: '2026-10-13', weight: 70 } },
    { group: 'progress', id: week, data: { completed: { day1_thoracic: true } } },
  ];
  await importGuestData(uid, records); await importGuestData(uid, records);
  assert.equal((await getDoc(userDoc(uid, 'metrics', '2026-10-13'))).data().weight, 80);
  assert.deepEqual((await getDoc(userDoc(uid, 'progress', week))).data().completed, { day1_thoracic: true, day2_pull_up: true });
});
test('writes reject stale signed-out session UIDs', async () => {
  await assert.rejects(saveMeasurement('another-user', { date: '2026-10-13', weight: 70 }), /SESSION_CHANGED/);
});
test('linking a new Google identity retains the anonymous UID and records', async () => {
  await saveMeasurement(uid, { date: '2026-10-13', weight: 70 });
  const credential = GoogleAuthProvider.credential(JSON.stringify({ sub: 'new-google-identity', email: 'new@example.test' }));
  const result = await linkWithCredential(auth.currentUser, credential);
  assert.equal(result.user.uid, uid);
  assert.equal(result.user.isAnonymous, false);
  assert.equal((await getDoc(userDoc(uid, 'metrics', '2026-10-13'))).data().weight, 70);
});
test('actual identity switching can import captured guest plans and keep existing account data', async () => {
  const credential = GoogleAuthProvider.credential(JSON.stringify({ sub: 'existing-google-identity', email: 'existing@example.test' }));
  const target = (await signInWithCredential(auth, credential)).user.uid;
  await saveMeasurement(target, { date: '2026-10-13', weight: 80 });
  await signOut(auth);
  const guest = (await signInAnonymously(auth)).user.uid;
  await saveMeasurement(guest, { date: '2026-10-13', weight: 70 });
  await savePlan(guest, week, plan, plan, false, 0);
  await setCompletion(guest, week, 1, 'thoracic', true, EXERCISES_I18N.zh.thoracic, plan.schedule);
  const records = await captureGuestData(guest);
  await signInWithCredential(auth, credential);
  await importGuestData(target, JSON.parse(JSON.stringify(records)));
  assert.equal((await getDoc(userDoc(target, 'metrics', '2026-10-13'))).data().weight, 80);
  assert.equal((await getDoc(userDoc(target, 'progress', week))).data().completed.day1_thoracic, true);
  assert.deepEqual((await getDoc(userDoc(target, 'plans', week))).data().schedule, plan.schedule);
});
