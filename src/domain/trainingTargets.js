import { exercisePhase } from './phases.js';
import { catalogExercises } from './exerciseCatalog.js';
import { classifyBalanceExercise } from './weeklyBalance.js';
import { TARGET_PATTERNS, TARGET_REGIONS } from './trainingPreferences.js';

const CATALOG = catalogExercises();
// Curated contributing movements, not muscle-isolation claims or measured outcomes.
const TARGET_CODES = {
  serratus: ['A07', 'C07'], scapular: ['C06'], rotator_cuff: ['C05'],
  chest: ['C02', 'C03', 'C11'], back: ['C01', 'C04', 'C06', 'C10'], forearm: ['C08', 'C09'],
  glutes: ['B01', 'B02', 'B05', 'B06', 'B09', 'B10', 'B11', 'B12'],
  quadriceps: ['B01', 'B02', 'B10', 'B12'], hamstrings: ['B03', 'B04', 'B05', 'B11'], adductors: ['B02'], calves: ['B07', 'B08'],
};
export const TARGET_ACCESSORIES = { core: ['D01', 'D02', 'D04'], serratus: ['C07', 'A07'], scapular: ['C06'], rotator_cuff: ['C05'], forearm: ['C09', 'C08'], calves: ['B07', 'B08'] };

export function matchesTrainingTarget(region, id, exercise) {
  if (TARGET_CODES[region]) return CATALOG[id]?.catalogCode === exercise?.catalogCode && TARGET_CODES[region].includes(exercise?.catalogCode);
  return (TARGET_PATTERNS[region] || []).some(pattern => classifyBalanceExercise(id, exercise).patterns.includes(pattern));
}
export const exerciseTrainingTargets = (id, exercise) => TARGET_REGIONS.filter(region => matchesTrainingTarget(region, id, exercise));

export function trainingTargetReport(sessions = [], exercises = {}, regions = []) {
  return regions.map(region => {
    const days = sessions.filter(day => (day.routine || []).some(id => ['strength', 'accessory'].includes(exercisePhase(day, id, exercises[id])) && matchesTrainingTarget(region, id, exercises[id])));
    // A full flow contains serratus/scapular activation; that is not dedicated strength work.
    const activation = ['serratus', 'scapular'].includes(region) ? sessions.filter(day => (day.routine || []).some(id => ['warmup', 'recovery'].includes(exercisePhase(day, id, exercises[id])) && ['A12', 'A13', 'A07'].includes(exercises[id]?.catalogCode))) : [];
    return { region, dates: [...new Set(days.map(day => day.date || day.day))], activationDates: [...new Set(activation.map(day => day.date || day.day))] };
  });
}
