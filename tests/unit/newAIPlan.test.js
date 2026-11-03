import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises, eligibleExercises } from '../../src/domain/exerciseCatalog.js';
import { generateTemplatePlan } from '../../src/domain/templatePlanner.js';
import { validateGeneratedPlan } from '../../src/domain/planning.js';
import { validateNewAIPlan } from '../../src/domain/newAIPlan.js';
import { dailyWarmupPrescriptions, isDailyWarmupComplete } from '../../src/domain/quickWorkouts.js';

const exercises = catalogExercises();
const context = { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable'], badmintonDays: [2, 5] };
const options = { context, currentDate: '2026-10-19', currentWeek: '2026-W43' };
const make = (profile = context, minutes = 35, catalog = exercises, extra = {}) => generateTemplatePlan(catalog, profile, minutes, 'zh', { ...options, ...extra });
const remove = (day, id) => { day.routine = day.routine.filter(item => item !== id); day.prescriptions = day.prescriptions.filter(dose => dose.id !== id); };

test('new AI requires the canonical eight independent opening IDs, phases, order and doses when eligible', () => {
  const canonical = make();
  assert.deepEqual(validateNewAIPlan(canonical, exercises, 35, options), canonical);
  const missing = structuredClone(canonical); remove(missing.schedule[0], 'bf_A19');
  assert.doesNotThrow(() => validateGeneratedPlan(missing, exercises, 35));
  assert.throws(() => validateNewAIPlan(missing, exercises, 35, options), /AI_DAILY_WARMUP_MISSING/);
  const wrongDose = structuredClone(canonical); wrongDose.schedule[0].prescriptions[0].value = '2';
  assert.throws(() => validateNewAIPlan(wrongDose, exercises, 35, options), /AI_DAILY_WARMUP_DOSE/);
  const wrongOrder = structuredClone(canonical); [wrongOrder.schedule[0].routine[0], wrongOrder.schedule[0].routine[1]] = [wrongOrder.schedule[0].routine[1], wrongOrder.schedule[0].routine[0]];
  assert.throws(() => validateNewAIPlan(wrongOrder, exercises, 35, options), /AI_DAILY_WARMUP_DOSE/);
});

test('short, disabled, soreness-limited and clinical recovery are exceptions without inventing eight completed movements', () => {
  for (const [profile, minutes, catalog] of [
    [context, 10, exercises],
    [{ ...context, sorenessRegions: ['posterior'], sorenessImpact: 'limited' }, 35, exercises],
    [{ ...context, healthStatus: 'unknown' }, 35, exercises],
    [{ ...context, healthNotes: 'shoulder shockwave' }, 35, exercises],
    [context, 35, { ...exercises, bf_A19: { ...exercises.bf_A19, active: false } }],
  ]) {
    const plan = make(profile, minutes, catalog);
    const eligible = eligibleExercises(catalog, profile);
    assert.doesNotThrow(() => validateNewAIPlan(plan, eligible, minutes, { ...options, context: profile }));
    assert.ok(plan.schedule.every(day => !isDailyWarmupComplete(day)));
  }
  const restricted = { ...context, healthStatus: 'restricted' };
  const rest = make(restricted);
  const day = rest.schedule[0]; day.routine = ['bf_A02']; day.prescriptions = [{ id: 'bf_A02', ...exercises.bf_A02.prescription, phase: 'recovery' }]; day.sessionType = 'recovery';
  assert.doesNotThrow(() => validateNewAIPlan(rest, eligibleExercises(exercises, restricted), 35, { ...options, context: restricted }));
});

test('court/fatigue retain the eight while unfamiliar taper does not acquire them; explicit rest stays empty', () => {
  for (const profile of [{ ...context, recoveryState: 'reduce' }, { ...context, recoveryState: 'recover' }]) {
    const plan = make(profile);
    assert.ok(plan.schedule.filter(day => day.routine.length).every(isDailyWarmupComplete));
    assert.doesNotThrow(() => validateNewAIPlan(plan, exercises, 35, { ...options, context: profile }));
  }
  const profile = { ...context, competitionDate: '2026-10-26' };
  const taper = make(profile);
  assert.doesNotThrow(() => validateNewAIPlan(taper, exercises, 35, { ...options, context: profile }));
  const inserted = structuredClone(taper); const day = inserted.schedule[0];
  day.prescriptions = dailyWarmupPrescriptions('recovery'); day.routine = day.prescriptions.map(dose => dose.id); day.sessionType = 'recovery';
  assert.throws(() => validateNewAIPlan(inserted, exercises, 35, { ...options, context: profile }), /AI_DAILY_WARMUP_CONTEXT/);
  const familiar = { ...profile, warmupFamiliar: true };
  assert.doesNotThrow(() => validateNewAIPlan(make(familiar), exercises, 35, { ...options, context: familiar }));
});

test('new AI rejects legacy sequences and aerobic warmups while generic historical validation remains compatible', () => {
  const blank = make({ ...context, healthStatus: 'unknown' });
  for (const [id, expected] of [['bf_A13', /AI_LEGACY_WARMUP/], ['bf_A12', /AI_LEGACY_WARMUP/], ['bf_A01', /AI_AEROBIC_WARMUP/]]) {
    for (const phase of ['warmup', 'recovery']) {
      const old = structuredClone(blank); const day = old.schedule[0];
      day.routine = [id]; day.prescriptions = [{ id, ...exercises[id].prescription, phase }]; day.sessionType = 'recovery';
      assert.doesNotThrow(() => validateGeneratedPlan(old, exercises, 35));
      assert.throws(() => validateNewAIPlan(old, exercises, 35, { ...options, context: { ...context, healthStatus: 'restricted' } }), expected);
    }
  }
});
