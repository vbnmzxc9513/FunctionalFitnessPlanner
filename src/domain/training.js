import { dateForWeekDay, getWeekString, isCalendarDate } from './dates.js';
import { orderedRoutine, syncSessionType } from './phases.js';

export const clampLevel = (level) => Math.max(0, Math.min(2, Number.isFinite(level) ? level : 1));
export const exerciseKey = (day, id) => `day${day}_${id}`;

export function applyFeedback(profile, progress, adjustment) {
  if (![-1, 0, 1].includes(adjustment)) throw new Error('INVALID_FEEDBACK');
  const base = clampLevel(progress.difficultyBase ?? (clampLevel(profile.difficultyLevel ?? 1) - (progress.feedbackValue ?? 0)));
  return { difficultyBase: base, difficultyLevel: clampLevel(base + adjustment), feedbackValue: adjustment };
}

export function resolveExerciseId(id, exercises) {
  if (typeof id !== 'string') return null;
  if (Object.hasOwn(exercises, id)) return id;
  // Exact legacy names only; substring matching can select a different exercise.
  return Object.keys(exercises).find(key => exercises[key].name === id || exercises[key].aliases?.includes(id)) || null;
}

export function normalizeSchedule(schedule, exercises, fallback = []) {
  if (!Array.isArray(schedule)) return fallback;
  const days = schedule.filter(day => day && Number.isInteger(day.day) && day.day >= 1 && day.day <= 5 && Array.isArray(day.routine));
  if (days.length !== 5 || new Set(days.map(day => day.day)).size !== 5) return fallback;
  return days.map(day => {
    let routine = [...new Set(day.routine.map(id => resolveExerciseId(id, exercises)).filter(Boolean))];
    if (day.prescriptions?.some(dose => dose.phase)) routine = orderedRoutine({ ...day, routine }, exercises);
    return syncSessionType({ ...day, routine, ...(Array.isArray(day.prescriptions) ? { prescriptions: day.prescriptions.filter(dose => routine.includes(dose.id)) } : {}) }, exercises);
  })
    .sort((a, b) => a.day - b.day);
}

export function availableSchedule(schedule, exercises) {
  return schedule.map(day => {
    const routine = day.routine.filter(id => exercises[id] && !exercises[id].deleted && exercises[id].active !== false);
    return { ...day, routine, ...(Array.isArray(day.prescriptions) ? { prescriptions: day.prescriptions.filter(dose => routine.includes(dose.id)) } : {}) };
  });
}

export function countCompleted(schedule, completed = {}) {
  const keys = new Set(schedule.flatMap(day => day.routine.map(id => exerciseKey(day.day, id))));
  return { completed: [...keys].filter(key => completed[key] === true).length, total: keys.size };
}

export function prescription(id, type, level, exercise, day) {
  const planned = day?.prescriptions?.find(dose => dose.id === id);
  if (planned) return planned;
  if (exercise?.prescription) return exercise.prescription;
  level = clampLevel(level);
  if (['stretch_10m', 'thoracic'].includes(id)) return { sets: 1, value: [5, 10, 12][level], unit: 'minutes' };
  if (['farmer_walk', 'one_arm_plank', 'bear_crawl'].includes(id)) return { sets: [3, 4, 5][level], value: [30, 45, 60][level], unit: 'seconds' };
  if (type === 'mobility') return { sets: 1, value: [30, 45, 60][level], unit: 'seconds' };
  if (['squat_jump', 'lunge_press', 'finger_pushup'].includes(id)) return { sets: level === 0 ? 3 : 4, value: [8, 12, 15][level], unit: 'reps' };
  return { sets: level === 2 ? 4 : 3, value: ['8–10', '10–12', '12–15'][level], unit: 'reps' };
}

export function calculateStats(allProgress, exercises) {
  let totalCompleted = 0;
  const typeStats = { lower: 0, core: 0, upper_push: 0, upper_pull: 0, mobility: 0, power: 0, full: 0 };
  const dailyMap = {};
  Object.entries(allProgress).forEach(([week, data]) => {
    if (!dateForWeekDay(week)) return;
    Object.entries(data.completed || {}).forEach(([key, done]) => {
      const match = /^day([1-5])_(.+)$/.exec(key);
      if (done !== true || !match) return;
      totalCompleted++;
      const type = data.exerciseTypes?.[key] || exercises[match[2]]?.type;
      if (type in typeStats) typeStats[type]++;
      const recordedDate = data.completedAt?.[key];
      const date = isCalendarDate(recordedDate) ? recordedDate : dateForWeekDay(week, +match[1]);
      const dateValue = new Date(`${date}T12:00:00`);
      const activityWeek = getWeekString(dateValue);
      const activityDay = dateValue.getDay() || 7;
      const dailyKey = `${activityWeek}-${activityDay}`;
      dailyMap[dailyKey] = (dailyMap[dailyKey] || 0) + 1;
    });
  });
  return { totalCompleted, totalActiveDays: Object.keys(dailyMap).length, typeStats, dailyMap };
}

// Attribute a scheduled slot to its calendar month, including weeks crossing months/years.
export function monthlyStats(allProgress, plans, fallback, exercises = {}) {
  const months = {};
  Object.entries(allProgress).forEach(([week, data]) => {
    if (!dateForWeekDay(week)) return;
    const schedule = data.scheduleSnapshot || plans[week]?.schedule || fallback;
    if (!Array.isArray(schedule)) return;
    schedule.forEach(day => {
      if (!day) return;
      const date = dateForWeekDay(week, day.day);
      if (!date || !Array.isArray(day.routine)) return;
      const monthKey = date.slice(0, 7);
      months[monthKey] ??= { monthKey, completed: 0, total: 0 };
      [...new Set(day.routine.map(id => resolveExerciseId(id, exercises) || id))].forEach(id => {
        months[monthKey].total++;
        if (data.completed?.[exerciseKey(day.day, id)] === true) months[monthKey].completed++;
      });
    });
  });
  return Object.values(months).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}
