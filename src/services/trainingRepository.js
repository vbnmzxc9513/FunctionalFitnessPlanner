import { endAt, limit, orderBy, query, runTransaction, setDoc, startAt } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { userDoc, userCollection } from './userPaths.js';
function weekHistoryStart(week, weeks) {
  return getWeekString(new Date(`${dateForWeekDay(week)}T12:00:00`), 1 - weeks);
}
import { dateForWeekDay, getWeekString, localDate } from '../domain/dates.js';
import { prescription } from '../domain/training.js';
import { validateTrainingLog, validateReadiness, trainingLogId, plannedSnapshot } from '../domain/coaching.js';

function assertUser(uid) {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('SESSION_CHANGED');
}
function assertRecentWeek(week) {
  const current = getWeekString();
  if (!dateForWeekDay(week) || week < weekHistoryStart(current, 12) || week > current) throw new Error('TRAINING_OUT_OF_SCOPE');
}
export { plannedSnapshot } from '../domain/coaching.js';
function samePlanned(a, b) {
  return ['sets', 'value', 'unit', 'perSide', 'phase', 'restSeconds'].every(key => a?.[key] === b?.[key]);
}
export function trainingHistoryQueries(uid, currentWeek = getWeekString(), weeks = 12) {
  const boundedWeeks = Math.max(1, Math.min(12, Number.isInteger(weeks) ? weeks : 12));
  const start = weekHistoryStart(currentWeek, boundedWeeks);
  const endWeek = currentWeek > getWeekString() ? getWeekString() : currentWeek;
  const endDate = [dateForWeekDay(endWeek, 7), localDate()].sort()[0];
  return {
    logs: query(userCollection(uid, 'trainingLogs'), orderBy('week', 'desc'), startAt(endWeek), endAt(start), limit(boundedWeeks * 40 + 1)),
    readiness: query(userCollection(uid, 'readiness'), orderBy('date', 'desc'), startAt(endDate), endAt(dateForWeekDay(start)), limit(boundedWeeks * 7 + 1)),
  };
}
export async function saveTrainingLog(uid, record, { fallback, expectedRevision, exercise, level = 1 } = {}) {
  assertUser(uid);
  const clean = validateTrainingLog(record);
  assertRecentWeek(clean.week);
  if (!Number.isInteger(expectedRevision)) throw new Error('PLAN_CHANGED');
  return runTransaction(db, async transaction => {
    const ref = userDoc(uid, 'trainingLogs', trainingLogId(clean));
    const existing = await transaction.get(ref);
    const savedPlan = await transaction.get(userDoc(uid, 'plans', clean.week));
    assertUser(uid);
    const plan = savedPlan.exists() ? savedPlan.data() : fallback;
    if (!plan || (plan.revision || 0) !== expectedRevision) throw new Error('PLAN_CHANGED');
    const day = plan.schedule?.find(item => item.day === clean.day);
    const matchesExercise = value => value === clean.exerciseId || (exercise && (value === exercise.name || exercise.aliases?.includes(value)));
    if (!day?.routine?.some(matchesExercise)) throw new Error('PLAN_CHANGED');
    if (existing.exists()) {
      const original = existing.data();
      if (original.date !== clean.date || !samePlanned(original.planned, clean.planned)) throw new Error('LOG_CHANGED');
    } else {
      const dose = prescription(clean.exerciseId, exercise?.type, level, exercise, day);
      if (!samePlanned(plannedSnapshot(dose), clean.planned)) throw new Error('PLAN_CHANGED');
    }
    // Exercise edits cannot undo a separately recorded next-day response.
    transaction.set(ref, existing.exists() ? { ...clean, nextDay: existing.data().nextDay } : clean);
  });
}
export async function saveNextDayResponse(uid, id, nextDay) {
  assertUser(uid);
  return runTransaction(db, async transaction => {
    const ref = userDoc(uid, 'trainingLogs', id);
    const existing = await transaction.get(ref);
    assertUser(uid);
    if (!existing.exists()) throw new Error('LOG_NOT_FOUND');
    const clean = validateTrainingLog({ ...existing.data(), nextDay });
    if (trainingLogId(clean) !== id || clean.date >= localDate()) throw new Error('NEXT_DAY_TOO_EARLY');
    transaction.update(ref, { nextDay: clean.nextDay });
  });
}
export async function saveReadiness(uid, record) {
  assertUser(uid);
  const clean = validateReadiness(record);
  const start = dateForWeekDay(weekHistoryStart(getWeekString(), 12));
  if (clean.date < start) throw new Error('TRAINING_OUT_OF_SCOPE');
  await setDoc(userDoc(uid, 'readiness', clean.date), clean);
}

// Read collision targets before any writes. Preview adoption never overwrites
// earlier private records, and runs in the same transaction as the plan.
export async function prepareTrainingPreview(transaction, uid, week, _plan, preview = {}) {
  if (!Array.isArray(preview.logs || []) || !Array.isArray(preview.readiness || [])) throw new Error('INVALID_TRAINING_PREVIEW');
  const logs = (preview.logs || []).map(record => validateTrainingLog(record));
  const readiness = (preview.readiness || []).map(record => validateReadiness(record));
  if (logs.length > 40 || readiness.length > 7) throw new Error('INVALID_TRAINING_PREVIEW');
  const entries = [];
  for (const record of logs) {
    if (record.week !== week) throw new Error('INVALID_TRAINING_PREVIEW');
    entries.push({ group: 'trainingLogs', id: trainingLogId(record), record });
  }
  for (const record of readiness) {
    if (getWeekString(new Date(`${record.date}T12:00:00`)) !== week) throw new Error('INVALID_TRAINING_PREVIEW');
    entries.push({ group: 'readiness', id: record.date, record });
  }
  if (new Set(entries.map(entry => `${entry.group}/${entry.id}`)).size !== entries.length) throw new Error('INVALID_TRAINING_PREVIEW');
  for (const entry of entries) {
    entry.ref = userDoc(uid, entry.group, entry.id);
    entry.exists = (await transaction.get(entry.ref)).exists();
  }
  return entries;
}
export function writeTrainingPreview(transaction, entries) {
  for (const entry of entries) if (!entry.exists) transaction.set(entry.ref, entry.record);
}
