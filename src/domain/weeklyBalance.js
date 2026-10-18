import { competitionDaysAway, normalizePlanningContext, planningExercises } from './planning.js';
import { dateForWeekDay, getWeekString, isCalendarDate, localDate } from './dates.js';
import { catalogExercises } from './exerciseCatalog.js';

export const MOBILITY_REGIONS = ['hip', 'ankle', 'thoracic', 'shoulder'];
export const TRAINING_PATTERNS = ['squat_lunge', 'hinge', 'push', 'pull', 'core', 'footwork_reaction'];
const CURATED_CODES = Object.fromEntries(Object.entries(catalogExercises()).map(([id, exercise]) => [id, exercise.catalogCode]));
const CLEAN_NOTES = /^(?:無|沒有|沒有疼痛|沒有受傷|正常|none|no pain|no injuries|no restrictions)[。.!\s]*$/i;
const MOBILITY_CODES = {
  hip: ['A03', 'A04', 'A05', 'A12', 'A13', 'A14', 'A15', 'H03', 'H04', 'H05', 'H06'],
  ankle: ['A02', 'A12', 'A13', 'H01', 'H02'],
  thoracic: ['A06', 'A10', 'A11', 'A12', 'A13', 'H12'],
  shoulder: ['A09', 'H07'],
};
const PATTERN_CODES = {
  squat_lunge: ['B01', 'B02', 'B10', 'B12'],
  hinge: ['B03', 'B04', 'B05', 'B06', 'B11'],
  push: ['C02', 'C03', 'C11'],
  pull: ['C01', 'C04', 'C06', 'C10'],
  core: ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08'],
  footwork_reaction: ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08', 'I02'],
};
const LEGACY = {
  thoracic: { mobility: ['thoracic'], patterns: [] },
  stretch_10m: { mobility: ['hip', 'ankle'], patterns: [] },
  single_dl: { mobility: [], patterns: ['hinge'] },
  weighted_lunge: { mobility: [], patterns: ['squat_lunge'] },
  shoulder_press: { mobility: [], patterns: ['push'] },
  finger_pushup: { mobility: [], patterns: ['push'] },
  pull_up: { mobility: [], patterns: ['pull'] },
  plank_row: { mobility: [], patterns: ['pull', 'core'] },
  bear_crawl: { mobility: [], patterns: ['core'] },
  one_arm_plank: { mobility: [], patterns: ['core'] },
  farmer_walk: { mobility: [], patterns: ['core'] },
  lunge_press: { mobility: [], patterns: [] },
  squat_jump: { mobility: [], patterns: [] },
};

/** Explicit movement purpose, never inferred from a custom exercise's name or muscle type. */
export function classifyBalanceExercise(id, exercise) {
  const code = exercise?.catalogCode;
  if (code && CURATED_CODES[id] === code) return {
    mobility: MOBILITY_REGIONS.filter(region => MOBILITY_CODES[region].includes(code)),
    patterns: TRAINING_PATTERNS.filter(pattern => PATTERN_CODES[pattern].includes(code)),
    unclassified: false,
  };
  if (Object.hasOwn(LEGACY, id)) return { mobility: [...LEGACY[id].mobility], patterns: [...LEGACY[id].patterns], unclassified: false };
  return { mobility: [], patterns: [], unclassified: true };
}

/** Coverage describes scheduled DAYS, not completed volume, adequacy or a medical assessment. */
export function analyzeWeeklyBalance(schedule = [], exercises = {}, context = {}, options = {}) {
  const profile = normalizePlanningContext(context);
  const today = isCalendarDate(options.currentDate) ? options.currentDate : localDate();
  const week = dateForWeekDay(options.week, 1) ? options.week : getWeekString(new Date(`${today}T12:00:00`));
  const notes = profile.healthNotes.trim();
  const hasNotes = !!notes && !CLEAN_NOTES.test(notes);
  const missingClinical = !['unrestricted', 'restricted'].includes(context.healthStatus);
  const restricted = profile.healthStatus !== 'unrestricted' || hasNotes
    || /麻|無力|功能下降|停止運動|醫囑休息|numb|weak|loss of function|no exercise/i.test(profile.recoveryNotes);
  const recoveryPriority = profile.sorenessRegions.length > 0 || !!profile.recoveryNotes.trim() && !CLEAN_NOTES.test(profile.recoveryNotes.trim());
  const days = [1, 2, 3, 4, 5, 6, 7].map(day => {
    const entry = schedule.find(item => item?.day === day);
    const date = dateForWeekDay(week, day);
    const away = competitionDaysAway(profile.competitionDate, date);
    return { day, date, court: profile.badmintonDays.includes(day), sessionType: entry?.sessionType || (entry?.routine?.length ? 'training' : 'rest'),
      protected: away !== null && away <= 10 && away >= -5, routine: [...new Set(Array.isArray(entry?.routine) ? entry.routine : [])] };
  });
  const competitionPriority = days.some(day => day.protected);
  const available = planningExercises(exercises, restricted ? { ...profile, healthStatus: 'restricted' } : profile);
  const availableClasses = Object.entries(available).map(([id, exercise]) => classifyBalanceExercise(id, exercise));
  const unclassified = [];
  const all = days.flatMap(day => day.routine.map(id => ({ id, day: day.day, classification: classifyBalanceExercise(id, exercises[id]) })));
  for (const item of all.filter(item => item.classification.unclassified)) unclassified.push({ day: item.day, id: item.id });
  const row = (kind, key) => {
    const entries = all.filter(item => item.classification[kind].includes(key));
    const coveredDays = [...new Set(entries.map(item => item.day))].sort();
    const unavailableDays = [...new Set(entries.filter(item => !Object.hasOwn(available, item.id)).map(item => item.day))].sort();
    let status = 'scheduled';
    if (coveredDays.length && unavailableDays.length) status = 'check_conditions';
    if (!coveredDays.length) {
      status = missingClinical ? 'information_missing' : restricted ? 'limited' : competitionPriority ? 'competition_priority'
        : recoveryPriority ? 'recovery_priority' : !availableClasses.some(item => item[kind].includes(key)) ? 'unavailable'
          : key === 'footwork_reaction' && profile.badmintonDays.length ? 'court_priority' : 'not_scheduled';
    }
    return { key, days: coveredDays, count: coveredDays.length, status, unavailableDays,
      byDay: Object.fromEntries(days.map(day => [day.day, entries.filter(item => item.day === day.day).map(item => item.id)])) };
  };
  return { week, days, mobility: MOBILITY_REGIONS.map(key => row('mobility', key)), patterns: TRAINING_PATTERNS.map(key => row('patterns', key)),
    unclassified, context: { restricted, missingClinical, competitionPriority, recoveryPriority, courtDays: profile.badmintonDays } };
}
