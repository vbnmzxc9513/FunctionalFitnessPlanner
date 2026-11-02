import recipeData from '../data/quickWorkouts.json' with { type: 'json' };
import { catalogExercises } from './exerciseCatalog.js';
import { estimateSessionMinutes } from './sessions.js';

export const QUICK_WORKOUT_SCHEMA_VERSION = recipeData.schemaVersion;
const warmup = recipeData.workouts.find(recipe => recipe.id === 'daily-warmup');
export const DAILY_WARMUP_IDS = Object.freeze(warmup.prescriptions.map(dose => dose.id));

/** Return isolated copies: editing a day's dose never mutates a system recipe. */
export function getQuickWorkouts(lang = 'zh') {
  const exercises = catalogExercises(lang);
  return recipeData.workouts.map(recipe => {
    const prescriptions = recipe.prescriptions.map(dose => ({ ...dose }));
    const session = { sessionType: 'training', routine: prescriptions.map(dose => dose.id), prescriptions };
    return {
      ...structuredClone(recipe), ...session,
      name: lang === 'en' ? recipe.nameEn : recipe.name,
      description: lang === 'en' ? recipe.descriptionEn : recipe.description,
      equipmentSummary: lang === 'en' ? recipe.equipmentSummaryEn : recipe.equipmentSummary,
      estimatedMinutes: estimateSessionMinutes(session, exercises),
    };
  });
}

export function getQuickWorkout(id, lang = 'zh') {
  return getQuickWorkouts(lang).find(recipe => recipe.id === id) || null;
}

export function dailyWarmupPrescriptions(phase = 'warmup') {
  if (!['warmup', 'recovery'].includes(phase)) throw new Error('INVALID_WARMUP_PHASE');
  return warmup.prescriptions.map(dose => ({ ...dose, phase }));
}

/** Identity and phase check, not evidence that any movement was performed. */
export function isDailyWarmupComplete(day) {
  return DAILY_WARMUP_IDS.every(id => day.routine?.includes(id)
    && day.prescriptions?.some(dose => dose.id === id && ['warmup', 'recovery'].includes(dose.phase)));
}

/** Preview conversion only. Callers check date/record protection and obtain the
 * user's explicit choice before storing this returned copy. No completion or
 * log record is created or expanded here. */
export function expandLegacyWarmup(day) {
  const legacy = new Set(['bf_A12', 'bf_A13']);
  if (!day?.routine?.some(id => legacy.has(id))) return structuredClone(day);
  const legacyDose = day.prescriptions?.find(dose => legacy.has(dose.id));
  const phase = legacyDose?.phase === 'recovery' ? 'recovery' : 'warmup';
  const originals = (day.prescriptions || []).filter(dose => !legacy.has(dose.id));
  const existing = new Set((day.routine || []).filter(id => !legacy.has(id)));
  const added = dailyWarmupPrescriptions(phase).filter(dose => !existing.has(dose.id));
  const first = day.routine.findIndex(id => legacy.has(id));
  const routine = day.routine.filter(id => !legacy.has(id));
  routine.splice(first, 0, ...added.map(dose => dose.id));
  const prescriptions = routine.map(id => structuredClone(originals.find(dose => dose.id === id) || added.find(dose => dose.id === id))).filter(Boolean);
  return { ...structuredClone(day), routine, prescriptions };
}
