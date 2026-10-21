import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCHEDULE_I18N, EXERCISES_I18N } from '../../src/locale.js';
import { createWorkoutSnapshot, normalizedWorkoutName, readSavedWorkout, readWorkoutPayload, savedWorkoutDay,
  savedWorkoutExercises, validateWorkoutSnapshot, workoutName, workoutNameKey, workoutPayload } from '../../src/domain/savedWorkouts.js';
import { SAVED_WORKOUTS_TEXT } from '../../src/savedWorkoutsLocale.js';

const day = () => structuredClone(DEFAULT_SCHEDULE_I18N.zh[0]);
const snapshot = () => createWorkoutSnapshot(day(), EXERCISES_I18N.zh);

test('private snapshots retain planned preparation, phase and order while excluding all source free text and records', () => {
  const source = day();
  Object.assign(source, { date: 'PRIVATE_DATE', week: 'PRIVATE_WEEK', name: 'PRIVATE_NAME', theme: 'PRIVATE_THEME',
    healthNotes: 'PRIVATE_HEALTH', coachAdvice: 'PRIVATE_ADVICE', warmupNote: 'PRIVATE_WARM', completed: { secret: true }, actualWeight: 12345 });
  source.prescriptions.find(dose => dose.preparation).preparation.instruction = 'PRIVATE_PREP';
  source.prescriptions[0].actualWeight = 'PRIVATE_WEIGHT';
  const value = createWorkoutSnapshot(source, { ...EXERCISES_I18N.zh, bf_B01: { ...EXERCISES_I18N.zh.bf_B01, name: 'PRIVATE_OVERRIDE' } });
  assert.ok(!JSON.stringify(value).includes('PRIVATE_'));
  assert.deepEqual(value.routine, source.routine);
  assert.deepEqual(value.prescriptions.map(dose => dose.phase), source.prescriptions.map(dose => dose.phase));
  assert.ok(value.prescriptions.some(dose => dose.preparation));
  assert.ok(!JSON.stringify(value).includes('instruction'));
  assert.deepEqual(readWorkoutPayload(workoutPayload(value)), value);
  const restored = savedWorkoutDay({ snapshot: value }, 'en');
  assert.ok(restored.prescriptions.find(dose => dose.preparation).preparation.instruction.startsWith('Use bodyweight'));
  source.routine.length = 0; source.prescriptions[0].sets = 5;
  assert.ok(value.routine.length); assert.notEqual(value.prescriptions[0].sets, 5);
  restored.routine.length = 0; assert.ok(value.routine.length, 'applying returns a fresh copy');
});

test('all bundled plans, including rest and recovery, can be saved without dropping movements', () => {
  for (const lang of ['zh', 'en']) for (const source of DEFAULT_SCHEDULE_I18N[lang]) {
    const result = createWorkoutSnapshot(source, EXERCISES_I18N[lang]);
    assert.equal(result.routine.length, source.routine.length);
    assert.equal(result.sessionType, source.sessionType);
  }
});

test('custom exercise snapshots are explicit and minimal; missing movements fail rather than disappear', () => {
  const custom = { name: 'My custom exercise', type: 'upper_pull', tip: 'PRIVATE_TIP', healthNotes: 'PRIVATE_HEALTH', deleted: false };
  const source = { routine: ['custom_one'], prescriptions: [{ id: 'custom_one', phase: 'strength', sets: 2, value: '6', unit: 'reps', restSeconds: 60, perSide: true }] };
  const result = createWorkoutSnapshot(source, { custom_one: custom });
  assert.deepEqual(result.exercises, [{ id: 'custom_one', name: custom.name, type: 'upper_pull', custom: true }]);
  assert.deepEqual(savedWorkoutExercises({ snapshot: result }), { custom_one: { name: custom.name, type: 'upper_pull', active: true } });
  assert.ok(!JSON.stringify(result).includes('PRIVATE_'));
  assert.throws(() => createWorkoutSnapshot({ routine: ['missing', 'custom_one'] }, { custom_one: custom }), /UNKNOWN_WORKOUT_EXERCISE/);
  assert.throws(() => createWorkoutSnapshot(source, { custom_one: { ...custom, deleted: true } }), /UNKNOWN_WORKOUT_EXERCISE/);
});

test('workout names are Unicode bounded and normalized for collision checks', async () => {
  assert.equal(workoutName('  Ａ  Workout  '), 'A Workout');
  assert.equal(normalizedWorkoutName('A WORKOUT'), normalizedWorkoutName('ａ workout'));
  assert.equal(workoutName('😀'.repeat(40)), '😀'.repeat(40));
  for (const invalid of ['', '  ', 'a'.repeat(41), '😀'.repeat(41), 'bad\u0000name', null]) assert.throws(() => workoutName(invalid), /INVALID_WORKOUT_NAME/);
  assert.match(await workoutNameKey(' A  Workout '), /^[a-f0-9]{64}$/);
  assert.equal(await workoutNameKey('A Workout'), await workoutNameKey('ａ workout'));
});

test('untrusted saved payloads reject unknown fields, invalid doses, mismatched names and prototype keys', () => {
  const changes = [
    value => { value.healthNotes = 'secret'; }, value => { value.v = 2; },
    value => { value.prescriptions[0].actualWeight = 20; }, value => { value.prescriptions[0].sets = 0; },
    value => { value.prescriptions[0].value = '8–4'; }, value => { value.exercises.pop(); },
    value => { value.prescriptions.reverse(); }, value => { value.exercises[0].custom = true; },
    value => { value.prescriptions.find(dose => dose.preparation).preparation.instruction = 'secret'; },
    value => { value.prescriptions.find(dose => dose.preparation).preparation.sets = 3; },
    value => { value.routine.push(value.routine[0]); }, value => { value.exercises[0].type = 'unknown'; },
  ];
  for (const change of changes) { const value = snapshot(); change(value); assert.throws(() => validateWorkoutSnapshot(value), /INVALID_SAVED_WORKOUT/); }
  assert.throws(() => readWorkoutPayload('{"__proto__":{"secret":true}}'), /INVALID_SAVED_WORKOUT/);
  assert.throws(() => readWorkoutPayload('x'.repeat(20001)), /INVALID_SAVED_WORKOUT/);
  const record = { v: 1, name: 'Workout', payload: workoutPayload(snapshot()), revision: 1, createdAt: 1, updatedAt: 1 };
  assert.equal(readSavedWorkout('abc', record).name, 'Workout');
  assert.throws(() => readSavedWorkout('abc', { ...record, uid: 'other' }), /INVALID_SAVED_WORKOUT/);
  assert.throws(() => readSavedWorkout('abc', { ...record, updatedAt: 0 }), /INVALID_SAVED_WORKOUT/);
});

test('saved workout interface and validation messages exist in both languages', () => {
  const keys = value => Object.entries(value).flatMap(([key, item]) => typeof item === 'object' ? keys(item).map(child => `${key}.${child}`) : [key]).sort();
  assert.deepEqual(keys(SAVED_WORKOUTS_TEXT.zh), keys(SAVED_WORKOUTS_TEXT.en));
});
