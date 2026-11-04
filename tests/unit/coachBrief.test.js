import test from 'node:test';
import assert from 'node:assert/strict';
import { planningGuidance, coachPlanFacts } from '../../src/domain/coachBrief.js';
import { generatePeriodPlan } from '../../src/domain/periodPlanning.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';

const exercises = catalogExercises();
const range = { from: '2026-11-09', to: '2026-11-15' };
const context = { healthStatus: 'unrestricted', recoveryState: 'normal', equipment: ['dumbbell', 'band'], trainingDays: [1, 2, 3, 4, 5], badmintonDays: [2, 4, 5] };
const profile = { context, time: '40', focus: 'strength' };
const create = (input = profile, history = {}) => ({ ...generatePeriodPlan(exercises, input, range, { today: range.from, ...history }), profile: input });

test('intake flags actual date availability, short time and limits before making promises', () => {
  assert.deepEqual(planningGuidance(context, 40, range).issues, []);
  const weekend = { from: '2026-11-14', to: '2026-11-15' };
  assert.ok(planningGuidance(context, 40, weekend).issues.includes('noDays'));
  assert.ok(planningGuidance({ ...context, trainingDays: [2, 4] }, 40, range).issues.includes('courtOnly'));
  assert.ok(planningGuidance(context, 10, range).issues.includes('short'));
  assert.ok(planningGuidance({ ...context, healthNotes: '肩部震波治療' }, 40, range).issues.includes('restriction'));
  assert.ok(planningGuidance({ ...context, sorenessRegions: ['legs'], sorenessImpact: 'limited' }, 40, range).issues.includes('recover'));
  assert.ok(planningGuidance({ ...context, competitionDate: '2026-11-16' }, 40, range).issues.includes('competition'));
});

test('coach counts reflect actual prescriptions, including skill-only days and missing selected goals', () => {
  const plan = create({ ...profile, focus: 'coordination', context: { ...context, badmintonDays: [], targetRegions: ['calves'], weeklyExerciseIds: ['bf_B03', 'missing'] } });
  const facts = coachPlanFacts(plan, exercises);
  assert.equal(facts.count.strength, plan.sessions.filter(day => day.prescriptions.some(dose => dose.phase === 'strength')).length);
  assert.ok(facts.count.control > 0);
  assert.equal(Object.values(facts.count).reduce((a, b) => a + b), 7);
  assert.equal(facts.selectedCount, 2);
  assert.ok(facts.scheduledChoices < 2);
  assert.ok(facts.maxMinutes <= 40);
  assert.equal(facts.mobilityCount + facts.missingMobility.length, 8);
  const empty = coachPlanFacts({ ...plan, sessions: [] }, exercises);
  assert.deepEqual(empty.missingTargets, ['calves']);
  assert.equal(empty.scheduledChoices, 0);
  assert.equal(empty.mobilityCount, 0);
  assert.equal(empty.maxMinutes, 0);
  const legacy = coachPlanFacts({ sessions: [{ routine: ['bf_B03'], sessionType: 'training' }] }, exercises);
  assert.equal(legacy.count.unspecified, 1);
  assert.equal(legacy.count.control, 0, 'missing prescriptions do not become confirmed control training');
});

test('date planning carries last week difficulty feedback into actual load without escalating positive feedback', () => {
  const baseline = create();
  const difficult = create(profile, { progressByWeek: { '2026-W45': { feedbackValue: -1 } } });
  const easy = create(profile, { progressByWeek: { '2026-W45': { feedbackValue: 1 } } });
  const work = plan => plan.sessions.flatMap(day => day.prescriptions).filter(dose => dose.phase === 'strength').reduce((total, dose) => total + dose.sets, 0);
  assert.ok(work(difficult) < work(baseline));
  assert.equal(work(easy), work(baseline));
  assert.ok(difficult.sessions.some(day => day.coachAdvice.includes('上週回報偏難')));
  assert.equal(coachPlanFacts(create({ ...profile, context: { ...context, recoveryState: 'recover' } }), exercises).count.strength, 0);
});
