import { isCalendarDate } from './dates.js';
import { eligibleExercises } from './exerciseCatalog.js';

export const DEFAULT_PLANNING_CONTEXT = {
  badmintonDays: [], badmintonMinutes: '', badmintonIntensity: 'unknown',
  equipment: [], partnerAvailable: false, experience: 'beginner',
  competitionDate: '', healthStatus: 'unrestricted', healthNotes: '', recoveryNotes: '',
};

export function normalizePlanningContext(value = {}) {
  return {
    badmintonDays: [...new Set((Array.isArray(value.badmintonDays) ? value.badmintonDays : []).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort(),
    badmintonMinutes: Number(value.badmintonMinutes) > 0 && Number(value.badmintonMinutes) <= 360 ? Number(value.badmintonMinutes) : '',
    badmintonIntensity: ['unknown', 'light', 'mixed', 'hard'].includes(value.badmintonIntensity) ? value.badmintonIntensity : 'unknown',
    equipment: Array.isArray(value.equipment) ? [...new Set(value.equipment.filter(item => typeof item === 'string'))] : [],
    partnerAvailable: value.partnerAvailable === true,
    experience: ['beginner', 'intermediate', 'advanced'].includes(value.experience) ? value.experience : 'beginner',
    competitionDate: isCalendarDate(value.competitionDate) ? value.competitionDate : '',
    healthStatus: /震波|shockwave|ESWT/i.test(value.healthNotes || '') ? 'restricted' : ['unrestricted', 'restricted', 'unknown'].includes(value.healthStatus) ? value.healthStatus : 'unknown',
    healthNotes: typeof value.healthNotes === 'string' ? value.healthNotes.slice(0, 2000) : '',
    recoveryNotes: typeof value.recoveryNotes === 'string' ? value.recoveryNotes.slice(0, 2000) : '',
  };
}

export function competitionDaysAway(competitionDate, currentDate) {
  if (!isCalendarDate(competitionDate) || !isCalendarDate(currentDate)) return null;
  return Math.round((Date.parse(`${competitionDate}T12:00:00Z`) - Date.parse(`${currentDate}T12:00:00Z`)) / 86400000);
}

export function planningExercises(exercises, context) {
  return eligibleExercises(exercises, normalizePlanningContext(context));
}

export function estimateSessionMinutes(day, exercises) {
  if (!day.routine.length) return 0;
  let seconds = 0;
  for (const dose of day.prescriptions) {
    const maximum = Math.max(...dose.value.split(/[–-]/).map(Number));
    const rounds = dose.sets * (dose.perSide ? 2 : 1);
    const work = dose.unit === 'minutes' ? maximum * 60 : dose.unit === 'seconds' ? maximum
      : maximum * (dose.unit === 'breaths' ? 8 : 3);
    seconds += rounds * work + Math.max(0, rounds - 1) * dose.restSeconds + 20;
    if (dose.unit === 'reps') seconds += rounds * Math.max(0, maximum - 1) * (exercises[dose.id].betweenRepsSeconds || 0);
  }
  // A rough planning budget includes preparation rather than only work reps.
  // It does not measure a user's actual pace or recovery needs.
  seconds += day.routine.some(id => exercises[id].category === 'warmup') ? 120 : 240;
  return Math.ceil(seconds / 60);
}

export function validateGeneratedPlan(plan, exercises, dailyTime) {
  if (!Number.isFinite(Number(dailyTime)) || Number(dailyTime) < 5 || Number(dailyTime) > 240) throw new Error('INVALID_PLANNING_TIME');
  if (!plan || typeof plan.conclusion !== 'string' || !Array.isArray(plan.schedule) || plan.schedule.length !== 5) throw new Error('INVALID_AI_PLAN');
  const seen = new Set();
  const schedule = plan.schedule.map(day => {
    if (!day || !Number.isInteger(day.day) || day.day < 1 || day.day > 5 || seen.has(day.day)
      || !['name', 'theme', 'concept', 'coachAdvice'].every(key => typeof day[key] === 'string')
      || !Array.isArray(day.routine) || day.routine.length > 6 || new Set(day.routine).size !== day.routine.length
      || day.routine.some(id => typeof id !== 'string' || !Object.hasOwn(exercises, id))) throw new Error('INVALID_AI_PLAN');
    seen.add(day.day);
    if (!Array.isArray(day.prescriptions) || day.prescriptions.length !== day.routine.length) throw new Error('INVALID_AI_PRESCRIPTION');
    const doses = new Set();
    let contacts = 0;
    for (const dose of day.prescriptions) {
      if (!dose || !day.routine.includes(dose.id) || doses.has(dose.id) || !Number.isInteger(dose.sets) || dose.sets < 1 || dose.sets > 5
        || typeof dose.value !== 'string' || !/^\d+(?:[–-]\d+)?$/.test(dose.value)
        || !['reps', 'seconds', 'minutes', 'breaths'].includes(dose.unit)
        || !Number.isInteger(dose.restSeconds) || dose.restSeconds < 0 || dose.restSeconds > 300
        || typeof dose.perSide !== 'boolean') throw new Error('INVALID_AI_PRESCRIPTION');
      const values = dose.value.split(/[–-]/).map(Number);
      if (values.some(value => value < 1) || (values.length === 2 && values[0] > values[1])) throw new Error('INVALID_AI_PRESCRIPTION');
      const maximum = Math.max(...values);
      if (maximum < 1 || maximum > (dose.unit === 'minutes' ? Number(dailyTime) : 120)) throw new Error('INVALID_AI_PRESCRIPTION');
      if (exercises[dose.id].jumpContacts && dose.unit === 'reps') contacts += exercises[dose.id].jumpContacts * dose.sets * maximum * (dose.perSide ? 2 : 1);
      doses.add(dose.id);
    }
    // The curated entry-level plan uses deliberately low added jump volume.
    // This is a programming limit, not a medical safety threshold.
    if (contacts > 24 || (contacts > 0 && day.routine.some(id => exercises[id].catalogCode === 'I04'))) throw new Error('EXCESSIVE_AI_JUMP_VOLUME');
    if (estimateSessionMinutes(day, exercises) > Number(dailyTime)) throw new Error('AI_SESSION_TOO_LONG');
    return { day: day.day, name: day.name, theme: day.theme, concept: day.concept, coachAdvice: day.coachAdvice,
      routine: day.routine, prescriptions: day.prescriptions.map(({ id, sets, value, unit, restSeconds, perSide }) => ({ id, sets, value, unit, restSeconds, perSide })) };
  }).sort((a, b) => a.day - b.day);
  return { conclusion: plan.conclusion, schedule };
}
