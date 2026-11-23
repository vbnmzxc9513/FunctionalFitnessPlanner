import { getWeekString, isCalendarDate } from './dates.js';
import { SESSION_PHASES, exercisePhase } from './phases.js';
import { exerciseKey } from './training.js';
import { sanitizePeriodSession } from './periodPlanning.js';
import { addManualExercises, hydrateManualSession, removeManualExercise } from './manualPlanner.js';
import { MAX_DAY_EXERCISES } from './plannerLimits.js';

const isoDay = date => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
const weekFor = date => getWeekString(new Date(`${date}T12:00:00`));

/**
 * Return the set of exercise IDs on `date` that already have a completion mark
 * or an actual training log. These exercises must retain their recorded identity
 * and original prescription during single-day edits.
 */
export function getRecordedExerciseIds(date, { progressByWeek = {}, logs = [] } = {}) {
  const ids = new Set();
  if (!isCalendarDate(date)) return ids;
  const week = weekFor(date);
  const day = isoDay(date);
  const prefix = `day${day}_`;
  const completed = progressByWeek?.[week]?.completed || {};
  for (const [key, done] of Object.entries(completed)) {
    if (done === true && key.startsWith(prefix)) {
      ids.add(key.slice(prefix.length));
    }
  }
  const logList = Array.isArray(logs) ? logs : Object.values(logs || {});
  for (const log of logList) {
    if (log && log.week === week && log.day === day && typeof log.exerciseId === 'string') {
      ids.add(log.exerciseId);
    }
  }
  return ids;
}

/**
 * Merge a single-day edit with any already-recorded exercises on that date.
 * Recorded exercises stay in the day with their exact original prescriptions;
 * unrecorded exercises can be freely added, removed, or edited.
 */
export function mergePreservingRecordedExercises(existingSession, nextSession, recordedIds, { exercises = {}, lang = 'zh' } = {}) {
  const locked = recordedIds instanceof Set ? recordedIds : new Set(recordedIds || []);
  const date = nextSession?.date || existingSession?.date;
  if (!isCalendarDate(date)) throw new Error('INVALID_PERIOD_SESSION');
  const week = weekFor(date);
  const day = isoDay(date);

  const hydratedNext = hydrateManualSession({ ...nextSession, date }, exercises, lang);
  const hydratedExisting = existingSession?.routine?.length
    ? hydrateManualSession({ ...existingSession, date }, exercises, lang)
    : null;

  const keptPrescriptions = [];
  const keptIds = new Set();

  // First preserve any recorded exercise from existingSession verbatim.
  if (hydratedExisting) {
    for (const id of hydratedExisting.routine) {
      if (!locked.has(id)) continue;
      const originalDose = existingSession.prescriptions?.find(dose => dose.id === id)
        || hydratedExisting.prescriptions.find(dose => dose.id === id);
      if (originalDose) {
        keptPrescriptions.push(structuredClone(originalDose));
        keptIds.add(id);
      }
    }
  }

  // Then add all non-locked exercises from the incoming edit.
  for (const dose of hydratedNext.prescriptions) {
    if (keptIds.has(dose.id)) continue;
    keptPrescriptions.push(structuredClone(dose));
    keptIds.add(dose.id);
  }

  if (keptPrescriptions.length > MAX_DAY_EXERCISES) {
    throw new Error('MANUAL_CAPACITY');
  }

  // Sort strictly by canonical phase order while keeping intra-phase relative order.
  const ordered = keptPrescriptions
    .map((dose, index) => ({ dose, index, rank: SESSION_PHASES.indexOf(dose.phase) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.dose);

  // Ensure the first strength exercise has a preparation set (unless it's locked with an existing dose).
  const firstStrengthIndex = ordered.findIndex(dose => dose.phase === 'strength');
  if (firstStrengthIndex >= 0 && !ordered[firstStrengthIndex].preparation && !locked.has(ordered[firstStrengthIndex].id)) {
    const target = ordered[firstStrengthIndex];
    const ex = exercises[target.id] || {};
    if (!ex.sequenceMinutes) {
      ordered[firstStrengthIndex] = {
        ...target,
        preparation: {
          sets: 1,
          value: target.unit === 'seconds' ? '10' : '4',
          unit: target.unit === 'seconds' ? 'seconds' : 'reps',
          restSeconds: 30,
          perSide: target.perSide === true,
          instruction: lang === 'en'
            ? 'Prepare with the same movement using bodyweight or the lightest controllable resistance, without fatigue; rest 30 seconds.'
            : '同一動作以徒手或最輕可控阻力準備，不做到疲勞；完成後休息 30 秒。',
        },
      };
    }
  }

  const hasTraining = ordered.some(
    dose => ['skill', 'strength', 'accessory'].includes(dose.phase)
      || ['lower', 'upper', 'power', 'footwork', 'reaction'].includes(exercises[dose.id]?.category),
  );
  const sessionType = !ordered.length ? 'rest' : hasTraining ? 'training' : 'recovery';

  const merged = {
    ...hydratedNext,
    date,
    week,
    day,
    sessionType,
    routine: ordered.map(dose => dose.id),
    prescriptions: ordered,
  };

  return sanitizePeriodSession(merged, { exercises, dailyTime: 240 });
}

/**
 * Quick 1-tap add of one exercise to a single day's workout.
 */
export function quickAddExerciseToDay(session, exerciseId, { exercises = {}, eligibleExercises = {}, lang = 'zh' } = {}) {
  const exercise = exercises[exerciseId];
  if (!exercise || !eligibleExercises[exerciseId]) throw new Error('MANUAL_INELIGIBLE_EXERCISE');
  const hydrated = hydrateManualSession(session, exercises, lang);
  const phase = exercisePhase({ sessionType: 'training' }, exerciseId, exercise);
  const next = addManualExercises(hydrated, [exerciseId], { exercises, eligibleExercises, phase, lang });
  return sanitizePeriodSession(next, { exercises, dailyTime: 240 });
}

/**
 * Quick 1-tap removal of one unrecorded exercise from a single day's workout.
 */
export function quickRemoveExerciseFromDay(session, exerciseId, { recordedIds = new Set(), exercises = {}, lang = 'zh' } = {}) {
  const locked = recordedIds instanceof Set ? recordedIds : new Set(recordedIds || []);
  if (locked.has(exerciseId)) throw new Error('RECORDED_EXERCISE_LOCKED');
  const hydrated = hydrateManualSession(session, exercises, lang);
  const next = removeManualExercise(hydrated, exerciseId, { exercises, lang });
  return sanitizePeriodSession(next, { exercises, dailyTime: 240 });
}

export function isExerciseRecordedOnDay(dayNumber, exerciseId, { progress = {}, logs = [], week } = {}) {
  if (progress?.[exerciseKey(dayNumber, exerciseId)] === true) return true;
  const logList = Array.isArray(logs) ? logs : Object.values(logs || {});
  return logList.some(log => log && log.day === dayNumber && (!week || log.week === week) && log.exerciseId === exerciseId);
}
