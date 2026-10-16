import { normalizePlanningContext } from './planning.js';
import { WEEKLY_FOCUSES } from './trainingPreferences.js';

export function questionnaireProfile(value, week) {
  return { week, context: normalizePlanningContext(value?.context),
    focus: WEEKLY_FOCUSES.includes(value?.focus) ? value.focus : 'balanced',
    time: typeof value?.time === 'string' && value.time.length <= 8 ? value.time : '30',
    goal: typeof value?.goal === 'string' ? value.goal.slice(0, 2000) : '' };
}

export function readQuestionnaireDraft(storage, key, week) {
  try {
    const raw = storage.getItem(key);
    if (!raw || raw.length > 16000) return null;
    const value = JSON.parse(raw);
    return value?.week === week ? questionnaireProfile(value, week) : null;
  } catch { return null; }
}

export function planningFingerprint({ week, uid, revision, context, focus, time, goal, message, mode, lang, exercises, progress, schedule, feedback }) {
  return JSON.stringify({ week, uid, revision, context: normalizePlanningContext(context), focus, time, goal, message, mode, lang, exercises, progress, schedule, feedback });
}
