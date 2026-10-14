import { readStorage, writeStorage } from './storage.js';
import { catalogExercises, eligibleExercises } from './exerciseCatalog.js';
import { normalizePlanningContext, validateGeneratedPlan } from './planning.js';

const KEY = 'fitness_local_promotion_counts_v1';
const EVENTS = ['first_plan', 'first_completion', 'next_week_visit'];
const DRAFT_KEY = 'fitness_public_preview_v1';

export function normalizePromotionDraft(value, week, pending = false) {
  try {
    if (!value || value.week !== week || !/^\d{4}-W\d{2}$/.test(week) || value.plan?.source !== 'template') return null;
    if (pending && (typeof value.targetUid !== 'string' || !value.targetUid || value.targetUid.length > 128)) return null;
    const lang = value.plan.language === 'en' ? 'en' : 'zh';
    const context = normalizePlanningContext(value.profile?.context);
    const time = Number(value.profile?.time);
    if (!Number.isFinite(time) || time < 5 || time > 240) return null;
    const plan = { ...validateGeneratedPlan(value.plan, eligibleExercises(catalogExercises(lang), context), time), language: lang, source: 'template' };
    const allowed = new Set(plan.schedule.flatMap(day => day.routine.map(id => `day${day.day}_${id}`)));
    const completed = Object.fromEntries(Object.entries(value.completed || {}).filter(([key, done]) => allowed.has(key) && done === true));
    return { week, plan, completed, profile: { context, time: String(time), goal: typeof value.profile?.goal === 'string' ? value.profile.goal.slice(0, 2000) : '',
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
