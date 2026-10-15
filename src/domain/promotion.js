import { normalizeWeeklyIntent } from './trainingPreferences.js';
import { readStorage, writeStorage } from './storage.js';
import { catalogExercises, eligibleExercises } from './exerciseCatalog.js';
import { normalizePlanningContext, validateGeneratedPlan } from './planning.js';
import { validateTrainingLog, validateReadiness, trainingLogId, targetRange } from './coaching.js';
import { getWeekString } from './dates.js';

const KEY = 'fitness_local_promotion_counts_v1';
const EVENTS = ['first_plan', 'first_completion', 'next_week_visit'];
const DRAFT_KEY = 'fitness_public_preview_v1';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const noMore = (candidate, baseline, unit) => {
  const next = targetRange(candidate, unit); const original = targetRange(baseline, unit);
  return next && original && next.min > 0 && next.min <= original.min && next.max <= original.max;
};
function cleanAdjustedDose(dose, baseline, exercise) {
  const reject = () => { throw new Error('INVALID_PREVIEW_ADJUSTMENT'); };
  const keys = ['id', 'sets', 'value', 'unit', 'restSeconds', 'perSide', 'phase', 'preparation'];
  if (!dose || Object.keys(dose).some(key => !keys.includes(key)) || !Number.isInteger(dose.sets) || dose.sets < 1 || dose.sets > baseline.sets
    || typeof dose.value !== 'string' || !/^\d+(?:[–-]\d+)?$/.test(dose.value)
    || !['id', 'unit', 'restSeconds', 'perSide'].every(key => dose[key] === baseline[key]) || !noMore(dose.value, baseline.value, baseline.unit)) reject();
  const recoveryMove = exercise && !exercise.shoulderLoaded && !exercise.jumpContacts
    && (['warmup', 'recovery', 'cooldown', 'mobility'].includes(exercise.category) || exercise.type === 'mobility' || ['bf_D09', 'bf_I01', 'bf_G07'].includes(dose.id));
  if (dose.phase !== baseline.phase && !(dose.phase === 'recovery' && recoveryMove)) reject();
  let preparation;
  if (dose.preparation !== undefined) {
    const prep = dose.preparation; const original = baseline.preparation;
    if (!['strength', 'accessory'].includes(dose.phase) || !original || !prep || typeof prep.value !== 'string' || !/^\d+(?:[–-]\d+)?$/.test(prep.value) || Object.keys(prep).length !== 6 || !Object.keys(original).every(key => Object.hasOwn(prep, key))
      || !Number.isInteger(prep.sets) || prep.sets < 1 || prep.sets > original.sets
      || !['unit', 'restSeconds', 'perSide', 'instruction'].every(key => prep[key] === original[key]) || !noMore(prep.value, original.value, original.unit)) reject();
    preparation = { sets: prep.sets, value: prep.value, unit: prep.unit, restSeconds: prep.restSeconds, perSide: prep.perSide, instruction: prep.instruction };
  }
  return { id: dose.id, sets: dose.sets, value: dose.value, unit: dose.unit, restSeconds: dose.restSeconds, perSide: dose.perSide, phase: dose.phase,
    ...(preparation ? { preparation } : {}) };
}
function promotionPlan(value, available, time, lang) {
  const decorate = plan => {
    const weeklyIntent = normalizeWeeklyIntent(value.plan?.weeklyIntent);
    return { ...plan, ...(weeklyIntent ? { weeklyIntent } : {}), language: lang, source: 'template' };
  };
  if (!value.baselinePlan && !value.adjustment) return { plan: decorate(validateGeneratedPlan(value.plan, available, time)) };
  const reject = () => { throw new Error('INVALID_PREVIEW_ADJUSTMENT'); };
  if (value.baselinePlan?.source !== 'template' || !value.adjustment || Object.keys(value.adjustment).length !== 2
    || !Array.isArray(value.adjustment.days) || !value.adjustment.days.length || value.adjustment.days.length > 5
    || new Set(value.adjustment.days).size !== value.adjustment.days.length || value.adjustment.days.some(day => !Number.isInteger(day) || day < 1 || day > 5)
    || !value.adjustment.completed || typeof value.adjustment.completed !== 'object' || Array.isArray(value.adjustment.completed)) reject();
  const baselinePlan = decorate(validateGeneratedPlan(value.baselinePlan, available, time));
  const baselineKeys = new Set(baselinePlan.schedule.flatMap(day => day.routine.map(id => `day${day.day}_${id}`)));
  const completed = value.adjustment.completed;
  if (Object.entries(completed).some(([key, done]) => !baselineKeys.has(key) || done !== true)) reject();
  if (value.plan?.source !== 'template' || value.plan.conclusion !== baselinePlan.conclusion || !Array.isArray(value.plan.schedule) || value.plan.schedule.length !== 5) reject();
  const seen = new Set(); const phases = ['warmup', 'skill', 'strength', 'accessory', 'recovery', 'cooldown'];
  const schedule = value.plan.schedule.map(day => {
    const base = baselinePlan.schedule.find(item => item.day === day?.day);
    if (!base || seen.has(day.day) || !['name', 'theme', 'concept'].every(key => day[key] === base[key])
      || !['coachAdvice', 'warmupNote', 'cooldownNote'].every(key => typeof day[key] === 'string' && day[key].trim() && day[key].length <= 10000)
      || !Array.isArray(day.routine) || day.routine.length > base.routine.length || new Set(day.routine).size !== day.routine.length
      || day.routine.some(id => !base.routine.includes(id)) || !Array.isArray(day.prescriptions) || day.prescriptions.length !== day.routine.length) reject();
    seen.add(day.day);
    const prescriptions = day.routine.map(id => {
      const candidates = day.prescriptions.filter(dose => dose?.id === id);
      if (candidates.length !== 1) reject();
      return cleanAdjustedDose(candidates[0], base.prescriptions.find(dose => dose.id === id), available[id]);
    });
    if (prescriptions.some((dose, index) => index && phases.indexOf(dose.phase) < phases.indexOf(prescriptions[index - 1].phase))) reject();
    for (const id of base.routine) if (completed[`day${day.day}_${id}`]
      && (!day.routine.includes(id) || !same(prescriptions.find(dose => dose.id === id), base.prescriptions.find(dose => dose.id === id)))) reject();
    const type = !day.routine.length ? 'rest' : prescriptions.some(dose => ['skill', 'strength', 'accessory'].includes(dose.phase)) ? 'training' : 'recovery';
    if (day.sessionType !== type) reject();
    if (type === 'training' && prescriptions.some(dose => ['skill', 'strength', 'accessory'].includes(dose.phase) && value.completed?.[`day${day.day}_${dose.id}`] !== true)
      && !prescriptions.some(dose => dose.phase === 'warmup')) reject();
    const firstStrength = prescriptions.find(dose => dose.phase === 'strength');
    if (firstStrength && value.completed?.[`day${day.day}_${firstStrength.id}`] !== true && !firstStrength.preparation) reject();
    const cleaned = { day: day.day, name: day.name, theme: day.theme, concept: day.concept, coachAdvice: day.coachAdvice,
      sessionType: day.sessionType, warmupNote: day.warmupNote, cooldownNote: day.cooldownNote, routine: [...day.routine], prescriptions };
    if (!value.adjustment.days.includes(day.day) && !same(cleaned, base)) reject();
    return cleaned;
  }).sort((a, b) => a.day - b.day);
  return { plan: decorate({ conclusion: baselinePlan.conclusion, schedule }), baselinePlan,
    adjustment: { days: [...value.adjustment.days].sort(), completed: { ...completed } } };
}

export function normalizePromotionDraft(value, week, pending = false) {
  try {
    if (!value || value.week !== week || !/^\d{4}-W\d{2}$/.test(week) || value.plan?.source !== 'template') return null;
    if (pending && (typeof value.targetUid !== 'string' || !value.targetUid || value.targetUid.length > 128)) return null;
    const lang = value.plan.language === 'en' ? 'en' : 'zh';
    const context = normalizePlanningContext(value.profile?.context);
    const time = Number(value.profile?.time);
    if (!Number.isFinite(time) || time < 5 || time > 240) return null;
    const validatedPlan = promotionPlan(value, eligibleExercises(catalogExercises(lang), context), time, lang);
    const { plan } = validatedPlan;
    const allowed = new Set(plan.schedule.flatMap(day => day.routine.map(id => `day${day.day}_${id}`)));
    const completed = Object.fromEntries(Object.entries(value.completed || {}).filter(([key, done]) => allowed.has(key) && done === true));
    // Private feedback belongs to the preview session, never to its public plan or share payload.
    const logs = []; const readiness = []; const seenLogs = new Set(); const seenDates = new Set();
    for (const item of (Array.isArray(value.logs) ? value.logs.slice(0, 40) : [])) {
      try {
        const clean = validateTrainingLog(item); const id = trainingLogId(clean);
        if (clean.week !== week || seenLogs.has(id)) continue;
        seenLogs.add(id); logs.push(clean);
      } catch { /* A malformed private entry does not invalidate a usable public preview. */ }
    }
    for (const item of (Array.isArray(value.readiness) ? value.readiness.slice(0, 7) : [])) {
      try {
        const clean = validateReadiness(item);
        if (getWeekString(new Date(`${clean.date}T12:00:00`)) !== week || seenDates.has(clean.date)) continue;
        seenDates.add(clean.date); readiness.push(clean);
      } catch { /* Invalid private entries never become coaching evidence. */ }
    }
    return { week, ...validatedPlan, completed, logs, readiness, profile: { context, time: String(time), goal: typeof value.profile?.goal === 'string' ? value.profile.goal.slice(0, 2000) : '',
      focus: ['balanced', 'coordination', 'stability', 'strength'].includes(value.profile?.focus) ? value.profile.focus : 'balanced' }, ...(pending ? { targetUid: value.targetUid } : {}) };
  } catch { return null; }
}
export function readPromotionDrafts(week) {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY) || '{}';
    if (raw.length > 300000) return { publicDraft: null, pendingDraft: null };
    const value = JSON.parse(raw);
    return { publicDraft: normalizePromotionDraft(value.publicDraft, week), pendingDraft: normalizePromotionDraft(value.pendingDraft, week, true) };
  } catch { return { publicDraft: null, pendingDraft: null }; }
}
export function writePromotionDrafts(publicDraft, pendingDraft) {
  try {
    if (!publicDraft && !pendingDraft) sessionStorage.removeItem(DRAFT_KEY);
    else sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ publicDraft, pendingDraft }));
  } catch { /* The live preview still works when browser session storage is unavailable. */ }
}
export function updatePromotionCounts(previous, event, week) {
  const validWeek = typeof week === 'string' && /^\d{4}-W\d{2}$/.test(week);
  if (!EVENTS.includes(event) || !validWeek) return previous;
  const counts = Object.fromEntries(EVENTS.map(key => [key, Number.isSafeInteger(previous?.counts?.[key]) && previous.counts[key] >= 0 ? previous.counts[key] : 0]));
  const firstWeek = typeof previous?.firstWeek === 'string' && /^\d{4}-W\d{2}$/.test(previous.firstWeek) ? previous.firstWeek : null;
  const lastVisitWeek = typeof previous?.lastVisitWeek === 'string' && /^\d{4}-W\d{2}$/.test(previous.lastVisitWeek) ? previous.lastVisitWeek : null;
  if (event === 'next_week_visit') {
    if (firstWeek && week > firstWeek && week !== lastVisitWeek) counts.next_week_visit += 1;
  } else if (!counts[event]) counts[event] = 1;
  return { counts, firstWeek: firstWeek || (event === 'first_plan' ? week : null), lastVisitWeek: event === 'next_week_visit' ? week : lastVisitWeek };
}
export function recordPromotionEvent(event, week) {
  let previous;
  try { previous = JSON.parse(readStorage(KEY, '{}')); } catch { previous = {}; }
  writeStorage(KEY, JSON.stringify(updatePromotionCounts(previous, event, week)));
}
