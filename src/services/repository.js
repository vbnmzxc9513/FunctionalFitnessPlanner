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

export async function savePlan(uid, week, plan, fallback, restore = false, expectedRevision) {
  assertUser(uid);
  return runTransaction(db, async transaction => {
    const planRef = userDoc(uid, 'plans', week);
    const progressRef = userDoc(uid, 'progress', week);
    const existing = await transaction.get(planRef);
    await transaction.get(progressRef);
    assertUser(uid);
    const current = existing.exists() ? existing.data() : fallback;
    if (expectedRevision !== undefined && (current.revision || 0) !== expectedRevision) throw new Error('PLAN_CHANGED');
    const next = restore ? current.previous : plan;
    if (!next || !Array.isArray(next.schedule)) throw new Error('INVALID_PLAN');
    const totalExercises = next.schedule.reduce((sum, day) => sum + day.routine.length, 0);
    // Preserve completions as training history. The active plan alone determines its percentage.
    transaction.set(planRef, { ...withoutPrevious(next), previous: withoutPrevious(current), revision: (current.revision || 0) + 1, savedAt: serverTimestamp() });
    transaction.set(progressRef, { scheduleSnapshot: next.schedule, totalExercises, schemaVersion: 2 }, { merge: true });
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
        transaction.set(ref, record.group === 'profile' ? { ...record.data, isAnonymous: false }
          : record.group === 'plans' ? { ...record.data, savedAt: serverTimestamp() } : record.data);
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
