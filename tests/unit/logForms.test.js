import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultLoadBasis, emptySet, optionalNumber, readinessInput, trainingLogInput } from '../../src/domain/logForms.js';
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
