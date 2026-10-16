import { catalogExercises as loadCatalog, validSequenceDose } from './exerciseCatalog.js';
import { exercisePhase, SESSION_PHASES } from './phases.js';
import { prescription } from './training.js';

export const MAX_SHARE_LENGTH = 6000;
const catalogExercises = loadCatalog();
const DOSE_FIELDS = ['sets', 'value', 'unit', 'restSeconds', 'perSide'];
const ITEM_FIELDS = ['id', 'phase', ...DOSE_FIELDS, 'preparation'];
const fail = () => { throw new Error('INVALID_SHARE'); };
const exactKeys = (value, allowed, required = allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail();
};

function validateDose(value, preparation = false) {
  exactKeys(value, DOSE_FIELDS);
  if (!Number.isInteger(value.sets) || value.sets < 1 || value.sets > (preparation ? 2 : 5)
    || typeof value.value !== 'string' || !/^\d{1,3}(?:[–-]\d{1,3})?$/.test(value.value)
    || !['reps', 'seconds', 'minutes', 'breaths'].includes(value.unit)
    || (preparation && value.unit === 'minutes') || !Number.isInteger(value.restSeconds)
    || value.restSeconds < 0 || value.restSeconds > (preparation ? 120 : 300) || typeof value.perSide !== 'boolean') fail();
  const numbers = value.value.split(/[–-]/).map(Number);
  const limit = preparation ? value.unit === 'seconds' ? 30 : 8 : { reps: 100, seconds: 600, minutes: 10, breaths: 30 }[value.unit];
  if (numbers.some(number => number < 1 || number > limit) || numbers.length === 2 && numbers[0] > numbers[1]) fail();
  return Object.fromEntries(DOSE_FIELDS.map(key => [key, value[key]]));
}

export function validateSharePayload(payload) {
  exactKeys(payload, ['v', 'items']);
  if (payload.v !== 1 || !Array.isArray(payload.items) || payload.items.length > 8) fail();
  const seen = new Set();
  let lastPhase = -1;
  let contacts = 0;
  const items = payload.items.map(item => {
    exactKeys(item, ITEM_FIELDS, ITEM_FIELDS.filter(key => key !== 'preparation'));
    const phase = SESSION_PHASES.indexOf(item.phase);
    if (typeof item.id !== 'string' || !Object.hasOwn(catalogExercises, item.id)
      || seen.has(item.id) || phase < lastPhase || phase < 0) fail();
    seen.add(item.id); lastPhase = phase;
    const dose = validateDose(Object.fromEntries(DOSE_FIELDS.map(key => [key, item[key]])));
    if (!validSequenceDose(item.id, item)) fail();
    const exercise = catalogExercises[item.id];
    if (['power', 'footwork', 'reaction'].includes(exercise.category) && item.phase !== 'skill') fail();
    if (exercise.jumpContacts) {
      if (dose.unit !== 'reps') fail();
      contacts += exercise.jumpContacts * dose.sets * Math.max(...dose.value.split(/[–-]/).map(Number)) * (dose.perSide ? 2 : 1);
    }
    const preparation = item.preparation === undefined ? undefined : validateDose(item.preparation, true);
    if (preparation && !['strength', 'accessory'].includes(item.phase)) fail();
    return { id: item.id, phase: item.phase, ...dose, ...(preparation ? { preparation } : {}) };
  });
  if (contacts > 24 || contacts > 0 && items.some(item => catalogExercises[item.id].catalogCode === 'I04')) fail();
  return { v: 1, items };
}

// The catalog is trusted; arbitrary exercise names and all free-text plan fields
// are intentionally excluded from the public representation.
export function createSharePayload(day, _exercises = catalogExercises, level = 1) {
  if (!day || !Array.isArray(day.routine) || day.routine.length > 8) fail();
  if (day.routine.some(id => !Object.hasOwn(catalogExercises, id))) throw new Error('UNSUPPORTED_SHARE');
  const items = day.routine.map(id => {
    const exercise = catalogExercises[id];
    const dose = prescription(id, exercise.type, level, exercise, day);
    const phase = exercisePhase(day, id, exercise);
    const selected = {
      id, phase, sets: dose.sets, value: String(dose.value), unit: dose.unit,
      restSeconds: dose.restSeconds ?? 0, perSide: dose.perSide ?? false,
    };
    if (dose.preparation) selected.preparation = Object.fromEntries(DOSE_FIELDS.map(key => [key, key === 'value' ? String(dose.preparation[key]) : dose.preparation[key]]));
    return selected;
  }).sort((a, b) => SESSION_PHASES.indexOf(a.phase) - SESSION_PHASES.indexOf(b.phase));
  return validateSharePayload({ v: 1, items });
}

export function encodeSharePayload(payload) {
  const json = JSON.stringify(validateSharePayload(payload));
  const bytes = new TextEncoder().encode(json);
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (encoded.length > MAX_SHARE_LENGTH) fail();
  return encoded;
}

export function decodeSharePayload(encoded) {
  if (typeof encoded !== 'string' || !encoded.length || encoded.length > MAX_SHARE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encoded)) fail();
  try {
    const raw = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
    const json = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, char => char.charCodeAt(0)));
    return validateSharePayload(JSON.parse(json));
  } catch { fail(); }
}

export function shareDay(payload, lang = 'zh') {
  const validated = validateSharePayload(payload);
  const preparationInstruction = lang === 'en' ? 'Use bodyweight or very light resistance. Move slowly and keep several repetitions in reserve.' : '使用徒手或很輕的阻力，緩慢控制，保留餘力。';
  const phases = validated.items.map(item => item.phase);
  return {
    day: 1,
    sessionType: !phases.length ? 'rest' : phases.some(phase => ['strength', 'skill', 'accessory'].includes(phase)) ? 'training' : 'recovery',
    routine: validated.items.map(item => item.id),
    prescriptions: validated.items.map(item => ({ ...item, ...(item.preparation ? { preparation: { ...item.preparation, instruction: preparationInstruction } } : {}) })),
  };
}

export function shareUrl(payload, location = window.location) {
  return `${location.origin}${location.pathname}#workout=${encodeSharePayload(payload)}`;
}

export function readShareFromLocation(location = window.location) {
  const hash = location.hash || '';
  if (!hash.startsWith('#workout=')) return null;
  try { return { day: shareDay(decodeSharePayload(hash.slice(9))) }; }
  catch { return { day: null, error: 'INVALID_SHARE' }; }
}
