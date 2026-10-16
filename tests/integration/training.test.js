import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from '../../src/services/firebase.js';
import { userDoc, userCollection, savePlan, captureGuestData, importGuestData } from '../../src/services/repository.js';
import { saveTrainingLog, saveNextDayResponse, saveReadiness, plannedSnapshot, trainingHistoryQueries } from '../../src/services/trainingRepository.js';
import { DEFAULT_SCHEDULE_I18N, LEGACY_DEFAULT_SCHEDULE_I18N, EXERCISES_I18N } from '../../src/locale.js';
import { getWeekString, localDate, dateForWeekDay } from '../../src/domain/dates.js';
import { trainingLogId } from '../../src/domain/coaching.js';
import { createWeeklyIntent } from '../../src/domain/trainingPreferences.js';

const week = getWeekString();
// Follow-up must be valid even when CI runs on Monday.
const date = localDate(new Date(Date.now() - 86400000));
const plan = { conclusion: 'Private training', schedule: DEFAULT_SCHEDULE_I18N.zh, source: 'manual' };
let environment;
let uid;
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-fitness-planner', firestore: { rules: await readFile('firestore.rules', 'utf8') } });
  uid = (await signInAnonymously(auth)).user.uid;
});
beforeEach(async () => { await environment.clearFirestore(); });
after(async () => { await signOut(auth); await environment.cleanup(); });
function log(day = 1, exerciseId = plan.schedule[day - 1].routine[0]) {
  const dose = plan.schedule[day - 1].prescriptions.find(item => item.id === exerciseId);
  return { week, day, exerciseId, date, variant: 'bodyweight', loadKg: null, loadBasis: 'none', resistanceLabel: '',
    unit: dose.unit, perSide: dose.perSide, sets: [{ value: 5, otherSide: dose.perSide ? 5 : null }], rir: null,
    quality: 'unknown', symptoms: 'unknown', nextDay: 'pending', planned: plannedSnapshot(dose), schemaVersion: 1 };
}
const readiness = () => ({ date: localDate(), sleepHours: null, fatigue: null, soreness: null, symptoms: 'unknown',
  yesterdayCourtMinutes: null, yesterdayCourtRpe: null, todayCourtIntensity: 'unknown', schemaVersion: 1 });
const save = record => saveTrainingLog(uid, record, { fallback: plan, expectedRevision: 0, exercise: EXERCISES_I18N.zh[record.exerciseId] });

test('private records persist five sets and both sides without changing completion', async () => {
  const record = { ...log(1, 'bf_B01'), variant: 'dumbbell', loadBasis: 'per_dumbbell', loadKg: 12.5, rir: 2,
    quality: 'good', symptoms: 'none', sets: Array.from({ length: 5 }, (_, i) => ({ value: 8 + i, otherSide: 7 + i })) };
  assert.equal(record.perSide, true);
  await assertSucceeds(save(record));
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(record)))).data(), record);
  assert.equal((await getDoc(userDoc(uid, 'progress', week))).exists(), false);
  await assertSucceeds(saveNextDayResponse(uid, trainingLogId(record), 'good'));
  await assertSucceeds(saveTrainingLog(uid, { ...record, nextDay: 'good', quality: 'unstable' }, { fallback: plan, expectedRevision: 0 }));
  await assertSucceeds(saveReadiness(uid, readiness()));
});
test('owner reads work and stranger or signed-out access is denied', async () => {
  await save(log());
  for (const group of ['trainingLogs', 'readiness']) {
    const id = group === 'trainingLogs' ? trainingLogId(log()) : localDate();
    const path = `artifacts/my-fitness-app-yp/users/${uid}/${group}/${id}`;
    await assertSucceeds(getDocs(userCollection(uid, group)));
    for (const context of [environment.authenticatedContext('stranger'), environment.unauthenticatedContext()]) {
      await assertFails(getDoc(doc(context.firestore(), path)));
      await assertFails(setDoc(doc(context.firestore(), path), group === 'trainingLogs' ? log() : readiness()));
    }
  }
});
test('strict rules reject malformed records, dates, unknown keys and negative bounds', async () => {
  const record = log();
  const ref = userDoc(uid, 'trainingLogs', trainingLogId(record));
  const invalid = [
    { ...record, loadKg: -1 }, { ...record, loadKg: 501 }, { ...record, rir: -1 }, { ...record, rir: 1.5 },
    { ...record, day: 6 }, { ...record, week: '2026-W99' }, { ...record, exerciseId: '../admin' },
    { ...record, loadBasis: 'invented' }, { ...record, resistanceLabel: null }, { ...record, resistanceLabel: 'x'.repeat(121) },
    { ...record, unit: 'kg' }, { ...record, perSide: 'yes' }, { ...record, sets: [{ value: 1, otherSide: 1 }] }, { ...record, variant: 'invented' }, { ...record, quality: null }, { ...record, symptoms: 'good' },
    { ...record, nextDay: 'unknown' }, { ...record, date: '2999-01-01' }, { ...record, date: '2026-02-31' }, { ...record, schemaVersion: 2 },
    { ...record, admin: true }, { ...record, sets: [] }, { ...record, sets: [{ value: -1, otherSide: null }] },
    { ...record, sets: [{ value: 2, otherSide: null, extra: true }] },
    { ...record, planned: { ...record.planned, sets: 6 } }, { ...record, planned: { ...record.planned, restSeconds: -1 } },
    { ...record, planned: { ...record.planned, phase: 'invented' } },
    { ...record, planned: { ...record.planned, value: '9999' } },
    { ...record, planned: { ...record.planned, value: '8–2' } },
  ];
  for (const candidate of invalid) await assertFails(setDoc(ref, candidate));
  for (const field of Object.keys(record)) {
    const missing = { ...record }; delete missing[field];
    await assertFails(setDoc(ref, missing));
  }
  for (const field of Object.keys(record.planned)) {
    const missing = { ...record, planned: { ...record.planned } }; delete missing.planned[field];
    await assertFails(setDoc(ref, missing));
  }
  await assertFails(setDoc(userDoc(uid, 'trainingLogs', `${week}-D2-${record.exerciseId}`), record));
  for (const field of Object.keys(readiness())) {
    const missing = { ...readiness() }; delete missing[field];
    await assertFails(setDoc(userDoc(uid, 'readiness', localDate()), missing));
  }
  for (const fields of [{ fatigue: -1 }, { fatigue: 5 }, { sleepHours: 25 }, { soreness: 1.5 }, { symptoms: null },
    { yesterdayCourtMinutes: 361 }, { yesterdayCourtRpe: 11 }, { todayCourtIntensity: 'medium' }, { admin: true }]) {
    await assertFails(setDoc(userDoc(uid, 'readiness', localDate()), { ...readiness(), ...fields }));
  }
});
test('concurrent slots retain data and stale plan revisions do not silently rebind logs', async () => {
  const first = log(); const second = log(1, plan.schedule[0].routine[1]);
  await Promise.all([save(first), save(second)]);
  assert.equal((await getDocs(userCollection(uid, 'trainingLogs'))).size, 2);
  await savePlan(uid, week, plan, plan, false, 0);
  await assert.rejects(save(first), /PLAN_CHANGED/);
  const changed = structuredClone(plan);
  changed.schedule[0].prescriptions[0].value = '6';
  await savePlan(uid, week, changed, plan, false, 1);
  await assertSucceeds(saveTrainingLog(uid, { ...first, quality: 'good' }, { fallback: plan, expectedRevision: 2 }));
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(first)))).data().planned, first.planned);
  await assert.rejects(saveTrainingLog(uid, { ...first, planned: { ...first.planned, value: '6' } }, { fallback: changed, expectedRevision: 2 }), /LOG_CHANGED/);
});
test('follow-up remains available after the exercise was removed and changes only nextDay', async () => {
  const record = log(); await save(record);
  const removed = structuredClone(plan);
  removed.schedule[0].routine = removed.schedule[0].routine.filter(id => id !== record.exerciseId);
  removed.schedule[0].prescriptions = removed.schedule[0].prescriptions.filter(dose => dose.id !== record.exerciseId);
  await savePlan(uid, week, removed, plan, false, 0);
  await saveNextDayResponse(uid, trainingLogId(record), 'good');
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(record)))).data(), { ...record, nextDay: 'good' });
  await assertFails(setDoc(userDoc(uid, 'trainingLogs', trainingLogId(record)), { ...record, planned: { ...record.planned, value: '9' } }));
});
test('guest import retries preserve private collisions and reject unlisted groups', async () => {
  const record = log(); await save(record); await saveReadiness(uid, readiness());
  const captured = await captureGuestData(uid);
  assert.equal(captured.filter(item => item.group === 'trainingLogs').length, 1);
  const imported = captured.map(item => ({ ...item, data: item.group === 'trainingLogs' ? { ...item.data, quality: 'good' } : { ...item.data, fatigue: 4 } }));
  await importGuestData(uid, imported); await importGuestData(uid, imported);
  assert.equal((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(record)))).data().quality, 'unknown');
  assert.equal((await getDoc(userDoc(uid, 'readiness', localDate()))).data().fatigue, null);
  await assert.rejects(importGuestData(uid, [{ group: 'aiTrialQuota', id: 'x', data: {} }]), /INVALID_IMPORT/);
});
test('preview adoption is atomic with records/readiness and rolls back an invalid plan', async () => {
  const record = log();
  await assert.rejects(savePlan(uid, week, { ...plan, forbidden: true }, plan, false, 0, { day1_bf_A01: true }, { logs: [record], readiness: [readiness()] }));
  assert.equal((await getDocs(userCollection(uid, 'trainingLogs'))).size, 0);
  assert.equal((await getDoc(userDoc(uid, 'readiness', localDate()))).exists(), false);
  assert.equal((await getDoc(userDoc(uid, 'progress', week))).exists(), false);
  await savePlan(uid, week, plan, plan, false, 0, { day1_bf_A01: true }, { logs: [record], readiness: [readiness()] });
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(record)))).data(), record);
  assert.equal((await getDoc(userDoc(uid, 'progress', week))).data().completed.day1_bf_A01, true);
  assert.equal((await getDoc(userDoc(uid, 'plans', week))).data().revision, 1);
});
test('legacy plans stay writable and actual logs use conservative legacy snapshots', async () => {
  const legacy = { conclusion: 'Legacy', schedule: LEGACY_DEFAULT_SCHEDULE_I18N.zh };
  await assertSucceeds(setDoc(userDoc(uid, 'plans', week), legacy));
});

test('forty preview slots adopt together with private records and all completion marks', async () => {
  const base = structuredClone(DEFAULT_SCHEDULE_I18N.zh[3]);
  base.routine.splice(2, 0, 'bf_A03'); base.routine.push('bf_H03');
  for (const [id, phase] of [['bf_A03', 'warmup'], ['bf_H03', 'cooldown']]) base.prescriptions.push({ id, ...EXERCISES_I18N.zh[id].prescription, phase });
  const choices = ['bf_B03', 'dead_bug', 'bf_A06', 'bf_H03', 'bf_B05', 'bf_A01', 'bf_F01', 'bf_D09'];
  const full = { ...plan, weeklyIntent: createWeeklyIntent({ weeklyExerciseIds: choices }), schedule: Array.from({ length: 5 }, (_, i) => ({ ...structuredClone(base), day: i + 1 })) };
  const records = full.schedule.flatMap(day => day.prescriptions.map(dose => ({ ...log(), day: day.day, exerciseId: dose.id,
    unit: dose.unit, perSide: dose.perSide, planned: plannedSnapshot(dose), sets: Array.from({ length: 5 }, () => ({ value: 1, otherSide: dose.perSide ? 1 : null })) })));
  const completed = Object.fromEntries(records.map(record => [`day${record.day}_${record.exerciseId}`, true]));
  await savePlan(uid, week, full, plan, false, 0, completed, { logs: records, readiness: [readiness()] });
  assert.equal((await getDocs(userCollection(uid, 'trainingLogs'))).size, 40);
  assert.equal(Object.keys((await getDoc(userDoc(uid, 'progress', week))).data().completed).length, 40);
  assert.deepEqual((await getDoc(userDoc(uid, 'plans', week))).data().weeklyIntent.weeklyExerciseIds, choices);
  await assert.rejects(savePlan(uid, week, full, plan, false, 1, {}, {}, {}), /PROGRESS_CHANGED/);
  assert.equal((await getDoc(userDoc(uid, 'plans', week))).data().revision, 1);
});

test('bounded history scans prefer recent records and include weekend readiness', async () => {
  const previousWeek = getWeekString(new Date(), -1);
  await environment.withSecurityRulesDisabled(async context => {
    const batch = writeBatch(context.firestore());
    const path = `artifacts/my-fitness-app-yp/users/${uid}`;
    for (let i = 0; i < 42; i++) {
      const record = { ...log(), exerciseId: `custom_${String(i).padStart(2, '0')}` };
      batch.set(doc(context.firestore(), `${path}/trainingLogs/${trainingLogId(record)}`), record);
    }
    batch.set(doc(context.firestore(), `${path}/trainingLogs/${previousWeek}-D1-old`), { ...log(), week: previousWeek, exerciseId: 'old' });
    for (const day of [6, 7]) {
      const date = dateForWeekDay(previousWeek, day);
      batch.set(doc(context.firestore(), `${path}/readiness/${date}`), { ...readiness(), date });
    }
    await batch.commit();
  });
  const scan = trainingHistoryQueries(uid, week, 1);
  const logs = await getDocs(scan.logs);
  assert.equal(logs.size, 41);
  assert.equal(logs.docs[0].data().exerciseId, 'custom_41');
  assert.equal(logs.docs.at(-1).data().exerciseId, 'custom_01');
  const recovery = await getDocs(trainingHistoryQueries(uid, week, 2).readiness);
  assert.equal(recovery.size, 2);
  assert.equal(recovery.docs[0].id, dateForWeekDay(previousWeek, 7));
});

test('legacy exact exercise names and aliases accept canonical logs without substring matching', async () => {
  const exercise = EXERCISES_I18N.zh.bf_B01;
  const legacy = { conclusion: 'Named legacy', schedule: structuredClone(LEGACY_DEFAULT_SCHEDULE_I18N.zh) };
  legacy.schedule[0].routine = [exercise.name];
  const record = { ...log(1, 'bf_B01'), planned: plannedSnapshot(exercise.prescription) };
  await setDoc(userDoc(uid, 'plans', week), legacy);
  await saveTrainingLog(uid, record, { fallback: legacy, expectedRevision: 0, exercise });
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(record)))).data(), record);
  legacy.schedule[0].routine = ['Split squat'];
  await setDoc(userDoc(uid, 'plans', week), legacy);
  await saveTrainingLog(uid, { ...record, quality: 'good' }, { fallback: legacy, expectedRevision: 0, exercise });
  legacy.schedule[0].routine = ['Split squat extra'];
  await setDoc(userDoc(uid, 'plans', week), legacy);
  await assert.rejects(saveTrainingLog(uid, record, { fallback: legacy, expectedRevision: 0, exercise }), /PLAN_CHANGED/);
  assert.equal((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(record)))).data().quality, 'good');
});

test('rest-adjusted preview adopts its completed strength slot and original private snapshot', async () => {
  const { adaptDayForReadiness } = await import('../../src/domain/coaching.js');
  const { normalizePromotionDraft } = await import('../../src/domain/promotion.js');
  const { catalogExercises } = await import('../../src/domain/exerciseCatalog.js');
  const { generateTemplatePlan } = await import('../../src/domain/templatePlanner.js');
  const exercises = catalogExercises('zh');
  const profile = { context: { healthStatus: 'unrestricted' }, time: '30', focus: 'strength', goal: '' };
  const baselinePlan = { ...generateTemplatePlan(exercises, profile.context, profile.time, 'zh', { currentDate: localDate(), currentWeek: week }), source: 'template', language: 'zh' };
  const original = baselinePlan.schedule.find(day => day.prescriptions.some(dose => dose.phase === 'strength'));
  const strength = original.prescriptions.find(dose => dose.phase === 'strength');
  const completed = { [`day${original.day}_${strength.id}`]: true };
  const adapted = adaptDayForReadiness(original, { action: 'rest', reasonCodes: ['worsening_symptoms'] }, completed, exercises, 'zh');
  const record = { ...log(), day: original.day, exerciseId: strength.id, unit: strength.unit, perSide: strength.perSide,
    planned: plannedSnapshot(strength), sets: [{ value: 1, otherSide: strength.perSide ? 1 : null }] };
  const draft = { week, baselinePlan, profile, completed, adjustment: { days: [original.day], completed }, logs: [record], readiness: [readiness()],
    plan: { ...baselinePlan, schedule: baselinePlan.schedule.map(day => day.day === original.day ? adapted : day) } };
  const preview = normalizePromotionDraft(JSON.parse(JSON.stringify(draft)), week);
  assert.ok(preview);
  assert.deepEqual(preview.plan.schedule.find(day => day.day === original.day).prescriptions, [strength]);
  await savePlan(uid, week, preview.plan, baselinePlan, false, 0, preview.completed, { logs: preview.logs, readiness: preview.readiness });
  const saved = (await getDoc(userDoc(uid, 'plans', week))).data().schedule.find(day => day.day === original.day);
  assert.equal(saved.prescriptions.some(dose => dose.phase === 'warmup'), false);
  assert.deepEqual(saved.prescriptions, [strength]);
  assert.equal((await getDoc(userDoc(uid, 'progress', week))).data().completed[`day${original.day}_${strength.id}`], true);
  assert.deepEqual((await getDoc(userDoc(uid, 'trainingLogs', trainingLogId(record)))).data().planned, record.planned);
});
