import { MAX_DAY_EXERCISES, LEGACY_MAX_DAY_EXERCISES } from './plannerLimits.js';
import { catalogExercises } from './exerciseCatalog.js';
import { exercisePhase, SESSION_PHASES, SESSION_TYPES } from './phases.js';
import { prescription, resolveExerciseId } from './training.js';

export const MAX_WORKOUT_PAYLOAD = 20000;
export const MAX_WORKOUT_NAME = 40;
const TYPES = ['mobility', 'lower', 'core', 'upper_pull', 'upper_push', 'full', 'power'];
const DOSE = ['sets', 'value', 'unit', 'restSeconds', 'perSide'];
const builtin = catalogExercises();
const fail = (code = 'INVALID_SAVED_WORKOUT') => { throw new Error(code); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, allowed, required = allowed) => {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail();
};
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.trim().length > 0
  && Array.from(value).length <= max && !Array.from(value).some(char => char.codePointAt(0) < 32 || char.codePointAt(0) === 127);

export function workoutName(value) {
  if (typeof value !== 'string') fail('INVALID_WORKOUT_NAME');
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!text(name, MAX_WORKOUT_NAME)) fail('INVALID_WORKOUT_NAME');
  return name;
}

export const normalizedWorkoutName = value => workoutName(value).toLowerCase();

export async function workoutNameKey(value) {
  const bytes = new TextEncoder().encode(normalizedWorkoutName(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function cleanDose(value, preparation = false) {
  keys(value, DOSE);
  if (!Number.isInteger(value.sets) || value.sets < 1 || value.sets > (preparation ? 2 : 5)
    || typeof value.value !== 'string' || !/^\d{1,3}(?:[–-]\d{1,3})?$/.test(value.value)
    || !['reps', 'seconds', 'minutes', 'breaths'].includes(value.unit) || preparation && value.unit === 'minutes'
    || !Number.isInteger(value.restSeconds) || value.restSeconds < 0 || value.restSeconds > (preparation ? 120 : 300)
    || typeof value.perSide !== 'boolean') fail();
  const values = value.value.split(/[–-]/).map(Number);
  const maximum = preparation ? value.unit === 'seconds' ? 30 : 8 : { reps: 120, seconds: 600, minutes: 240, breaths: 120 }[value.unit];
  if (values.some(number => number < 1 || number > maximum) || values.length === 2 && values[0] > values[1]) fail();
  return Object.fromEntries(DOSE.map(key => [key, value[key]]));
}

/** Strict reader: unknown fields and incomplete/custom movements fail closed. */
export function validateWorkoutSnapshot(value) {
  keys(value, ['v', 'sessionType', 'routine', 'prescriptions', 'exercises']);
  if (![1, 3].includes(value.v) || !SESSION_TYPES.includes(value.sessionType) || !Array.isArray(value.routine)
    || value.routine.length > (value.v === 1 ? LEGACY_MAX_DAY_EXERCISES : MAX_DAY_EXERCISES) || new Set(value.routine).size !== value.routine.length
    || value.routine.some(id => !identifier(id)) || !Array.isArray(value.prescriptions)
    || !Array.isArray(value.exercises) || value.prescriptions.length !== value.routine.length
    || value.exercises.length !== value.routine.length) fail();
  const exercises = value.exercises.map((exercise, index) => {
    keys(exercise, ['id', 'name', 'type', 'custom']);
    if (exercise.id !== value.routine[index] || !text(exercise.name, 100) || !TYPES.includes(exercise.type)
      || typeof exercise.custom !== 'boolean' || exercise.custom !== !Object.hasOwn(builtin, exercise.id)) fail();
    return { ...exercise };
  });
  const prescriptions = value.prescriptions.map((dose, index) => {
    keys(dose, ['id', 'phase', ...DOSE, 'preparation'], ['id', 'phase', ...DOSE]);
    if (dose.id !== value.routine[index] || !SESSION_PHASES.includes(dose.phase)) fail();
    const clean = cleanDose(Object.fromEntries(DOSE.map(key => [key, dose[key]])));
    const preparation = dose.preparation === undefined ? null : cleanDose(dose.preparation, true);
    if (preparation && !['strength', 'accessory'].includes(dose.phase)) fail();
    return { id: dose.id, phase: dose.phase, ...clean, ...(preparation ? { preparation } : {}) };
  });
  const sessionType = !prescriptions.length ? 'rest' : prescriptions.some(dose => ['skill', 'strength', 'accessory'].includes(dose.phase)) ? 'training' : 'recovery';
  if (value.sessionType !== sessionType) fail();
  const clean = { v: value.v, sessionType, routine: [...value.routine], prescriptions, exercises };
  if (JSON.stringify(clean).length > MAX_WORKOUT_PAYLOAD) fail('SAVED_WORKOUT_TOO_LARGE');
  return clean;
}

/** A private, date-free plan snapshot. No source free text is copied. */
export function createWorkoutSnapshot(day, exercises = builtin, level = 1) {
  if (!day || !Array.isArray(day.routine) || day.routine.length > MAX_DAY_EXERCISES || !plain(exercises)
    || day.prescriptions !== undefined && !Array.isArray(day.prescriptions)) fail();
  const routine = day.routine.map(value => {
    const id = resolveExerciseId(value, exercises);
    if (!identifier(id) || !exercises[id] || exercises[id].deleted) fail('UNKNOWN_WORKOUT_EXERCISE');
    return id;
  });
  if (new Set(routine).size !== routine.length) fail();
  const source = { ...day, routine, prescriptions: day.prescriptions?.map(dose => ({ ...dose, id: resolveExerciseId(dose.id, exercises) || dose.id })) };
  const savedExercises = routine.map(id => {
    const exercise = builtin[id] || exercises[id];
    if (!text(exercise.name, 100) || !TYPES.includes(exercise.type)) fail('UNKNOWN_WORKOUT_EXERCISE');
    return { id, name: exercise.name.trim(), type: exercise.type, custom: !Object.hasOwn(builtin, id) };
  });
  const prescriptions = routine.map(id => {
    const exercise = exercises[id];
    const dose = prescription(id, exercise.type, level, exercise, source);
    const pick = value => ({ sets: value.sets, value: String(value.value), unit: value.unit,
      restSeconds: value.restSeconds ?? 0, perSide: value.perSide ?? false });
    return { id, phase: exercisePhase(source, id, exercise), ...pick(dose), ...(dose.preparation ? { preparation: pick(dose.preparation) } : {}) };
  });
  const sessionType = !routine.length ? 'rest' : prescriptions.some(dose => ['skill', 'strength', 'accessory'].includes(dose.phase)) ? 'training' : 'recovery';
  return validateWorkoutSnapshot({ v: 3, sessionType, routine, prescriptions, exercises: savedExercises });
}

export function workoutPayload(snapshot) {
  return JSON.stringify(validateWorkoutSnapshot(snapshot));
}

export function readWorkoutPayload(payload) {
  if (typeof payload !== 'string' || payload.length > MAX_WORKOUT_PAYLOAD) fail();
  try { return validateWorkoutSnapshot(JSON.parse(payload)); } catch { fail(); }
}

export const WORKOUT_SCOPES = ['day', 'warmup', 'training', 'cooldown', 'selection'];
export function workoutMetadata({ scope = 'day', tags = [], contentVersion = 1, pinned = false, lastUsedAt = null } = {}) {
  if (!WORKOUT_SCOPES.includes(scope) || !Array.isArray(tags) || tags.length > 6
    || typeof pinned !== 'boolean' || lastUsedAt !== null && (!Number.isSafeInteger(lastUsedAt) || lastUsedAt < 0 || lastUsedAt > 4102444800000)
    || !Number.isSafeInteger(contentVersion) || contentVersion < 1 || contentVersion > 1000000) fail();
  const cleanTags = tags.map(tag => {
    if (typeof tag !== 'string') fail();
    const clean = tag.normalize('NFKC').trim();
    if (!text(clean, 30)) fail();
    return clean;
  });
  if (new Set(cleanTags).size !== cleanTags.length) fail();
  return { scope, tags: cleanTags, contentVersion, pinned, lastUsedAt };
}

export function readSavedWorkout(id, record) {
  keys(record, ['v', 'name', 'payload', 'revision', 'createdAt', 'updatedAt', 'scope', 'tags', 'contentVersion', 'pinned', 'lastUsedAt'], ['v', 'name', 'payload', 'revision', 'createdAt', 'updatedAt']);
  if (!identifier(id) || record.v !== 1 || workoutName(record.name) !== record.name
    || !Number.isSafeInteger(record.revision) || record.revision < 1
    || !Number.isSafeInteger(record.createdAt) || record.createdAt < 0
    || !Number.isSafeInteger(record.updatedAt) || record.updatedAt < record.createdAt) fail();
  return { id, name: record.name, revision: record.revision, createdAt: record.createdAt,
    updatedAt: record.updatedAt, ...workoutMetadata(record), snapshot: readWorkoutPayload(record.payload) };
}

export function savedWorkoutDay(item, lang = 'zh') {
  const value = validateWorkoutSnapshot(item.snapshot);
  const instruction = lang === 'en' ? 'Use bodyweight or light resistance; move slowly and leave repetitions in reserve.'
    : '使用徒手或輕阻力，緩慢控制並保留餘力。';
  return { sessionType: value.sessionType, routine: value.routine, prescriptions: value.prescriptions.map(dose => ({ ...dose,
    ...(dose.preparation ? { preparation: { ...dose.preparation, instruction } } : {}) })) };
}

export function savedWorkoutExercises(item) {
  return Object.fromEntries(validateWorkoutSnapshot(item.snapshot).exercises.map(({ id, name, type }) => [id, { name, type, active: true }]));
}
