import { hydrateManualSession, MANUAL_MAX_EXERCISES, manualExerciseRegions } from './manualPlanner.js';
import { exerciseEligibilityIssues } from './exerciseCatalog.js';
import { estimateSessionMinutes } from './sessions.js';

const clone = value => structuredClone(value);
const phasesFor = scope => scope === 'warmup' ? ['warmup'] : scope === 'training' ? ['skill', 'strength', 'accessory'] : scope === 'cooldown' ? ['recovery', 'cooldown'] : null;

export function quickWorkoutRegions(workout, exercises = {}) {
  return [...new Set([...(workout.bodyRegions || []), ...(workout.routine || []).flatMap(id => manualExerciseRegions(id, exercises[id] || {}))])];
}

/** The returned next draft is the exact content shown by preview. No item is silently discarded. */
export function previewQuickWorkout(session, workout, { exercises = {}, eligibleExercises = {}, mode = 'append', replaceScope = 'day', duplicateChoices = {}, excludedIds = [], dailyTime = 240, context = {}, lang = 'zh' } = {}) {
  const incoming = workout.prescriptions || workout.snapshot?.prescriptions || [];
  const current = session.prescriptions || [];
  const phases = phasesFor(replaceScope);
  const removed = mode === 'replace' ? current.filter(dose => !phases || phases.includes(dose.phase)) : [];
  const base = current.filter(dose => !removed.some(item => item.id === dose.id)).map(clone);
  const duplicates = incoming.filter(dose => base.some(item => item.id === dose.id)).map(dose => ({ id: dose.id, existing: clone(base.find(item => item.id === dose.id)), incoming: clone(dose), choice: duplicateChoices[dose.id] || 'keep' }));
  let keptCount = 0;
  const addedIds = [], replacedIds = [], excluded = [];
  for (const dose of incoming) {
    if (excludedIds.includes(dose.id)) { excluded.push(dose.id); continue; }
    const existing = base.findIndex(item => item.id === dose.id);
    if (existing >= 0) {
      if (duplicateChoices[dose.id] === 'replace') { base[existing] = clone(dose); replacedIds.push(dose.id); }
      else keptCount++;
    } else { base.push(clone(dose)); addedIds.push(dose.id); }
  }
  const candidate = { ...clone(session), prescriptions: base, routine: base.map(dose => dose.id), ...(session.routine.length === 0 ? { theme: workout.name || session.theme, name: workout.name || session.name } : {}) };
  const next = hydrateManualSession(candidate, exercises, lang);
  const conflicts = [];
  for (const dose of next.prescriptions) {
    const exercise = exercises[dose.id];
    if (!exercise || !eligibleExercises[dose.id] || exercise.active === false || exercise.deleted) conflicts.push({ type: 'ineligible', id: dose.id, equipment: exercise?.equipment || [], reasons: exerciseEligibilityIssues(exercise, context) });
  }
  if (next.routine.length > MANUAL_MAX_EXERCISES) conflicts.push({ type: 'capacity', count: next.routine.length, max: MANUAL_MAX_EXERCISES });
  let minutes = 0;
  try { minutes = estimateSessionMinutes(next, exercises); } catch { conflicts.push({ type: 'invalid-dose' }); }
  if (minutes > dailyTime) conflicts.push({ type: 'time', minutes, dailyTime, excess: minutes - dailyTime });
  return { before: clone(session), next, duplicates, removed, addedIds, replacedIds, keptCount, excluded, minutes, conflicts, changedCount: addedIds.length + replacedIds.length, canApply: conflicts.length === 0 };
}

export function applyQuickWorkout(preview, { confirmReplacement = false, confirmPartial = false } = {}) {
  if (!preview?.canApply) throw new Error('QUICK_WORKOUT_CONFLICT');
  if (preview.removed.length && !confirmReplacement) throw new Error('QUICK_REPLACEMENT_CONFIRMATION');
  if (preview.excluded.length && !confirmPartial) throw new Error('QUICK_PARTIAL_CONFIRMATION');
  return { session: clone(preview.next), undo: clone(preview.before), addedCount: preview.addedIds.length, replacedCount: preview.replacedIds.length, keptCount: preview.keptCount };
}

export function undoQuickWorkout(operation) {
  if (!operation?.undo) throw new Error('QUICK_NO_UNDO');
  return clone(operation.undo);
}
