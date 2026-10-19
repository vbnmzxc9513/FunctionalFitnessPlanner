import { isCalendarDate, dateForWeekDay, localDate, getWeekString } from './dates.js';
import { normalizePlanningContext } from './planning.js';
import { sanitizePeriodSession, preservePeriodSession, enumeratePeriodDates } from './periodPlanning.js';
import { validateReadiness, validateTrainingLog, trainingLogId } from './coaching.js';
import { exerciseKey, resolveExerciseId } from './training.js';
import { readStorage, writeStorage } from './storage.js';

const KEY = 'fitness_date_period_v1';
// Server timestamps may resolve after the local save. The matching local
// snapshot retains questionnaire fields absent from the cloud's bounded intent.
export function selectSavedPeriod(saved, cloud) {
  if (saved?.periodId && saved.periodId === cloud?.periodId) return saved;
  return saved && (!cloud || (saved.createdAt || 0) >= cloud.createdAt) ? saved : cloud;
}
export function periodProfile(value = {}) {
  return { context: normalizePlanningContext(value.context), focus: ['balanced', 'coordination', 'stability', 'strength'].includes(value.focus) ? value.focus : 'balanced',
    time: String(Math.max(5, Math.min(240, Number(value.time) || 30))), goal: String(value.goal || '').slice(0, 2000) };
}
export function normalizePeriodDraft(value) {
  if (!value || value.version !== 1) return null;
  try { enumeratePeriodDates(value.range); } catch { return null; }
  const range = { from: value.range.from, to: value.range.to };
  const sessionsByDate = {};
  for (const [date, session] of Object.entries(value.sessionsByDate || {})) {
    if (!isCalendarDate(date) || session?.date !== date) continue;
    try {
      // Only an explicitly marked converted weekly session may retain incomplete
      // historical targets. Native date plans always use strict validation.
      const legacy = session.legacy === true;
      const saved = legacy ? preservePeriodSession(session) : sanitizePeriodSession(session);
      sessionsByDate[date] = { ...saved, ...(legacy ? { legacy: true } : {}), date, revision: Number.isSafeInteger(session.revision) && session.revision > 0 ? session.revision : 1 };
    } catch { /* Preserve only valid sessions. */ }
  }
  const logs = [];
  for (const item of (Array.isArray(value.logs) ? value.logs : []).slice(-1120)) { try { logs.push(validateTrainingLog(item)); } catch { /* Invalid imported records are not evidence. */ } }
  const readiness = [];
  for (const item of (Array.isArray(value.readiness) ? value.readiness : []).slice(-366)) { try { readiness.push(validateReadiness(item)); } catch { /* Invalid records are not evidence. */ } }
  const progressByWeek = {};
  for (const [week, progress] of Object.entries(value.progressByWeek || {})) {
    if (!dateForWeekDay(week)) continue;
    const completed = Object.fromEntries(Object.entries(progress?.completed || {}).filter(([key, done]) => /^day[1-7]_[a-zA-Z0-9_-]+$/.test(key) && done === true));
    const completedAt = Object.fromEntries(Object.entries(progress?.completedAt || {}).filter(([key, date]) => completed[key] && isCalendarDate(date) && date <= localDate()));
    progressByWeek[week] = { completed, completedAt };
  }
  const weeklySummaries = (Array.isArray(value.weeklySummaries) ? value.weeklySummaries : []).slice(0, 6).flatMap(summary => {
    if (!summary || !dateForWeekDay(summary.week) || !isCalendarDate(summary.from) || !isCalendarDate(summary.to) || summary.from > summary.to || summary.from < range.from || summary.to > range.to || getWeekString(new Date(`${summary.from}T12:00:00`)) !== summary.week || getWeekString(new Date(`${summary.to}T12:00:00`)) !== summary.week) return [];
    const counts = Object.fromEntries(['strengthSessions', 'trainingSessions', 'recoverySessions', 'restDays', 'minutes'].map(key => [key, Math.max(0, Math.min(key === 'minutes' ? 6720 : 28, Number.isFinite(summary[key]) ? Math.round(summary[key]) : 0))]));
    return [{ week: summary.week, from: summary.from, to: summary.to, focus: periodProfile(summary).focus, conclusion: String(summary.conclusion || '').slice(0, 4000), ...counts }];
  });
  return { version: 1, range, sessionsByDate, progressByWeek, logs, readiness, profile: periodProfile(value.profile),
    conclusion: String(value.conclusion || '').slice(0, 12000), weeklySummaries, periodId: /^[A-Za-z0-9_-]{1,120}$/.test(value.periodId || '') ? value.periodId : 'local' };
}
export function readPeriodDraft() {
  try { const raw = readStorage(KEY); return raw.length < 2000000 ? normalizePeriodDraft(JSON.parse(raw)) : null; } catch { return null; }
}
export function writePeriodDraft(value) { return writeStorage(KEY, value ? JSON.stringify(value) : null); }
// previousSessions includes unchanged sessions on both sides of the requested range.
export function localPeriodState(draft, range, today) {
  const sessionsByDate = draft?.sessionsByDate || {};
  const protectedDates = Object.keys(sessionsByDate).filter(date => date < today || (draft?.logs || []).some(log => log.week === sessionsByDate[date].week && log.day === sessionsByDate[date].day) ||
    Object.entries(draft?.progressByWeek?.[sessionsByDate[date].week]?.completed || {}).some(([key, done]) => done && key.startsWith(`day${sessionsByDate[date].day}_`)));
  return { range, sessionsByDate, progressByWeek: draft?.progressByWeek || {}, logs: draft?.logs || [], previousSessions: Object.values(sessionsByDate).filter(session => session.date < range.from || session.date > range.to),
    protectedDates, expectedState: { fingerprint: JSON.stringify(draft) } };
}
export function applyLocalPeriod(draft, preview, today) {
  if (preview.expectedState.fingerprint !== JSON.stringify(draft)) throw new Error('PERIOD_CHANGED');
  const state = localPeriodState(draft, preview.range, today);
  const sessionsByDate = { ...(draft?.sessionsByDate || {}) };
  for (const session of preview.sessions) {
    if (session.date < preview.range.from || session.date > preview.range.to || state.protectedDates.includes(session.date)) continue;
    sessionsByDate[session.date] = { ...sanitizePeriodSession(session), date: session.date, week: session.week, revision: (sessionsByDate[session.date]?.revision || 0) + 1 };
  }
  return { version: 1, ...draft, range: preview.range, sessionsByDate, profile: preview.profile, conclusion: preview.conclusion, weeklySummaries: preview.weeklySummaries,
    periodId: `local_${Date.now()}`, progressByWeek: draft?.progressByWeek || {}, logs: draft?.logs || [], readiness: draft?.readiness || [] };
}
export function upsertLocalPeriodLog(draft, log, complete = false, today = localDate()) {
  const progressByWeek = { ...draft.progressByWeek };
  if (complete) progressByWeek[log.week] = { ...progressByWeek[log.week], completed: { ...progressByWeek[log.week]?.completed, [`day${log.day}_${log.exerciseId}`]: true }, completedAt: { ...progressByWeek[log.week]?.completedAt, [`day${log.day}_${log.exerciseId}`]: progressByWeek[log.week]?.completedAt?.[`day${log.day}_${log.exerciseId}`] || today } };
  return { ...draft, progressByWeek, logs: [...draft.logs.filter(item => trainingLogId(item) !== trainingLogId(log)), log] };
}

// Carry validated weekly public facts into the first date plan without changing
// the existing weekly draft or its separate account-adoption lifecycle.
export function periodFromWeeklyDraft(draft) {
  if (!draft?.week || !draft.plan?.schedule?.length) return null;
  try {
    const sessionsByDate = Object.fromEntries(draft.plan.schedule.map(day => {
      const date = dateForWeekDay(draft.week, day.day);
      const dated = { ...day, date, week: draft.week };
      let session;
      try { session = sanitizePeriodSession(dated); }
      catch { session = { ...preservePeriodSession(dated), legacy: true }; }
      return [date, { ...session, revision: 1 }];
    }));
    const dates = Object.keys(sessionsByDate).sort();
    return { version: 1, range: { from: dates[0], to: dates.at(-1) }, sessionsByDate, profile: periodProfile(draft.profile),
      conclusion: draft.plan.conclusion || '', weeklySummaries: [], progressByWeek: { [draft.week]: { completed: draft.completed || {}, completedAt: draft.completedAt || {} } },
      logs: draft.logs || [], readiness: draft.readiness || [], periodId: 'legacy_public' };
  } catch { return null; }
}

// Display projection only: persisted completion facts stay separate from plans.
export function localPeriodProgressView(draft, exercises = {}) {
  const progress = { ...(draft?.progressByWeek || {}) };
  const sessions = Object.values(draft?.sessionsByDate || {}).filter(session => session && dateForWeekDay(session.week, session.day) === session.date);
  for (const week of new Set(sessions.map(session => session.week))) {
    const previous = progress[week] || {};
    const scheduleSnapshot = sessions.filter(session => session.week === week).sort((a, b) => a.day - b.day);
    const exerciseTypes = { ...previous.exerciseTypes };
    for (const day of scheduleSnapshot) for (const id of day.routine) {
      const canonical = resolveExerciseId(id, exercises) || id;
      const type = exercises[canonical]?.type;
      if (type) exerciseTypes[exerciseKey(day.day, canonical)] = type;
    }
    progress[week] = { ...previous, scheduleSnapshot, exerciseTypes,
      totalExercises: scheduleSnapshot.reduce((count, day) => count + new Set(day.routine.map(id => resolveExerciseId(id, exercises) || id)).size, 0) };
  }
  return progress;
}
