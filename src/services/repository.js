import { documentId, endAt, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, startAt } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { applyFeedback, exerciseKey } from '../domain/training.js';
import { dateForWeekDay, getWeekString, localDate } from '../domain/dates.js';
import { prepareTrainingPreview, writeTrainingPreview } from './trainingRepository.js';
import { userDoc, userCollection } from './userPaths.js';
import { captureWorkoutTemplate, importSavedWorkoutTemplates } from './workoutRepository.js';
import { dateDoseKeys, dateDoseRecord } from '../domain/dateDoseStorage.js';
import { LEGACY_MAX_DAY_EXERCISES } from '../domain/plannerLimits.js';
export { userDoc, userCollection } from './userPaths.js';

export function weekHistoryStart(week, weeks) {
  return getWeekString(new Date(`${dateForWeekDay(week)}T12:00:00`), 1 - weeks);
}
export function weekHistoryQuery(uid, group, weeks, week) {
  // Ascending key scans with explicit bounds also work in the Firestore emulator.
  return query(userCollection(uid, group), orderBy(documentId()), startAt(weekHistoryStart(week, weeks)), endAt(week), limit(weeks));
}
function assertUser(uid) {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('SESSION_CHANGED');
}
function withoutPrevious(plan) {
  const copy = { ...plan };
  delete copy.previous;
  return copy;
}

function writePlanDays(transaction, uid, week, schedule) {
  if (schedule.some(day => !Array.isArray(day.routine) || day.routine.length > LEGACY_MAX_DAY_EXERCISES)) throw new Error('LEGACY_PLAN_CAPACITY');
  // Two identical daily mirrors validate four doses each to stay within the
  // rule expression budget, even when every lift has a preparation set. Rules
  // confirm both same-commit mirrors against the weekly snapshot atomically.
  for (const day of schedule) for (const part of [1, 2]) {
    transaction.set(userDoc(uid, 'planDays', `${week}-D${day.day}-P${part}`), { ...day, savedAt: serverTimestamp() });
  }
}

export async function savePlan(uid, week, plan, fallback, restore = false, expectedRevision, previewCompleted = {}, previewTraining = {}, expectedCompleted) {
  assertUser(uid);
  return runTransaction(db, async transaction => {
    const planRef = userDoc(uid, 'plans', week);
    const progressRef = userDoc(uid, 'progress', week);
    const existing = await transaction.get(planRef);
    const progress = await transaction.get(progressRef);
    assertUser(uid);
    const current = existing.exists() ? existing.data() : fallback;
    if (expectedRevision !== undefined && (current.revision || 0) !== expectedRevision) throw new Error('PLAN_CHANGED');
    if (expectedCompleted !== undefined) {
      const trueKeys = value => Object.entries(value || {}).filter(([, done]) => done === true).map(([key]) => key).sort();
      if (JSON.stringify(trueKeys(progress.data()?.completed)) !== JSON.stringify(trueKeys(expectedCompleted))) throw new Error('PROGRESS_CHANGED');
    }
    const next = restore ? current.previous : plan;
    if (!next || !Array.isArray(next.schedule)) throw new Error('INVALID_PLAN');
    const trainingEntries = await prepareTrainingPreview(transaction, uid, week, next, previewTraining);
    assertUser(uid);
    const totalExercises = next.schedule.reduce((sum, day) => sum + day.routine.length, 0);
    const allowedKeys = new Set(next.schedule.flatMap(day => day.routine.map(id => exerciseKey(day.day, id))));
    const completed = Object.fromEntries(Object.entries(previewCompleted).filter(([key, done]) => done === true && allowedKeys.has(key)));
    const previousProgress = progress.data() || {};
    const completedAt = Object.fromEntries(Object.keys(completed).map(key => [key,
      previousProgress.completed?.[key] && previousProgress.completedAt?.[key] || localDate()]));
    writeTrainingPreview(transaction, trainingEntries);
    writePlanDays(transaction, uid, week, next.schedule);
    // Preserve completions as training history. The active plan alone determines its percentage.
    transaction.set(planRef, { ...withoutPrevious(next), previous: withoutPrevious(current), validationVersion: 1, revision: (current.revision || 0) + 1, savedAt: serverTimestamp() });
    transaction.set(progressRef, { scheduleSnapshot: next.schedule, totalExercises, schemaVersion: 2,
      ...(Object.keys(completed).length ? { completed, completedAt } : {}) }, { merge: true });
  });
}

export async function setCompletion(uid, week, day, id, done, exercise, fallback) {
  assertUser(uid);
  return runTransaction(db, async transaction => {
    const ref = userDoc(uid, 'progress', week);
    // Two read stages: metadata in parallel, then its dependent dose chunks.
    // Every document remains inside the transaction's conflict check.
    const dates = Array.from({ length: 7 }, (_, index) => dateForWeekDay(week, index + 1));
    const [plan, progress, ...metadata] = await Promise.all([
      transaction.get(userDoc(uid, 'plans', week)), transaction.get(ref),
      ...dates.map(date => transaction.get(userDoc(uid, 'dateSessions', date))),
    ]);
    const native = (await Promise.all(metadata.map(async (snapshot, index) => {
      if (!snapshot.exists()) return null;
      const date = dates[index], session = snapshot.data();
      const keys = dateDoseKeys(date, session);
      const snapshots = await Promise.all(keys.map(key => transaction.get(userDoc(uid, 'dateDoses', key))));
      const records = Object.fromEntries(snapshots.flatMap((dose, i) => dose.exists() ? [[keys[i], dose.data()]] : []));
      const doses = session.routine.map(id => dateDoseRecord(date, session, records, id));
      if (doses.some((dose, i) => !dose || dose.revision !== session.revision || dose.date !== date
        || dose.dose?.id !== session.routine[i])) throw new Error('PLAN_CHANGED');
      return { ...session, prescriptions: doses.map(dose => dose.dose) };
    }))).filter(Boolean);
    assertUser(uid);
    const savedSchedule = plan.exists() ? plan.data().schedule : fallback || [];
    const priorSchedule = progress.data()?.scheduleSnapshot || [];
    const schedule = Array.from({ length: 7 }, (_, index) => {
      const slot = index + 1;
      const dated = native.find(item => item.day === slot);
      const prior = priorSchedule.find(item => item.day === slot);
      const legacy = savedSchedule.find(item => item.day === slot);
      if (!dated) return prior || legacy;
      const { v: _v, date: _date, week: _week, revision: _revision, periodId: _periodId, weeklyIntent: _intent, ...daily } = dated;
      return daily;
    }).filter(Boolean);
    if (!schedule.some(item => item.day === day && (item.routine.includes(id) || item.routine.includes(exercise.name)))) throw new Error('PLAN_CHANGED');
    const key = exerciseKey(day, id);
    const data = progress.data() || {};
    transaction.set(ref, {
      completed: { [key]: done },
      completedAt: { [key]: done ? localDate() : (data.completedAt?.[key] || localDate()) },
      exerciseTypes: { [key]: exercise.type },
      scheduleSnapshot: schedule,
      totalExercises: schedule.reduce((sum, item) => sum + item.routine.length, 0),
      schemaVersion: 2,
    }, { merge: true });
  });
}

export async function saveFeedback(uid, week, adjustment) {
  assertUser(uid);
  return runTransaction(db, async transaction => {
    const profileRef = userDoc(uid, 'profile', 'settings');
    const progressRef = userDoc(uid, 'progress', week);
    const profile = await transaction.get(profileRef);
    const progress = await transaction.get(progressRef);
    assertUser(uid);
    const result = applyFeedback(profile.data() || {}, progress.data() || {}, adjustment);
    transaction.set(profileRef, { difficultyLevel: result.difficultyLevel }, { merge: true });
    transaction.set(progressRef, { difficultyBase: result.difficultyBase, feedbackValue: result.feedbackValue, feedbackProvided: true }, { merge: true });
  });
}

export async function saveMeasurement(uid, values) {
  assertUser(uid);
  // Blank form fields are omitted by parseMetrics and cannot erase a previous measurement.
  await setDoc(userDoc(uid, 'metrics', values.date), values, { merge: true });
}

export async function captureGuestData(uid) {
  assertUser(uid);
  const groups = ['profile', 'progress', 'plans', 'metrics', 'exercises', 'trainingLogs', 'readiness', 'dateSessions', 'dateDoses', 'planningPeriods', 'workoutTemplates'];
  const snapshots = await Promise.all(groups.map(group => getDocs(userCollection(uid, group))));
  assertUser(uid);
  return snapshots.flatMap((snapshot, index) => snapshot.docs.map(item => groups[index] === 'workoutTemplates'
    ? captureWorkoutTemplate(uid, item.id, item.data()) : ({ group: groups[index], id: item.id, data: item.data() })));
}

export async function importGuestData(uid, records) {
  assertUser(uid);
  // Transactions allow retry and preserve existing account data on collisions.
  const allowedGroups = new Set(['profile', 'progress', 'plans', 'metrics', 'exercises', 'trainingLogs', 'readiness', 'dateSessions', 'dateDoses', 'planningPeriods', 'workoutTemplates']);
  if (!Array.isArray(records) || records.some(record => !allowedGroups.has(record?.group) || typeof record.id !== 'string' || record.id.includes('/'))) throw new Error('INVALID_IMPORT');
  const workouts = await importSavedWorkoutTemplates(uid, records.filter(record => record.group === 'workoutTemplates'));
  const dateDoses = new Map(records.filter(record => record.group === 'dateDoses').map(record => [record.id, record.data]));
  for (const record of records) {
    if (record.group === 'workoutTemplates') continue;
    // Date metadata and its active doses are one migration unit. Collisions
    // preserve the destination's entire session; stale unreferenced source
    // doses have no effect on the active plan and do not need to be copied.
    if (record.group === 'dateDoses') continue;
    if (record.group === 'dateSessions') {
      if (!Array.isArray(record.data?.routine)) throw new Error('INVALID_IMPORT');
      const keys = dateDoseKeys(record.id, record.data);
      const documents = Object.fromEntries(keys.map(id => [id, dateDoses.get(id)]));
      const doses = record.data.routine.map(id => dateDoseRecord(record.id, record.data, documents, id));
      if (doses.some((dose, index) => !dose || dose.date !== record.id || dose.revision !== record.data.revision
        || dose.exerciseId !== record.data.routine[index] || dose.dose?.id !== record.data.routine[index])) throw new Error('INVALID_IMPORT');
      await runTransaction(db, async transaction => {
        const ref = userDoc(uid, record.group, record.id);
        const existing = await transaction.get(ref);
        assertUser(uid);
        if (existing.exists()) return;
        transaction.set(ref, record.data);
        for (const id of keys) transaction.set(userDoc(uid, 'dateDoses', id), documents[id]);
      });
      continue;
    }
    await runTransaction(db, async transaction => {
      const ref = userDoc(uid, record.group, record.id);
      const existing = await transaction.get(ref);
      assertUser(uid);
      if (!existing.exists()) {
        if (record.group === 'plans') writePlanDays(transaction, uid, record.id, record.data.schedule);
        transaction.set(ref, record.group === 'profile' ? { ...record.data, isAnonymous: false }
          : record.group === 'plans' ? { ...record.data, validationVersion: 1, savedAt: serverTimestamp() }
            : record.group === 'planningPeriods' ? { ...record.data, createdAt: serverTimestamp() } : record.data);
      } else if (record.group === 'progress') {
        const target = existing.data();
        const completed = { ...record.data.completed, ...target.completed };
        for (const [key, done] of Object.entries(record.data.completed || {})) if (done === true) completed[key] = true;
        transaction.set(ref, { completed, completedAt: { ...record.data.completedAt, ...target.completedAt }, exerciseTypes: { ...record.data.exerciseTypes, ...target.exerciseTypes } }, { merge: true });
      } else if (record.group === 'exercises') {
        transaction.set(ref, { exercises: { ...record.data.exercises, ...existing.data().exercises } }, { merge: true });
      }
    });
  }
  return { workouts };
}
