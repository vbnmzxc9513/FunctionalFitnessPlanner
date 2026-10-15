import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLoadBasis, emptySet, optionalNumber, readinessInput, readinessForm, readinessMissing, readinessChanges, trainingLogInput } from '../../src/domain/logForms.js';
import { coachText } from '../../src/coachLocale.js';

const form = { variant: 'bodyweight', loadBasis: 'none', loadKg: '', resistanceLabel: '', sets: [emptySet()], rir: '', quality: 'unknown', symptoms: 'unknown', nextDay: 'pending' };

test('blank actual values remain missing instead of becoming zero or prescribed reps', () => {
  const log = trainingLogInput(form, { perSide: true, planned: { value: '8' } });
  assert.equal(log.sets[0].value, null);
  assert.equal(log.sets[0].otherSide, null);
  assert.equal(log.rir, null);
  assert.equal(log.loadKg, null);
  assert.equal(optionalNumber('0'), 0, 'an explicitly entered zero remains factual');
});

test('per-dumbbell kilograms retain their basis and band descriptions have no invented kg', () => {
  const dumbbell = trainingLogInput({ ...form, variant: 'dumbbell', loadBasis: 'per_dumbbell', loadKg: '5', sets: [{ value: '8', otherSide: '6' }] }, { perSide: true });
  assert.equal(dumbbell.loadKg, 5);
  assert.equal(dumbbell.loadBasis, 'per_dumbbell');
  assert.deepEqual(dumbbell.sets, [{ value: 8, otherSide: 6 }]);
  const band = trainingLogInput({ ...form, variant: 'band', loadBasis: 'description', loadKg: '5', resistanceLabel: ' red band ' }, { perSide: false });
  assert.equal(band.loadKg, null);
  assert.equal(band.resistanceLabel, 'red band');
  assert.equal(defaultLoadBasis('dumbbell'), 'per_dumbbell');
  assert.equal(defaultLoadBasis('band'), 'description');
});

test('missing readiness never defaults to good sleep, no court play or no symptoms', () => {
  const input = readinessInput({ sleepHours: '', fatigue: '', soreness: '', symptoms: 'unknown', yesterdayCourtMinutes: '', yesterdayCourtRpe: '', todayCourtIntensity: 'unknown' }, '2026-10-14');
  assert.equal(input.sleepHours, null);
  assert.equal(input.yesterdayCourtMinutes, null);
  assert.equal(input.symptoms, 'unknown');
  assert.equal(input.todayCourtIntensity, 'unknown');
});

test('guidance reasons are localized without exposing internal codes', () => {
  for (const lang of ['zh', 'en']) {
    assert.ok(coachText(lang, 'reason_target_not_met').length > 20);
    assert.ok(!coachText(lang, 'reason_target_not_met').includes('target_not_met'));
    assert.ok(coachText(lang, 'applyConflict').length > 20);
  }
});


test('bodyweight variants remain factual descriptions without adding load', () => {
  const value = trainingLogInput({ ...form, resistanceLabel: ' wall-assisted ' }, { perSide: false });
  assert.equal(value.resistanceLabel, 'wall-assisted');
  assert.equal(value.loadKg, null);
  assert.equal(value.loadBasis, 'none');
  assert.match(coachText('zh', 'bodyweightPlaceholder'), /靠牆/);
  assert.match(coachText('en', 'bodyweightPlaceholder'), /kneeling/);
});


test('court question distinguishes unknown, explicit no session and an entered session', () => {
  const unknown = readinessInput(readinessForm(null), '2026-10-15');
  assert.equal(unknown.yesterdayCourtMinutes, null);
  assert.equal(unknown.yesterdayCourtRpe, null);
  const noCourt = readinessInput({ ...readinessForm(null), yesterdayCourt: 'none', yesterdayCourtMinutes: '90', yesterdayCourtRpe: '8' }, '2026-10-15');
  assert.equal(noCourt.yesterdayCourtMinutes, 0, 'explicit no court overrides stale hidden minutes');
  assert.equal(noCourt.yesterdayCourtRpe, null, 'no court does not invent an effort rating');
  const played = readinessInput({ ...readinessForm(null), yesterdayCourt: 'yes', yesterdayCourtMinutes: '90', yesterdayCourtRpe: '' }, '2026-10-15');
  assert.equal(played.yesterdayCourtMinutes, 90);
  assert.equal(played.yesterdayCourtRpe, null);
  assert.equal(readinessForm(noCourt).yesterdayCourt, 'none');
  assert.equal(readinessForm(played).yesterdayCourt, 'yes');
});

test('readiness missing labels match decision inputs and do not ask RPE for no court', () => {
  const value = readinessInput({ ...readinessForm(null), yesterdayCourt: 'none' }, '2026-10-15');
  assert.deepEqual(readinessMissing(value), ['sleepHours', 'fatigue', 'soreness', 'symptoms', 'todayCourtIntensity']);
  assert.deepEqual(readinessMissing({ ...value, sleepHours: 7, fatigue: 0, soreness: 0, symptoms: 'none', todayCourtIntensity: 'none' }), []);
  assert.deepEqual(readinessMissing({ ...value, sleepHours: 7, fatigue: 0, soreness: 0, symptoms: 'none', todayCourtIntensity: 'none', yesterdayCourtMinutes: 60 }), ['yesterdayCourtRpe']);
});

test('adjustment preview lists only removed or changed exercises and preparation changes', () => {
  const original = { routine: ['warmup', 'squat', 'jump'], prescriptions: [{ id: 'warmup', sets: 1, value: '5', unit: 'reps' }, { id: 'squat', sets: 2, value: '6–8', unit: 'reps', preparation: { sets: 1, value: '4' } }, { id: 'jump', sets: 2, value: '3', unit: 'reps' }] };
  const adapted = { routine: ['warmup', 'squat'], prescriptions: [original.prescriptions[0], { ...original.prescriptions[1], sets: 1 }] };
  const changes = readinessChanges(original, adapted);
  assert.deepEqual(changes.map(change => change.id), ['squat', 'jump']);
  assert.equal(changes[0].before.sets, 2);
  assert.equal(changes[0].after.sets, 1);
  assert.equal(changes[1].removed, true);
  assert.deepEqual(readinessChanges(original, structuredClone(original)), []);
  const preparationOnly = structuredClone(original);
  preparationOnly.prescriptions[1].preparation.value = '2';
  assert.deepEqual(readinessChanges(original, preparationOnly).map(change => change.id), ['squat']);
  assert.equal(original.prescriptions[1].preparation.value, '4', 'preview does not mutate prescriptions');
});
