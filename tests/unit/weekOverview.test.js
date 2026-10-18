import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlanningContext, validateGeneratedPlan, planningExercises } from '../../src/domain/planning.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { createWeeklyIntent, normalizeWeeklyIntent } from '../../src/domain/trainingPreferences.js';
import { buildWeekOverview } from '../../src/domain/weekOverview.js';
import { generateTemplatePlan } from '../../src/domain/templatePlanner.js';
import { normalizePromotionDraft } from '../../src/domain/promotion.js';
import { estimateSessionMinutes } from '../../src/domain/sessions.js';
import { createSharePayload } from '../../src/domain/sharing.js';
import { normalizeTrialInput } from '../../functions/core.js';
import { EQUIPMENT } from '../../src/domain/exerciseCatalog.js';
import { WEEK_PLAN_TEXT } from '../../src/weekPlanLocale.js';

const exercises = catalogExercises();
const context = { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable', 'foam_roller'], badmintonDays: [2, 5, 6] };
const options = { currentDate: '2026-10-14', currentWeek: '2026-W42', focus: 'coordination' };

test('weekly preferences are bounded facts, not health clearance or arbitrary metadata', () => {
  const profile = normalizePlanningContext({ ...context, targetRegions: ['core', 'upper', 'core', 'legs', 'fake'], stiffnessRegions: ['thoracic', 'shoulder', 'fake'], healthNotes: '肩部震波' });
  assert.equal(profile.healthStatus, 'restricted');
  assert.deepEqual(profile.targetRegions, ['legs', 'upper']);
  assert.deepEqual(profile.stiffnessRegions, ['thoracic', 'shoulder']);
  const intent = createWeeklyIntent(profile, 'stability', '35');
  assert.deepEqual(normalizeWeeklyIntent(intent), intent);
  for (const change of [{ focus: 'heal' }, { targetRegions: ['fake'] }, { targetRegions: ['core', 'core'] }, { stiffnessRegions: ['hip', 'ankle', 'thoracic'] }, { dailyTime: 300 }, { healthNotes: 'private' }, { competitionDate: '2026-02-30' }]) assert.equal(normalizeWeeklyIntent({ ...intent, ...change }), null);
  assert.ok(!JSON.stringify(intent).includes('震波'));
});

test('target priorities change real main order and main-specific warm-up without adding working sets', () => {
  const base = generateTemplatePlan(exercises, context, 35, 'zh', options);
  const targeted = generateTemplatePlan(exercises, { ...context, targetRegions: ['upper'], stiffnessRegions: ['shoulder'] }, 35, 'zh', options);
  const main = targeted.schedule.find(day => day.prescriptions.some(dose => dose.phase === 'strength'));
  assert.equal(exercises[main.prescriptions.find(dose => dose.phase === 'strength').id].category, 'upper');
  assert.ok(main.prescriptions.some(dose => dose.phase === 'warmup' && dose.id === 'bf_A13'));
  const compactCatalog = { ...exercises, bf_A12: { ...exercises.bf_A12, active: false }, bf_A13: { ...exercises.bf_A13, active: false } };
  const compact = generateTemplatePlan(compactCatalog, { ...context, targetRegions: ['upper'], stiffnessRegions: ['shoulder'] }, 35, 'zh', options);
  assert.ok(compact.schedule.some(day => day.prescriptions.some(dose => dose.phase === 'warmup' && dose.id === 'bf_A09')), 'when the flow is disabled, targeted individual warm-up remains available');
  const sets = plan => plan.schedule.flatMap(day => day.prescriptions).filter(dose => ['strength', 'accessory'].includes(dose.phase)).reduce((sum, dose) => sum + dose.sets, 0);
  assert.ok(sets(targeted) <= sets(base));
  const first = main.prescriptions.find(dose => dose.phase === 'strength');
  assert.ok(first.preparation);
  assert.equal(first.preparation.perSide, first.perSide);
});

test('preference matrix keeps phase validation, eligibility, time, court recovery and clinical/taper priority', () => {
  for (const targetRegions of [[], ['legs'], ['posterior'], ['upper'], ['core'], ['upper', 'core']]) {
    for (const stiffnessRegions of [[], ['hip'], ['ankle'], ['thoracic'], ['shoulder'], ['hip', 'shoulder']]) {
      for (const time of [5, 10, 20, 35]) {
        const profile = { ...context, targetRegions, stiffnessRegions };
        const plan = generateTemplatePlan(exercises, profile, time, 'zh', options);
        assert.deepEqual(validateGeneratedPlan(plan, planningExercises(exercises, profile), time), plan);
        for (const day of plan.schedule) {
          assert.ok(estimateSessionMinutes(day, exercises) <= time);
          assert.ok(day.routine.length <= 8);
          if (context.badmintonDays.includes(day.day)) assert.notEqual(day.sessionType, 'training');
        }
      }
    }
  }
  for (const change of [{ healthStatus: 'unknown' }, { healthNotes: '膝痛' }, { healthNotes: 'shoulder therapy' }, { recoveryNotes: 'new numbness' }, { competitionDate: '2026-10-18' }, { recoveryNotes: 'poor sleep' }]) {
    const profile = { ...context, ...change };
    const base = generateTemplatePlan(exercises, profile, 35, 'zh', options);
    const preferred = generateTemplatePlan(exercises, { ...profile, targetRegions: ['upper'], stiffnessRegions: ['shoulder'] }, 35, 'zh', options);
    assert.deepEqual(preferred.schedule, base.schedule, JSON.stringify(change));
  }
});

test('overview uses actual phases, includes weekend court days and labels legacy unknowns honestly', () => {
  const profile = { ...context, targetRegions: ['posterior'], stiffnessRegions: ['thoracic'] };
  const plan = generateTemplatePlan(exercises, profile, 35, 'zh', options);
  const overview = buildWeekOverview(plan.schedule, exercises, options.currentWeek, plan.weeklyIntent);
  assert.equal(overview.days.length, 7);
  assert.equal(overview.days[5].court, true);
  assert.equal(overview.days[5].type, 'unplanned');
  assert.equal(overview.days[5].minutes, null);
  assert.ok(overview.counts.skill > 0, 'skill inside a strength day is counted');
  assert.deepEqual(overview.targetCoverage[0].days, plan.schedule.filter(day => day.prescriptions.some(dose => dose.phase === 'strength' && ['bf_B11', 'bf_B03', 'bf_B04', 'bf_B06'].includes(dose.id))).map(day => day.day));
  const legacy = buildWeekOverview(plan.schedule, exercises, options.currentWeek);
  assert.equal(legacy.intent, null);
  assert.ok(legacy.days.every(day => day.court === null));
  assert.deepEqual(Object.keys(WEEK_PLAN_TEXT.zh).sort(), Object.keys(WEEK_PLAN_TEXT.en).sort());
});

test('weekly intent survives preview normalization without leaking unsaved inputs into the plan', () => {
  const profile = { context: { ...context, targetRegions: ['core'], stiffnessRegions: ['ankle'] }, focus: options.focus, time: '35' };
  const plan = { ...generateTemplatePlan(exercises, profile.context, profile.time, 'zh', options), source: 'template', language: 'zh' };
  const restored = normalizePromotionDraft({ week: options.currentWeek, plan, profile, completed: {} }, options.currentWeek);
  assert.ok(restored);
  assert.deepEqual(restored.plan.weeklyIntent, plan.weeklyIntent);
  assert.deepEqual(restored.profile.context.targetRegions, ['core']);
  const allRest = generateTemplatePlan(exercises, { ...profile.context, healthStatus: 'unknown' }, 35, 'zh', options);
  const overview = buildWeekOverview(allRest.schedule, exercises, options.currentWeek, allRest.weeklyIntent);
  assert.deepEqual(overview.targetCoverage[0].days, []);
  assert.equal(overview.counts.strength, 0);
});


test('private preferences stay out of public sharing and hosted input remains bounded', () => {
  const plan = generateTemplatePlan(exercises, { ...context, targetRegions: ['core'], stiffnessRegions: ['thoracic'] }, 35, 'zh', options);
  const payload = JSON.stringify(createSharePayload(plan.schedule[0], exercises));
  for (const key of ['weeklyIntent', 'targetRegions', 'stiffnessRegions', 'competitionDate']) assert.ok(!payload.includes(key));
  for (const extra of [{ targetRegions: ['fake'] }, { stiffnessRegions: ['hip', 'ankle', 'shoulder'] }, { targetRegions: ['upper', 'upper'] }]) {
    assert.throws(() => normalizeTrialInput({ dailyTime: 35, context: { ...context, ...extra } }, normalizePlanningContext, EQUIPMENT), /AI_TRIAL_INVALID_INPUT/);
  }
});
