import { selectedRegions, TARGET_REGIONS, STIFFNESS_REGIONS, SORENESS_REGIONS, normalizeWeeklyIntent, weeklyChoiceIds } from './trainingPreferences.js';
import { estimateSessionMinutes } from './sessions.js';
export { estimateSessionMinutes } from './sessions.js';
import { SESSION_PHASES, SESSION_TYPES } from './phases.js';
import { isCalendarDate } from './dates.js';
import { eligibleExercises, validSequenceDose } from './exerciseCatalog.js';

export const DEFAULT_PLANNING_CONTEXT = {
  trainingDays: [1, 2, 3, 4, 5], badmintonDays: [], badmintonMinutes: '', badmintonIntensity: 'unknown',
  equipment: [], partnerAvailable: false, experience: 'beginner',
  targetRegions: [], stiffnessRegions: [], sorenessRegions: [], weeklyExerciseIds: [], competitionDate: '', healthStatus: 'unrestricted', healthNotes: '', recoveryNotes: '',
};

export function normalizePlanningContext(value = {}) {
  return {
    targetRegions: selectedRegions(value.targetRegions, TARGET_REGIONS),
    stiffnessRegions: selectedRegions(value.stiffnessRegions, STIFFNESS_REGIONS),
    sorenessRegions: selectedRegions(value.sorenessRegions, SORENESS_REGIONS),
    weeklyExerciseIds: weeklyChoiceIds(value.weeklyExerciseIds),
    trainingDays: [...new Set((Array.isArray(value.trainingDays) ? value.trainingDays : [1, 2, 3, 4, 5]).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort(),
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

export function validateGeneratedPlan(plan, exercises, dailyTime, { calendarDays = [1, 2, 3, 4, 5] } = {}) {
  if (!Number.isFinite(Number(dailyTime)) || Number(dailyTime) < 5 || Number(dailyTime) > 240) throw new Error('INVALID_PLANNING_TIME');
  if (!Array.isArray(calendarDays) || !calendarDays.length || calendarDays.some(day => !Number.isInteger(day) || day < 1 || day > 7) || new Set(calendarDays).size !== calendarDays.length) throw new Error('INVALID_AI_PLAN');
  if (!plan || typeof plan.conclusion !== 'string' || !Array.isArray(plan.schedule) || plan.schedule.length !== calendarDays.length) throw new Error('INVALID_AI_PLAN');
  const seen = new Set();
  const schedule = plan.schedule.map(day => {
    if (!day || !Number.isInteger(day.day) || !calendarDays.includes(day.day) || seen.has(day.day)
      || !['name', 'theme', 'concept', 'coachAdvice'].every(key => typeof day[key] === 'string')
      || !Array.isArray(day.routine) || day.routine.length > 8 || new Set(day.routine).size !== day.routine.length
      || day.routine.some(id => typeof id !== 'string' || !Object.hasOwn(exercises, id))) throw new Error('INVALID_AI_PLAN');
    seen.add(day.day);
    if (!SESSION_TYPES.includes(day.sessionType) || !['warmupNote', 'cooldownNote'].every(key => typeof day[key] === 'string' && day[key].trim())) throw new Error('INVALID_AI_SESSION');
    if (!Array.isArray(day.prescriptions) || day.prescriptions.length !== day.routine.length) throw new Error('INVALID_AI_PRESCRIPTION');
    const doses = new Set();
    let contacts = 0;
    for (const dose of day.prescriptions) {
      if (dose && !validSequenceDose(dose.id, dose)) throw new Error('INVALID_AI_PRESCRIPTION');
      if (!dose || !day.routine.includes(dose.id) || doses.has(dose.id) || !Number.isInteger(dose.sets) || dose.sets < 1 || dose.sets > 5
        || !SESSION_PHASES.includes(dose.phase)
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
      if (['power', 'footwork', 'reaction'].includes(exercises[dose.id].category) && dose.phase !== 'skill') throw new Error('INVALID_AI_EXERCISE_PHASE');
      if (dose.preparation !== undefined) {
        const prep = dose.preparation;
        if (!prep || !['strength', 'accessory'].includes(dose.phase) || !Number.isInteger(prep.sets) || prep.sets < 1 || prep.sets > 2
          || typeof prep.value !== 'string' || !/^\d+(?:[–-]\d+)?$/.test(prep.value)
          || !['reps', 'seconds', 'breaths'].includes(prep.unit) || typeof prep.perSide !== 'boolean'
          || !Number.isInteger(prep.restSeconds) || prep.restSeconds < 0 || prep.restSeconds > 120
          || typeof prep.instruction !== 'string' || !prep.instruction.trim()) throw new Error('INVALID_AI_PREPARATION');
        const values = prep.value.split(/[–-]/).map(Number);
        if (values.some(value => value < 1 || value > (prep.unit === 'seconds' ? 30 : 8)) || (values.length === 2 && values[0] > values[1])) throw new Error('INVALID_AI_PREPARATION');
      }
    }
    // The curated entry-level plan uses deliberately low added jump volume.
    // This is a programming limit, not a medical safety threshold.
    if (contacts > 24 || (contacts > 0 && day.routine.some(id => exercises[id].catalogCode === 'I04'))) throw new Error('EXCESSIVE_AI_JUMP_VOLUME');
    const phases = day.routine.map(id => day.prescriptions.find(dose => dose.id === id).phase);
    if (phases.some((phase, index) => index > 0 && SESSION_PHASES.indexOf(phase) < SESSION_PHASES.indexOf(phases[index - 1]))) throw new Error('INVALID_AI_PHASE_ORDER');
    if ((day.sessionType === 'rest') !== (day.routine.length === 0)) throw new Error('INVALID_AI_SESSION');
    if (day.sessionType === 'training' && !phases.includes('warmup')) throw new Error('AI_WARMUP_MISSING');
    if (day.sessionType === 'recovery' && phases.some(phase => !['warmup', 'recovery', 'cooldown'].includes(phase))) throw new Error('INVALID_AI_RECOVERY');
    if (day.sessionType === 'recovery' && day.routine.some(id => ['lower', 'upper', 'power', 'footwork', 'reaction'].includes(exercises[id].category)
      || (exercises[id].category === 'conditioning' && exercises[id].catalogCode !== 'I01'))) throw new Error('INVALID_AI_RECOVERY');
    const firstStrengthId = day.routine.find(id => day.prescriptions.find(dose => dose.id === id).phase === 'strength');
    const firstStrength = day.prescriptions.find(dose => dose.id === firstStrengthId);
    if (firstStrength && !firstStrength.preparation) throw new Error('AI_PREPARATION_MISSING');
    if (estimateSessionMinutes(day, exercises) > Number(dailyTime)) throw new Error('AI_SESSION_TOO_LONG');
    return { day: day.day, name: day.name, theme: day.theme, concept: day.concept, coachAdvice: day.coachAdvice,
      sessionType: day.sessionType, warmupNote: day.warmupNote, cooldownNote: day.cooldownNote,
      routine: [...day.routine], prescriptions: day.routine.map(id => day.prescriptions.find(dose => dose.id === id)).map(({ id, sets, value, unit, restSeconds, perSide, phase, preparation }) => ({ id, sets, value, unit, restSeconds, perSide, phase,
        ...(preparation ? { preparation: { sets: preparation.sets, value: preparation.value, unit: preparation.unit, restSeconds: preparation.restSeconds, perSide: preparation.perSide, instruction: preparation.instruction } } : {}) })) };
  }).sort((a, b) => a.day - b.day);
  const weeklyIntent = plan.weeklyIntent === undefined ? undefined : normalizeWeeklyIntent(plan.weeklyIntent);
  if (weeklyIntent === null) throw new Error('INVALID_WEEKLY_INTENT');
  return { conclusion: plan.conclusion, schedule, ...(weeklyIntent ? { weeklyIntent } : {}) };
}

/** Apply the same prescription, sequence and time guards to one dated session. */
export function validateGeneratedDay(day, exercises, dailyTime) {
  return validateGeneratedPlan({ conclusion: '', schedule: [day] }, exercises, dailyTime, { calendarDays: [day?.day] }).schedule[0];
}
