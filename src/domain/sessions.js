import { prescription } from './training.js';
import { exercisePhase, SESSION_PHASES } from './phases.js';

export function doseSeconds(dose, exercise = {}, preparation = false) {
  const maximum = Math.max(...String(dose.value).split(/[–-]/).map(Number));
  const rounds = dose.sets * (dose.perSide ? 2 : 1);
  const work = dose.unit === 'minutes' ? maximum * 60 : dose.unit === 'seconds' ? maximum
    : maximum * (dose.unit === 'breaths' ? 8 : 3);
  let seconds = rounds * work + Math.max(0, rounds - 1) * (dose.restSeconds || 0) + 20;
  if (preparation) seconds += dose.restSeconds || 0;
  if (!preparation && dose.unit === 'reps') seconds += rounds * Math.max(0, maximum - 1) * (exercise.betweenRepsSeconds || 0);
  return seconds;
}

export function sessionSections(day, exercises, level = 1) {
  const groups = Object.fromEntries(SESSION_PHASES.map(phase => [phase, { phase, items: [], preparation: [], seconds: 0 }]));
  day.routine.forEach((id, index) => {
    const exercise = exercises[id];
    if (!exercise) return;
    const dose = prescription(id, exercise.type, level, exercise, day);
    const phase = exercisePhase(day, id, exercise);
    groups[phase].items.push({ id, index, dose });
    groups[phase].seconds += doseSeconds(dose, exercise);
    if (dose.preparation) {
      groups.warmup.preparation.push({ id, dose: dose.preparation });
      groups.warmup.seconds += doseSeconds(dose.preparation, exercise, true);
    }
  });
  return SESSION_PHASES.map(phase => groups[phase]);
}

export function estimateSessionMinutes(day, exercises, level = 1) {
  if (!day.routine.length) return 0;
  const minutes = sessionSections(day, exercises, level).reduce((sum, section) => sum + Math.ceil(section.seconds / 60), 0);
  // Explicit sessions already list warm-up and preparation work; leave a small
  // transition allowance. Legacy flat plans retain their preparation allowance.
  const allowance = day.sessionType ? 60 : day.routine.some(id => exercises[id]?.category === 'warmup') ? 120 : 240;
  return minutes + Math.ceil(allowance / 60);
}
