import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { getDoc, getDocs, writeBatch } from 'firebase/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from '../../src/services/firebase.js';
import { userDoc, userCollection, setCompletion, captureGuestData, importGuestData } from '../../src/services/repository.js';
import { applyPeriodPlan, loadPeriodState } from '../../src/services/periodRepository.js';
import { saveTrainingLog, plannedSnapshot } from '../../src/services/trainingRepository.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { dailyWarmupPrescriptions } from '../../src/domain/quickWorkouts.js';
import { DOSES_PER_CHUNK } from '../../src/domain/plannerLimits.js';
import { getWeekString, localDate } from '../../src/domain/dates.js';
import { trainingLogId } from '../../src/domain/coaching.js';
import { SESSION_PHASES } from '../../src/domain/phases.js';

if (process.env.NODE_ENV !== 'test' || process.env.VITE_USE_FIREBASE_EMULATORS !== 'true' || process.env.VITE_FIREBASE_PROJECT_ID !== 'demo-fitness-planner') throw new Error('Requires demo-fitness-planner emulators.');
const date = localDate(), week = getWeekString();
const day = new Date(`${date}T12:00:00`).getDay() || 7;
const exercises = catalogExercises();
const range = { from: date, to: date };
const extra = ['A02', 'A03', 'A04', 'A05', 'A08', 'A09', 'A11', 'A14', 'B13', 'B14', 'B15', 'B16', 'B17', 'C12', 'C13', 'D09'];
const prescriptions = [...dailyWarmupPrescriptions(), ...extra.map(code => ({ id: `bf_${code}`, ...exercises[`bf_${code}`].prescription,
  phase: code === 'D09' ? 'cooldown' : /^[BC]/.test(code) || code === 'A08' ? 'accessory' : 'warmup' }))]
  .sort((a, b) => SESSION_PHASES.indexOf(a.phase) - SESSION_PHASES.indexOf(b.phase));
const session = { date, week, day, name: '24 independent exercises', theme: '', concept: '', coachAdvice: '', warmupNote: 'Eight independent movements.',
  cooldownNote: 'Easy breathing.', sessionType: 'training', routine: prescriptions.map(dose => dose.id), prescriptions };
let environment, uid;
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-fitness-planner', firestore: { rules: await readFile('firestore.rules', 'utf8') } });
  uid = (await signInAnonymously(auth)).user.uid;
});
beforeEach(async () => { await environment.clearFirestore(); });
after(async () => { await signOut(auth); await environment.cleanup(); });
const apply = async () => applyPeriodPlan(uid, { range, sessions: [session], profile: { time: 240, context: { healthStatus: 'unrestricted' } },
  expectedState: (await loadPeriodState(uid, range)).expectedState });
function record(id = 'bf_B17') {
  const dose = prescriptions.find(item => item.id === id);
  return { week, day, date, exerciseId: id, variant: 'bodyweight', loadKg: null, loadBasis: 'none', resistanceLabel: '', unit: dose.unit,
    perSide: dose.perSide, sets: [{ value: 1, otherSide: dose.perSide ? 1 : null }], rir: null, quality: 'unknown', symptoms: 'unknown',
    nextDay: 'pending', planned: plannedSnapshot(dose), schemaVersion: 1 };
}

test('actual records resolve later v3 chunks and retain their original planned facts without marking completion', async () => {
  await apply();
  const actual = record();
  await saveTrainingLog(uid, actual, { expectedRevision: 1 });
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(actual)))).data(), actual);
  assert.deepEqual((await getDoc(userDoc(uid, 'progress', week))).data().completed || {}, {});
  await assert.rejects(saveTrainingLog(uid, { ...actual, planned: { ...actual.planned, value: '99' } }, { expectedRevision: 1 }), /LOG_CHANGED/);
  await assert.rejects(saveTrainingLog(uid, actual, { expectedRevision: 0 }), /PLAN_CHANGED/);
  await saveTrainingLog(uid, { ...actual, quality: 'good' }, { expectedRevision: 1 });
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(actual)))).data().planned, actual.planned);
});

test('completion snapshots join all independent doses and a new actual cannot forge its planned dose', async () => {
  await apply();
  await setCompletion(uid, week, day, 'bf_A16', true, exercises.bf_A16);
  const progress = (await getDoc(userDoc(uid, 'progress', week))).data();
  assert.deepEqual(Object.entries(progress.completed).filter(([, value]) => value), [[`day${day}_bf_A16`, true]]);
  const snapshot = progress.scheduleSnapshot.find(item => item.day === day);
  assert.equal(snapshot.routine.length, 24);
  assert.equal(snapshot.prescriptions.length, 24);
  assert.equal(Object.hasOwn(snapshot, 'v'), false);
  assert.deepEqual(snapshot.prescriptions, prescriptions);
  for (const id of ['bf_C12', 'bf_C13']) await setCompletion(uid, week, day, id, true, exercises[id]);
  const controls = (await getDoc(userDoc(uid, 'progress', week))).data();
  for (const id of ['bf_C12', 'bf_C13']) assert.equal(controls.completed[`day${day}_${id}`], true, 'new scapular controls support independent completion');
  const actual = record();
  await assert.rejects(saveTrainingLog(uid, { ...actual, planned: { ...actual.planned, value: '99' } }, { expectedRevision: 1 }), /PLAN_CHANGED/);
  assert.equal((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(actual)))).exists(), false);
});

test('guest migration copies 24-dose chunks atomically, retries idempotently and preserves one actual completion', async () => {
  await apply();
  await setCompletion(uid, week, day, 'bf_A16', true, exercises.bf_A16);
  const actual = record();
  await saveTrainingLog(uid, actual, { expectedRevision: 1 });
  const captured = await captureGuestData(uid);
  assert.equal(captured.filter(item => item.group === 'dateDoses').length, Math.ceil(24 / DOSES_PER_CHUNK));
  await signOut(auth);
  uid = (await signInAnonymously(auth)).user.uid;
  const incomplete = captured.filter(item => item.group !== 'dateDoses' || !item.id.endsWith('__0'));
  await assert.rejects(importGuestData(uid, incomplete), /INVALID_IMPORT/);
  assert.equal((await getDoc(userDoc(uid, 'dateSessions', date))).exists(), false);
  await importGuestData(uid, captured);
  await importGuestData(uid, captured);
  assert.equal((await getDocs(userCollection(uid, 'dateDoses'))).size, Math.ceil(24 / DOSES_PER_CHUNK));
  assert.deepEqual((await loadPeriodState(uid, range)).sessionsByDate[date].prescriptions, prescriptions);
  assert.deepEqual((await getDoc(userDoc(uid, 'progress', week))).data().completed, { [`day${day}_bf_A16`]: true });
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(actual)))).data(), actual);
});

test('legacy per-exercise dates and completed sequence facts remain one historical movement after migration', async () => {
  const dose = { id: 'bf_A13', ...exercises.bf_A13.prescription, phase: 'warmup' };
  const metadata = { date, week, day, name: 'Historical sequence', theme: '', concept: '', coachAdvice: '', warmupNote: 'Historical sequence.',
    cooldownNote: 'Optional.', sessionType: 'training', routine: ['bf_A13'], revision: 1, periodId: 'legacy-migration' };
  const ref = userDoc(uid, 'dateSessions', date), batch = writeBatch(ref.firestore);
  batch.set(ref, metadata);
  batch.set(userDoc(uid, 'dateDoses', `${date}_bf_A13`), { date, exerciseId: dose.id, revision: 1, dose });
  await batch.commit();
  await setCompletion(uid, week, day, dose.id, true, exercises.bf_A13);
  const actual = { ...record(), exerciseId: dose.id, unit: dose.unit, perSide: dose.perSide, sets: [{ value: 1, otherSide: null }], planned: plannedSnapshot(dose) };
  await saveTrainingLog(uid, actual, { expectedRevision: 1 });
  const captured = await captureGuestData(uid);
  await signOut(auth);
  uid = (await signInAnonymously(auth)).user.uid;
  await importGuestData(uid, captured);
  await importGuestData(uid, captured);
  assert.deepEqual((await getDoc(userDoc(uid, 'dateSessions', date))).data(), metadata);
  assert.equal((await getDocs(userCollection(uid, 'dateDoses'))).size, 1);
  assert.equal((await getDocs(userCollection(uid, 'trainingLogs'))).size, 1);
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(actual)))).data(), actual);
  const progress = (await getDoc(userDoc(uid, 'progress', week))).data();
  assert.deepEqual(progress.completed, { [`day${day}_bf_A13`]: true });
  assert.deepEqual(progress.scheduleSnapshot.find(item => item.day === day).routine, ['bf_A13']);
});
