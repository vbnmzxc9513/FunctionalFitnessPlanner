import { getWeekString, isCalendarDate, localDate } from './dates.js';
import { normalizePlanningContext, validateGeneratedDay } from './planning.js';
import { generateTemplatePlan } from './templatePlanner.js';
import { estimateSessionMinutes } from './sessions.js';
import { catalogExercises } from './exerciseCatalog.js';
import { exercisePhase } from './phases.js';
import { resolveExerciseId } from './training.js';

const DAY_MS = 86400000;
const isoDay = date => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
const weekFor = date => getWeekString(new Date(`${date}T12:00:00`));
const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

export function defaultPlanningRange(today = localDate()) {
  if (!isCalendarDate(today)) throw new Error('INVALID_PLANNING_RANGE');
  return { from: today, to: addDays(today, 6) };
}

/** Inclusive range, anchored to the local calendar rather than the ISO week. */
export function normalizePlanningRange(range, today = localDate()) {
  const { from, to } = range || {};
  if (![from, to, today].every(isCalendarDate) || from < today || to < from
    || (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS >= 28) throw new Error('INVALID_PLANNING_RANGE');
  return { from, to };
}

export function enumeratePeriodDates(range, { maxDays = 28 } = {}) {
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > 366 || !range || ![range.from, range.to].every(isCalendarDate) || range.to < range.from
    || (Date.parse(`${range.to}T12:00:00Z`) - Date.parse(`${range.from}T12:00:00Z`)) / DAY_MS >= maxDays) throw new Error('INVALID_PLANNING_RANGE');
  const dates = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** Persist only public session fields; factual logs and questionnaire notes stay private. */
export function sanitizePeriodSession(session, { exercises, dailyTime = 240 } = {}) {
  if (!session || !isCalendarDate(session.date) || session.day !== isoDay(session.date)
    || (session.week !== undefined && session.week !== weekFor(session.date))) throw new Error('INVALID_PERIOD_SESSION');
  const known = exercises || { ...Object.fromEntries((session.routine || []).map(id => [id, {}])), ...catalogExercises() };
  const day = validateGeneratedDay(session, known, dailyTime);
  return { date: session.date, week: weekFor(session.date), ...day };
}

/** Read-only legacy display: retain saved targets without issuing missing prescriptions.
 * This helper is never used to validate a new native-session write.
 */
export function preservePeriodSession(session, { exercises } = {}) {
  try { return sanitizePeriodSession(session, { exercises }); } catch { /* Legacy sessions lack explicit phases or preparation. */ }
  if (!session || !isCalendarDate(session.date) || session.day !== isoDay(session.date)
    || (session.week !== undefined && session.week !== weekFor(session.date))
    || !Array.isArray(session.routine) || session.routine.some(id => typeof id !== 'string')) throw new Error('INVALID_PERIOD_SESSION');
  const known = Object.fromEntries(['name', 'theme', 'concept', 'coachAdvice', 'warmupNote', 'cooldownNote']
    .filter(key => typeof session[key] === 'string').map(key => [key, session[key]]));
  const select = (value, fields) => Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
  const prescriptions = (Array.isArray(session.prescriptions) ? session.prescriptions : []).filter(dose => dose && session.routine.includes(dose.id))
    .map(dose => ({ ...select(dose, ['id', 'sets', 'value', 'unit', 'restSeconds', 'perSide', 'phase']),
      ...(dose.preparation && typeof dose.preparation === 'object' ? { preparation: select(dose.preparation, ['sets', 'value', 'unit', 'restSeconds', 'perSide', 'instruction']) } : {}) }));
  return { date: session.date, week: weekFor(session.date), day: session.day, ...known,
    ...(['training', 'recovery', 'rest'].includes(session.sessionType) ? { sessionType: session.sessionType } : {}),
    routine: [...session.routine], prescriptions };
}

export function generatePeriodPlan(exercises, profile, range, {
  today = localDate(), existingSessions = {}, protectedDates = [], previousSessions = [],
} = {}, lang = 'zh') {
  range = normalizePlanningRange(range, today);
  const dates = enumeratePeriodDates(range);
  const context = normalizePlanningContext(profile?.context);
  const time = Number(profile?.time);
  if (!Number.isFinite(time) || time < 5 || time > 240) throw new Error('INVALID_PLANNING_TIME');
  const focus = ['balanced', 'strength', 'stability', 'coordination'].includes(profile?.focus) ? profile.focus : 'balanced';
  const existing = Array.isArray(existingSessions) ? Object.fromEntries(existingSessions.map(session => [session.date, session])) : existingSessions;
  const protectedSet = new Set(protectedDates);
  const preserved = dates.filter(date => protectedSet.has(date) && existing[date])
    .map(date => preservePeriodSession(existing[date], { exercises }));
  // previousSessions retains its original name for callers, but includes fixed
  // sessions outside either boundary. Future neighbors constrain spacing and
  // weekly volume without becoming evidence of already familiar movements.
  const unchanged = Object.values(Object.fromEntries([...previousSessions, ...Object.values(existing)]
    .filter(session => isCalendarDate(session?.date) && (session.date < range.from || session.date > range.to))
    .map(session => [session.date, session])));
  const history = [...unchanged, ...preserved];
  const hasStrength = session => session.routine.some(id => exercisePhase(session, id, exercises[resolveExerciseId(id, exercises)]) === 'strength');
  const sessions = []; const weeklySummaries = [];
  for (const week of [...new Set(dates.map(weekFor))]) {
    const weekDates = dates.filter(date => weekFor(date) === week);
    const plan = generateTemplatePlan(exercises, context, time, lang, {
      currentDate: today, currentWeek: week, focus,
      calendarDays: [1, 2, 3, 4, 5, 6, 7], inRangeDates: weekDates,
      protectedDates: [...protectedSet], previousSessions: history,
      previousPlan: { schedule: unchanged.filter(session => session.date < range.from && session.date <= today) },
    });
    const effective = weekDates.map(date => preserved.find(session => session.date === date)
      || sanitizePeriodSession({ ...plan.schedule.find(day => day.day === isoDay(date)), date, week }, { exercises, dailyTime: time }));
    sessions.push(...effective);
    history.push(...effective.filter(session => !protectedSet.has(session.date)));
    const strengthCount = effective.filter(hasStrength).length;
    const preservedCount = effective.filter(session => protectedSet.has(session.date)).length;
    const summary = lang === 'en'
      ? `${focus} focus: ${strengthCount} main strength sessions across ${weekDates.length} selected dates. ${preservedCount} completed or logged dates retained. Daily time is an upper limit; no automatic weekly load increase.`
      : `本段以${{ balanced: '整體肌力、協調與穩定', strength: '肌力', stability: '穩定', coordination: '協調' }[focus]}為主，${weekDates.length} 天中安排 ${strengthCount} 堂主要肌力；保留 ${preservedCount} 天已完成或有紀錄的安排。每日時間是上限，不因跨週自動增加負荷。`;
    const conclusion = [summary, ...plan.conclusion.split('\n\n').slice(1)].join('\n\n');
    weeklySummaries.push({ week, from: weekDates[0], to: weekDates.at(-1), focus, conclusion,
      strengthSessions: strengthCount,
      trainingSessions: effective.filter(session => session.sessionType === 'training' || (!session.sessionType && session.routine.length > 0)).length,
      recoverySessions: effective.filter(session => session.sessionType === 'recovery').length,
      restDays: effective.filter(session => session.sessionType === 'rest' || (!session.sessionType && session.routine.length === 0)).length,
      minutes: effective.reduce((sum, session) => sum + estimateSessionMinutes(session, exercises), 0) });
  }
  return { range, sessions, weeklySummaries,
    conclusion: weeklySummaries.map(summary => `${summary.week} (${summary.from} – ${summary.to})\n${summary.conclusion}`).join('\n\n') };
}
