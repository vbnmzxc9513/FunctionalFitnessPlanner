import { dateForWeekDay, getWeekString, localDate } from './dates.js';
import { assignmentSummary } from './planAssignments.js';
import { sanitizePeriodSession } from './periodPlanning.js';

// The old AI entry means the current Monday–Friday. Preserve those dates and
// use the same native date writer as new plans instead of the eight-slot writer.
export function weeklyApplicationDraft(plan, profile, week, { today = localDate(), exercises } = {}) {
  if (week !== getWeekString(new Date(`${today}T12:00:00`)) || !Array.isArray(plan?.schedule)
    || plan.schedule.length !== 5 || new Set(plan.schedule.map(day => day.day)).size !== 5
    || plan.schedule.some(day => !Number.isInteger(day.day) || day.day < 1 || day.day > 5)) throw new Error('INVALID_LEGACY_WEEK');
  const sessions = plan.schedule.map(day => sanitizePeriodSession({ ...day, week, date: dateForWeekDay(week, day.day) },
    { exercises, dailyTime: Number(profile.time) })).sort((a, b) => a.date.localeCompare(b.date));
  return { range: { from: dateForWeekDay(week, 1), to: dateForWeekDay(week, 5) },
    sessions, dates: sessions.map(day => day.date), profile: structuredClone(profile), legacyWeek: week,
    conclusion: String(plan.conclusion || ''), weeklySummaries: assignmentSummary(sessions, exercises, profile.focus) };
}
