import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { dailyWarmupPrescriptions, DAILY_WARMUP_IDS, isDailyWarmupComplete } from '../../src/domain/quickWorkouts.js';
import { applyWeeklyChoices, recommendWeeklyChoices, weeklyChoicePhase } from '../../src/domain/weeklyChoices.js';
import { classifyBalanceExercise } from '../../src/domain/weeklyBalance.js';
import { suggestedUses } from '../../src/domain/library.js';

const exercises = catalogExercises();
const dose = (id, phase) => ({ id, ...exercises[id].prescription, phase });
const session = prescriptions => ({ sessionType: 'training', routine: prescriptions.map(item => item.id), prescriptions });

test('weekly preferences keep all eight daily opening doses while replacing a compatible training slot above eight exercises', () => {
  const opening = dailyWarmupPrescriptions();
  const day = session([...opening, dose('bf_B04', 'strength'), dose('bf_D09', 'cooldown')]);
  applyWeeklyChoices(day, exercises, ['bf_B03', 'bf_A14'], new Set());
  assert.equal(isDailyWarmupComplete(day), true);
  assert.deepEqual(day.prescriptions.filter(item => DAILY_WARMUP_IDS.includes(item.id)), opening);
  assert.ok(day.routine.includes('bf_B03'));
  assert.ok(day.routine.includes('bf_A14'));
  assert.ok(!day.routine.includes('bf_B04'));
  assert.ok(!day.routine.includes('bf_D09'));
});

test('old sequence dates remain intact and new recommendations exclude historical sequences', () => {
  const old = dose('bf_A13', 'warmup');
  const day = session([old, dose('bf_B04', 'strength'), dose('bf_D09', 'cooldown')]);
  applyWeeklyChoices(day, exercises, ['bf_A06'], new Set());
  assert.deepEqual(day.prescriptions.find(item => item.id === 'bf_A13'), old);
  assert.ok(day.routine.includes('bf_A06'));
  const recommendations = recommendWeeklyChoices(exercises, { healthStatus: 'unrestricted', equipment: [] }, 'balanced', exercises);
  for (const id of ['bf_A12', 'bf_A13']) assert.equal(recommendations.includes(id), false);
});

test('control exercises do not claim stretching or main movement coverage', () => {
  for (const code of ['A07', 'A18', 'B13', 'B14', 'B15', 'B16', 'B17', 'C12', 'C13']) {
    const id = `bf_${code}`;
    assert.deepEqual(classifyBalanceExercise(id, exercises[id]), { mobility: [], patterns: [], unclassified: false }, id);
    assert.deepEqual(suggestedUses(id, exercises[id]), ['warmup', 'training'], id);
    assert.equal(weeklyChoicePhase(id, exercises[id]), 'accessory', id);
  }
  assert.deepEqual(classifyBalanceExercise('bf_A17', exercises.bf_A17).mobility, ['hip', 'thoracic']);
  assert.deepEqual(classifyBalanceExercise('bf_A19', exercises.bf_A19).mobility, ['ankle']);
  assert.deepEqual(suggestedUses('bf_A16', exercises.bf_A16), ['warmup', 'cooldown']);
});
