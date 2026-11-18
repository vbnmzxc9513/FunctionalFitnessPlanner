import { EQUIPMENT } from './exerciseCatalog.js';
import { BODY_PARTS } from './exerciseTags.js';

export const DEVICE_EXERCISES_KEY = 'fitness_custom_exercises_v1';
const purposes = ['warmup', 'training', 'cooldown'];
const parts = new Set(BODY_PARTS.map(([key]) => key));
const fail = code => { throw new Error(code); };

// Firestore rejects arrays inside arrays. Keep the runtime alternatives format
// out of persisted custom rows; one explicit equipment set is sufficient here.
export function customExerciseForStorage(exercise) {
  const { equipmentOptions, ...row } = exercise;
  return { ...row, equipmentRequired: [...(equipmentOptions?.[0] || [])] };
}
export function hydrateCustomExercise(row) {
  if (!row?.manuallyCreated || !Array.isArray(row.equipmentRequired)) return row;
  const { equipmentRequired, ...exercise } = row;
  return { ...exercise, equipmentOptions: [[...equipmentRequired]] };
}

export function createCustomExercise(input) {
  const name = String(input.name || '').trim();
  if (!name || name.length > 100 || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) fail('CUSTOM_NAME');
  if (!purposes.includes(input.purpose)) fail('CUSTOM_PURPOSE');
  if (!Array.isArray(input.bodyParts) || !input.bodyParts.length || input.bodyParts.length > 4 || input.bodyParts.some(value => !parts.has(value))) fail('CUSTOM_PARTS');
  if (!Array.isArray(input.equipment) || input.equipment.some(value => !EQUIPMENT.includes(value))) fail('CUSTOM_EQUIPMENT');
  const mobility = input.purpose !== 'training';
  const dose = input.prescription || { sets: mobility ? 1 : 2, value: mobility ? '30' : '8', unit: mobility ? 'seconds' : 'reps', restSeconds: mobility ? 0 : 60, perSide: false };
  const values = String(dose.value).split(/[–-]/).map(Number);
  if (!Number.isInteger(dose.sets) || dose.sets < 1 || dose.sets > 5 || !/^\d{1,3}(?:[–-]\d{1,3})?$/.test(String(dose.value))
    || !['reps','seconds','minutes','breaths'].includes(dose.unit) || values.some(value => value < 1 || value > ({ reps:100, seconds:600, minutes:10, breaths:30 }[dose.unit]))
    || values.length === 2 && values[0] > values[1] || !Number.isInteger(dose.restSeconds) || dose.restSeconds < 0 || dose.restSeconds > 300 || typeof dose.perSide !== 'boolean') fail('CUSTOM_DOSE');
  const bodyParts = [...new Set(input.bodyParts)];
  const upper = bodyParts.some(value => ['chest','back','shoulder','arms','forearm','serratus'].includes(value));
  const lower = bodyParts.some(value => ['legs','hip','glutes','quadriceps','hamstrings','adductors','calves','ankle','foot'].includes(value));
  const category = mobility ? input.purpose === 'warmup' ? 'warmup' : 'recovery' : upper ? 'upper' : lower ? 'lower' : bodyParts.includes('core') ? 'core' : 'conditioning';
  const description = String(input.description || '').trim();
  if (description.length > 1000) fail('CUSTOM_DESCRIPTION');
  return { name, type: mobility ? 'mobility' : upper ? bodyParts.includes('back') ? 'upper_pull' : 'upper_push' : lower ? 'lower' : bodyParts.includes('core') ? 'core' : 'full', category,
    bodyParts, libraryGroups: [input.purpose], equipmentOptions: [[...new Set(input.equipment)]], active: true,
    shoulderLoaded: upper || input.equipment.length > 0, requiresPartner: false, advanced: false,
    prescription: { sets: dose.sets, value: String(dose.value), unit: dose.unit, restSeconds: dose.restSeconds, perSide: dose.perSide },
    tip: description, purpose: input.purpose, manuallyCreated: true };
}

export function readDeviceExercises(storage = globalThis.localStorage) {
  let raw; try { raw = storage?.getItem(DEVICE_EXERCISES_KEY); } catch { fail('CUSTOM_STORAGE'); }
  if (!raw) return {};
  try {
    if (raw.length > 1500000) fail('CUSTOM_STORAGE');
    const saved = JSON.parse(raw);
    if (saved.version !== 1 || !saved.exercises || Object.keys(saved.exercises).length > 500) fail('CUSTOM_STORAGE');
    const result = {};
    for (const [id, row] of Object.entries(saved.exercises)) {
      if (!/^custom_[a-zA-Z0-9_]{1,100}$/.test(id)) fail('CUSTOM_STORAGE');
      const clean = createCustomExercise({ ...row, purpose: row.purpose || row.libraryGroups?.[0], equipment: row.equipmentRequired || row.equipmentOptions?.[0], description: row.tip });
      result[id] = { ...clean, ...(row.deleted ? { deleted:true, active:false } : {}) };
    }
    return result;
  } catch { fail('CUSTOM_STORAGE'); }
}
export function writeDeviceExercise(id, exercise, storage = globalThis.localStorage) {
  if (!/^custom_[a-zA-Z0-9_]{1,100}$/.test(id)) fail('CUSTOM_STORAGE');
  const next = { ...readDeviceExercises(storage), [id]: exercise };
  if (Object.keys(next).length > 500) fail('CUSTOM_LIMIT');
  try { storage.setItem(DEVICE_EXERCISES_KEY, JSON.stringify({ version:1, exercises:Object.fromEntries(Object.entries(next).map(([key,row]) => [key,customExerciseForStorage(row)])) })); } catch { fail('CUSTOM_STORAGE'); }
  return next;
}
export function customExerciseError(error, lang = 'zh') {
  const messages = {
    CUSTOM_NAME: ['請填 1–100 字的動作名稱。','Enter a name of 1–100 characters.'],
    CUSTOM_PARTS: ['請選擇動作部位。','Choose a body part.'],
    CUSTOM_EQUIPMENT: ['請選擇清單中的器材。','Choose equipment from the list.'],
    CUSTOM_DOSE: ['請檢查組次、數值、單位與休息時間。','Check sets, amount, unit and rest.'],
    CUSTOM_LIMIT: ['動作庫已達 500 項上限。','The library has reached its 500-item limit.'],
    CUSTOM_STORAGE: ['本機資料無法儲存，動作尚未新增。請保持表單開啟並重試。','Device storage is unavailable. Nothing was added; keep the form open and retry.'],
    SESSION_CHANGED: ['帳號已變更，請重新開啟新增動作。','Your account changed. Reopen the create form.'],
  };
  return messages[error?.message]?.[lang === 'en' ? 1 : 0] || (lang === 'en' ? 'Could not save. Your form is retained; please retry.' : '無法儲存，表單內容已保留，請重試。');
}
