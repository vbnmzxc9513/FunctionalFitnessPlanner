import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTemplatePlan, manualPlanningExercises } from '../../src/domain/templatePlanner.js';
import { catalogExercises, equipmentChoices } from '../../src/domain/exerciseCatalog.js';
import { estimateSessionMinutes, planningExercises, validateGeneratedPlan } from '../../src/domain/planning.js';

const catalog = catalogExercises();
const context = { badmintonDays: [2, 4, 5], badmintonMinutes: 90, badmintonIntensity: 'mixed', equipment: ['dumbbell', 'band', 'cable', 'foam_roller'], healthStatus: 'unrestricted', experience: 'beginner' };
const options = { currentDate: '2026-10-14', currentWeek: '2026-W43' };
const strengthDays = plan => plan.schedule.filter(day => day.prescriptions.some(dose => dose.phase === 'strength'));
const volume = plan => plan.schedule.flatMap(day => day.prescriptions).reduce((total, dose) => total + (dose.phase === 'strength' ? dose.sets : 0), 0);

test('template matrix respects phases, actual time, equipment, partners and court days', () => {
  for (const badmintonDays of [[], [2, 4, 5], [2, 5, 6], [1, 2, 3, 4, 5], [6, 7], [7]]) {
    for (const equipment of [[], ['dumbbell'], ['band'], ['cable'], ['foam_roller', 'jump_rope']]) {
      for (const dailyTime of [5, 10, 20, 30, 40]) {
        const profile = { ...context, badmintonDays, equipment };
        const available = planningExercises(catalog, profile);
        const plan = generateTemplatePlan(catalog, profile, dailyTime, 'zh', options);
        assert.deepEqual(validateGeneratedPlan(plan, available, dailyTime), plan);
        assert.equal(plan.schedule.length, 5);
        assert.ok(strengthDays(plan).length <= 2);
        const strengths = strengthDays(plan).map(day => day.day);
        if (strengths.length === 2) assert.ok(Math.abs(strengths[1] - strengths[0]) >= 2);
        for (const day of plan.schedule) {
          assert.ok(estimateSessionMinutes(day, available) <= dailyTime);
          if (badmintonDays.includes(day.day)) assert.notEqual(day.sessionType, 'training');
          assert.ok(day.routine.length <= 8);
          for (const id of day.routine) {
            assert.ok(equipmentChoices(available[id], equipment).length);
            assert.equal(available[id].requiresPartner, false);
            assert.equal(available[id].advanced, false);
          }
        }
      }
    }
  }
});

test('template is deterministic, input-preserving and meaningful for each structured focus', () => {
  const original = structuredClone(catalog);
  const balanced = generateTemplatePlan(catalog, context, 35, 'zh', options);
  assert.deepEqual(generateTemplatePlan(catalog, context, 35, 'zh', options), balanced);
  assert.deepEqual(catalog, original);
  const coordination = generateTemplatePlan(catalog, context, 35, 'zh', { ...options, focus: 'coordination' });
  const stability = generateTemplatePlan(catalog, context, 35, 'zh', { ...options, focus: 'stability' });
  const strength = generateTemplatePlan(catalog, context, 35, 'zh', { ...options, focus: 'strength' });
  assert.ok(coordination.schedule.some(day => day.routine.includes('bf_F01')));
  assert.ok(stability.schedule.some(day => day.routine.includes('bf_B05') && day.routine.includes('bf_E01')));
  assert.ok(strength.schedule.some(day => day.prescriptions.some(dose => dose.phase === 'strength')));
  assert.notDeepEqual(strength.schedule, coordination.schedule);
  const withPartner = generateTemplatePlan(catalog, { ...context, partnerAvailable: true }, 35, 'en', { ...options, focus: 'coordination' });
  assert.ok(withPartner.schedule.some(day => day.routine.includes('bf_G01')));
  assert.ok(!/[\u4e00-\u9fff]/.test(JSON.stringify(withPartner)));
});

test('custom, disabled and deleted moves cannot silently enter a fixed template', () => {
  const modified = { ...catalog, custom: { name: 'Custom', active: true, prescription: catalog.bf_B01.prescription }, bf_B10: { ...catalog.bf_B10, deleted: true }, bf_F01: { ...catalog.bf_F01, active: false } };
  const plan = generateTemplatePlan(modified, context, 30, 'zh', options);
  for (const day of plan.schedule) for (const id of ['custom', 'bf_B10', 'bf_F01']) assert.ok(!day.routine.includes(id));
  const none = generateTemplatePlan({}, context, 30, 'zh', options);
  assert.ok(none.schedule.every(day => day.sessionType === 'rest' && !day.routine.length));
});

test('unclear clinical notes do not invent clearance, diagnosis or alternatives', () => {
  for (const profile of [
    { healthStatus: 'restricted', healthNotes: '膝蓋剛受傷' },
    { healthStatus: 'unrestricted', healthNotes: 'ankle pain when walking' },
    { healthStatus: 'unknown', healthNotes: '' },
    { healthStatus: 'restricted', healthNotes: '' },
    { healthStatus: 'unrestricted', healthNotes: '肩膀跟膝蓋不舒服' },
    { healthStatus: 'unrestricted', recoveryNotes: 'new weakness and numbness' },
  ]) {
    const plan = generateTemplatePlan(catalog, { ...context, ...profile }, 35, 'zh', options);
    assert.ok(plan.schedule.every(day => day.sessionType === 'rest' && !day.routine.length));
  }
  for (const healthNotes of ['肩部剛做震波，感覺鬆', 'shoulder pain after therapy']) {
    const profile = { ...context, healthNotes };
    const plan = generateTemplatePlan(catalog, profile, 35, 'zh', options);
    assert.ok(plan.schedule.every(day => day.sessionType === 'recovery' && day.routine.length === 1));
    for (const day of plan.schedule) assert.deepEqual(day.routine, ['bf_I01']);
    assert.match(plan.conclusion, /治療端允許/);
    assert.doesNotThrow(() => validateGeneratedPlan(plan, planningExercises(catalog, profile), 35));
  }
  assert.ok(strengthDays(generateTemplatePlan(catalog, { ...context, healthNotes: '沒有疼痛' }, 35, 'zh', options)).length);
});

test('fatigue and heavy/consecutive court load reduce strength rather than adding catch-up work', () => {
  const profile = { ...context, badmintonDays: [2, 5], badmintonMinutes: 60 };
  const normal = generateTemplatePlan(catalog, profile, 35, 'zh', options);
  assert.equal(strengthDays(normal).length, 2);
  for (const extra of [{ lastWeekFeedback: -1 }, { recoveryNotes: '睡不好、累' }]) {
    const plan = generateTemplatePlan(catalog, { ...profile, recoveryNotes: extra.recoveryNotes }, 35, 'zh', { ...options, lastWeekFeedback: extra.lastWeekFeedback });
    assert.ok(strengthDays(plan).length <= 1);
    assert.ok(volume(plan) < volume(normal));
  }
  const hard = generateTemplatePlan(catalog, { ...context, badmintonIntensity: 'hard' }, 35, 'zh', options);
  assert.ok(strengthDays(hard).length <= 1);
  const weekends = generateTemplatePlan(catalog, { ...context, badmintonDays: [2, 5, 6] }, 35, 'zh', options);
  assert.ok(strengthDays(weekends).length <= 1);
  assert.equal(weekends.schedule[4].sessionType, 'recovery');
  assert.equal(volume(generateTemplatePlan(catalog, profile, 35, 'zh', { ...options, lastWeekFeedback: 1 })), volume(normal));
});

test('competition uses each scheduled date, includes post-event recovery and avoids new taper moves', () => {
  const profile = { ...context, badmintonDays: [], competitionDate: '2026-10-26' };
  const noHistory = generateTemplatePlan(catalog, profile, 35, 'zh', options);
  assert.ok(noHistory.schedule.every(day => day.sessionType === 'recovery'));
  const previousPlan = generateTemplatePlan(catalog, { ...profile, competitionDate: '' }, 35, 'zh', options);
  const taper = generateTemplatePlan(catalog, profile, 35, 'zh', { ...options, previousPlan });
  assert.ok(volume(taper) < volume(previousPlan));
  const old = new Set(previousPlan.schedule.flatMap(day => day.routine));
  for (const day of taper.schedule.filter(day => day.sessionType === 'training')) for (const id of day.routine) assert.ok(old.has(id));
  const event = generateTemplatePlan(catalog, { ...profile, competitionDate: '2026-10-21' }, 35, 'zh', options);
  assert.ok(event.schedule.slice(0, 3).every(day => day.sessionType === 'rest'));
  assert.ok(event.schedule.slice(3).every(day => day.sessionType === 'rest'));
  const past = generateTemplatePlan(catalog, { ...profile, competitionDate: '2026-10-10' }, 35, 'zh', options);
  assert.ok(strengthDays(past).length > 0);
});

test('template rejects invalid times and reports missing court assumptions', () => {
  for (const minutes of [0, 4, 241, 'invalid']) assert.throws(() => generateTemplatePlan(catalog, context, minutes, 'zh', options), /INVALID_PLANNING_TIME/);
  assert.match(generateTemplatePlan(catalog, { ...context, badmintonDays: [] }, 35, 'zh', options).conclusion, /未提供球日/);
});


test('manual additions respect equipment and the same conservative clinical guard as templates', () => {
  const exercises = catalogExercises();
  const profile = { ...context, equipment: [], healthStatus: 'unrestricted', healthNotes: '', recoveryNotes: '' };
  const available = manualPlanningExercises(exercises, profile);
  assert.ok(available.bf_B01);
  assert.equal(available.bf_C11, undefined);
  for (const change of [
    { healthStatus: 'unknown' }, { healthNotes: 'ankle pain when walking' },
    { recoveryNotes: 'new weakness and numbness' }, { healthStatus: 'restricted', healthNotes: '' },
  ]) assert.deepEqual(manualPlanningExercises(exercises, { ...profile, ...change }), {});
  const shoulder = manualPlanningExercises(exercises, { ...profile, healthNotes: '肩部震波，治療限制未確認' });
  assert.ok(Object.keys(shoulder).length > 0);
  assert.ok(Object.values(shoulder).every(exercise => exercise.catalogCode === 'I01'));
});
