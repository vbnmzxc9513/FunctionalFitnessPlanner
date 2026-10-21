import { getWeekString, isCalendarDate } from './dates.js';
import { normalizePlanningRange, sanitizePeriodSession } from './periodPlanning.js';
import { estimateSessionMinutes } from './sessions.js';

const DAY_MS = 86400000;
export function shiftPlanDate(date, offset) {
  if (!isCalendarDate(date) || !Number.isInteger(offset)) throw new Error('INVALID_ASSIGNMENT_DATES');
  return new Date(Date.parse(`${date}T12:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
}
export function assignmentRange(dates, today) {
  if (!Array.isArray(dates) || !dates.length || dates.length > 28 || dates.some(date => !isCalendarDate(date)) || new Set(dates).size !== dates.length) throw new Error('INVALID_ASSIGNMENT_DATES');
  const sorted = [...dates].sort();
  return normalizePlanningRange({ from: sorted[0], to: sorted.at(-1) }, today);
}
export function planOffsets(days) {
  if (days.every(day => Number.isInteger(day.offset))) return days.map(day => day.offset);
  if (days.every(day => isCalendarDate(day.date))) {
    const first = Date.parse(`${days[0].date}T12:00:00Z`);
    return days.map(day => Math.round((Date.parse(`${day.date}T12:00:00Z`) - first) / DAY_MS));
  }
  return days.map((_, index) => index);
}
export function materializeAssignments(days, dates, { name = '', exercises, lang = 'zh', today } = {}) {
  assignmentRange(dates, today);
  if (days.length !== dates.length) throw new Error('INVALID_ASSIGNMENT_DATES');
  return days.map((source, index) => {
    const date = dates[index], day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
    const phases = (source.prescriptions || []).map(dose => dose.phase);
    const sessionType = source.routine?.length ? phases.some(phase => ['strength', 'skill', 'accessory'].includes(phase)) ? 'training' : 'recovery' : 'rest';
    const generic = lang === 'en' ? 'Follow the listed exercises and planned doses.' : '依列出的動作順序與計畫組次進行。';
    return sanitizePeriodSession({
      date, day, week: getWeekString(new Date(`${date}T12:00:00`)), name: new Intl.DateTimeFormat(lang === 'en' ? 'en' : 'zh-TW', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)),
      theme: String(source.theme || source.name || name || (lang === 'en' ? 'My workout' : '我的課表')).slice(0, 1000),
      concept: '', coachAdvice: '', warmupNote: generic, cooldownNote: generic, sessionType,
      routine: structuredClone(source.routine || []), prescriptions: structuredClone(source.prescriptions || []),
    }, { exercises, dailyTime: 240 });
  });
}
export function assignmentConflicts(state, dates) {
  const protectedSet = new Set(state.protectedDates || []);
  return dates.map(date => ({ date, protected: protectedSet.has(date), existing: state.sessionsByDate[date] || null }));
}
export function validateAssignmentConsent(state, dates, replaceDates = []) {
  const replace = new Set(replaceDates);
  const conflicts = assignmentConflicts(state, dates);
  if (conflicts.some(item => item.protected)) throw new Error('DATE_PROTECTED');
  if (conflicts.some(item => item.existing && !replace.has(item.date))) throw new Error('DATE_CONFLICT');
  return conflicts;
}
export function assignmentSummary(sessions, exercises, focus = 'balanced') {
  return [...new Set(sessions.map(day => day.week))].map(week => {
    const days = sessions.filter(day => day.week === week).sort((a, b) => a.date.localeCompare(b.date));
    return { week, from: days[0].date, to: days.at(-1).date, focus,
      trainingSessions: days.filter(day => day.sessionType === 'training').length,
      recoverySessions: days.filter(day => day.sessionType === 'recovery').length,
      restDays: days.filter(day => day.sessionType === 'rest').length,
      minutes: days.reduce((sum, day) => sum + estimateSessionMinutes(day, exercises), 0) };
  });
}
