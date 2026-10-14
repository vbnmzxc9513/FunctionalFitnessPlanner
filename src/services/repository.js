import { collection, doc, documentId, endAt, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, startAt } from 'firebase/firestore';
import { auth, db, appId } from './firebase.js';
import { applyFeedback, exerciseKey } from '../domain/training.js';
import { dateForWeekDay, getWeekString, localDate } from '../domain/dates.js';

export const userDoc = (uid, group, id) => doc(db, 'artifacts', appId, 'users', uid, group, id);
export const userCollection = (uid, group) => collection(db, 'artifacts', appId, 'users', uid, group);
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
  // Two identical daily mirrors validate four doses each to stay within the
  // rule expression budget, even when every lift has a preparation set. Rules
  // confirm both same-commit mirrors against the weekly snapshot atomically.
  for (const day of schedule) for (const part of [1, 2]) {
    transaction.set(userDoc(uid, 'planDays', `${week}-D${day.day}-P${part}`), { ...day, savedAt: serverTimestamp() });
  }
}

export async function savePlan(uid, week, plan, fallback, restore = false, expectedRevision, previewCompleted = {}) {
  assertUser(uid);
  return runTransaction(db, async transaction => {
    const planRef = userDoc(uid, 'plans', week);
    const progressRef = userDoc(uid, 'progress', week);
    const existing = await transaction.get(planRef);
    const progress = await transaction.get(progressRef);
    assertUser(uid);
    const current = existing.exists() ? existing.data() : fallback;
    if (expectedRevision !== undefined && (current.revision || 0) !== expectedRevision) throw new Error('PLAN_CHANGED');
    const next = restore ? current.previous : plan;
    if (!next || !Array.isArray(next.schedule)) throw new Error('INVALID_PLAN');
    const totalExercises = next.schedule.reduce((sum, day) => sum + day.routine.length, 0);
    const allowedKeys = new Set(next.schedule.flatMap(day => day.routine.map(id => exerciseKey(day.day, id))));
    const completed = Object.fromEntries(Object.entries(previewCompleted).filter(([key, done]) => done === true && allowedKeys.has(key)));
    const previousProgress = progress.data() || {};
    const completedAt = Object.fromEntries(Object.keys(completed).map(key => [key,
      previousProgress.completed?.[key] && previousProgress.completedAt?.[key] || localDate()]));
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
    const plan = await transaction.get(userDoc(uid, 'plans', week));
    const progress = await transaction.get(ref);
    assertUser(uid);
    const schedule = plan.exists() ? plan.data().schedule : fallback;
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
  const groups = ['profile', 'progress', 'plans', 'metrics', 'exercises'];
  const snapshots = await Promise.all(groups.map(group => getDocs(userCollection(uid, group))));
  return snapshots.flatMap((snapshot, index) => snapshot.docs.map(item => ({ group: groups[index], id: item.id, data: item.data() })));
}

export async function importGuestData(uid, records) {
  assertUser(uid);
  // Transactions allow retry and preserve existing account data on collisions.
  for (const record of records) {
    await runTransaction(db, async transaction => {
      const ref = userDoc(uid, record.group, record.id);
      const existing = await transaction.get(ref);
      assertUser(uid);
      if (!existing.exists()) {
        if (record.group === 'plans') writePlanDays(transaction, uid, record.id, record.data.schedule);
        transaction.set(ref, record.group === 'profile' ? { ...record.data, isAnonymous: false }
          : record.group === 'plans' ? { ...record.data, validationVersion: 1, savedAt: serverTimestamp() } : record.data);
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
}
