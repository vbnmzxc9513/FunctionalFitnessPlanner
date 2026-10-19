import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from '../../src/services/firebase.js';
import { userDoc, userCollection, setCompletion, captureGuestData, importGuestData } from '../../src/services/repository.js';
import { applyPeriodPlan, assembleDateSessions, loadPeriodState, saveDateReadinessAdjustment } from '../../src/services/periodRepository.js';
import { saveTrainingLog, plannedSnapshot } from '../../src/services/trainingRepository.js';
import { dateForWeekDay, getWeekString, localDate } from '../../src/domain/dates.js';
import { enumeratePeriodDates } from '../../src/domain/periodPlanning.js';
import { DEFAULT_SCHEDULE_I18N, EXERCISES_I18N, LEGACY_DEFAULT_SCHEDULE_I18N } from '../../src/locale.js';

let environment, uid;
const shift = (date, days) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return localDate(value); };
const today = localDate(), week = getWeekString();
const profile = { focus: 'strength', time: '240', context: { trainingDays: [1, 2, 3, 4, 5, 6, 7], healthNotes: 'NEVER_STORE_THIS' } };
const rangeFor = days => ({ from: today, to: shift(today, days - 1) });
function sessionsFor(range) {
  const base = structuredClone(DEFAULT_SCHEDULE_I18N.zh[3]);
  base.routine.splice(2, 0, 'bf_A03'); base.routine.push('bf_H03');
  base.prescriptions.splice(2, 0, { id: 'bf_A03', ...EXERCISES_I18N.zh.bf_A03.prescription, phase: 'warmup' });
  base.prescriptions.push({ id: 'bf_H03', ...EXERCISES_I18N.zh.bf_H03.prescription, phase: 'cooldown' });
  return enumeratePeriodDates(range).map(date => ({ ...structuredClone(base), date, week: getWeekString(new Date(`${date}T12:00:00`)), day: new Date(`${date}T12:00:00`).getDay() || 7 }));
}
async function apply(range, sessions = sessionsFor(range), state) {
  state ||= await loadPeriodState(uid, range);
  return applyPeriodPlan(uid, { range, sessions, profile, expectedState: state.expectedState, conclusion: 'Bounded plan' });
}
function recordFor(session, id = session.routine[0]) {
  const dose = session.prescriptions.find(item => item.id === id);
  return { week: session.week, day: session.day, exerciseId: id, date: today, variant: 'bodyweight', loadKg: null, loadBasis: 'none', resistanceLabel: '',
    unit: dose.unit, perSide: dose.perSide, sets: [{ value: 1, otherSide: dose.perSide ? 1 : null }], rir: null,
    quality: 'unknown', symptoms: 'unknown', nextDay: 'pending', planned: plannedSnapshot(dose), schemaVersion: 1 };
}
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-fitness-planner', firestore: { rules: await readFile('firestore.rules', 'utf8') } });
  uid = (await signInAnonymously(auth)).user.uid;
});
beforeEach(async () => { await environment.clearFirestore(); });
after(async () => { await signOut(auth); await environment.cleanup(); });

test('28 dates and 224 independently validated doses apply atomically without legacy mirrors or private profile data', async () => {
  const range = rangeFor(28), sessions = sessionsFor(range);
  const result = await apply(range, sessions);
  assert.equal(result.appliedDates.length, 28);
  assert.equal((await getDocs(userCollection(uid, 'dateSessions'))).size, 28);
  assert.equal((await getDocs(userCollection(uid, 'dateDoses'))).size, 224);
  assert.equal((await getDocs(userCollection(uid, 'planDays'))).size, 0);
  assert.equal((await getDocs(userCollection(uid, 'plans'))).size, 0);
  const state = await loadPeriodState(uid, range);
  assert.equal(Object.keys(state.sessionsByDate).length, 28);
  assert.equal(JSON.stringify(state).includes('NEVER_STORE_THIS'), false);
  assert.deepEqual(state.sessionsByDate[today].prescriptions, sessions[0].prescriptions);
  for (const progress of Object.values(state.progressByWeek)) assert.ok((progress.scheduleSnapshot || []).length <= 7);
});

test('four detailed targets persist in native date sessions and cloud period summaries without exposing private notes', async () => {
  const range = rangeFor(2), sessions = sessionsFor(range), state = await loadPeriodState(uid, range);
  const targetRegions = ['serratus', 'rotator_cuff', 'glutes', 'calves'];
  const result = await applyPeriodPlan(uid, { range, sessions, profile: { ...profile, context: { ...profile.context, targetRegions } }, expectedState: state.expectedState, conclusion: 'Fine priorities' });
  const period = (await getDoc(userDoc(uid, 'planningPeriods', result.periodId))).data();
  assert.deepEqual(period.weeklyIntent.targetRegions, targetRegions);
  const reloaded = await loadPeriodState(uid, range);
  assert.deepEqual(reloaded.sessionsByDate[today].weeklyIntent.targetRegions, targetRegions);
  assert.equal(JSON.stringify(period).includes('NEVER_STORE_THIS'), false);
  const ref = userDoc(uid, 'dateSessions', today), saved = (await getDoc(ref)).data();
  await assertFails(setDoc(ref, { ...saved, weeklyIntent: { ...saved.weeklyIntent, targetRegions: [...targetRegions, 'core'] } }));
});

test('malformed preparation rolls back the entire independent document batch; collections enforce owner and whitelists', async () => {
  const range = rangeFor(1); await apply(range);
  const session = (await getDoc(userDoc(uid, 'dateSessions', today))).data();
  const doseRef = userDoc(uid, 'dateDoses', `${today}_bf_B02`), dose = (await getDoc(doseRef)).data();
  const batch = writeBatch(doseRef.firestore);
  batch.set(userDoc(uid, 'dateSessions', today), { ...session, revision: 2 });
  batch.set(doseRef, { ...dose, revision: 2, dose: { ...dose.dose, preparation: { ...dose.dose.preparation, value: '100' } } });
  await assertFails(batch.commit());
  assert.equal((await getDoc(userDoc(uid, 'dateSessions', today))).data().revision, 1);
  for (const [group, id, data] of [['dateSessions', today, session], ['dateDoses', doseRef.id, dose]]) {
    await assertFails(setDoc(userDoc(uid, group, id), { ...data, healthNotes: 'private' }));
    for (const context of [environment.authenticatedContext('stranger'), environment.unauthenticatedContext()]) {
      const ref = doc(context.firestore(), `artifacts/my-fitness-app-yp/users/${uid}/${group}/${id}`);
      await assertFails(getDoc(ref)); await assertFails(setDoc(ref, data));
    }
  }
  const badDoses = [
    { ...dose, date: '2026-02-31' }, { ...dose, revision: 0 }, { ...dose, exerciseId: 'wrong' },
    { ...dose, dose: { ...dose.dose, sets: 1.5 } }, { ...dose, dose: { ...dose.dose, phase: 'legacy' } },
    { ...dose, dose: { ...dose.dose, value: '8–2' } }, { ...dose, dose: { ...dose.dose, value: '0' } },
    { ...dose, dose: { ...dose.dose, unit: 'kg' } }, { ...dose, dose: { ...dose.dose, privateNotes: 'never' } },
    { ...dose, dose: { ...dose.dose, preparation: null } },
    { ...dose, dose: { ...dose.dose, preparation: { ...dose.dose.preparation, instruction: '' } } },
  ];
  for (const data of badDoses) await assertFails(setDoc(doseRef, data));
  for (const data of [{ ...session, day: session.day === 7 ? 1 : session.day + 1 }, { ...session, prescriptions: [] },
    { ...session, routine: [...session.routine, session.routine[0]] }, { ...session, revision: 0 }]) await assertFails(setDoc(userDoc(uid, 'dateSessions', today), data));
  await assert.rejects(loadPeriodState('stranger', range), /SESSION_CHANGED/);
});

test('completion and removed-routine logs protect entire dates while outside native dates stay byte-for-byte unchanged', async () => {
  const range = rangeFor(3), sessions = sessionsFor(range); await apply(range, sessions);
  const first = sessions[0], second = sessions[1], outside = sessions[2];
  await setCompletion(uid, first.week, first.day, first.routine[0], true, EXERCISES_I18N.zh[first.routine[0]], []);
  const old = { ...recordFor(second), exerciseId: 'removed_old_routine' };
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), `artifacts/my-fitness-app-yp/users/${uid}/trainingLogs/${second.week}-D${second.day}-removed_old_routine`), old);
  });
  const before = (await getDoc(userDoc(uid, 'dateSessions', outside.date))).data();
  const subset = { from: first.date, to: second.date }, state = await loadPeriodState(uid, subset);
  assert.deepEqual(state.protectedDates, [first.date, second.date]);
  const result = await apply(subset, sessions.slice(0, 2), state);
  assert.deepEqual(result.appliedDates, []);
  assert.equal((await getDoc(userDoc(uid, 'dateSessions', first.date))).data().revision, 1);
  assert.deepEqual((await getDoc(userDoc(uid, 'dateSessions', outside.date))).data(), before);
  const progress = (await getDoc(userDoc(uid, 'progress', first.week))).data();
  assert.equal(progress.completed[`day${first.day}_${first.routine[0]}`], true);
  assert.equal(progress.completedAt[`day${first.day}_${first.routine[0]}`], today);
});

test('a new deterministic log, completion, or outside-range native revision invalidates preview and writes nothing', async () => {
  const range = rangeFor(2), sessions = sessionsFor(range); await apply(range, sessions);
  let state = await loadPeriodState(uid, { from: today, to: today });
  const first = sessions[0], record = recordFor(first);
  await saveTrainingLog(uid, record, { expectedRevision: 1 });
  await assert.rejects(apply({ from: today, to: today }, [first], state), /PERIOD_CHANGED/);
  state = await loadPeriodState(uid, { from: today, to: today });
  await setCompletion(uid, first.week, first.day, first.routine[1], true, EXERCISES_I18N.zh[first.routine[1]], []);
  await assert.rejects(apply({ from: today, to: today }, [first], state), /PERIOD_CHANGED/);
  const sameWeekOutside = sessions[1].week === first.week ? sessions[1] : null;
  if (sameWeekOutside) {
    state = await loadPeriodState(uid, { from: today, to: today });
    const ref = userDoc(uid, 'dateSessions', sameWeekOutside.date), existing = (await getDoc(ref)).data();
    await setDoc(ref, { ...existing, revision: existing.revision + 1 });
    await assert.rejects(apply({ from: today, to: today }, [first], state), /PERIOD_CHANGED/);
  }
  assert.equal((await getDocs(userCollection(uid, 'planningPeriods'))).size, 1);
});

test('native seven-day logging validates revision and saved dose while preserving historical planned snapshots', async () => {
  const range = rangeFor(1), sessions = sessionsFor(range); await apply(range, sessions);
  const first = sessions[0], record = recordFor(first);
  await assertSucceeds(saveTrainingLog(uid, record, { expectedRevision: 1 }));
  await assert.rejects(saveTrainingLog(uid, record, { expectedRevision: 0 }), /PLAN_CHANGED/);
  await assert.rejects(saveTrainingLog(uid, { ...record, planned: { ...record.planned, value: '3' } }, { expectedRevision: 1 }), /LOG_CHANGED/);
  const state = await loadPeriodState(uid, range), changed = structuredClone(state.sessionsByDate[today]);
  await setCompletion(uid, first.week, first.day, first.routine[1], true, EXERCISES_I18N.zh[first.routine[1]], []);
  changed.routine = []; changed.prescriptions = []; changed.sessionType = 'rest';
  await assert.rejects(saveDateReadinessAdjustment(uid, today, changed, { expectedRevision: 1, expectedCompleted: {} }), /PROGRESS_CHANGED/);
  const adjusted = await saveDateReadinessAdjustment(uid, today, changed, { expectedRevision: 1, expectedCompleted: { [`day${first.day}_${first.routine[1]}`]: true } });
  assert.equal(adjusted.revision, 2);
  assert.deepEqual(adjusted.prescriptions[0], first.prescriptions[1], 'completed dose is immutable during readiness adaptation');
  assert.equal(adjusted.routine.length, 1);
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', `${first.week}-D${first.day}-${record.exerciseId}`))).data().planned, record.planned);
  assert.equal((await getDoc(userDoc(uid, 'progress', first.week))).data().completed?.[`day${first.day}_${first.routine[0]}`], undefined);
});

test('rest removes logged but unfinished active work and retains its actual record and planned history', async () => {
  const range = rangeFor(1), [session] = sessionsFor(range); await apply(range, [session]);
  const record = recordFor(session, 'bf_B02');
  await saveTrainingLog(uid, record, { expectedRevision: 1 });
  const adjusted = await saveDateReadinessAdjustment(uid, today, { ...session, routine: [], prescriptions: [], sessionType: 'rest' }, { expectedRevision: 1, expectedCompleted: {} });
  assert.deepEqual(adjusted.routine, []); assert.deepEqual(adjusted.prescriptions, []); assert.equal(adjusted.sessionType, 'rest');
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', `${session.week}-D${session.day}-${record.exerciseId}`))).data(), record);
});

test('a canonical log for a legacy exact exercise alias invalidates the loaded preview', async () => {
  const range = rangeFor(1), exercise = EXERCISES_I18N.zh.bf_B01;
  const legacy = { conclusion: 'Named legacy', schedule: structuredClone(LEGACY_DEFAULT_SCHEDULE_I18N.zh) };
  legacy.schedule[0].routine = [exercise.name];
  await setDoc(userDoc(uid, 'plans', week), legacy);
  const state = await loadPeriodState(uid, range, { exercises: EXERCISES_I18N.zh });
  const source = { ...sessionsFor(range)[0], week, day: 1, routine: ['bf_B01'], prescriptions: [{ id: 'bf_B01', ...exercise.prescription }] };
  const record = recordFor(source, 'bf_B01');
  await saveTrainingLog(uid, record, { expectedRevision: 0, fallback: legacy, exercise });
  await assert.rejects(apply(range, sessionsFor(range), state), /PERIOD_CHANGED/);
  assert.equal((await getDocs(userCollection(uid, 'dateSessions'))).size, 0);
});

test('protected legacy days bypass new-native sanitation and a concurrent legacy plan revision invalidates preview', async () => {
  const nextWeek = getWeekString(new Date(), 1), date = dateForWeekDay(nextWeek, 1), range = { from: date, to: date };
  const legacy = { conclusion: 'Legacy', schedule: LEGACY_DEFAULT_SCHEDULE_I18N.zh };
  await setDoc(userDoc(uid, 'plans', nextWeek), legacy);
  const state = await loadPeriodState(uid, range);
  await setDoc(userDoc(uid, 'plans', nextWeek), { ...legacy, revision: 1 });
  await assert.rejects(apply(range, sessionsFor(range), state), /PERIOD_CHANGED/);
  await setDoc(userDoc(uid, 'progress', nextWeek), { completed: { day1_removed_old_id: true }, schemaVersion: 2 });
  const protectedState = await loadPeriodState(uid, range);
  const result = await apply(range, [protectedState.sessionsByDate[date]], protectedState);
  assert.deepEqual(result.appliedDates, []);
  assert.equal((await getDoc(userDoc(uid, 'dateSessions', date))).exists(), false);
  assert.deepEqual((await getDoc(userDoc(uid, 'plans', nextWeek))).data().schedule, legacy.schedule);
});

test('legacy five-day documents remain untouched and incomplete native joins reserve their date', async () => {
  const legacy = { conclusion: 'Legacy', schedule: LEGACY_DEFAULT_SCHEDULE_I18N.zh };
  await setDoc(userDoc(uid, 'plans', week), legacy);
  const range = rangeFor(1), before = (await getDoc(userDoc(uid, 'plans', week))).data();
  await apply(range);
  assert.deepEqual((await getDoc(userDoc(uid, 'plans', week))).data(), before);
  const metadata = (await getDoc(userDoc(uid, 'dateSessions', today))).data();
  assert.throws(() => assembleDateSessions({ [today]: metadata }, {}), /DATE_SESSION_INCOMPLETE/);
  const session = sessionsFor(range)[0], dose = session.prescriptions[0];
  assert.throws(() => assembleDateSessions({ [today]: metadata }, { [`${today}_${dose.id}`]: { date: today, exerciseId: dose.id, revision: 0, dose } }), /DATE_SESSION_INCOMPLETE/);
  // Sunday and year-boundary identities are checked by rules independently of
  // the current UI week. These harmless rest records require no dose writes.
  for (const date of ['2027-01-03', '2027-01-04']) {
    const isoWeek = getWeekString(new Date(`${date}T12:00:00`)), day = new Date(`${date}T12:00:00`).getDay() || 7;
    assert.equal(dateForWeekDay(isoWeek, day), date);
    await assertSucceeds(setDoc(userDoc(uid, 'dateSessions', date), { ...metadata, date, week: isoWeek, day, routine: [], sessionType: 'rest' }));
  }
});

test('guest capture and idempotent import retain historical native sessions, doses and bounded metadata', async () => {
  const range = rangeFor(1); await apply(range);
  const captured = (await captureGuestData(uid)).filter(record => ['dateSessions', 'dateDoses', 'planningPeriods'].includes(record.group));
  assert.equal(captured.length, 10);
  const past = shift(today, -20);
  const imported = captured.map(record => {
    const data = structuredClone(record.data);
    if (record.group === 'planningPeriods') { data.from = past; data.to = past; return { ...record, data }; }
    data.date = past;
    if (record.group === 'dateSessions') { data.week = getWeekString(new Date(`${past}T12:00:00`)); data.day = new Date(`${past}T12:00:00`).getDay() || 7; }
    return { ...record, id: record.id.replace(today, past), data };
  });
  await environment.clearFirestore();
  await importGuestData(uid, imported); await importGuestData(uid, imported);
  assert.equal((await getDocs(userCollection(uid, 'dateDoses'))).size, 8);
  const state = await loadPeriodState(uid, { from: past, to: past });
  assert.equal(state.sessionsByDate[past].routine.length, 8);
  assert.equal((await getDocs(userCollection(uid, 'planningPeriods'))).size, 1);
  await assert.rejects(applyPeriodPlan(uid, { range: { from: past, to: past }, sessions: [state.sessionsByDate[past]], expectedState: state.expectedState, profile }), /INVALID_PLANNING_RANGE/);
});
