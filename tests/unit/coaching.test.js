import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptDayForReadiness, evaluateReadiness, plannedSnapshot, recommendExercise, targetRange, trainingLogId, validateReadiness, validateTrainingLog } from '../../src/domain/coaching.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { exerciseKey } from '../../src/domain/training.js';
import { estimateSessionMinutes } from '../../src/domain/sessions.js';

const today = '2026-10-14';
const planned = { sets: 2, value: '6–8', unit: 'reps', perSide: true, phase: 'strength', restSeconds: 60 };
const exercise = { id: 'squat', type: 'lower', category: 'lower', shoulderLoaded: false, jumpContacts: 0 };
const ready = (overrides = {}) => ({ date: today, sleepHours: 8, fatigue: 0, soreness: 0, symptoms: 'none', yesterdayCourtMinutes: 0, yesterdayCourtRpe: null, todayCourtIntensity: 'none', schemaVersion: 1, ...overrides });
const log = (date = '2026-10-06', overrides = {}) => ({ week: '2026-W41', day: 2, exerciseId: 'squat', date,
  variant: 'dumbbell', loadKg: 8, loadBasis: 'per_dumbbell', resistanceLabel: '', unit: 'reps', perSide: true,
  sets: [{ value: 6, otherSide: 6 }, { value: 6, otherSide: 6 }], rir: 3, quality: 'good', symptoms: 'none', nextDay: 'good', planned: { ...planned }, schemaVersion: 1, ...overrides });
const context = (overrides = {}) => ({ today, readiness: ready(), healthStatus: 'unrestricted', ...overrides });
const history = () => [log('2026-10-06'), log('2026-10-09', { day: 5 })];
const advice = (logs = history(), overrides = {}, dose = planned, move = exercise) => recommendExercise(dose, move, logs, context(overrides));

const doseFor = (catalog, id, phase) => ({ id, ...catalog[id].prescription, phase });
function dayFixture() {
  const catalog = catalogExercises();
  const prescriptions = [doseFor(catalog, 'bf_A01', 'warmup'), { ...doseFor(catalog, 'bf_B01', 'strength'), sets: 4, preparation: { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: true, instruction: 'Bodyweight first' } }, doseFor(catalog, 'bf_B07', 'accessory'), doseFor(catalog, 'bf_D09', 'cooldown')];
  return { catalog, day: { day: 1, name: 'Monday', routine: prescriptions.map(item => item.id), prescriptions,
    sessionType: 'training', warmupNote: 'Prepare main movement', cooldownNote: 'Breathe gently', coachAdvice: 'Quality first' } };
}

test('actual log validates factual values and detached snapshot; blanks and missing sides never become zeros', () => {
  const actual = validateTrainingLog(log(), { today });
  actual.planned.value = '8'; actual.sets[0].value = 9;
  assert.equal(log().planned.value, '6–8');
  assert.equal(trainingLogId(log()), '2026-W41-D2-squat');
  assert.equal(plannedSnapshot({ ...planned, value: '6-8' }).value, '6–8');
  assert.deepEqual(targetRange('0', 'reps'), null);
  for (const sets of [[{ value: '', otherSide: 6 }], [{ value: null, otherSide: 6 }], [{ value: 6, otherSide: null }], [{ value: 6 }], []]) {
    assert.throws(() => validateTrainingLog(log('2026-10-06', { sets }), { today }), /INVALID_TRAINING_LOG/);
  }
  assert.doesNotThrow(() => validateTrainingLog(log('2026-10-06', { sets: [{ value: 0, otherSide: 0 }] }), { today }));
  for (const patch of [{ unit: 'seconds' }, { perSide: false }, { loadKg: Infinity }, { rir: 11 }, { extra: 'not stored' }, { variant: 'bodyweight' }, { loadBasis: 'description', resistanceLabel: '' }]) {
    assert.throws(() => validateTrainingLog(log('2026-10-06', patch), { today }), /INVALID_TRAINING_LOG/);
  }
});

test('dates are real, future records excluded and tomorrow response cannot be reported today', () => {
  for (const date of ['2026-02-30', '2026-10-15', 'no date']) assert.throws(() => validateTrainingLog(log(date), { today }), /INVALID_TRAINING_LOG/);
  assert.throws(() => validateTrainingLog(log(today), { today }), /INVALID_TRAINING_LOG/);
  assert.doesNotThrow(() => validateTrainingLog(log(today, { nextDay: 'pending' }), { today }));
  const fresh = advice([log('2026-10-15'), log('2026-10-06')]);
  assert.equal(fresh.code, 'record_more');
  assert.deepEqual(fresh.evidenceDates, ['2026-10-06']);
});

test('readiness requires a current report with unknowns explicit; absence is never clearance', () => {
  assert.equal(evaluateReadiness(ready(), { today }).action, 'normal');
  assert.equal(evaluateReadiness(null, { today }).action, 'unknown');
  for (const patch of [{ sleepHours: null }, { fatigue: null }, { soreness: null }, { symptoms: 'unknown' }, { yesterdayCourtMinutes: null }, { todayCourtIntensity: 'unknown' }, { yesterdayCourtMinutes: 60, yesterdayCourtRpe: null }]) {
    assert.equal(evaluateReadiness(ready(patch), { today }).action, 'unknown');
  }
  assert.equal(evaluateReadiness(ready({ date: '2026-10-13', symptoms: 'none' }), { today }).action, 'unknown');
  for (const patch of [{ fatigue: 5 }, { sleepHours: '' }, { date: '2026-10-15' }, { yesterdayCourtRpe: 11 }, { extra: true }]) assert.throws(() => validateReadiness(ready(patch), { today }), /INVALID_READINESS/);
});

test('readiness prioritizes worsening/new neurological symptoms over training and tracks combined court load', () => {
  assert.equal(evaluateReadiness(ready({ symptoms: 'red_flags' }), { today }).action, 'rest');
  assert.equal(evaluateReadiness(ready({ symptoms: 'worse' }), { today }).action, 'rest');
  assert.equal(evaluateReadiness(ready({ fatigue: 4 }), { today }).action, 'recover');
  assert.equal(evaluateReadiness(ready({ sleepHours: 4 }), { today }).action, 'recover');
  assert.equal(evaluateReadiness(ready({ yesterdayCourtMinutes: 120, yesterdayCourtRpe: 7, fatigue: 2 }), { today }).action, 'recover');
  assert.equal(evaluateReadiness(ready({ yesterdayCourtMinutes: 90, yesterdayCourtRpe: 7 }), { today }).action, 'reduce');
  assert.equal(evaluateReadiness(ready({ todayCourtIntensity: 'hard' }), { today }).action, 'reduce');
  assert.equal(evaluateReadiness(ready(), { today, healthStatus: 'restricted' }).action, 'recover');
  assert.equal(evaluateReadiness(ready(), { today, healthNotes: '肩部剛做震波' }).action, 'recover');
});

test('two distinct comparable sessions propose one extra rep per side at the same resistance without editing targets', () => {
  const logs = history(); const proposal = advice(logs);
  assert.equal(proposal.code, 'progress_reps');
  assert.equal(proposal.parameters.value, '7');
  assert.equal(proposal.parameters.loadKg, 8);
  assert.equal(proposal.parameters.loadBasis, 'per_dumbbell');
  assert.deepEqual(proposal.evidenceDates, ['2026-10-09', '2026-10-06']);
  assert.equal(logs[0].sets[0].value, 6);
  assert.equal(planned.value, '6–8');
  assert.equal(advice([log(), log('2026-10-06', { day: 3 })]).code, 'record_more');
  assert.equal(advice([log('2026-10-06', { nextDay: 'pending' }), log('2026-10-09')]).code, 'complete_followup');
});

test('changed prescribed conditions and noncomparable resistance hold progression', () => {
  for (const patch of [{ value: '7–9' }, { sets: 3 }, { restSeconds: 90 }, { perSide: false }, { phase: 'accessory' }]) {
    assert.equal(advice(history(), {}, { ...planned, ...patch }).code, 'hold');
    assert.ok(advice(history(), {}, { ...planned, ...patch }).reasonCodes.includes('changed_target'));
  }
  for (const patch of [{ loadKg: 10 }, { variant: 'cable', loadBasis: 'stack' }, { loadBasis: 'total' }, { resistanceLabel: 'different handle' }]) {
    assert.equal(advice([log(), log('2026-10-09', patch)]).code, 'hold');
  }
  assert.equal(advice(history().map(item => ({ ...item, loadKg: null }))).code, 'hold');
});

test('both sides, all prescribed sets, quality, reserve and next-day response are mandatory evidence', () => {
  for (const patch of [{ sets: [{ value: 6, otherSide: 5 }, { value: 6, otherSide: 6 }] }, { sets: [{ value: 6, otherSide: 6 }] }, { rir: null }, { rir: 1 }, { quality: 'unknown' }, { symptoms: 'unknown' }]) {
    assert.equal(advice([log(), log('2026-10-09', patch)]).code, 'hold');
  }
  assert.equal(advice([log(), log('2026-10-09', { quality: 'unstable' })]).code, 'improve_quality');
  assert.equal(advice([log(), log('2026-10-09', { nextDay: 'worse' })]).code, 'reduce');
  assert.equal(advice([log(), log('2026-10-09', { symptoms: 'worse' })]).code, 'reduce');
});

test('current fatigue, restrictions, taper, jumping and missing readiness block increases', () => {
  for (const overrides of [{ readiness: null }, { healthStatus: 'restricted' }, { healthStatus: 'unknown' }, { healthNotes: 'recent shockwave' }, { readiness: ready({ fatigue: 2 }) }, { competitionDate: '2026-10-20' }]) {
    assert.equal(advice(history(), overrides).code, 'hold');
  }
  assert.equal(advice(history(), { readiness: ready({ symptoms: 'red_flags' }) }).code, 'rest');
  assert.equal(advice(history(), { readiness: ready({ fatigue: 4 }) }).code, 'reduce');
  assert.equal(advice(history(), {}, planned, { ...exercise, jumpContacts: 1 }).code, 'hold');
  assert.equal(advice(history(), {}, planned, { ...exercise, type: 'power' }).code, 'hold');
});

test('load suggestions require a known increment and never invent a kilogram increase or band conversion', () => {
  const top = history().map(item => ({ ...item, sets: [{ value: 8, otherSide: 8 }, { value: 8, otherSide: 8 }] }));
  const unspecified = advice(top);
  assert.equal(unspecified.code, 'consider_load');
  assert.equal(Object.hasOwn(unspecified.parameters, 'proposedLoadKg'), false);
  const known = advice(top, { loadIncrementKg: 1 });
  assert.equal(known.parameters.proposedLoadKg, 9);
  assert.equal(known.parameters.value, '6');
  const bands = top.map(item => ({ ...item, variant: 'band', loadKg: null, loadBasis: 'description', resistanceLabel: 'Blue band; same marked anchor' }));
  assert.equal(advice(bands, { loadIncrementKg: 1 }).code, 'hold');
  assert.equal(advice(top.map(item => ({ ...item, loadKg: 500 })), { loadIncrementKg: 2 }).parameters.proposedLoadKg, undefined);
});

test('explicit reduction preserves completed targets and preparation and only changes existing unfinished work', () => {
  const { catalog, day } = dayFixture();
  const completed = { [exerciseKey(1, 'bf_B01')]: true };
  const original = structuredClone(day);
  const adapted = adaptDayForReadiness(day, { action: 'reduce', reasonCodes: ['elevated_load'] }, completed, catalog);
  assert.deepEqual(adapted.prescriptions.find(item => item.id === 'bf_B01'), day.prescriptions.find(item => item.id === 'bf_B01'));
  assert.deepEqual(day, original);
  assert.ok(adapted.routine.every(id => day.routine.includes(id)));
  const unfinished = adaptDayForReadiness(day, { action: 'reduce', reasonCodes: ['elevated_load'] }, {}, catalog);
  assert.equal(unfinished.prescriptions.find(item => item.id === 'bf_B01').sets, 2);
  assert.deepEqual(unfinished.prescriptions.find(item => item.id === 'bf_B01').preparation, day.prescriptions.find(item => item.id === 'bf_B01').preparation);
  assert.ok(estimateSessionMinutes(unfinished, catalog) <= estimateSessionMinutes(day, catalog));
  assert.match(unfinished.coachAdvice, /尚未完成/);
});

test('hard court day removes extra unfinished jumping, recovery/rest add nothing and never overwrite a done slot', () => {
  const { catalog, day } = dayFixture();
  day.routine.splice(1, 0, 'bf_E02'); day.prescriptions.splice(1, 0, doseFor(catalog, 'bf_E02', 'skill'));
  const adapted = adaptDayForReadiness(day, { action: 'reduce', reasonCodes: ['today_hard_court'] }, {}, catalog);
  assert.equal(adapted.routine.includes('bf_E02'), false);
  const recovery = adaptDayForReadiness(day, { action: 'recover', reasonCodes: ['high_recovery_need'] }, {}, catalog);
  assert.equal(recovery.routine.includes('bf_B01'), false);
  assert.equal(recovery.routine.includes('bf_E02'), false);
  assert.equal(recovery.routine.includes('bf_D09'), true);
  assert.equal(recovery.sessionType, 'recovery');
  const stopped = adaptDayForReadiness(day, { action: 'rest', reasonCodes: ['red_flags'] }, { [exerciseKey(1, 'bf_B01')]: true }, catalog);
  assert.deepEqual(stopped.routine, ['bf_B01']);
  assert.deepEqual(stopped.prescriptions, [day.prescriptions.find(item => item.id === 'bf_B01')]);
  const pureRest = adaptDayForReadiness({ ...day, routine: [], prescriptions: [], sessionType: 'rest' }, { action: 'reduce', reasonCodes: [] }, {}, catalog);
  assert.deepEqual(pureRest.routine, []);
  assert.equal(pureRest.sessionType, 'rest');
  assert.deepEqual(adaptDayForReadiness(day, { action: 'unknown', reasonCodes: [] }, {}, catalog), day);
});

test('clinical recovery never retains unclassified custom mobility or changes completed legacy absence', () => {
  const { catalog, day } = dayFixture();
  catalog.custom = { type: 'mobility', name: 'Unclassified shoulder movement', prescription: { sets: 1, value: '30', unit: 'seconds' } };
  day.routine.push('custom');
  const incomplete = adaptDayForReadiness(day, { action: 'recover', reasonCodes: ['restricted'] }, {}, catalog);
  assert.equal(incomplete.routine.includes('custom'), false);
  const complete = adaptDayForReadiness(day, { action: 'rest', reasonCodes: ['worsening_symptoms'] }, { day1_custom: true }, catalog);
  assert.deepEqual(complete.routine, ['custom']);
  assert.equal(complete.prescriptions.some(item => item.id === 'custom'), false);
});

test('single fractional time targets never increase during a reduction and recovery days never escalate', () => {
  const { catalog, day } = dayFixture();
  const fractional = { ...day, routine: ['bf_B01'], prescriptions: [{ ...day.prescriptions[1], sets: 1, value: '0.5', unit: 'seconds' }] };
  const adapted = adaptDayForReadiness(fractional, { action: 'reduce', reasonCodes: [] }, {}, catalog);
  assert.ok(Number(adapted.prescriptions[0].value) <= 0.5);
  const recoveryDay = { ...day, sessionType: 'recovery' };
  assert.equal(adaptDayForReadiness(recoveryDay, { action: 'reduce', reasonCodes: [] }, {}, catalog).sessionType, 'recovery');
});

test('old evidence after a break cannot support an increase even if two lifetime sessions were good', () => {
  const old = [log('2026-09-01'), log('2026-09-02')];
  const result = advice(old);
  assert.equal(result.code, 'record_more');
  assert.deepEqual(result.reasonCodes, ['recent_sessions_required']);
  assert.deepEqual(result.evidenceDates, []);
  assert.equal(advice([log('2026-09-15'), log('2026-10-09')]).code, 'record_more');
  assert.equal(advice([log('2026-09-16'), log('2026-10-09')]).code, 'progress_reps');
});

test('missing clinical status or free health notes cannot be interpreted as progression clearance', () => {
  assert.deepEqual(advice(history(), { healthStatus: undefined }).reasonCodes, ['clinical_status_unknown']);
  assert.deepEqual(advice(history(), { healthStatus: 'invented' }).reasonCodes, ['clinical_status_unknown']);
  assert.deepEqual(advice(history(), { healthNotes: 'My shoulder feels loose after treatment' }).reasonCodes, ['clinical_notes_review']);
  assert.equal(evaluateReadiness(ready(), { today, healthStatus: 'unrestricted', healthNotes: 'knee recovering' }).action, 'recover');
});

test('bodyweight evidence requires the same explicit variation, depth/support/tempo description', () => {
  const bodyweight = history().map(item => ({ ...item, variant: 'bodyweight', loadBasis: 'none', loadKg: null, resistanceLabel: '' }));
  assert.deepEqual(advice(bodyweight).reasonCodes, ['bodyweight_definition_required']);
  const comparable = bodyweight.map(item => ({ ...item, resistanceLabel: 'Supported split squat; same depth; 3-second lower' }));
  assert.equal(advice(comparable).code, 'progress_reps');
  comparable[1].resistanceLabel = 'Unassisted split squat; deeper; fast lower';
  assert.deepEqual(advice(comparable).reasonCodes, ['incomparable_resistance']);
});

test('recovery can retain an existing easy walk and visual prediction without adding a new activity', () => {
  const { catalog, day } = dayFixture();
  for (const id of ['bf_I01', 'bf_G07']) { day.routine.push(id); day.prescriptions.push(doseFor(catalog, id, 'skill')); }
  const recovered = adaptDayForReadiness(day, { action: 'recover', reasonCodes: ['high_recovery_need'] }, {}, catalog);
  assert.equal(recovered.routine.includes('bf_I01'), true);
  assert.equal(recovered.routine.includes('bf_G07'), true);
  assert.ok(recovered.routine.every(id => day.routine.includes(id)));
  const hardCourt = adaptDayForReadiness(day, { action: 'reduce', reasonCodes: ['today_hard_court'] }, {}, catalog);
  assert.equal(hardCourt.routine.includes('bf_G07'), true);
});
