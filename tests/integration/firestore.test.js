import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, query, orderBy, documentId, limit, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { GoogleAuthProvider, linkWithCredential, signInAnonymously, signInWithCredential, signOut } from 'firebase/auth';
import { auth } from '../../src/services/firebase.js';
import { userDoc, userCollection, weekHistoryQuery, captureGuestData, setCompletion, saveFeedback, savePlan, saveMeasurement, importGuestData } from '../../src/services/repository.js';
import { LEGACY_DEFAULT_SCHEDULE_I18N, DEFAULT_SCHEDULE_I18N, EXERCISES_I18N } from '../../src/locale.js';

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
test('hosted trial controls and quota records are unavailable to clients', async () => {
  const ownerDb = userDoc(uid, 'profile', 'settings').firestore;
  for (const path of ['aiTrialConfig/runtime', 'aiTrialQuota/user-weeks', `aiTrialQuota/${uid}/weeks/2026-W40`, 'aiTrialQuota/daily/limits/2026-10-14']) {
    await assertFails(getDoc(doc(ownerDb, path)));
    await assertFails(setDoc(doc(ownerDb, path), { enabled: true, attempts: 0 }));
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), path)));
  }
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
test('preview adoption saves matching completion marks atomically and ignores foreign slots', async () => {
  const free = { conclusion: 'Preview', schedule: DEFAULT_SCHEDULE_I18N.zh, source: 'template' };
  await setCompletion(uid, week, 1, 'thoracic', true, EXERCISES_I18N.zh.thoracic, plan.schedule);
  await savePlan(uid, week, free, plan, false, 0, { day1_bf_A01: true, day3_bf_F01: true,
    day1_private_invented: true, day5_bf_F01: true, day2_bf_A02: false });
  const current = (await getDoc(userDoc(uid, 'progress', week))).data();
  assert.equal(current.completed.day1_bf_A01, true);
  assert.equal(current.completed.day3_bf_F01, true);
  assert.equal(current.completed.day1_thoracic, true);
  assert.equal(current.completed.day1_private_invented, undefined);
  assert.equal(current.completed.day5_bf_F01, undefined);
  assert.equal(current.completed.day2_bf_A02, undefined);
  assert.match(current.completedAt.day1_bf_A01, /^\d{4}-\d{2}-\d{2}$/);
  await assert.rejects(savePlan(uid, week, { ...free, forbidden: true }, plan, false, 1, { day1_bf_B01: true }));
  assert.deepEqual((await getDoc(userDoc(uid, 'progress', week))).data(), current);
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
test('phases, preparation and recovery instructions persist at the full eight-exercise limit', async () => {
  const base = structuredClone(DEFAULT_SCHEDULE_I18N.zh[3]);
  base.routine.splice(2, 0, 'bf_A03'); base.routine.push('bf_H03');
  base.prescriptions.push({ id: 'bf_A03', ...EXERCISES_I18N.zh.bf_A03.prescription, phase: 'warmup' }, { id: 'bf_H03', ...EXERCISES_I18N.zh.bf_H03.prescription, phase: 'cooldown' });
  const full = { conclusion: 'Complete phased plan', schedule: [1, 2, 3, 4, 5].map(day => ({ ...structuredClone(base), day })) };
  assert.equal(base.routine.length, 8);
  await assertSucceeds(savePlan(uid, week, full, plan, false, 0));
  assert.deepEqual((await getDoc(userDoc(uid, 'plans', week))).data().schedule, full.schedule);
  const bad = structuredClone(full); bad.schedule[0].prescriptions[0].phase = 'invented';
  await assert.rejects(savePlan(uid, week, bad, plan, false, 1));
  const badPrep = structuredClone(full); badPrep.schedule[0].prescriptions.find(dose => dose.preparation).preparation.sets = 5;
  await assert.rejects(savePlan(uid, week, badPrep, plan, false, 1));
  assert.equal((await getDoc(userDoc(uid, 'plans', week))).data().revision, 1);
  const everyPrep = structuredClone(full);
  const preparation = base.prescriptions.find(dose => dose.preparation).preparation;
  for (const day of everyPrep.schedule) for (const dose of day.prescriptions) dose.preparation = preparation;
  await assertSucceeds(savePlan(uid, week, everyPrep, plan, false, 1));
  assert.equal((await getDoc(userDoc(uid, 'plans', week))).data().revision, 2);
  const legacyDoses = structuredClone(full);
  for (const day of legacyDoses.schedule) {
    delete day.sessionType; delete day.warmupNote; delete day.cooldownNote;
    day.routine = day.routine.slice(0, 6);
    day.prescriptions = day.prescriptions.filter(dose => day.routine.includes(dose.id));
    for (const dose of day.prescriptions) { delete dose.phase; delete dose.preparation; }
  }
  await assertSucceeds(savePlan(uid, week, legacyDoses, plan, false, 2));
  assert.deepEqual((await getDoc(userDoc(uid, 'plans', week))).data().schedule, legacyDoses.schedule);
});
test('phased plans need matching fresh daily proofs; legacy writes remain compatible and proofs are private', async () => {
  const phased = { conclusion: 'Phased', schedule: DEFAULT_SCHEDULE_I18N.zh, validationVersion: 1 };
  await assertFails(setDoc(userDoc(uid, 'plans', week), phased));
  await assertSucceeds(setDoc(userDoc(uid, 'plans', week), plan));
  await savePlan(uid, week, phased, plan, false, 0);
  await assertFails(setDoc(userDoc(uid, 'plans', week), phased));
  const first = userDoc(uid, 'planDays', `${week}-D1-P1`);
  const original = (await getDoc(first)).data();
  const path = first.path;
  await assertFails(getDoc(doc(environment.authenticatedContext('stranger').firestore(), path)));
  await assertFails(setDoc(doc(environment.authenticatedContext('stranger').firestore(), path), { ...original, savedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), path)));
  const batch = writeBatch(first.firestore);
  for (const day of phased.schedule) for (const part of [1, 2]) {
    batch.set(userDoc(uid, 'planDays', `${week}-D${day.day}-P${part}`), { ...day, savedAt: serverTimestamp() });
  }
  const mismatch = structuredClone(phased); mismatch.schedule[0].warmupNote = 'Changed only in the weekly document';
  batch.set(userDoc(uid, 'plans', week), mismatch);
  await assertFails(batch.commit());
  assert.deepEqual((await getDoc(first)).data(), original, 'a mismatched weekly snapshot rolls back every daily proof');
  assert.equal((await getDoc(userDoc(uid, 'plans', week))).data().revision, 1);
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

test('saved weekly intent survives editing and restore while rules bound its fields', async () => {
  const owner = auth.currentUser.uid;
  const weeklyIntent = { focus: 'stability', targetRegions: ['upper', 'core'], stiffnessRegions: ['thoracic'],
    badmintonDays: [2, 5, 6], dailyTime: 35, competitionDate: '2026-11-16' };
  const original = { ...plan, weeklyIntent };
  await assertSucceeds(savePlan(owner, week, original, plan, false, 0));
  assert.deepEqual((await getDoc(userDoc(owner, 'plans', week))).data().weeklyIntent, weeklyIntent);
  await assertSucceeds(savePlan(owner, week, { ...original, weeklyIntent: { ...weeklyIntent, focus: 'strength' } }, plan, false, 1));
  await assertSucceeds(savePlan(owner, week, null, plan, true, 2));
  assert.deepEqual((await getDoc(userDoc(owner, 'plans', week))).data().weeklyIntent, weeklyIntent);
  for (const change of [{ targetRegions: ['fake'] }, { targetRegions: ['core', 'core'] }, { stiffnessRegions: ['hip', 'ankle', 'thoracic'] },
    { badmintonDays: [8] }, { dailyTime: 1000 }, { focus: 'medical' }, { healthNotes: 'not part of intent' }]) {
    await assertFails(setDoc(userDoc(owner, 'plans', week), { ...plan, weeklyIntent: { ...weeklyIntent, ...change } }));
  }
});
