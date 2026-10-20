import { getWeekString, isCalendarDate } from './dates.js';
import { exercisePhase, moveWithinPhase, SESSION_PHASES } from './phases.js';
import { validateGeneratedDay } from './planning.js';
import { prescription } from './training.js';
import { validSequenceDose } from './exerciseCatalog.js';
import { matchesTrainingTarget } from './trainingTargets.js';

export const MANUAL_MAX_EXERCISES = 8;
export const MANUAL_MAX_DAYS = 28;
export const MANUAL_TYPES = ['all', 'strength', 'dynamic', 'static', 'skill', 'other'];
export const MANUAL_REGIONS = ['all', 'legs', 'chest', 'back', 'serratus', 'thoracic', 'hip', 'leg_stretch', 'shoulder', 'core'];
const DAY_MS = 86400000;
const clone = value => structuredClone(value);
const fail = (code, details = {}) => { throw Object.assign(new Error(code), details); };
const scope = uid => uid ? `account:${uid}` : 'signed-out';
const text = (lang, zh, en) => lang === 'en' ? en : zh;
const words = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
const NOTES = ['name', 'theme', 'concept', 'coachAdvice', 'warmupNote', 'cooldownNote'];

export function shiftManualDate(date, amount) {
  if (!isCalendarDate(date) || !Number.isInteger(amount)) fail('MANUAL_INVALID_DATES');
  return new Date(Date.parse(`${date}T12:00:00Z`) + amount * DAY_MS).toISOString().slice(0, 10);
}

/** Nonconsecutive dates are allowed; the inclusive first-to-last span is at most 28 days. */
export function validateManualDates(dates, { today, allowEmpty = false } = {}) {
  if (!Array.isArray(dates) || (!allowEmpty && !dates.length) || dates.some(date => !isCalendarDate(date))
    || new Set(dates).size !== dates.length) fail('MANUAL_INVALID_DATES');
  const ordered = [...dates].sort();
  if (today && (!isCalendarDate(today) || ordered.some(date => date < today))) fail('MANUAL_PAST_DATE');
  if (ordered.length && (Date.parse(`${ordered.at(-1)}T12:00:00Z`) - Date.parse(`${ordered[0]}T12:00:00Z`)) / DAY_MS >= MANUAL_MAX_DAYS) fail('MANUAL_DATE_SPAN');
  return ordered;
}

export function createManualSession(date, lang = 'zh') {
  if (!isCalendarDate(date)) fail('MANUAL_INVALID_DATES');
  return {
    date, week: getWeekString(new Date(`${date}T12:00:00`)), day: new Date(`${date}T12:00:00Z`).getUTCDay() || 7,
    name: text(lang, '自訂訓練', 'Custom session'), theme: text(lang, '手動安排', 'Manually planned'),
    concept: text(lang, '依自己選擇的動作、階段與組次安排。', 'Exercises, phases and doses selected by you.'),
    coachAdvice: text(lang, '依列出的計畫執行；不適時停止並調整。', 'Follow the listed plan; stop and adjust if uncomfortable.'),
    warmupNote: text(lang, '依列出的暖身與主項準備組進行；尚未加入暖身時，請先補齊再檢查。', 'Follow the listed warm-up and preparation sets. Add a warm-up before reviewing a training session.'),
    cooldownNote: text(lang, '依列出的收操進行；沒有收操動作時不需額外補做。', 'Follow the listed cooldown; no extra work is required when none is listed.'),
    sessionType: 'rest', routine: [], prescriptions: [],
  };
}

export function defaultManualPhaseType(phase) {
  return phase === 'warmup' ? 'dynamic' : phase === 'skill' ? 'skill' : ['recovery', 'cooldown'].includes(phase) ? 'static' : 'strength';
}

export function manualExerciseType(id, exercise = {}) {
  if (['power', 'footwork', 'reaction'].includes(exercise.category) || exercise.type === 'power') return 'skill';
  if (exercise.category === 'recovery' || /^H\d/.test(exercise.catalogCode || '')) return 'static';
  if (exercise.category === 'warmup' || exercise.type === 'mobility' || exercise.sequenceMinutes) return 'dynamic';
  if (['lower', 'upper', 'core'].includes(exercise.category) || ['lower', 'upper_pull', 'upper_push', 'core'].includes(exercise.type)) return 'strength';
  return 'other';
}

const MOBILITY_CODES = {
  thoracic: ['A06', 'A10', 'A11', 'A12', 'A13', 'H12'],
  hip: ['A03', 'A04', 'A05', 'A12', 'A13', 'A15', 'H03', 'H04', 'H05', 'H06', 'H11'],
  leg_stretch: ['A02', 'A03', 'A04', 'A05', 'A12', 'A13', 'A14', 'A15', 'H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H09', 'H10', 'H11'],
};
const REGION_TERMS = {
  legs: '腿 下肢 leg lower body quadriceps hamstrings calves', chest: '胸 胸肌 chest pectoral', back: '背 背肌 back pull',
  serratus: '前鋸肌 前锯肌 serratus', thoracic: '胸椎 胸椎拉伸 thoracic spine', hip: '髖 髋 hip',
  leg_stretch: '腿拉伸 腿部拉伸 腿伸展 leg stretch hamstring stretch', shoulder: '肩 肩胛 shoulder scapular', core: '核心 core trunk',
};
export function manualExerciseRegions(id, exercise = {}) {
  const result = new Set();
  if (exercise.category === 'lower' || exercise.type === 'lower') result.add('legs');
  for (const region of ['chest', 'back', 'serratus']) if (matchesTrainingTarget(region, id, exercise)) result.add(region);
  for (const [region, codes] of Object.entries(MOBILITY_CODES)) if (codes.includes(exercise.catalogCode)) result.add(region);
  if (['A07', 'A08', 'A09', 'C05', 'C06', 'C07', 'H07'].includes(exercise.catalogCode)) result.add('shoulder');
  if (exercise.category === 'core' || exercise.type === 'core') result.add('core');
  // Custom exercises remain discoverable by their declared names and aliases.
  const description = words([exercise.name, exercise.nameEn, ...(exercise.aliases || [])].join(' '));
  if (!exercise.catalogCode) for (const [region, terms] of Object.entries(REGION_TERMS)) {
    if (terms.split(' ').some(term => term.length > 1 && description.includes(term))) result.add(region);
  }
  return [...result];
}

export function filterManualExercises(exercises = {}, eligible = {}, { type = 'all', region = 'all', query = '' } = {}) {
  const tokens = words(query).split(' ').filter(Boolean);
  return Object.entries(eligible).filter(([id, exercise]) => {
    if (!exercises[id] || exercise.active === false || exercise.deleted) return false;
    const regions = manualExerciseRegions(id, exercise);
    if (type !== 'all' && manualExerciseType(id, exercise) !== type || region !== 'all' && !regions.includes(region)) return false;
    const searchable = words([id, exercise.name, exercise.nameEn, exercise.catalogCode, exercise.purpose, ...(exercise.aliases || []), ...regions.map(value => REGION_TERMS[value])].join(' '));
    return tokens.every(token => searchable.includes(token));
  });
}

function defaultDose(id, exercise, phase) {
  const source = prescription(id, exercise.type, 1, exercise);
  return { id, phase, sets: source.sets, value: String(source.value), unit: source.unit,
    restSeconds: source.restSeconds ?? (['strength', 'accessory', 'skill'].includes(phase) ? 90 : 0), perSide: source.perSide === true,
    ...(source.preparation ? { preparation: clone(source.preparation) } : {}) };
}

/** Preserve every saved item. Eligibility is checked before addition and preview, never by filtering a draft. */
export function hydrateManualSession(source, exercises = {}, lang = 'zh') {
  if (!source || !isCalendarDate(source.date) || !Array.isArray(source.routine) || source.routine.some(id => typeof id !== 'string')
    || new Set(source.routine).size !== source.routine.length || source.prescriptions !== undefined && !Array.isArray(source.prescriptions)) fail('MANUAL_INVALID_DRAFT');
  const existing = source.prescriptions || [];
  if (existing.some(dose => !dose || !source.routine.includes(dose.id) || dose.phase !== undefined && !SESSION_PHASES.includes(dose.phase)) || new Set(existing.map(dose => dose.id)).size !== existing.length) fail('MANUAL_INVALID_DRAFT');
  const session = { ...createManualSession(source.date, lang), ...Object.fromEntries(NOTES.filter(key => typeof source[key] === 'string').map(key => [key, source[key]])),
    routine: [...source.routine], prescriptions: source.routine.map(id => {
      const dose = existing.find(value => value.id === id);
      const defaults = defaultDose(id, exercises[id] || {}, exercisePhase(source, id, exercises[id]));
      return dose ? { ...defaults, ...clone(dose), phase: dose.phase || defaults.phase } : defaults;
    }) };
  return syncManualSession(session, exercises, lang);
}

function syncManualSession(session, exercises, lang = 'zh') {
  const doses = [...session.prescriptions].sort((a, b) => SESSION_PHASES.indexOf(a.phase) - SESSION_PHASES.indexOf(b.phase));
  const firstStrength = doses.find(dose => dose.phase === 'strength');
  if (firstStrength && !firstStrength.preparation) {
    const exercise = exercises[firstStrength.id] || {};
    const replacement = { ...firstStrength, preparation: { sets: 1, value: firstStrength.unit === 'seconds' ? '10' : '4',
      unit: firstStrength.unit === 'seconds' ? 'seconds' : 'reps', restSeconds: 30, perSide: firstStrength.perSide,
      instruction: text(lang, '同一動作以徒手或最輕可控阻力準備，不做到疲勞；完成後休息 30 秒。', 'Prepare with the same movement using bodyweight or the lightest controllable resistance, without fatigue; rest 30 seconds.') } };
    if (!exercise.sequenceMinutes) doses[doses.indexOf(firstStrength)] = replacement;
  }
  const hasTraining = doses.some(dose => ['skill', 'strength', 'accessory'].includes(dose.phase)
    || ['lower', 'upper', 'power', 'footwork', 'reaction'].includes(exercises[dose.id]?.category));
  return { ...session, routine: doses.map(dose => dose.id), prescriptions: doses,
    sessionType: !doses.length ? 'rest' : hasTraining ? 'training' : 'recovery' };
}

function requireAvailable(ids, exercises, eligible) {
  for (const id of ids) if (!exercises[id] || !eligible[id] || eligible[id].active === false || eligible[id].deleted) fail('MANUAL_INELIGIBLE_EXERCISE', { exerciseId: id });
}

export function addManualExercises(session, ids, { exercises = {}, eligibleExercises = {}, phase, lang = 'zh' } = {}) {
  if (!SESSION_PHASES.includes(phase) || !Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string')) fail('MANUAL_INVALID_SELECTION');
  if (new Set(ids).size !== ids.length || ids.some(id => session.routine.includes(id))) fail('MANUAL_DUPLICATE_EXERCISE');
  if (session.routine.length + ids.length > MANUAL_MAX_EXERCISES) fail('MANUAL_CAPACITY');
  requireAvailable(ids, exercises, eligibleExercises);
  if ([...session.routine, ...ids].filter(id => exercises[id]?.sequenceMinutes).length > 1) fail('MANUAL_SEQUENCE_LIMIT');
  if (ids.some(id => ['power', 'footwork', 'reaction'].includes(exercises[id].category) && phase !== 'skill')) fail('INVALID_AI_EXERCISE_PHASE');
  const doses = ids.map(id => defaultDose(id, eligibleExercises[id], phase));
  return syncManualSession({ ...session, prescriptions: [...session.prescriptions.map(clone), ...doses] }, exercises, lang);
}

export function updateManualPrescription(session, id, changes, { exercises = {}, lang = 'zh' } = {}) {
  const existing = session.prescriptions.find(dose => dose.id === id);
  if (!existing) fail('MANUAL_MISSING_EXERCISE');
  const dose = { ...clone(existing), ...clone(changes), id };
  const values = typeof dose.value === 'string' && /^\d+(?:[–-]\d+)?$/.test(dose.value) ? dose.value.split(/[–-]/).map(Number) : [];
  if (!Number.isInteger(dose.sets) || dose.sets < 1 || dose.sets > 5 || !values.length || values.some(value => value < 1 || value > (dose.unit === 'minutes' ? 240 : 120))
    || values.length === 2 && values[0] > values[1] || !['reps', 'seconds', 'minutes', 'breaths'].includes(dose.unit)
    || !Number.isInteger(dose.restSeconds) || dose.restSeconds < 0 || dose.restSeconds > 300 || typeof dose.perSide !== 'boolean' || !SESSION_PHASES.includes(dose.phase)) fail('MANUAL_INVALID_DOSE');
  if (!validSequenceDose(id, dose)) fail('MANUAL_SEQUENCE_DOSE');
  if (['power', 'footwork', 'reaction'].includes(exercises[id]?.category) && dose.phase !== 'skill') fail('INVALID_AI_EXERCISE_PHASE');
  return syncManualSession({ ...session, prescriptions: session.prescriptions.map(item => item.id === id ? dose : clone(item)) }, exercises, lang);
}

export function removeManualExercise(session, id, options = {}) {
  if (!session.routine.includes(id)) fail('MANUAL_MISSING_EXERCISE');
  return syncManualSession({ ...session, prescriptions: session.prescriptions.filter(dose => dose.id !== id).map(clone) }, options.exercises || {}, options.lang);
}

export function reorderManualExercise(session, id, direction, exercises = {}, lang = 'zh') {
  if (![-1, 1].includes(direction) || !session.routine.includes(id)) fail('MANUAL_INVALID_SELECTION');
  const next = moveWithinPhase(session, id, direction, exercises);
  return syncManualSession({ ...next, prescriptions: next.routine.map(item => clone(next.prescriptions.find(dose => dose.id === item))) }, exercises, lang);
}

export function copyManualSession(source, date, { exercises = {}, lang = 'zh' } = {}) {
  return hydrateManualSession({ ...clone(source), date }, exercises, lang);
}

export function prepareManualPreview(sessions, { exercises = {}, eligibleExercises = {}, today, dailyTime = 240 } = {}) {
  if (!Array.isArray(sessions)) fail('MANUAL_INVALID_DRAFT');
  validateManualDates(sessions.map(session => session.date), { today });
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date)).map(session => {
    try {
      if (session.routine.length > MANUAL_MAX_EXERCISES) fail('MANUAL_CAPACITY');
      requireAvailable(session.routine, exercises, eligibleExercises);
      const identity = createManualSession(session.date);
      const day = validateGeneratedDay({ ...session, day: identity.day }, exercises, dailyTime);
      return { date: identity.date, week: identity.week, ...day };
    } catch (error) { error.date = session.date; throw error; }
  });
}

export const manualDraftStorageKey = uid => `fitness_manual_planner_v1_${encodeURIComponent(scope(uid))}`;

export function saveManualDraft(uid, sessions, { storage = globalThis.localStorage } = {}) {
  validateManualDates(sessions.map(session => session.date));
  if (!storage) fail('MANUAL_STORAGE_UNAVAILABLE');
  // Only public planning fields enter the draft; no actuals, profile or clinical notes.
  const clean = sessions.map(session => ({ ...Object.fromEntries(['date', 'week', 'day', ...NOTES, 'sessionType'].map(key => [key, session[key]])),
    routine: [...session.routine], prescriptions: session.prescriptions.map(clone) }));
  storage.setItem(manualDraftStorageKey(uid), JSON.stringify({ version: 1, scope: scope(uid), sessions: clean }));
}

export function loadManualDraft(uid, { storage = globalThis.localStorage, exercises = {}, lang = 'zh' } = {}) {
  if (!storage) return null;
  const raw = storage.getItem(manualDraftStorageKey(uid));
  if (!raw) return null;
  let saved;
  try { saved = JSON.parse(raw); } catch { fail('MANUAL_INVALID_DRAFT'); }
  if (!saved || typeof saved !== 'object' || saved.version !== 1 || saved.scope !== scope(uid) || !Array.isArray(saved.sessions) || saved.sessions.some(session => !session || typeof session !== 'object')) fail('MANUAL_INVALID_DRAFT');
  validateManualDates(saved.sessions.map(session => session.date));
  return saved.sessions.map(session => hydrateManualSession(session, exercises, lang));
}

export function clearManualDraft(uid, { storage = globalThis.localStorage } = {}) {
  storage?.removeItem(manualDraftStorageKey(uid));
}

export function manualPlannerErrorMessage(error, lang = 'zh', exercises = {}) {
  const code = error?.message;
  const copy = {
    INVALID_PLANNING_TIME: ['每日時間上限需為 5–240 分鐘。', 'The daily time limit must be between 5 and 240 minutes.'],
    MANUAL_INVALID_DATES: ['請選至少一天，並檢查日期格式。', 'Select at least one valid date.'],
    MANUAL_PAST_DATE: ['不能把新草稿排到過去日期。請回日期步驟調整。', 'New plans cannot use past dates. Return to the date step to adjust.'],
    MANUAL_DATE_SPAN: ['第一天到最後一天最多 28 天，可以不連續。', 'The inclusive first-to-last date span must be at most 28 days. Dates may be nonconsecutive.'],
    MANUAL_INVALID_DRAFT: ['無法讀取這份草稿；原本資料尚未清除。可以返回或明確捨棄後重新開始。', 'This draft cannot be read. The stored data has not been cleared. Return or explicitly discard it to start again.'],
    MANUAL_INELIGIBLE_EXERCISE: ['有動作已不符合目前器材、搭檔、治療限制或啟用條件。請移除或更換後再檢查。', 'An exercise no longer meets the current equipment, partner, treatment or enabled conditions. Remove or replace it before reviewing.'],
    MANUAL_CAPACITY: ['每天最多 8 個動作，包含暖身與收操。這一批尚未加入，請減少選取或先移除既有動作。', 'Each day allows 8 exercises, including warm-up and cooldown. This batch was not added. Select fewer or remove an existing exercise.'],
    MANUAL_DUPLICATE_EXERCISE: ['同一天不能重複加入同一動作；這一批尚未加入。', 'The same exercise cannot be added twice to a day. This batch was not added.'],
    MANUAL_SEQUENCE_LIMIT: ['每天只能選一套完整計時暖身，不能同時加入 6 分與 10 分流程。這一批尚未加入。', 'Choose only one complete timed flow per day. The 6- and 10-minute flows cannot both be added. This batch was not added.'],
    MANUAL_SEQUENCE_DOSE: ['整套流程的時間包含全部段落與左右側，不能改成縮短組次。', 'A complete flow includes every part and both sides; its fixed dose cannot be shortened.'],
    MANUAL_INVALID_DOSE: ['請填有效組次：1–5 組、數值或遞增範圍、休息 0–300 秒。', 'Use a valid dose: 1–5 sets, a number or increasing range, and 0–300 seconds of rest.'],
    INVALID_AI_EXERCISE_PHASE: ['步法、反應與爆發動作必須放在技能階段，請回排課選正確階段。', 'Footwork, reaction and power exercises must use the skill phase. Return and choose that phase.'],
    AI_WARMUP_MISSING: ['訓練日還沒有暖身。請先加入合適的暖身，再檢查。', 'This training day needs a warm-up before review.'],
    AI_PREPARATION_MISSING: ['第一個肌力動作需要明列輕量準備組。請編輯後再檢查。', 'The first strength exercise needs an explicit light preparation set. Edit it before reviewing.'],
    AI_SESSION_TOO_LONG: ['這天的動作、左右側、準備組與休息超過每日時間上限。請調整組次、休息或動作，不會自動刪項。', 'This day exceeds the daily time limit including both sides, preparation and rests. Adjust doses, rests or exercises; nothing was removed automatically.'],
    EXCESSIVE_AI_JUMP_VOLUME: ['這天超過現有跳躍量規則，或把跳繩與額外跳躍合排。請減少或改日期。', 'This day exceeds the existing jump-volume rule or combines skipping with extra jumps. Reduce it or use another date.'],
    INVALID_AI_RECOVERY: ['恢復日不能混入主要肌力、爆發、步法或高強度體能。請調整階段或動作。', 'A recovery day cannot include main strength, power, footwork or high-intensity conditioning. Adjust phases or exercises.'],
    INVALID_AI_PREPARATION: ['輕量準備組的格式或劑量不符合規則，請調整後再檢查。', 'The preparation set format or dose needs adjustment before review.'],
    INVALID_AI_PRESCRIPTION: ['這天有無效組次或整套暖身劑量，請檢查每個動作。', 'This day contains an invalid dose or timed flow. Check each exercise.'],
    MANUAL_STORAGE_UNAVAILABLE: ['無法在這台裝置保存草稿。請先保持此頁開啟，再重試保存。', 'This device could not save the draft. Keep this page open and retry.'],
  };
  const message = (copy[code] || ['無法完成這個草稿操作。請檢查內容後重試；既有課表沒有變動。', 'The draft action could not be completed. Check it and retry; existing plans have not changed.'])[lang === 'en' ? 1 : 0];
  return `${error?.date ? `${error.date}：` : ''}${message}${error?.exerciseId ? ` (${exercises[error.exerciseId]?.name || error.exerciseId})` : ''}`;
}
