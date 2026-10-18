import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWeeklyBalance, classifyBalanceExercise, MOBILITY_REGIONS, TRAINING_PATTERNS } from '../../src/domain/weeklyBalance.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { generateTemplatePlan } from '../../src/domain/templatePlanner.js';
import { planningExercises, validateGeneratedPlan } from '../../src/domain/planning.js';
import { estimateSessionMinutes } from '../../src/domain/sessions.js';
import { buildPlanningPrompt } from '../../src/domain/coachingPrompt.js';
import { WEEKLY_BALANCE_TEXT, weeklyBalanceText } from '../../src/weeklyBalanceLocale.js';

const catalog = catalogExercises();
const context = { healthStatus: 'unrestricted', healthNotes: '', equipment: ['dumbbell', 'cable', 'foam_roller'], badmintonDays: [2, 4, 5], badmintonMinutes: 90, badmintonIntensity: 'mixed' };
const options = { currentDate: '2026-10-15', currentWeek: '2026-W43' };
const analysis = (schedule, profile = context, exercises = catalog) => analyzeWeeklyBalance(schedule, exercises, profile, { week: options.currentWeek, currentDate: options.currentDate });
const byKey = (balance, kind, key) => balance[kind].find(row => row.key === key);
const schedule = entries => entries.map(([day, ...routine]) => ({ day, routine, sessionType: routine.length ? 'training' : 'rest' }));

test('weekly mobility counts distinct scheduled days, not movements, strength, breathing or jumps', () => {
  const result = analysis(schedule([[1, 'bf_A06', 'bf_A11', 'bf_A06', 'bf_B11', 'bf_D09', 'bf_E02'], [2, 'bf_D09', 'bf_B10'], [3, 'bf_H12']]));
  assert.deepEqual(byKey(result, 'mobility', 'thoracic').days, [1, 3]);
  assert.equal(byKey(result, 'mobility', 'thoracic').count, 2);
  assert.deepEqual(byKey(result, 'mobility', 'thoracic').byDay[1], ['bf_A06', 'bf_A11']);
  assert.equal(byKey(result, 'mobility', 'hip').count, 0);
  assert.equal(byKey(result, 'patterns', 'hinge').count, 1);
  assert.equal(byKey(result, 'patterns', 'core').count, 0);
  assert.equal(Object.hasOwn(result, 'score'), false);
});

test('pull means actual pulling pattern, not wrist work, scapular control or stretching', () => {
  const result = analysis(schedule([[1, 'bf_C05', 'bf_C08', 'bf_C09', 'bf_H07'], [2, 'bf_C01', 'bf_C04'], [3, 'bf_C10']]));
  assert.deepEqual(byKey(result, 'patterns', 'pull').days, [2, 3]);
  assert.deepEqual(byKey(result, 'mobility', 'shoulder').days, [1]);
  assert.equal(byKey(result, 'mobility', 'thoracic').count, 0);
  assert.deepEqual(classifyBalanceExercise('bf_H10', catalog.bf_H10).mobility, []);
});

test('unknown customs retain their IDs without guessed coverage, including forged catalog codes', () => {
  const exercises = { ...catalog, custom: { name: 'Thoracic squat mobility', type: 'lower' }, fake: { name: 'Open book', catalogCode: 'A06' } };
  const result = analysis(schedule([[1, 'custom'], [2, 'fake', 'missing']] ), context, exercises);
  assert.deepEqual(result.unclassified, [{ day: 1, id: 'custom' }, { day: 2, id: 'fake' }, { day: 2, id: 'missing' }]);
  assert.ok([...result.mobility, ...result.patterns].every(row => row.count === 0));
});

test('missing coverage under restrictions or unknown information does not prescribe make-up exercises', () => {
  for (const profile of [{ ...context, healthStatus: 'restricted', healthNotes: 'shoulder treatment' }, { ...context, healthNotes: 'ankle pain' }]) {
    const result = analysis(schedule([[1, 'bf_I01']]), profile);
    assert.equal(byKey(result, 'mobility', 'thoracic').status, 'limited');
    assert.equal(byKey(result, 'patterns', 'push').status, 'limited');
    assert.deepEqual(byKey(result, 'mobility', 'thoracic').days, []);
  }
  assert.equal(byKey(analysis([], { ...context, healthStatus: 'unknown' }), 'mobility', 'thoracic').status, 'information_missing');
  const questionable = analysis(schedule([[1, 'bf_A11']]), { ...context, healthStatus: 'restricted', healthNotes: 'shoulder treatment' });
  assert.equal(byKey(questionable, 'mobility', 'thoracic').status, 'check_conditions');
  assert.deepEqual(byKey(questionable, 'mobility', 'thoracic').unavailableDays, [1]);
});

test('equipment, disabled entries, court days and competition affect explanations without fabricating completion', () => {
  const bodyweight = analysis([], { ...context, equipment: [] });
  assert.equal(byKey(bodyweight, 'patterns', 'pull').status, 'unavailable');
  assert.equal(byKey(bodyweight, 'patterns', 'footwork_reaction').status, 'court_priority');
  assert.equal(byKey(bodyweight, 'patterns', 'footwork_reaction').count, 0);
  const taper = analysis([], { ...context, competitionDate: '2026-10-26' });
  assert.equal(byKey(taper, 'mobility', 'thoracic').status, 'competition_priority');
  assert.ok(taper.days.every(day => day.protected));
  const fatigue = analysis([], { ...context, recoveryNotes: 'poor sleep' });
  assert.equal(byKey(fatigue, 'mobility', 'thoracic').status, 'recovery_priority');
  const disabled = Object.fromEntries(Object.entries(catalog).map(([id, e]) => [id, ['A06', 'A10', 'A11', 'A12', 'A13', 'H12'].includes(e.catalogCode) ? { ...e, active: false } : e]));
  assert.equal(byKey(analysis([], context, disabled), 'mobility', 'thoracic').status, 'unavailable');
});

test('normal template includes thoracic, hip and ankle days through existing short slots, preserving main preparation', () => {
  const plan = generateTemplatePlan(catalog, context, 35, 'zh', options);
  const result = analysis(plan.schedule);
  for (const region of ['thoracic', 'hip', 'ankle']) assert.ok(byKey(result, 'mobility', region).count > 0);
  const main = plan.schedule.find(day => day.prescriptions.some(dose => dose.phase === 'strength'));
  const first = main.prescriptions.find(dose => dose.phase === 'strength');
  assert.equal(first.id, 'bf_B10');
  assert.deepEqual(first.preparation, { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: false,
    instruction: '使用此動作已選器材的最輕可控阻力，保留餘力，不做到疲勞。' });
  assert.ok(main.routine.includes('bf_A13'));
  assert.ok(main.routine.includes('bf_B11'));
  assert.ok(main.routine.length <= 8);
  for (const day of plan.schedule.filter(item => context.badmintonDays.includes(item.day))) {
    assert.equal(day.sessionType, 'recovery');
    assert.equal(day.routine.length, 2);
    assert.equal(day.prescriptions.find(dose => dose.id === 'bf_I01').value, '5');
    assert.ok(estimateSessionMinutes(day, catalog) <= 8);
  }
});

test('template rotates existing eligible upper slots between push/pull without inventing a bodyweight pull', () => {
  const profile = { ...context, badmintonDays: [2, 5], badmintonMinutes: 60, equipment: ['dumbbell', 'platform'] };
  const plan = generateTemplatePlan(catalog, profile, 35, 'zh', options);
  const result = analysis(plan.schedule, profile);
  assert.equal(byKey(result, 'patterns', 'push').count, 1);
  assert.equal(byKey(result, 'patterns', 'pull').count, 1);
  const upper = plan.schedule.flatMap(day => day.prescriptions.filter(dose => catalog[dose.id].category === 'upper'));
  assert.deepEqual(upper.map(dose => dose.id), ['bf_C11', 'bf_C10']);
  assert.ok(upper.every(dose => dose.sets === 1 && dose.value === '6'));
  const noSupport = generateTemplatePlan(catalog, { ...profile, equipment: ['dumbbell'] }, 35, 'zh', options);
  assert.equal(byKey(analysis(noSupport.schedule, { ...profile, equipment: ['dumbbell'] }), 'patterns', 'pull').status, 'unavailable');
  const bodyweight = generateTemplatePlan(catalog, { ...profile, equipment: [] }, 35, 'zh', options);
  assert.equal(byKey(analysis(bodyweight.schedule, { ...profile, equipment: [] }), 'patterns', 'pull').count, 0);
});

test('restricted, unknown, fatigue and taper templates preserve their clinical/recovery priority instead of filling coverage', () => {
  const shoulder = generateTemplatePlan(catalog, { ...context, healthNotes: 'shoulder therapy' }, 35, 'zh', options);
  assert.ok(shoulder.schedule.every(day => JSON.stringify(day.routine) === JSON.stringify(['bf_I01'])));
  const unknown = generateTemplatePlan(catalog, { ...context, healthStatus: 'unknown' }, 35, 'zh', options);
  assert.ok(unknown.schedule.every(day => day.routine.length === 0));
  const taperProfile = { ...context, competitionDate: '2026-10-26', badmintonDays: [] };
  const taper = generateTemplatePlan(catalog, taperProfile, 35, 'zh', options);
  assert.ok(taper.schedule.every(day => JSON.stringify(day.routine) === JSON.stringify(['bf_I01', 'bf_A02'])));
  assert.equal(byKey(analysis(taper.schedule, taperProfile), 'mobility', 'thoracic').count, 0);
  const fatigue = generateTemplatePlan(catalog, { ...context, recoveryNotes: 'poor sleep' }, 35, 'zh', options);
  assert.equal(byKey(analysis(fatigue.schedule), 'mobility', 'thoracic').count, 0);
});

test('rotation never uses disabled/no-equipment thoracic moves, is deterministic and short sessions remain validated', () => {
  const limited = { ...catalog, bf_A12: { ...catalog.bf_A12, active: false }, bf_A13: { ...catalog.bf_A13, active: false }, bf_A11: { ...catalog.bf_A11, active: false }, bf_A06: { ...catalog.bf_A06, active: false }, bf_A10: { ...catalog.bf_A10, active: false } };
  const profile = { ...context, equipment: [] };
  const noRoller = generateTemplatePlan(limited, profile, 35, 'zh', options);
  assert.equal(byKey(analysis(noRoller.schedule, profile, limited), 'mobility', 'thoracic').count, 0);
  for (const minutes of [5, 6, 7, 10, 15, 20, 30, 40]) {
    const plan = generateTemplatePlan(catalog, profile, minutes, 'zh', options);
    assert.deepEqual(plan, generateTemplatePlan(catalog, profile, minutes, 'zh', options));
    assert.doesNotThrow(() => validateGeneratedPlan(plan, planningExercises(catalog, profile), minutes));
    assert.ok(plan.schedule.every(day => estimateSessionMinutes(day, catalog) <= minutes));
  }
});

test('prompt takes a weekly view without promising a perfect balance and locale keys match', () => {
  const prompt = buildPlanningPrompt({ availableExercises: {}, context, currentDate: options.currentDate, currentWeek: options.currentWeek });
  assert.match(prompt, /一週覆蓋與目的性重複/);
  assert.match(prompt, /90\/90呼吸不算胸椎拉伸/);
  assert.match(prompt, /不能宣稱課表已完美平衡/);
  assert.deepEqual(Object.keys(WEEKLY_BALANCE_TEXT.zh).sort(), Object.keys(WEEKLY_BALANCE_TEXT.en).sort());
  for (const key of [...MOBILITY_REGIONS, ...TRAINING_PATTERNS]) assert.notEqual(weeklyBalanceText('en', key), key);
});
