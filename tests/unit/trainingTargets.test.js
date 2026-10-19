import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { normalizePlanningContext } from '../../src/domain/planning.js';
import { createWeeklyIntent, normalizeWeeklyIntent, MAX_TARGET_REGIONS } from '../../src/domain/trainingPreferences.js';
import { generatePeriodPlan } from '../../src/domain/periodPlanning.js';
import { trainingTargetReport, matchesTrainingTarget } from '../../src/domain/trainingTargets.js';
import { estimateSessionMinutes } from '../../src/domain/sessions.js';
import { buildWeekOverview } from '../../src/domain/weekOverview.js';
import { recommendWeeklyChoices } from '../../src/domain/weeklyChoices.js';
import { manualPlanningExercises } from '../../src/domain/templatePlanner.js';
import { normalizeTrialInput } from '../../functions/core.js';
import { EQUIPMENT } from '../../src/domain/exerciseCatalog.js';
import { buildPlanningPrompt } from '../../src/domain/coachingPrompt.js';
import { createSharePayload } from '../../src/domain/sharing.js';

const exercises = catalogExercises();
const context = { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable'], badmintonDays: [2, 3, 5], badmintonMinutes: 90, badmintonIntensity: 'mixed' };
const make = (targetRegions, patch = {}, to = '2026-10-23', time = 35) => generatePeriodPlan(exercises, { time, context: { ...context, targetRegions, ...patch } }, { from: '2026-10-19', to }, { today: '2026-10-19' });
const workSets = result => result.sessions.flatMap(day => day.prescriptions).filter(dose => ['strength', 'accessory'].includes(dose.phase)).reduce((sum, dose) => sum + dose.sets, 0);

test('four fine priorities survive normalization and bounded intent; old priorities and soreness/stiffness caps stay compatible', () => {
  const targetRegions = ['serratus', 'rotator_cuff', 'glutes', 'calves'];
  const profile = normalizePlanningContext({ ...context, targetRegions: [...targetRegions, 'fake', 'serratus'], stiffnessRegions: ['hip', 'ankle', 'thoracic'], sorenessRegions: ['legs', 'calf', 'upper'] });
  assert.equal(MAX_TARGET_REGIONS, 4); assert.deepEqual(profile.targetRegions, targetRegions);
  assert.equal(profile.stiffnessRegions.length, 2); assert.equal(profile.sorenessRegions.length, 2);
  const intent = createWeeklyIntent(profile);
  assert.deepEqual(normalizeWeeklyIntent(intent), intent);
  assert.deepEqual(normalizeWeeklyIntent(createWeeklyIntent({ targetRegions: ['upper', 'core'] })).targetRegions, ['upper', 'core']);
  for (const targetRegions of [['serratus', 'fake'], ['serratus', 'serratus'], ['legs', 'upper', 'core', 'serratus', 'calves']]) assert.equal(normalizeWeeklyIntent({ ...intent, targetRegions }), null);
  assert.equal(normalizeTrialInput({ dailyTime: 35, lang: 'zh', context: profile }, normalizePlanningContext, EQUIPMENT).context.targetRegions.length, 4);
  assert.throws(() => normalizeTrialInput({ dailyTime: 35, context: { targetRegions: ['legs', 'upper', 'core', 'serratus', 'calves'] } }, normalizePlanningContext, EQUIPMENT), /AI_TRIAL_INVALID_INPUT/);
});

test('serratus selection assigns a real specific accessory while preserving the stretching flow and basic strength patterns', () => {
  for (const time of [30, 35, 40]) {
    const base = make([], {}, '2026-10-23', time), plan = make(['serratus'], {}, '2026-10-23', time);
    const day = plan.sessions.find(day => day.sessionType === 'training');
    assert.equal(day.routine[0], 'bf_A13');
    assert.ok(day.prescriptions.some(dose => dose.id === 'bf_C07' && dose.phase === 'accessory' && dose.sets === 1));
    for (const id of ['bf_B10', 'bf_B11', 'bf_C01', 'bf_C11']) assert.ok(day.routine.includes(id));
    assert.ok(plan.sessions.every(day => day.routine.length <= 8 && estimateSessionMinutes(day, exercises) <= time));
    assert.ok(workSets(plan) <= workSets(base));
    assert.equal(plan.weeklySummaries[0].strengthSessions, base.weeklySummaries[0].strengthSessions);
  }
  const none = make(['serratus'], { equipment: [] });
  assert.ok(none.sessions.some(day => day.prescriptions.some(dose => dose.id === 'bf_A07' && dose.phase === 'accessory')));
  assert.ok(none.sessions.every(day => !day.routine.includes('bf_C07')));
});

test('fine targets match curated contributing exercises, not any push/pull, stretches or forged names', () => {
  assert.equal(matchesTrainingTarget('serratus', 'bf_C07', exercises.bf_C07), true);
  for (const id of ['bf_C11', 'bf_A13', 'bf_C01']) assert.equal(matchesTrainingTarget('serratus', id, exercises[id]), false);
  assert.equal(matchesTrainingTarget('serratus', 'custom', { ...exercises.bf_C07 }), false);
  assert.equal(matchesTrainingTarget('calves', 'bf_B07', exercises.bf_B07), true);
  assert.equal(matchesTrainingTarget('calves', 'bf_F01', exercises.bf_F01), false);
  assert.equal(matchesTrainingTarget('rotator_cuff', 'bf_C01', exercises.bf_C01), false);
});

test('warm-up activation and dedicated work are reported separately, including guarded recovery weeks and legacy phases', () => {
  const normal = make(['serratus']);
  const row = trainingTargetReport(normal.sessions, exercises, ['serratus'])[0];
  assert.equal(row.dates.length, 1); assert.equal(row.activationDates.length, 5);
  const recover = make(['serratus'], { recoveryState: 'recover' });
  const recovered = trainingTargetReport(recover.sessions, exercises, ['serratus'])[0];
  assert.equal(recovered.dates.length, 0); assert.equal(recovered.activationDates.length, 5);
  const legacy = { day: 1, routine: ['bf_C07'], prescriptions: [] };
  assert.deepEqual(trainingTargetReport([legacy], exercises, ['serratus'])[0].dates, [1]);
  const week = buildWeekOverview(normal.sessions, exercises, '2026-W43', createWeeklyIntent({ targetRegions: ['serratus'] }));
  assert.deepEqual(week.targetCoverage[0].days, [1]);
});

test('multiple specialty priorities rotate through the existing accessory slot across weeks', () => {
  const targets = ['serratus', 'rotator_cuff', 'calves', 'glutes'];
  const plan = make(targets, {}, '2026-11-15');
  const rows = trainingTargetReport(plan.sessions, exercises, targets);
  assert.ok(rows.every(row => row.dates.length > 0));
  assert.ok(plan.sessions.filter(day => day.sessionType === 'training').every(day => day.prescriptions.filter(dose => dose.phase === 'accessory').length <= 1));
  const firstWeek = trainingTargetReport(plan.sessions.slice(0, 5), exercises, targets);
  assert.equal(firstWeek.find(row => row.region === 'rotator_cuff').dates.length, 0, 'selection is not falsely labeled as scheduled');
});

test('target choices never open clinical, recovery or unfamiliar taper work and cannot change a logged date', () => {
  for (const patch of [{ recoveryState: 'reduce' }, { recoveryState: 'recover' }, { healthNotes: '肩部震波' }, { healthStatus: 'unknown' }, { competitionDate: '2026-10-26' }]) {
    const base = make([], patch), target = make(['serratus', 'calves'], patch);
    assert.deepEqual(target.sessions.map(day => day.prescriptions), base.sessions.map(day => day.prescriptions));
  }
  const saved = make([]).sessions[0];
  const plan = generatePeriodPlan(exercises, { time: 35, context: { ...context, targetRegions: ['serratus'] } }, { from: '2026-10-19', to: '2026-10-23' }, { today: '2026-10-19', existingSessions: { [saved.date]: saved }, protectedDates: [saved.date] });
  assert.deepEqual(plan.sessions[0], saved);
});

test('fine priorities affect recommendations and AI context without leaking into public exercise sharing', () => {
  const profile = { ...context, targetRegions: ['serratus'] };
  const ids = recommendWeeklyChoices(exercises, profile, 'balanced', manualPlanningExercises(exercises, profile));
  assert.ok(ids.indexOf('bf_C07') < ids.indexOf('bf_C11'));
  const prompt = buildPlanningPrompt({ context: profile, availableExercises: exercises, dailyTime: 35 });
  assert.ok(prompt.includes('最多四項')); assert.ok(prompt.includes('不能把一般推胸或A13暖身啟動宣稱成已排專項肌力'));
  for (const lang of ['zh', 'en']) assert.ok(Buffer.byteLength(buildPlanningPrompt({ context: { ...context, targetRegions: ['serratus', 'rotator_cuff', 'calves', 'glutes'] }, availableExercises: catalogExercises(lang), dailyTime: 35, lang })) < 60000, 'target metadata stays within the hosted prompt bound');
  const share = createSharePayload(make(['serratus']).sessions[0]);
  assert.equal(Object.hasOwn(share, 'weeklyIntent'), false); assert.equal(Object.hasOwn(share, 'targetRegions'), false);
});
