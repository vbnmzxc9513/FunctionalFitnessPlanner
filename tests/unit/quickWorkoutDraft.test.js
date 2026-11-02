import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { getQuickWorkout } from '../../src/domain/quickWorkouts.js';
import { createManualSession } from '../../src/domain/manualPlanner.js';
import { previewQuickWorkout, applyQuickWorkout, undoQuickWorkout } from '../../src/domain/quickWorkoutDraft.js';
const exercises = catalogExercises('zh');
const options = { exercises, eligibleExercises: exercises, dailyTime: 240 };
const blank = () => createManualSession('2026-11-03');

test('preview is immutable and adding the daily warmup produces eight independent prescriptions', () => {
  const source = blank(), recipe = getQuickWorkout('daily-warmup');
  const preview = previewQuickWorkout(source, recipe, options);
  assert.deepEqual(source, blank()); assert.equal(preview.next.routine.length, 8); assert.equal(new Set(preview.next.routine).size, 8);
  assert.equal(preview.next.routine.includes('bf_A13'), false);
  const operation = applyQuickWorkout(preview); assert.equal(operation.addedCount, 8); assert.deepEqual(undoQuickWorkout(operation), source);
});

test('duplicates default keep old phase/dose; explicit replace changes the same id only once', () => {
  const warmup = applyQuickWorkout(previewQuickWorkout(blank(), getQuickWorkout('daily-warmup'), options)).session;
  const original = warmup.prescriptions.find(dose => dose.id === 'bf_A15');
  const kept = previewQuickWorkout(warmup, getQuickWorkout('hip-internal-rotation'), options);
  assert.equal(kept.keptCount, 1); assert.equal(kept.addedIds.length, 2); assert.deepEqual(kept.next.prescriptions.find(dose => dose.id === 'bf_A15'), original);
  const replaced = previewQuickWorkout(warmup, getQuickWorkout('hip-internal-rotation'), { ...options, duplicateChoices: { bf_A15: 'replace' } });
  assert.equal(replaced.replacedIds.length, 1); assert.equal(new Set(replaced.next.routine).size, replaced.next.routine.length); assert.equal(replaced.next.prescriptions.find(dose => dose.id === 'bf_A15').phase, 'accessory');
});

test('replacement and partial application require explicit confirmation and retain exact preview', () => {
  const warmup = applyQuickWorkout(previewQuickWorkout(blank(), getQuickWorkout('daily-warmup'), options)).session;
  const preview = previewQuickWorkout(warmup, getQuickWorkout('foot-arch-control'), { ...options, mode: 'replace', replaceScope: 'warmup' });
  assert.equal(preview.removed.length, 8); assert.throws(() => applyQuickWorkout(preview), /QUICK_REPLACEMENT_CONFIRMATION/);
  assert.deepEqual(applyQuickWorkout(preview, { confirmReplacement: true }).session, preview.next);
  const partial = previewQuickWorkout(blank(), getQuickWorkout('daily-warmup'), { ...options, excludedIds: ['bf_A19'] });
  assert.throws(() => applyQuickWorkout(partial), /QUICK_PARTIAL_CONFIRMATION/); assert.equal(applyQuickWorkout(partial, { confirmPartial: true }).addedCount, 7);
});

test('ineligibility and time overrun block addition without dropping content', () => {
  const recipe = getQuickWorkout('daily-warmup'), eligible = { ...exercises }; delete eligible.bf_A19;
  const blocked = previewQuickWorkout(blank(), recipe, { ...options, eligibleExercises: eligible, dailyTime: 1 });
  assert.equal(blocked.next.routine.length, 8); assert.ok(blocked.conflicts.some(issue => issue.id === 'bf_A19')); assert.ok(blocked.conflicts.some(issue => issue.type === 'time'));
  assert.throws(() => applyQuickWorkout(blocked), /QUICK_WORKOUT_CONFLICT/);
});

test('saved strength snapshot restores preparation instruction before quick reuse and final validation', async () => {
  const { addManualExercises, prepareManualPreview } = await import('../../src/domain/manualPlanner.js');
  const { createWorkoutSnapshot, savedWorkoutDay } = await import('../../src/domain/savedWorkouts.js');
  const warmup = applyQuickWorkout(previewQuickWorkout(blank(), getQuickWorkout('daily-warmup'), options)).session;
  const source = addManualExercises(warmup, ['bf_B01'], { ...options, phase: 'strength' });
  const snapshot = createWorkoutSnapshot(source, exercises);
  assert.equal(snapshot.prescriptions.find(dose => dose.phase === 'strength').preparation.instruction, undefined, 'private/scheduled instruction is not copied into the stored public dose shape');
  const incoming = { name: 'Saved strength day', ...savedWorkoutDay({ snapshot }) };
  const preview = previewQuickWorkout(blank(), incoming, options);
  const next = applyQuickWorkout(preview).session;
  assert.ok(next.prescriptions.find(dose => dose.phase === 'strength').preparation.instruction.length > 0);
  assert.equal(prepareManualPreview([next], { ...options, today: '2026-11-02' })[0].routine.length, 9);
});

test('saved recipe regions come from real movements even when saved metadata contains purpose tags only', async () => {
  const { quickWorkoutRegions } = await import('../../src/domain/quickWorkoutDraft.js');
  assert.ok(quickWorkoutRegions({ routine: ['bf_B16', 'bf_B17'], tags: ['控制'] }, exercises).includes('hip'));
  assert.ok(quickWorkoutRegions({ routine: ['bf_B13', 'bf_B14'], tags: ['控制'] }, exercises).includes('ankle'));
  assert.ok(quickWorkoutRegions({ routine: ['bf_C12', 'bf_C13'], tags: ['控制'] }, exercises).includes('shoulder'));
});
