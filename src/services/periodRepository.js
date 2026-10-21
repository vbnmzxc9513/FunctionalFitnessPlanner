import { documentId, endAt, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, startAt } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { userCollection, userDoc } from './userPaths.js';
import { dateForWeekDay, getWeekString, localDate } from '../domain/dates.js';
import { enumeratePeriodDates, normalizePlanningRange, sanitizePeriodSession } from '../domain/periodPlanning.js';
import { createWeeklyIntent } from '../domain/trainingPreferences.js';
import { validateAssignmentConsent } from '../domain/planAssignments.js';
import { exerciseKey, resolveExerciseId } from '../domain/training.js';

const dayFields = ['day', 'name', 'theme', 'concept', 'coachAdvice', 'routine', 'sessionType', 'warmupNote', 'cooldownNote'];
const assertUser = uid => { if (!uid || auth.currentUser?.uid !== uid) throw new Error('SESSION_CHANGED'); };
const weekFor = date => getWeekString(new Date(`${date}T12:00:00`));
const shiftDate = (date, days) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return localDate(value); };
const fields = (source, names) => Object.fromEntries(names.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
const stable = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const keyFor = (group, id) => `${group}/${id}`;
const refFor = (uid, key) => { const [group, id] = key.split('/'); return userDoc(uid, group, id); };
const raw = snapshot => snapshot.exists() ? snapshot.data() : null;

export function dateSessionQueries(uid, from, to) {
  return {
    sessions: query(userCollection(uid, 'dateSessions'), orderBy(documentId()), startAt(from), endAt(to)),
    doses: query(userCollection(uid, 'dateDoses'), orderBy(documentId()), startAt(`${from}_`), endAt(`${to}_\uf8ff`)),
  };
}

// A metadata document reserves its date even when a subscription has not yet
// received its corresponding doses. Never fall back to an obsolete weekly day.
export function assembleDateSessions(metadata, doses) {
  const sessions = {};
  for (const [date, entry] of Object.entries(metadata)) {
    if (entry.date !== date || entry.week !== weekFor(date) || dateForWeekDay(entry.week, entry.day) !== date
      || !Number.isInteger(entry.revision) || entry.revision < 1 || !Array.isArray(entry.routine)
      || entry.routine.length > 8 || new Set(entry.routine).size !== entry.routine.length) throw new Error('DATE_SESSION_INCOMPLETE');
    const prescriptions = entry.routine.map(exerciseId => {
      const record = doses[`${date}_${exerciseId}`];
      if (!record || record.date !== date || record.exerciseId !== exerciseId || record.revision !== entry.revision || record.dose?.id !== exerciseId) throw new Error('DATE_SESSION_INCOMPLETE');
      return record.dose;
    });
    sessions[date] = { ...entry, prescriptions };
  }
  return sessions;
}

function scopeDates(range) {
  const dates = enumeratePeriodDates(range);
  const weeks = [...new Set(dates.map(weekFor))];
  const from = shiftDate(dateForWeekDay(weeks[0]), -7);
  const to = shiftDate(dateForWeekDay(weeks.at(-1), 7), 7);
  const readWeeks = [...new Set(enumeratePeriodDates({ from, to }, { maxDays: 49 }).map(weekFor))];
  return { dates, weeks, readWeeks, from, to };
}

function resolvedSessions(scope, documents, fallbackPlans = {}) {
  const metadata = {}, doses = {};
  for (const [key, value] of Object.entries(documents)) {
    const [group, id] = key.split('/');
    if (value && group === 'dateSessions') metadata[id] = value;
    if (value && group === 'dateDoses') doses[id] = value;
  }
  const sessions = assembleDateSessions(metadata, doses);
  for (const date of enumeratePeriodDates({ from: scope.from, to: scope.to }, { maxDays: 49 })) {
    if (sessions[date]) continue;
    const week = weekFor(date);
    const plan = documents[keyFor('plans', week)] || fallbackPlans[week];
    const day = new Date(`${date}T12:00:00`).getDay() || 7;
    const legacy = plan?.schedule?.find(item => item.day === day);
    if (legacy) sessions[date] = { ...legacy, date, week, revision: plan.revision || 0, legacy: true };
  }
  return sessions;
}

function protectedDays(scope, progressByWeek, logs) {
  return scope.dates.filter(date => {
    const week = weekFor(date), day = new Date(`${date}T12:00:00`).getDay() || 7;
    return Object.entries(progressByWeek[week]?.completed || {}).some(([key, done]) => done === true && key.startsWith(`day${day}_`))
      || Object.values(logs).some(record => record.week === week && record.day === day);
  });
}

export async function loadPeriodState(uid, requestedRange, { today = localDate(), exercises = {}, fallbackPlans = {} } = {}) {
  assertUser(uid);
  const range = normalizePlanningRange(requestedRange, requestedRange?.from < today ? requestedRange.from : today), scope = scopeDates(range);
  const documents = {};
  const reads = scope.readWeeks.flatMap(week => ['plans', 'progress'].map(group => ({ group, id: week })));
  const bounds = dateSessionQueries(uid, scope.from, scope.to);
  const [snapshots, native, doseRecords, logRecords] = await Promise.all([
    Promise.all(reads.map(({ group, id }) => getDoc(userDoc(uid, group, id)))), getDocs(bounds.sessions), getDocs(bounds.doses),
    getDocs(query(userCollection(uid, 'trainingLogs'), orderBy('week'), startAt(scope.readWeeks[0]), endAt(scope.readWeeks.at(-1)))),
  ]);
  assertUser(uid);
  reads.forEach(({ group, id }, i) => { documents[keyFor(group, id)] = raw(snapshots[i]); });
  for (const date of enumeratePeriodDates({ from: scope.from, to: scope.to }, { maxDays: 49 })) documents[keyFor('dateSessions', date)] = null;
  for (const snapshot of native.docs) documents[keyFor('dateSessions', snapshot.id)] = snapshot.data();
  const activeDoseKeys = new Set(native.docs.flatMap(snapshot => (snapshot.data().routine || []).map(id => `${snapshot.id}_${id}`)));
  for (const id of activeDoseKeys) documents[keyFor('dateDoses', id)] = null;
  for (const snapshot of doseRecords.docs) if (activeDoseKeys.has(snapshot.id)) documents[keyFor('dateDoses', snapshot.id)] = snapshot.data();
  const logs = Object.fromEntries(logRecords.docs.map(snapshot => [snapshot.id, snapshot.data()]));
  for (const [id, data] of Object.entries(logs)) documents[keyFor('trainingLogs', id)] = data;
  const sessionsByDate = resolvedSessions(scope, documents, fallbackPlans);
  // Include absent deterministic slots so a log recorded during preview causes
  // an explicit stale-preview error, including formerly scheduled exercises.
  for (const week of scope.weeks) {
    const candidates = [documents[keyFor('plans', week)]?.schedule, documents[keyFor('progress', week)]?.scheduleSnapshot,
      fallbackPlans[week]?.schedule, Object.values(sessionsByDate).filter(session => session.week === week)].flatMap(value => value || []);
    for (const day of candidates) for (const value of day.routine || []) {
      const ids = new Set([resolveExerciseId(value, exercises), value].filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id)));
      for (const id of ids) {
        const key = keyFor('trainingLogs', `${week}-D${day.day}-${id}`);
        if (!(key in documents)) documents[key] = null;
      }
    }
  }
  // Query results and individual absent-slot reads must describe the same
  // state. A save between these reads is detected again when applying.
  const absentKeys = Object.keys(documents).filter(key => key.startsWith('trainingLogs/') && documents[key] == null);
  const absent = await Promise.all(absentKeys.map(key => getDoc(refFor(uid, key))));
  absent.forEach((snapshot, i) => { documents[absentKeys[i]] = raw(snapshot); if (snapshot.exists()) logs[snapshot.id] = snapshot.data(); });
  assertUser(uid);
  const progressByWeek = Object.fromEntries(scope.readWeeks.map(week => [week, documents[keyFor('progress', week)] || {}]));
  const fingerprint = stable(documents);
  return { range, sessionsByDate, progressByWeek, logs, protectedDates: protectedDays(scope, progressByWeek, logs),
    // Historical property name includes fixed future neighbors for boundary spacing.
    previousSessions: Object.values(sessionsByDate).filter(session => session.date < range.from || session.date > range.to),
    expectedState: { documents, fallbackPlans, fingerprint }, fingerprint };
}

function weeklySnapshot(week, documents, replacements, fallbackPlans = {}) {
  const progress = documents[keyFor('progress', week)] || {};
  const saved = documents[keyFor('plans', week)]?.schedule || fallbackPlans[week]?.schedule || [];
  const prior = progress.scheduleSnapshot || [];
  const schedule = [];
  for (let day = 1; day <= 7; day++) {
    const date = dateForWeekDay(week, day);
    const native = replacements[date] || documents[keyFor('dateSessions', date)];
    const priorDay = prior.find(item => item.day === day);
    let entry = native || priorDay || saved.find(item => item.day === day);
    if (native && !native.prescriptions) {
      const doses = native.routine.map(id => documents[keyFor('dateDoses', `${date}_${id}`)]).filter(record => record?.revision === native.revision).map(record => record.dose);
      entry = { ...native, ...(doses.length === native.routine.length ? { prescriptions: doses } : priorDay?.prescriptions ? { prescriptions: priorDay.prescriptions } : {}) };
    }
    if (entry) schedule.push(fields(entry, [...dayFields, 'prescriptions']));
  }
  return { scheduleSnapshot: schedule, totalExercises: schedule.reduce((total, day) => total + day.routine.length, 0), schemaVersion: 2 };
}

function writeSession(transaction, uid, session, revision, periodId, weeklyIntent) {
  const metadata = { ...fields(session, ['date', 'week', ...dayFields]), revision, periodId, ...(weeklyIntent ? { weeklyIntent } : {}) };
  transaction.set(userDoc(uid, 'dateSessions', session.date), metadata);
  for (const dose of session.prescriptions) transaction.set(userDoc(uid, 'dateDoses', `${session.date}_${dose.id}`), {
    date: session.date, exerciseId: dose.id, revision, dose,
  });
  return metadata;
}

export async function applyPeriodPlan(uid, { range: requestedRange, sessions, profile = {}, expectedState, periodId, conclusion = '', selectedDates, replaceDates = [] }) {
  assertUser(uid);
  const range = normalizePlanningRange(requestedRange, localDate()), scope = scopeDates(range);
  if (!expectedState?.documents || expectedState.fingerprint !== stable(expectedState.documents)) throw new Error('PERIOD_CHANGED');
  const targets = selectedDates || scope.dates;
  if (!Array.isArray(targets) || !targets.length || new Set(targets).size !== targets.length || targets.some(date => !scope.dates.includes(date))) throw new Error('INVALID_PERIOD_PLAN');
  if (!Array.isArray(sessions) || sessions.length !== targets.length) throw new Error('INVALID_PERIOD_PLAN');
  const expectedProgress = Object.fromEntries(scope.weeks.map(week => [week, expectedState.documents[keyFor('progress', week)] || {}]));
  const expectedLogs = Object.fromEntries(Object.entries(expectedState.documents).filter(([key, value]) => key.startsWith('trainingLogs/') && value));
  const expectedProtected = protectedDays(scope, expectedProgress, expectedLogs);
  if (selectedDates) validateAssignmentConsent({ protectedDates: expectedProtected, sessionsByDate: resolvedSessions(scope, expectedState.documents, expectedState.fallbackPlans) }, targets, replaceDates);
  const clean = sessions.map(session => expectedProtected.includes(session?.date) ? session : sanitizePeriodSession(session));
  if (new Set(clean.map(session => session.date)).size !== targets.length || clean.some(session => !targets.includes(session.date))) throw new Error('INVALID_PERIOD_PLAN');
  const id = periodId || `${range.from}_${range.to}_${globalThis.crypto.randomUUID()}`;
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('INVALID_PERIOD_ID');
  const intent = createWeeklyIntent(profile.context || {}, profile.focus, profile.time || 30);
  return runTransaction(db, async transaction => {
    const keys = new Set(Object.keys(expectedState.documents));
    for (const session of clean) for (const exerciseId of session.routine) keys.add(keyFor('trainingLogs', `${session.week}-D${session.day}-${exerciseId}`));
    keys.add(keyFor('planningPeriods', id));
    const documents = {};
    const readKeys = [...keys];
    const snapshots = await Promise.all(readKeys.map(key => transaction.get(refFor(uid, key))));
    readKeys.forEach((key, index) => { documents[key] = raw(snapshots[index]); });
    assertUser(uid);
    for (const [key, expected] of Object.entries(expectedState.documents)) if (stable(documents[key]) !== stable(expected)) throw new Error('PERIOD_CHANGED');
    for (const key of keys) if (!(key in expectedState.documents) && documents[key]) throw new Error('PERIOD_CHANGED');
    const progress = Object.fromEntries(scope.weeks.map(week => [week, documents[keyFor('progress', week)] || {}]));
    const logs = Object.fromEntries(Object.entries(documents).filter(([key, value]) => key.startsWith('trainingLogs/') && value));
    const protectedDates = protectedDays(scope, progress, logs), replacements = {}, appliedDates = [];
    if (selectedDates) validateAssignmentConsent({ protectedDates, sessionsByDate: resolvedSessions(scope, documents, expectedState.fallbackPlans) }, targets, replaceDates);
    for (const session of clean) if (!protectedDates.includes(session.date)) {
      const current = documents[keyFor('dateSessions', session.date)];
      replacements[session.date] = writeSession(transaction, uid, session, (current?.revision || 0) + 1, id, intent);
      // Snapshot includes doses for exports and legacy readers; native metadata
      // itself remains small and independently writable under the rules budget.
      replacements[session.date].prescriptions = session.prescriptions;
      appliedDates.push(session.date);
    }
    for (const week of scope.weeks) transaction.set(userDoc(uid, 'progress', week), weeklySnapshot(week, documents, replacements, expectedState.fallbackPlans), { merge: true });
    transaction.set(userDoc(uid, 'planningPeriods', id), { from: range.from, to: range.to, ...(selectedDates ? { dates: [...targets].sort() } : {}), createdAt: serverTimestamp(), weeklyIntent: intent, conclusion: String(conclusion).slice(0, 4000) });
    return { periodId: id, appliedDates, protectedDates };
  });
}

export async function saveDateReadinessAdjustment(uid, date, session, { expectedRevision, expectedCompleted } = {}) {
  assertUser(uid);
  const week = weekFor(date);
  return runTransaction(db, async transaction => {
    const sessionRef = userDoc(uid, 'dateSessions', date), progressRef = userDoc(uid, 'progress', week);
    const current = raw(await transaction.get(sessionRef));
    const progress = raw(await transaction.get(progressRef)) || {};
    const plan = raw(await transaction.get(userDoc(uid, 'plans', week)));
    if (!current || current.revision !== expectedRevision) throw new Error('PLAN_CHANGED');
    const trueKeys = value => Object.keys(value || {}).filter(key => value[key] === true).sort();
    if (expectedCompleted !== undefined && stable(trueKeys(progress.completed)) !== stable(trueKeys(expectedCompleted.completed || expectedCompleted))) throw new Error('PROGRESS_CHANGED');
    const doses = {};
    for (const exerciseId of new Set([...current.routine, ...(session.routine || [])])) {
      doses[exerciseId] = raw(await transaction.get(userDoc(uid, 'dateDoses', `${date}_${exerciseId}`)));
    }
    const documents = { [keyFor('plans', week)]: plan, [keyFor('progress', week)]: progress };
    for (let day = 1; day <= 7; day++) {
      const otherDate = dateForWeekDay(week, day);
      documents[keyFor('dateSessions', otherDate)] = otherDate === date ? current : raw(await transaction.get(userDoc(uid, 'dateSessions', otherDate)));
    }
    assertUser(uid);
    const preserved = current.routine.filter(id => progress.completed?.[exerciseKey(current.day, id)] === true);
    const next = { ...fields(session, dayFields), date, week, day: current.day };
    if (!Array.isArray(next.routine) || !Array.isArray(session.prescriptions)) throw new Error('INVALID_PERIOD_PLAN');
    const routine = [...new Set([...next.routine, ...preserved])];
    const prescriptions = routine.map(id => {
      if (preserved.includes(id)) {
        if (doses[id]?.revision !== current.revision) throw new Error('DATE_SESSION_INCOMPLETE');
        return doses[id].dose;
      }
      const dose = session.prescriptions.find(item => item.id === id);
      if (!dose) throw new Error('INVALID_PERIOD_PLAN');
      return dose;
    });
    next.routine = routine; next.prescriptions = prescriptions;
    if (routine.length && next.sessionType === 'rest') next.sessionType = current.sessionType;
    const metadata = writeSession(transaction, uid, next, current.revision + 1, current.periodId, current.weeklyIntent);
    transaction.set(progressRef, weeklySnapshot(week, documents, { [date]: { ...metadata, prescriptions } }), { merge: true });
    return { ...metadata, prescriptions };
  });
}
