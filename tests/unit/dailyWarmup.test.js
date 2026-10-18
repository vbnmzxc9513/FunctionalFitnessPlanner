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
      assert.deepEqual(day.routine.slice(0, 2), ['bf_A01', 'bf_A13']);
      const dose = day.prescriptions.find(item => item.id === 'bf_A13');
      assert.deepEqual(dose, { id: 'bf_A13', ...exercises.bf_A13.prescription, phase: 'warmup' });
      assert.ok(sessionSections(day, exercises)[0].seconds >= 12 * 60, 'both timed warm-ups count, before any lift preparation');
      assert.ok(estimateSessionMinutes(day, exercises) <= minutes);
      assert.ok(day.routine.length <= 8);
      const main = day.prescriptions.find(item => item.phase === 'strength');
      if (main) assert.ok(main.preparation);
      assert.equal(createSharePayload(day).items.filter(item => item.id === 'bf_A13').length, 1);
    }
    for (const day of plan.schedule.filter(day => day.sessionType !== 'training')) assert.ok(!day.routine.includes('bf_A13'));
  }
});

test('flow guide contains eight paced parts in both languages, distinct hip switches and no strength credit', () => {
  for (const lang of ['zh', 'en']) {
    const guide = getExerciseGuide('bf_A13', exercises.bf_A13, lang).guide;
    assert.equal(guide.steps.length, 8);
    const total = guide.steps.reduce((sum, step) => sum + Number(step.match(/(?:約 |about )(\d+)/)[1]), 0);
    assert.equal(total, 600, 'internal allocation fits ten minutes including transitions');
  }
  assert.match(getExerciseGuide('bf_A13').guide.steps[6], /不是靠牆呼吸/);
  assert.deepEqual(classifyBalanceExercise('bf_A13', exercises.bf_A13), { mobility: ['hip', 'ankle', 'thoracic'], patterns: [], unclassified: false });
  assert.ok(exercises.bf_A13.shoulderLoaded);
  assert.ok(exercises.bf_A13.aliases.includes('嬰兒式'));
  for (const region of ['髖前側', '內收肌', '股四頭肌', '腿後側', '腓腸肌', '比目魚肌']) assert.ok(getExerciseGuide('bf_A13').guide.steps.join(' ').includes(region));
});

test('shorter sessions and historical six-minute flows retain their own complete dose and instructions', () => {
  for (const minutes of [20, 25, 29]) {
    const plan = generate(context, minutes);
    for (const day of plan.schedule.filter(day => day.sessionType === 'training')) {
      assert.deepEqual(day.routine.slice(0, 2), ['bf_A01', 'bf_A12']);
      assert.ok(!day.routine.includes('bf_A13'));
      assert.ok(estimateSessionMinutes(day, exercises) <= minutes);
      assert.match(day.warmupNote, /6 分鐘/);
    }
  }
  const historical = generate(context, 25).schedule.find(day => day.routine.includes('bf_A12'));
  const snapshot = structuredClone(historical);
  assert.doesNotThrow(() => validateSharePayload(createSharePayload(historical)));
  assert.doesNotThrow(() => validateGeneratedPlan({ conclusion: '', schedule: [historical] }, exercises, 25, { calendarDays: [historical.day] }));
  assert.deepEqual(historical, snapshot);
  for (const lang of ['zh', 'en']) {
    const guide = getExerciseGuide('bf_A12', exercises.bf_A12, lang).guide;
    assert.equal(guide.steps.reduce((sum, step) => sum + Number(step.match(/(?:約 |about )(\d+)/)[1]), 0), 360);
  }
});

test('time pressure reduces training work while retaining the complete full-body warm-up', () => {
  const profile = { ...context, badmintonDays: [], trainingDays: [1, 2, 3, 4, 5] };
  for (const minutes of [30, 35, 40]) {
    const plan = generate(profile, minutes);
    for (const day of plan.schedule.filter(day => day.sessionType === 'training')) {
      assert.deepEqual(day.routine.slice(0, 2), ['bf_A01', 'bf_A13']);
      assert.equal(day.prescriptions.find(dose => dose.id === 'bf_A13').value, '10');
      assert.ok(!day.routine.includes('bf_A12'));
      assert.match(day.warmupNote, /10 分鐘/);
      assert.ok(estimateSessionMinutes(day, exercises) <= minutes);
      assert.doesNotThrow(() => validateSharePayload(createSharePayload(day)));
    }
  }
});

test('clinical limits, recovery priority, taper, disabled flows and short sessions keep their exceptions', () => {
  for (const change of [{ healthStatus: 'unknown' }, { healthNotes: '肩部震波' }, { healthNotes: '膝痛' }, { sorenessRegions: ['upper'] }, { recoveryNotes: 'poor sleep' }]) {
    const plan = generate({ ...context, ...change });
    assert.ok(plan.schedule.every(day => !day.routine.some(id => ['bf_A12', 'bf_A13'].includes(id))), JSON.stringify(change));
  }
  assert.equal(planningExercises(exercises, { ...context, healthStatus: 'restricted' }).bf_A13, undefined);
  const taperProfile = { ...context, competitionDate: '2026-10-26' };
  const previous = generate();
  for (const previousPlan of [undefined, previous]) {
    const plan = generate(taperProfile, 35, exercises, { previousPlan });
    assert.ok(plan.schedule.every(day => !day.routine.includes('bf_A13')), 'no new full flow is introduced during taper');
  }
  const disabled = { ...exercises, bf_A13: { ...exercises.bf_A13, active: false }, bf_A12: { ...exercises.bf_A12, active: false } };
  const without = generate(context, 35, disabled);
  assert.ok(without.schedule.every(day => !day.routine.includes('bf_A13')));
  const noHeat = { ...exercises, bf_A01: { ...exercises.bf_A01, active: false } };
  for (const weeklyExerciseIds of [[], ['bf_A13']]) {
    const plan = generate({ ...context, weeklyExerciseIds }, 35, noHeat);
    assert.ok(plan.schedule.every(day => !day.routine.includes('bf_A13')), 'the flow cannot claim a listed heat-raising step when it is disabled');
  }
  for (const minutes of [5, 10, 15]) {
    const plan = generate(context, minutes);
    assert.ok(plan.schedule.every(day => !day.routine.includes('bf_A13')));
    assert.doesNotThrow(() => validateGeneratedPlan(plan, planningExercises(exercises, context), minutes));
  }
  const day = previous.schedule.find(day => day.routine.includes('bf_A13'));
  const recovered = adaptDayForReadiness(day, { action: 'recover', reasonCodes: ['restricted'] }, {}, exercises);
  assert.ok(!recovered.routine.includes('bf_A13'));
});

test('an explicit weekly warm-up choice can replace the default without adding hidden work', () => {
  const plan = generate({ ...context, weeklyExerciseIds: ['bf_A06'] });
  assert.ok(plan.schedule.some(day => day.prescriptions.some(dose => dose.id === 'bf_A06' && dose.phase === 'warmup')));
  for (const day of plan.schedule.filter(day => day.routine.includes('bf_A06'))) {
    assert.ok(!day.routine.includes('bf_A13'));
    assert.ok(!day.warmupNote.includes('10 分鐘八段'));
  }
});

test('generated and shared flows reject compressed or multiplied doses; prompt explains limits', () => {
  const plan = generate();
  const day = plan.schedule.find(day => day.routine.includes('bf_A13'));
  for (const change of [{ value: '2' }, { unit: 'reps' }, { sets: 2 }, { perSide: true }, { restSeconds: 60 }]) {
    const tampered = structuredClone(plan);
    Object.assign(tampered.schedule.find(item => item.day === day.day).prescriptions.find(dose => dose.id === 'bf_A13'), change);
    assert.throws(() => validateGeneratedPlan(tampered, exercises, 40), /INVALID_AI_PRESCRIPTION/);
    const share = createSharePayload(day);
    Object.assign(share.items.find(item => item.id === 'bf_A13'), change);
    assert.throws(() => validateSharePayload(share), /INVALID_SHARE/);
  }
  const prompt = buildPlanningPrompt({ availableExercises: exercises, context, dailyTime: 35 });
  for (const text of ['bf_A13', '完整十分鐘', '不強塞', '徒手 Y/T', '90/90 髖轉換不同於 D09']) assert.ok(prompt.includes(text));
});

test('AI and public sharing reject stacking the compact and full warm-up flows', () => {
  const day = structuredClone(generate().schedule.find(day => day.routine.includes('bf_A13')));
  day.routine = ['bf_A01', 'bf_A12', 'bf_A13'];
  day.prescriptions = day.routine.map(id => ({ id, ...exercises[id].prescription, phase: 'warmup' }));
  assert.throws(() => validateGeneratedPlan({ conclusion: '', schedule: [day] }, exercises, 40, { calendarDays: [day.day] }), /INVALID_AI_PRESCRIPTION/);
  assert.throws(() => createSharePayload(day), /INVALID_SHARE/);
  for (const weeklyExerciseIds of [['bf_A12', 'bf_A13'], ['bf_A13', 'bf_A12']]) {
    for (const session of generate({ ...context, weeklyExerciseIds }).schedule) assert.ok(session.routine.filter(id => ['bf_A12', 'bf_A13'].includes(id)).length <= 1);
  }
});
