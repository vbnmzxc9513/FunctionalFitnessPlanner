import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { generateTemplatePlan } from '../../src/domain/templatePlanner.js';
import { planningExercises, validateGeneratedPlan, estimateSessionMinutes } from '../../src/domain/planning.js';
import { sessionSections } from '../../src/domain/sessions.js';
import { classifyBalanceExercise } from '../../src/domain/weeklyBalance.js';
import { createSharePayload, validateSharePayload } from '../../src/domain/sharing.js';
import { getExerciseGuide } from '../../src/data/exerciseGuides.js';
import { adaptDayForReadiness } from '../../src/domain/coaching.js';
import { buildPlanningPrompt } from '../../src/domain/coachingPrompt.js';

const exercises = catalogExercises();
const context = { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable'], badmintonDays: [2, 5, 6], badmintonMinutes: 60, badmintonIntensity: 'mixed' };
const options = { currentDate: '2026-10-14', currentWeek: '2026-W43' };
const generate = (profile = context, minutes = 35, catalog = exercises, extra = {}) => generateTemplatePlan(catalog, profile, minutes, 'zh', { ...options, ...extra });

test('normal lunch sessions start with heat then the complete flow, with honest timing and main preparation', () => {
  for (const badmintonDays of [[2, 4, 5], [2, 5, 6]]) for (const minutes of [30, 35, 40]) {
    const plan = generate({ ...context, badmintonDays }, minutes);
    const training = plan.schedule.filter(day => day.sessionType === 'training');
    assert.ok(training.length);
    for (const day of training) {
      assert.deepEqual(day.routine.slice(0, 2), ['bf_A01', 'bf_A12']);
      const dose = day.prescriptions.find(item => item.id === 'bf_A12');
      assert.deepEqual(dose, { id: 'bf_A12', ...exercises.bf_A12.prescription, phase: 'warmup' });
      assert.ok(sessionSections(day, exercises)[0].seconds >= 8 * 60, 'both timed warm-ups count, before any lift preparation');
      assert.ok(estimateSessionMinutes(day, exercises) <= minutes);
      assert.ok(day.routine.length <= 8);
      const main = day.prescriptions.find(item => item.phase === 'strength');
      if (main) assert.ok(main.preparation);
      assert.equal(createSharePayload(day).items.filter(item => item.id === 'bf_A12').length, 1);
    }
    for (const day of plan.schedule.filter(day => day.sessionType !== 'training')) assert.ok(!day.routine.includes('bf_A12'));
  }
});

test('flow guide contains eight paced parts in both languages, distinct hip switches and no strength credit', () => {
  for (const lang of ['zh', 'en']) {
    const guide = getExerciseGuide('bf_A12', exercises.bf_A12, lang).guide;
    assert.equal(guide.steps.length, 8);
    const total = guide.steps.reduce((sum, step) => sum + Number(step.match(/(?:約 |about )(\d+)/)[1]), 0);
    assert.equal(total, 360, 'internal allocation fits the six-minute total including transitions');
  }
  assert.match(getExerciseGuide('bf_A12').guide.steps[6], /不是靠牆呼吸/);
  assert.deepEqual(classifyBalanceExercise('bf_A12', exercises.bf_A12), { mobility: ['hip', 'ankle', 'thoracic'], patterns: [], unclassified: false });
  assert.ok(exercises.bf_A12.shoulderLoaded);
  assert.ok(exercises.bf_A12.aliases.includes('嬰兒式'));
});

test('clinical limits, recovery priority, taper, disabled flows and short sessions keep their exceptions', () => {
  for (const change of [{ healthStatus: 'unknown' }, { healthNotes: '肩部震波' }, { healthNotes: '膝痛' }, { sorenessRegions: ['upper'] }, { recoveryNotes: 'poor sleep' }]) {
    const plan = generate({ ...context, ...change });
    assert.ok(plan.schedule.every(day => !day.routine.includes('bf_A12')), JSON.stringify(change));
  }
  assert.equal(planningExercises(exercises, { ...context, healthStatus: 'restricted' }).bf_A12, undefined);
  const taperProfile = { ...context, competitionDate: '2026-10-26' };
  const previous = generate();
  for (const previousPlan of [undefined, previous]) {
    const plan = generate(taperProfile, 35, exercises, { previousPlan });
    assert.ok(plan.schedule.every(day => !day.routine.includes('bf_A12')), 'no new full flow is introduced during taper');
  }
  const disabled = { ...exercises, bf_A12: { ...exercises.bf_A12, active: false } };
  const without = generate(context, 35, disabled);
  assert.ok(without.schedule.every(day => !day.routine.includes('bf_A12')));
  const noHeat = { ...exercises, bf_A01: { ...exercises.bf_A01, active: false } };
  for (const weeklyExerciseIds of [[], ['bf_A12']]) {
    const plan = generate({ ...context, weeklyExerciseIds }, 35, noHeat);
    assert.ok(plan.schedule.every(day => !day.routine.includes('bf_A12')), 'the flow cannot claim a listed heat-raising step when it is disabled');
  }
  for (const minutes of [5, 10, 15]) {
    const plan = generate(context, minutes);
    assert.ok(plan.schedule.every(day => !day.routine.includes('bf_A12')));
    assert.doesNotThrow(() => validateGeneratedPlan(plan, planningExercises(exercises, context), minutes));
  }
  const day = previous.schedule.find(day => day.routine.includes('bf_A12'));
  const recovered = adaptDayForReadiness(day, { action: 'recover', reasonCodes: ['restricted'] }, {}, exercises);
  assert.ok(!recovered.routine.includes('bf_A12'));
});

test('an explicit weekly warm-up choice can replace the default without adding hidden work', () => {
  const plan = generate({ ...context, weeklyExerciseIds: ['bf_A06'] });
  assert.ok(plan.schedule.some(day => day.prescriptions.some(dose => dose.id === 'bf_A06' && dose.phase === 'warmup')));
  for (const day of plan.schedule.filter(day => day.routine.includes('bf_A06'))) {
    assert.ok(!day.routine.includes('bf_A12'));
    assert.ok(!day.warmupNote.includes('6 分鐘八段'));
  }
});

test('generated and shared flows reject compressed or multiplied doses; prompt explains limits', () => {
  const plan = generate();
  const day = plan.schedule.find(day => day.routine.includes('bf_A12'));
  for (const change of [{ value: '2' }, { unit: 'reps' }, { sets: 2 }, { perSide: true }, { restSeconds: 60 }]) {
    const tampered = structuredClone(plan);
    Object.assign(tampered.schedule.find(item => item.day === day.day).prescriptions.find(dose => dose.id === 'bf_A12'), change);
    assert.throws(() => validateGeneratedPlan(tampered, exercises, 40), /INVALID_AI_PRESCRIPTION/);
    const share = createSharePayload(day);
    Object.assign(share.items.find(item => item.id === 'bf_A12'), change);
    assert.throws(() => validateSharePayload(share), /INVALID_SHARE/);
  }
  const prompt = buildPlanningPrompt({ availableExercises: exercises, context, dailyTime: 35 });
  for (const text of ['bf_A12', '完整六分鐘', '不強塞', '徒手 Y/T', '90/90 髖轉換不同於 D09']) assert.ok(prompt.includes(text));
});
