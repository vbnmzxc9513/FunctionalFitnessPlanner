import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { createManualSession, prepareManualPreview, updateManualPrescription } from '../../src/domain/manualPlanner.js';
import { getQuickWorkout, DAILY_WARMUP_IDS } from '../../src/domain/quickWorkouts.js';
import { applyQuickWorkout, previewQuickWorkout, undoQuickWorkout } from '../../src/domain/quickWorkoutDraft.js';
import { createWorkoutSnapshot, readWorkoutPayload, savedWorkoutDay, workoutPayload } from '../../src/domain/savedWorkouts.js';
import { largePlannerDay } from '../fixtures/plannerV3.js';

const exercises = catalogExercises('zh');
const options = { exercises, eligibleExercises: exercises, dailyTime: 240 };
const date = '2026-11-13';
const blank = () => createManualSession(date);
const add = (session, workout) => applyQuickWorkout(previewQuickWorkout(session, workout, options)).session;
const warmup = () => add(blank(), getQuickWorkout('daily-warmup'));
const cooldown = { name: 'Calf cooldown', prescriptions: [{ id: 'bf_H01', phase: 'cooldown', sets: 1, value: '20', unit: 'seconds', restSeconds: 0, perSide: true }] };

// Basic eight-item recipes, duplicate choices, consent and snapshot validation
// already have unit coverage. These cases exercise combinations across those APIs.
test('UX-04: editing a warmup dose before composing ten movements survives review and undo of the second combo', () => {
  const first = updateManualPrescription(warmup(), 'bf_A15', { sets: 2, value: '6', restSeconds: 15, perSide: true }, { exercises });
  const originalDose = structuredClone(first.prescriptions.find(dose => dose.id === 'bf_A15'));
  const operation = applyQuickWorkout(previewQuickWorkout(first, getQuickWorkout('hip-internal-rotation'), options));
  const [reviewed] = prepareManualPreview([operation.session], { ...options, today: date });
  assert.equal(reviewed.routine.length, 10);
  assert.ok(DAILY_WARMUP_IDS.every(id => reviewed.routine.includes(id)));
  assert.equal(reviewed.prescriptions.filter(dose => dose.phase === 'warmup').length, 8);
  assert.deepEqual(reviewed.prescriptions.find(dose => dose.id === 'bf_A15'), originalDose);
  assert.deepEqual(undoQuickWorkout(operation), first, 'undo second addition retains the edited first combo');
});

test('UX-04/07: a partially duplicate combo uses actual new items at the capacity boundary and never truncates', () => {
  const source = largePlannerDay(date, 23);
  // The shared storage fixture includes a retained legacy movement; this case
  // needs a fully available day so only the new batch reaches capacity.
  source.prescriptions = source.prescriptions.map(dose => dose.id === 'bulgarian' ? { ...dose, id: 'bf_C03' } : dose);
  source.routine = source.prescriptions.map(dose => dose.id);
  const before = structuredClone(source);
  const incoming = { name: 'Overlap and two new movements', prescriptions: [
    { ...source.prescriptions[0], sets: 2 },
    ...getQuickWorkout('hip-internal-rotation').prescriptions.filter(dose => dose.id !== 'bf_A15'),
  ] };
  const blocked = previewQuickWorkout(source, incoming, options);
  assert.equal(blocked.next.routine.length, 25);
  assert.equal(blocked.keptCount, 1);
  assert.deepEqual(blocked.addedIds, ['bf_B16', 'bf_B17']);
  assert.ok(blocked.conflicts.some(issue => issue.type === 'capacity' && issue.count === 25));
  assert.throws(() => applyQuickWorkout(blocked), /QUICK_WORKOUT_CONFLICT/);
  assert.deepEqual(source, before);

  const partial = previewQuickWorkout(source, incoming, { ...options, excludedIds: ['bf_B17'] });
  assert.equal(partial.next.routine.length, 24);
  assert.throws(() => applyQuickWorkout(partial), /QUICK_PARTIAL_CONFIRMATION/);
  const accepted = applyQuickWorkout(partial, { confirmPartial: true });
  assert.equal(accepted.addedCount, 1);
  assert.deepEqual(accepted.session.prescriptions.find(dose => dose.id === source.routine[0]), source.prescriptions[0]);
  assert.deepEqual(source, before);
});

test('UX-07: time failure includes retained edited doses and leaves both the day and recipe unchanged', () => {
  const source = updateManualPrescription(warmup(), 'bf_A15', { sets: 3, value: '12', restSeconds: 30, perSide: true }, { exercises });
  const incoming = getQuickWorkout('hip-internal-rotation');
  const before = structuredClone({ source, incoming });
  const full = previewQuickWorkout(source, incoming, options);
  const blocked = previewQuickWorkout(source, incoming, { ...options, dailyTime: full.minutes - 1 });
  assert.ok(blocked.conflicts.some(issue => issue.type === 'time' && issue.excess === 1));
  assert.equal(blocked.next.routine.length, 10, 'the over-time candidate remains inspectable in full');
  assert.deepEqual(blocked.next.prescriptions.find(dose => dose.id === 'bf_A15'), source.prescriptions.find(dose => dose.id === 'bf_A15'));
  assert.throws(() => applyQuickWorkout(blocked), /QUICK_WORKOUT_CONFLICT/);
  assert.deepEqual({ source, incoming }, before);
});

test('UX-04/07: partial training replacement requires both consents and preserves other phases exactly', () => {
  const source = add(add(warmup(), getQuickWorkout('hip-internal-rotation')), cooldown);
  const before = structuredClone(source);
  // A stale eligibility map must not permit an exercise disabled in the catalog.
  const changedCatalog = { ...exercises, bf_B14: { ...exercises.bf_B14, active: false } };
  const incoming = getQuickWorkout('foot-arch-control');
  const replacementOptions = { ...options, exercises: changedCatalog, mode: 'replace', replaceScope: 'training' };
  const blocked = previewQuickWorkout(source, incoming, replacementOptions);
  assert.ok(blocked.conflicts.some(issue => issue.id === 'bf_B14' && issue.reasons.some(reason => reason.code === 'disabled')));
  assert.throws(() => applyQuickWorkout(blocked, { confirmReplacement: true }), /QUICK_WORKOUT_CONFLICT/);

  const partial = previewQuickWorkout(source, incoming, { ...replacementOptions, excludedIds: ['bf_B14'] });
  assert.deepEqual(partial.removed.map(dose => dose.id), ['bf_B16', 'bf_B17']);
  assert.throws(() => applyQuickWorkout(partial, { confirmPartial: true }), /QUICK_REPLACEMENT_CONFIRMATION/);
  assert.throws(() => applyQuickWorkout(partial, { confirmReplacement: true }), /QUICK_PARTIAL_CONFIRMATION/);
  const accepted = applyQuickWorkout(partial, { confirmReplacement: true, confirmPartial: true });
  assert.deepEqual(accepted.session.prescriptions.filter(dose => ['warmup', 'cooldown'].includes(dose.phase)), source.prescriptions.filter(dose => ['warmup', 'cooldown'].includes(dose.phase)));
  assert.deepEqual(accepted.session.prescriptions.filter(dose => dose.phase === 'accessory').map(dose => dose.id), ['bf_B13', 'bf_B15']);
  assert.deepEqual(source, before);
});

test('UX-05: a three-item cross-phase favorite round-trips independently and reuses without resetting a destination dose', () => {
  const source = add(add(warmup(), getQuickWorkout('hip-internal-rotation')), cooldown);
  const selected = new Set(['bf_A15', 'bf_B16', 'bf_H01']);
  const subset = { ...source, routine: source.routine.filter(id => selected.has(id)), prescriptions: source.prescriptions.filter(dose => selected.has(dose.id)) };
  const snapshot = readWorkoutPayload(workoutPayload(createWorkoutSnapshot(subset, exercises)));
  assert.deepEqual(snapshot.routine, ['bf_A15', 'bf_B16', 'bf_H01']);
  assert.deepEqual(snapshot.prescriptions, subset.prescriptions);
  assert.deepEqual(snapshot.prescriptions.map(dose => dose.phase), ['warmup', 'accessory', 'cooldown']);

  const target = updateManualPrescription(warmup(), 'bf_A15', { sets: 2, value: '8' }, { exercises });
  const targetDose = structuredClone(target.prescriptions.find(dose => dose.id === 'bf_A15'));
  const operation = applyQuickWorkout(previewQuickWorkout(target, { name: 'Three chosen movements', ...savedWorkoutDay({ snapshot }) }, options));
  assert.equal(operation.addedCount, 2);
  assert.equal(operation.keptCount, 1);
  assert.deepEqual(operation.session.prescriptions.find(dose => dose.id === 'bf_A15'), targetDose);
  assert.deepEqual(operation.session.prescriptions.filter(dose => ['bf_B16', 'bf_H01'].includes(dose.id)), snapshot.prescriptions.filter(dose => dose.id !== 'bf_A15'));
  operation.session.prescriptions.find(dose => dose.id === 'bf_B16').value = '99';
  assert.equal(snapshot.prescriptions.find(dose => dose.id === 'bf_B16').value, '5', 'using a favorite cannot mutate its saved snapshot');
  assert.equal(source.routine.length, 11, 'saving only a subset does not remove source content');
});
