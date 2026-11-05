import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises, eligibleExercises } from '../../src/domain/exerciseCatalog.js';
import { EXERCISES_I18N } from '../../src/locale.js';
import { addManualExercises, createManualSession, filterManualExercises } from '../../src/domain/manualPlanner.js';
import { classifyBalanceExercise } from '../../src/domain/weeklyBalance.js';
import { matchesTrainingTarget } from '../../src/domain/trainingTargets.js';
import { generateTemplatePlan, manualPlanningExercises } from '../../src/domain/templatePlanner.js';
import { createSharePayload, decodeSharePayload, encodeSharePayload, shareDay } from '../../src/domain/sharing.js';
import { getExerciseSource } from '../../src/data/exerciseSources.js';

const catalog = catalogExercises();
const ids = ['bf_C14', 'shoulder_press', 'plank_row', 'weighted_lunge'];
const context = { healthStatus: 'unrestricted', experience: 'advanced', equipment: ['dumbbell', 'cable'], badmintonDays: [] };
const enabled = { ...catalog, plank_row: { ...catalog.plank_row, active: true } };

test('gym additions keep historical identities, classify correctly and remain discoverable in either language', () => {
  const rows = [['bf_C14', 'back', '單臂下拉', 'pull'], ['shoulder_press', 'shoulder', 'overhead press', 'push'],
    ['plank_row', 'core', '俯撐划船', 'core'], ['weighted_lunge', 'legs', '負重跨步', 'squat_lunge']];
  for (const lang of ['zh', 'en']) {
    const exercises = catalogExercises(lang); exercises.plank_row = { ...exercises.plank_row, active: true };
    const available = eligibleExercises(exercises, context);
    for (const [id, region, query, pattern] of rows) {
      assert.deepEqual(filterManualExercises(exercises, available, { region, query, type: 'strength' }).map(([key]) => key), [id]);
      assert.ok(classifyBalanceExercise(id, exercises[id]).patterns.includes(pattern));
      assert.equal(EXERCISES_I18N[lang][id].catalogCode, exercises[id].catalogCode);
    }
  }
  assert.ok(matchesTrainingTarget('glutes', 'weighted_lunge', catalog.weighted_lunge));
  assert.ok(matchesTrainingTarget('quadriceps', 'weighted_lunge', catalog.weighted_lunge));
  assert.deepEqual(ids.slice(1).map(id => [id, catalog[id].prescription.value, catalog[id].prescription.perSide]),
    [['shoulder_press', '8', false], ['plank_row', '8', true], ['weighted_lunge', '6', true]]);
});

test('gym additions respect equipment, treatment, beginner and explicit disabled settings', () => {
  assert.equal(catalog.plank_row.active, false);
  assert.ok(!eligibleExercises(enabled, { ...context, experience: 'beginner' }).plank_row);
  for (const id of ids) {
    assert.ok(!eligibleExercises(enabled, { ...context, equipment: [] })[id]);
    assert.ok(!eligibleExercises(enabled, { ...context, healthStatus: 'restricted' })[id]);
    assert.ok(!eligibleExercises({ ...enabled, [id]: { ...enabled[id], active: false } }, context)[id]);
  }
});

test('new and promoted movements can be manually added and shared without losing dose or old IDs', () => {
  const available = eligibleExercises(enabled, context);
  const day = addManualExercises(createManualSession('2026-11-09'), ids, { exercises: enabled, eligibleExercises: available, phase: 'strength' });
  const shared = shareDay(decodeSharePayload(encodeSharePayload(createSharePayload(day, enabled))));
  assert.deepEqual(shared.routine, ids);
  assert.deepEqual(shared.prescriptions.map(({ id, sets, value, perSide }) => ({ id, sets, value, perSide })),
    day.prescriptions.map(({ id, sets, value, perSide }) => ({ id, sets, value, perSide })));
});

test('a selected gym addition reaches a real fixed-rule training slot when compatible', () => {
  for (const id of ids) {
    const profile = { ...context, weeklyExerciseIds: [id] };
    assert.ok(manualPlanningExercises(enabled, profile)[id]);
    const plan = generateTemplatePlan(enabled, profile, 40, 'zh', { currentDate: '2026-11-09', currentWeek: '2026-W46' });
    assert.ok(plan.schedule.some(day => day.routine.includes(id)), `${id} must actually be scheduled`);
  }
});

test('references use trusted built-in identities, never user-supplied URLs or prototype names', () => {
  for (const id of ids) {
    assert.match(getExerciseSource(id).videoUrl, /^https:\/\/www.youtube.com\/shorts\/[\w-]{11}$/);
    assert.match(getExerciseSource(id).sourceUrl, /^https:\/\/www.canva.com\/design\//);
  }
  for (const id of ['custom', 'toString', '__proto__', undefined]) assert.equal(getExerciseSource(id), null);
});
