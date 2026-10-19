import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises, EQUIPMENT } from '../../src/domain/exerciseCatalog.js';
import { generateTemplatePlan, manualPlanningExercises } from '../../src/domain/templatePlanner.js';
import { normalizePlanningContext, planningExercises, validateGeneratedPlan } from '../../src/domain/planning.js';
import { createWeeklyIntent, normalizeWeeklyIntent, weeklyChoiceIds } from '../../src/domain/trainingPreferences.js';
import { buildWeeklyChoiceReport, weeklyChoiceBlockReason, recommendWeeklyChoices } from '../../src/domain/weeklyChoices.js';
import { questionnaireProfile, readQuestionnaireDraft, planningFingerprint } from '../../src/domain/questionnaire.js';
import { createSharePayload } from '../../src/domain/sharing.js';
import { estimateSessionMinutes } from '../../src/domain/sessions.js';
import { normalizeTrialInput } from '../../functions/core.js';
import { SELECTION_TRANSLATIONS } from '../../src/selectionLocale.js';

const exercises = catalogExercises();
const context = { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable', 'foam_roller'], experience: 'intermediate', badmintonDays: [2, 5] };
const options = { currentDate: '2026-10-14', currentWeek: '2026-W42' };
const selections = ['bf_B03', 'dead_bug', 'bf_A06', 'bf_H03'];
const formalSets = plan => plan.schedule.flatMap(day => day.prescriptions).filter(dose => ['strength', 'accessory'].includes(dose.phase)).reduce((sum, dose) => sum + dose.sets, 0);

test('weekly choices remain bounded preferences independent from clinical notes and favorites', () => {
  assert.deepEqual(weeklyChoiceIds(['bf_B03', 'bf_B03', '../bad', 4, 'dead_bug']), ['bf_B03', 'dead_bug']);
  const profile = normalizePlanningContext({ ...context, weeklyExerciseIds: selections, sorenessRegions: ['legs', 'calf', 'fake'], healthNotes: '肩部震波' });
  assert.equal(profile.healthStatus, 'restricted');
  assert.deepEqual(profile.sorenessRegions, ['legs', 'calf']);
  const intent = createWeeklyIntent(profile);
  assert.deepEqual(normalizeWeeklyIntent(intent), intent);
  for (const ids of [['bf_B03', 'bf_B03'], ['../bad'], [8], Array.from({ length: 9 }, (_, n) => `move_${n}`)]) assert.equal(normalizeWeeklyIntent({ ...intent, weeklyExerciseIds: ids }), null);
  for (const key of ['sorenessRegions', 'healthNotes', 'libraryGroups']) assert.equal(Object.hasOwn(intent, key), false);
  assert.equal(Object.hasOwn(createWeeklyIntent(context), 'weeklyExerciseIds'), false, 'old intent snapshots retain their shape');
});

test('selected compatible moves replace real slots with specific preparation and no extra sessions', () => {
  const profile = { ...context, weeklyExerciseIds: selections };
  const plan = generateTemplatePlan(exercises, profile, 35, 'zh', options);
  const base = generateTemplatePlan(exercises, context, 35, 'zh', options);
  const report = buildWeeklyChoiceReport(plan, exercises, profile, manualPlanningExercises(exercises, profile), options.currentWeek);
  assert.ok(report.every(item => item.reason === 'planned' && item.days.length), 'explicit single stretches use real mobility slots alongside the full opening');
  for (const day of plan.schedule) {
    assert.ok(day.routine.length <= 8);
    assert.ok(estimateSessionMinutes(day, exercises) <= 35);
    if (day.sessionType === 'training') assert.equal(day.routine[0], 'bf_A13', 'the full stretching opening survives preference priority');
    const first = day.prescriptions.find(dose => dose.phase === 'strength');
    if (first) assert.equal(first.preparation.perSide, first.perSide);
    if (context.badmintonDays.includes(day.day)) assert.notEqual(day.sessionType, 'training');
  }
  assert.equal(plan.schedule.filter(day => day.prescriptions.some(dose => dose.phase === 'strength')).length, base.schedule.filter(day => day.prescriptions.some(dose => dose.phase === 'strength')).length);
  assert.deepEqual(exercises, catalogExercises(), 'catalog and favorites are untouched');
  const adjusted = structuredClone(plan); adjusted.schedule = adjusted.schedule.map(day => ({ ...day, routine: day.routine.filter(id => id !== 'bf_B03') }));
  assert.equal(buildWeeklyChoiceReport(adjusted, exercises).find(item => item.id === 'bf_B03').reason, 'omitted', 'report follows actual current content');
});

test('all eligible choices and short budgets preserve phase, contact, time and prescription validation', () => {
  for (const id of Object.keys(exercises)) for (const minutes of [5, 10, 35]) for (const focus of ['balanced', 'stability']) {
    const profile = { ...context, weeklyExerciseIds: [id] };
    const plan = generateTemplatePlan(exercises, profile, minutes, 'zh', { ...options, focus });
    assert.deepEqual(validateGeneratedPlan(plan, planningExercises(exercises, profile), minutes), plan);
    for (const day of plan.schedule) assert.ok(estimateSessionMinutes(day, exercises) <= minutes);
  }
});

test('choices cannot change clinical, recovery or competition priority; soreness reduces rather than adds', () => {
  for (const extra of [{ healthStatus: 'unknown' }, { healthNotes: '膝痛' }, { healthNotes: 'shoulder therapy' }, { recoveryNotes: 'poor sleep' }, { sorenessRegions: ['legs'] }, { competitionDate: '2026-10-18' }]) {
    const profile = { ...context, ...extra };
    const base = generateTemplatePlan(exercises, profile, 35, 'zh', options);
    const selected = generateTemplatePlan(exercises, { ...profile, weeklyExerciseIds: selections }, 35, 'zh', options);
    assert.deepEqual(selected.schedule, base.schedule, JSON.stringify(extra));
  }
  const normal = generateTemplatePlan(exercises, context, 35, 'zh', options);
  const sore = generateTemplatePlan(exercises, { ...context, sorenessRegions: ['legs'] }, 35, 'zh', options);
  assert.ok(formalSets(sore) < formalSets(normal));
});

test('recommendation and omission reasons enforce equipment, experience, partner and metadata', () => {
  const profile = normalizePlanningContext({ ...context, equipment: [], experience: 'beginner', weeklyExerciseIds: ['bf_B03', 'missing'] });
  const available = manualPlanningExercises(exercises, profile);
  assert.equal(weeklyChoiceBlockReason('bf_B03', exercises, profile, available), 'equipment');
  assert.equal(weeklyChoiceBlockReason('missing', exercises, profile, available), 'unavailable');
  const choices = recommendWeeklyChoices(exercises, profile, 'balanced', available);
  for (const id of choices) assert.equal(weeklyChoiceBlockReason(id, exercises, profile, available), null);
  const plan = generateTemplatePlan(exercises, profile, 5, 'zh', options);
  const report = buildWeeklyChoiceReport(plan, exercises, profile, available, options.currentWeek);
  assert.deepEqual(report.map(item => item.reason), ['equipment', 'unavailable']);
  const unknown = { ...exercises, forged: { ...exercises.bf_B03, catalogCode: 'B03', libraryGroups: ['training'] } };
  assert.equal(weeklyChoiceBlockReason('forged', unknown, context, unknown), 'metadata');
});

test('questionnaire drafts are week-scoped and stale preview fingerprints include real planning inputs', () => {
  const week = options.currentWeek;
  const value = questionnaireProfile({ context: { ...context, weeklyExerciseIds: selections }, focus: 'stability', time: '35', goal: 'control' }, week);
  const storage = { getItem: () => JSON.stringify(value) };
  assert.deepEqual(readQuestionnaireDraft(storage, 'draft', week), value);
  assert.equal(readQuestionnaireDraft(storage, 'draft', '2026-W43'), null);
  assert.equal(readQuestionnaireDraft({ getItem() { throw Error('blocked'); } }, 'draft', week), null);
  const inputs = { ...value, week, uid: 'owner', revision: 2, progress: {}, mode: 'template', exercises };
  const fingerprint = planningFingerprint(inputs);
  for (const change of [{ week: '2026-W43' }, { revision: 3 }, { uid: 'other' }, { time: '20' }, { progress: { day1_bf_B03: true } }, { context: { ...value.context, sorenessRegions: ['legs'] } }]) assert.notEqual(planningFingerprint({ ...inputs, ...change }), fingerprint);
});

test('new preferences stay out of public links and hosted AI rejects malformed selections', () => {
  const profile = { ...context, weeklyExerciseIds: selections, sorenessRegions: ['legs'] };
  const plan = generateTemplatePlan(exercises, profile, 35, 'zh', options);
  const shared = JSON.stringify(createSharePayload(plan.schedule[0], exercises));
  for (const key of ['weeklyExerciseIds', 'sorenessRegions', 'weeklyIntent']) assert.ok(!shared.includes(key));
  for (const change of [{ weeklyExerciseIds: ['bad/id'] }, { weeklyExerciseIds: ['bf_B03', 'bf_B03'] }, { sorenessRegions: ['fake'] }, { sorenessRegions: ['hip', 'ankle', 'thoracic'] }]) assert.throws(() => normalizeTrialInput({ context: { ...profile, ...change }, dailyTime: 35 }, normalizePlanningContext, EQUIPMENT));
  assert.deepEqual(Object.keys(SELECTION_TRANSLATIONS.zh).sort(), Object.keys(SELECTION_TRANSLATIONS.en).sort());
});
