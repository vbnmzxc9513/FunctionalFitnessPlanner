import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises, EXERCISE_CATEGORIES } from '../../src/domain/exerciseCatalog.js';
import { DEFAULT_PLANNING_CONTEXT, competitionDaysAway, estimateSessionMinutes, normalizePlanningContext, planningExercises, validateGeneratedPlan } from '../../src/domain/planning.js';
import { buildPlanningPrompt } from '../../src/domain/coachingPrompt.js';
import { DEFAULT_SCHEDULE_I18N, EXERCISES_I18N } from '../../src/locale.js';
import { exercisePhase, orderedRoutine } from '../../src/domain/phases.js';
import { prescription, normalizeSchedule } from '../../src/domain/training.js';

const catalog = catalogExercises();
const context = { ...DEFAULT_PLANNING_CONTEXT, equipment: ['dumbbell', 'band', 'cable', 'jump_rope', 'foam_roller', 'platform'] };
const emptyPlan = () => ({ conclusion: 'Recovery and weekly strategy', schedule: [1, 2, 3, 4, 5].map(day => ({ day, name: 'Day', theme: 'Rest', concept: 'Recovery', coachAdvice: 'Check readiness', sessionType: 'rest', warmupNote: 'Rest today', cooldownNote: 'No extra finish needed', routine: [], prescriptions: [] })) });
const include = (plan, id, dose = catalog[id].prescription) => {
  const day = plan.schedule[0]; day.sessionType = 'training';
  if (!day.routine.length) { day.routine.push('bf_A01'); day.prescriptions.push({ id: 'bf_A01', ...catalog.bf_A01.prescription, phase: 'warmup' }); }
  const phase = exercisePhase(day, id, catalog[id]);
  const preparation = phase === 'strength' ? { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: dose.perSide, instruction: 'Use bodyweight first' } : undefined;
  day.routine.push(id); day.prescriptions.push({ id, ...dose, phase, ...(preparation ? { preparation } : {}) });
  day.routine = orderedRoutine(day, catalog);
  return plan;
};

test('curated catalog has 83 bilingual entries, nine categories and controlled jump doses', () => {
  assert.equal(Object.keys(catalog).length, 83);
  assert.deepEqual([...new Set(Object.values(catalog).map(item => item.category))].sort(), [...EXERCISE_CATEGORIES].sort());
  assert.deepEqual(Object.keys(catalog), Object.keys(catalogExercises('en')));
  assert.ok(Object.values(catalogExercises('en')).every(item => item.name && item.tip && !/[\u4e00-\u9fff]/.test(item.name + item.tip)));
  for (const item of Object.values(catalog).filter(item => item.advanced)) assert.equal(item.active, false);
  assert.equal(catalog.bulgarian.catalogCode, 'B12');
  assert.equal(catalog.dead_bug.catalogCode, 'D01');
  assert.ok(Object.values(catalog).every(item => !item.equipmentOptions.flat().includes('medicine_ball')));
});
test('planning excludes unavailable equipment, partners, disabled moves and beginner advanced hops', () => {
  const available = planningExercises(catalog, { ...context, equipment: [] });
  assert.ok(available.bf_B01);
  assert.equal(available.bf_B11, undefined);
  assert.equal(available.bf_G02, undefined);
  assert.equal(available.bf_E03, undefined);
  const advanced = planningExercises({ ...catalog, bf_E03: { ...catalog.bf_E03, active: true } }, { ...context, experience: 'advanced' });
  assert.ok(advanced.bf_E03);
});
test('shockwave notes conservatively restrict shoulder loading without turning lack of pain into clearance', () => {
  const profile = normalizePlanningContext({ ...context, healthNotes: '肩部剛做震波，目前感覺鬆' });
  assert.equal(profile.healthStatus, 'restricted');
  const available = planningExercises({ ...EXERCISES_I18N.zh, custom_test: { name: 'Unknown loading', active: true } }, profile);
  assert.ok(available.bf_B01);
  assert.deepEqual(available.bf_B01.equipmentOptions, [[]]);
  for (const id of ['bf_C01', 'bf_B11', 'bf_D03', 'bf_I04', 'custom_test']) assert.equal(available[id], undefined);
});
test('dates and malformed profile inputs cannot invent a competition countdown or ball-session time', () => {
  assert.equal(competitionDaysAway('2026-11-16', '2026-10-13'), 34);
  assert.equal(competitionDaysAway('2026-02-30', '2026-10-13'), null);
  const profile = normalizePlanningContext({ badmintonDays: [2, 2, 5, 6, 8, '4'], badmintonMinutes: -2, competitionDate: 'wrong' });
  assert.deepEqual(profile.badmintonDays, [2, 5, 6]);
  assert.equal(profile.badmintonMinutes, '');
  assert.equal(profile.competitionDate, '');
});
test('generated plans allow rest days but reject unknown IDs, missing doses and oversized sessions', () => {
  assert.equal(validateGeneratedPlan(emptyPlan(), catalog, 30).schedule[0].routine.length, 0);
  const invalid = include(emptyPlan(), 'bf_B01');
  invalid.schedule[0].routine[0] = 'invented';
  assert.throws(() => validateGeneratedPlan(invalid, catalog, 30), /INVALID_AI_PLAN/);
  invalid.schedule[0].routine[0] = 'toString';
  assert.throws(() => validateGeneratedPlan(invalid, catalog, 30), /INVALID_AI_PLAN/);
  const missing = include(emptyPlan(), 'bf_B01'); missing.schedule[0].prescriptions = [];
  assert.throws(() => validateGeneratedPlan(missing, catalog, 30), /INVALID_AI_PRESCRIPTION/);
  const timed = include(emptyPlan(), 'bf_I01', { sets: 2, value: '20', unit: 'minutes', restSeconds: 60, perSide: false });
  assert.throws(() => validateGeneratedPlan(timed, catalog, 30), /AI_SESSION_TOO_LONG/);
  const reversed = include(emptyPlan(), 'bf_B01', { ...catalog.bf_B01.prescription, value: '8–6' });
  assert.throws(() => validateGeneratedPlan(reversed, catalog, 30), /INVALID_AI_PRESCRIPTION/);
});
test('added jump contact cap includes both sides and does not count non-jumping snap-downs', () => {
  const overloaded = include(emptyPlan(), 'bf_E03', { sets: 3, value: '5', unit: 'reps', restSeconds: 90, perSide: true });
  assert.throws(() => validateGeneratedPlan(overloaded, catalog, 30), /EXCESSIVE_AI_JUMP_VOLUME/);
  assert.doesNotThrow(() => validateGeneratedPlan(include(emptyPlan(), 'bf_E01'), catalog, 30));
  const mixed = include(include(emptyPlan(), 'bf_E02'), 'bf_I04');
  assert.throws(() => validateGeneratedPlan(mixed, catalog, 30), /EXCESSIVE_AI_JUMP_VOLUME/);
});
test('saved AI doses override global difficulty, and manual removal drops orphan prescriptions', () => {
  const plan = include(emptyPlan(), 'bf_B01', { sets: 1, value: '6', unit: 'reps', restSeconds: 90, perSide: true });
  assert.equal(prescription('bf_B01', 'lower', 2, catalog.bf_B01, plan.schedule[0]).sets, 1);
  plan.schedule[0].routine = [];
  assert.deepEqual(normalizeSchedule(plan.schedule, catalog)[0].prescriptions, []);
  assert.equal(prescription('bf_D09', 'core', 2, catalog.bf_D09).unit, 'breaths');
});
test('default weekly example has recovery slots and a practical rough time budget', () => {
  assert.equal(DEFAULT_SCHEDULE_I18N.zh.length, 5);
  for (const day of DEFAULT_SCHEDULE_I18N.zh) {
    const timed = day;
    assert.ok(estimateSessionMinutes(timed, EXERCISES_I18N.zh) <= 40);
    assert.ok(day.routine.every(id => EXERCISES_I18N.zh[id]));
  }
});
test('prompt includes court days, real dates, previous plan and progressive feedback rather than fixed daily quotas', () => {
  const prompt = buildPlanningPrompt({ availableExercises: catalog, dailyTime: 35, lastWeekFeedback: 1, currentDate: '2026-10-13',
    context: { ...context, badmintonDays: [2, 4, 5], competitionDate: '2026-11-16' }, previousPlan: { conclusion: 'keep the split squat' } });
  for (const text of ['34', 'keep the split squat', '不直接改成高衝擊', 'routine=[]', '30–50%', '星期六日球局']) assert.ok(prompt.includes(text), text);
  assert.ok(!prompt.includes('剛好 4 到 5'));
});
