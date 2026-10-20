import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { userCollection, userDoc } from './userPaths.js';
import { normalizedWorkoutName, readSavedWorkout, workoutName, workoutNameKey, workoutPayload } from '../domain/savedWorkouts.js';

export const DEVICE_WORKOUTS_KEY = 'fitness-planner:saved-workouts:v1';
const DEVICE_EVENT = 'fitness-planner:saved-workouts-changed';
const error = code => { throw new Error(code); };
const sorted = items => items.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
const newId = () => globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 20);
const checkRevision = (item, revision) => {
  if (revision !== undefined && revision !== item.revision) error('WORKOUT_CHANGED');
};

/** Device data is never copied to an account automatically. Reads fail closed. */
export function createDeviceWorkoutRepository({ storage = () => globalThis.localStorage, identity = () => auth.currentUser,
  events = globalThis.window, clock = Date.now, id = newId, locks = globalThis.navigator?.locks } = {}) {
  const assertScope = () => { if (identity()?.uid) error('WORKOUT_AUTH_CHANGED'); };
  const read = () => {
    assertScope();
    let raw;
    try { raw = storage().getItem(DEVICE_WORKOUTS_KEY); } catch { error('WORKOUT_STORAGE_FAILED'); }
    if (raw === null) return [];
    try {
      if (raw.length > 2000000) error('WORKOUT_STORAGE_FAILED');
      const value = JSON.parse(raw);
      if (!value || value.v !== 1 || !Array.isArray(value.items) || Object.keys(value).some(key => !['v', 'items'].includes(key))) error('INVALID_SAVED_WORKOUT');
      const seenIds = new Set(), seenNames = new Set();
      return value.items.map(record => {
        const { id, ...document } = record;
        const item = readSavedWorkout(id, document), name = normalizedWorkoutName(item.name);
        if (seenIds.has(id) || seenNames.has(name)) error('INVALID_SAVED_WORKOUT');
        seenIds.add(id); seenNames.add(name);
        return { id, ...document };
      });
    } catch (value) { if (value.message === 'WORKOUT_STORAGE_FAILED') throw value; error('INVALID_SAVED_WORKOUT'); }
  };
  const list = async () => sorted(read().map(({ id, ...record }) => readSavedWorkout(id, record)));
  const mutate = async change => {
    const work = () => {
      assertScope();
      const records = read(), result = change(records);
      const serialized = JSON.stringify({ v: 1, items: records });
      if (serialized.length > 2000000) error('WORKOUT_STORAGE_FAILED');
      assertScope();
      try { storage().setItem(DEVICE_WORKOUTS_KEY, serialized); } catch { error('WORKOUT_STORAGE_FAILED'); }
      events?.dispatchEvent(new Event(DEVICE_EVENT));
      return result;
    };
    return locks?.request ? locks.request(DEVICE_WORKOUTS_KEY, async () => work()) : work();
  };
  return {
    scope: 'device', uid: null, assertScope, list,
    subscribe(next, failed) {
      let active = true;
      const refresh = () => { list().then(items => { if (active) next(items); }, value => { if (active) failed(value); }); };
      const changed = event => { if (event.type === DEVICE_EVENT || event.key === DEVICE_WORKOUTS_KEY || event.key === null) refresh(); };
      events?.addEventListener('storage', changed); events?.addEventListener(DEVICE_EVENT, changed); refresh();
      return () => { active = false; events?.removeEventListener('storage', changed); events?.removeEventListener(DEVICE_EVENT, changed); };
    },
    async create({ name, snapshot }) {
      const cleanName = workoutName(name), payload = workoutPayload(snapshot);
      return mutate(records => {
        if (records.some(record => normalizedWorkoutName(record.name) === normalizedWorkoutName(cleanName))) error('DUPLICATE_WORKOUT_NAME');
        const now = clock(), document = { v: 1, name: cleanName, payload, revision: 1, createdAt: now, updatedAt: now }, workoutId = id();
        if (records.some(record => record.id === workoutId)) error('WORKOUT_CHANGED');
        const item = readSavedWorkout(workoutId, document);
        records.push({ id: workoutId, ...document });
        return item;
      });
    },
    async rename(workoutId, name, revision) {
      const cleanName = workoutName(name);
      return mutate(records => {
        const record = records.find(item => item.id === workoutId);
        if (!record) error('WORKOUT_NOT_FOUND');
        checkRevision(record, revision);
        if (records.some(item => item.id !== workoutId && normalizedWorkoutName(item.name) === normalizedWorkoutName(cleanName))) error('DUPLICATE_WORKOUT_NAME');
        record.name = cleanName; record.revision++; record.updatedAt = Math.max(record.updatedAt, clock());
        const { id, ...document } = record;
        return readSavedWorkout(id, document);
      });
    },
    async remove(workoutId, revision) {
      return mutate(records => {
        const index = records.findIndex(item => item.id === workoutId);
        if (index < 0) error('WORKOUT_NOT_FOUND');
        checkRevision(records[index], revision); records.splice(index, 1);
      });
    },
  };
}

const timestamp = value => {
  const milliseconds = value?.toMillis?.();
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) error('INVALID_SAVED_WORKOUT');
  return milliseconds;
};
const parseCloud = (id, value) => readSavedWorkout(id, { ...value, createdAt: timestamp(value.createdAt), updatedAt: timestamp(value.updatedAt) });
const validIndex = (value, id) => value && value.v === 1 && value.workoutId === id
  && Object.keys(value).length === 2 && Object.hasOwn(value, 'workoutId');

/** Every operation and transaction retry rechecks the captured account. */
export function createAccountWorkoutRepository(uid, { identity = () => auth.currentUser,
  transaction = work => runTransaction(db, work), document = userDoc, collection = userCollection,
  allocate = () => doc(collection(uid, 'workoutTemplates')).id, now = serverTimestamp,
  subscribe = onSnapshot, nameKey = workoutNameKey } = {}) {
  const assertScope = () => {
    if (typeof uid !== 'string' || !uid || identity()?.uid !== uid) error('WORKOUT_AUTH_CHANGED');
  };
  const ref = id => document(uid, 'workoutTemplates', id);
  const indexRef = key => document(uid, 'workoutNames', key);
  const locked = async operation => { assertScope(); const result = await operation(); assertScope(); return result; };
  return {
    scope: 'account', uid, assertScope,
    subscribe(next, failed) {
      try {
        assertScope();
        return subscribe(collection(uid, 'workoutTemplates'), snapshot => {
          try { assertScope(); if (snapshot.metadata?.hasPendingWrites) return; next(sorted(snapshot.docs.map(item => parseCloud(item.id, item.data())))); }
          catch (value) { failed(value); }
        }, failed);
      } catch (value) { queueMicrotask(() => failed(value)); return () => {}; }
    },
    async create({ name, snapshot }) {
      assertScope();
      const cleanName = workoutName(name), payload = workoutPayload(snapshot), key = await nameKey(cleanName), id = allocate();
      return locked(() => transaction(async tx => {
        assertScope();
        const lock = await tx.get(indexRef(key));
        if (lock.exists()) error('DUPLICATE_WORKOUT_NAME');
        assertScope();
        tx.set(ref(id), { v: 1, name: cleanName, payload, revision: 1, createdAt: now(), updatedAt: now() });
        tx.set(indexRef(key), { v: 1, workoutId: id });
        return { id, name: cleanName, snapshot: JSON.parse(payload), revision: 1 };
      }));
    },
    async rename(id, name, revision) {
      const cleanName = workoutName(name), newKey = await nameKey(cleanName);
      return locked(() => transaction(async tx => {
        assertScope();
        const snapshot = await tx.get(ref(id));
        if (!snapshot.exists()) error('WORKOUT_NOT_FOUND');
        const item = parseCloud(id, snapshot.data()); checkRevision(item, revision);
        const oldKey = await nameKey(item.name), oldRef = indexRef(oldKey), newRef = indexRef(newKey);
        const oldLock = await tx.get(oldRef), newLock = oldKey === newKey ? oldLock : await tx.get(newRef);
        if (!oldLock.exists() || !validIndex(oldLock.data(), id)) error('WORKOUT_CHANGED');
        if (newLock.exists() && (oldKey !== newKey || !validIndex(newLock.data(), id))) error('DUPLICATE_WORKOUT_NAME');
        assertScope();
        tx.update(ref(id), { name: cleanName, revision: item.revision + 1, updatedAt: now() });
        if (oldKey !== newKey) { tx.delete(oldRef); tx.set(newRef, { v: 1, workoutId: id }); }
        return { ...item, name: cleanName, revision: item.revision + 1 };
      }));
    },
    async remove(id, revision) {
      return locked(() => transaction(async tx => {
        assertScope();
        const snapshot = await tx.get(ref(id));
        if (!snapshot.exists()) error('WORKOUT_NOT_FOUND');
        const item = parseCloud(id, snapshot.data()); checkRevision(item, revision);
        const key = await nameKey(item.name), lock = await tx.get(indexRef(key));
        if (!lock.exists() || !validIndex(lock.data(), id)) error('WORKOUT_CHANGED');
        assertScope(); tx.delete(ref(id)); tx.delete(indexRef(key));
      }));
    },
  };
}

export const createWorkoutRepository = uid => uid ? createAccountWorkoutRepository(uid) : createDeviceWorkoutRepository();

/** Capture only validated templates, never a guest-provided name reservation. */
export function captureWorkoutTemplate(sourceUid, id, value) {
  const item = parseCloud(id, value);
  return { group: 'workoutTemplates', id, sourceUid, data: { v: 1, name: item.name, payload: workoutPayload(item.snapshot),
    revision: item.revision, createdAt: item.createdAt, updatedAt: item.updatedAt } };
}

const migrationId = async (sourceUid, id) => {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`workout-import:${sourceUid}/${id}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 20);
};

/** Existing-account migration is repeatable and never overwrites a name or id. */
export async function importSavedWorkoutTemplates(uid, records, { identity = () => auth.currentUser,
  transaction = work => runTransaction(db, work), document = userDoc, now = serverTimestamp } = {}) {
  const assertScope = () => { if (!uid || identity()?.uid !== uid) error('WORKOUT_AUTH_CHANGED'); };
  assertScope();
  if (!Array.isArray(records)) error('INVALID_IMPORT');
  const clean = records.map(record => {
    if (record?.group !== 'workoutTemplates' || typeof record.sourceUid !== 'string' || !record.sourceUid
      || record.sourceUid.length > 128 || record.sourceUid.includes('/')) error('INVALID_IMPORT');
    return { ...readSavedWorkout(record.id, record.data), sourceUid: record.sourceUid };
  });
  const imported = [], skipped = [];
  for (const source of clean) {
    const id = await migrationId(source.sourceUid, source.id), payload = workoutPayload(source.snapshot);
    const result = await transaction(async tx => {
      assertScope();
      const ref = document(uid, 'workoutTemplates', id), prior = await tx.get(ref);
      if (prior.exists()) {
        const existing = parseCloud(id, prior.data());
        if (workoutPayload(existing.snapshot) !== payload) error('WORKOUT_IMPORT_CONFLICT');
        const reservation = await tx.get(document(uid, 'workoutNames', await workoutNameKey(existing.name)));
        if (!reservation.exists() || !validIndex(reservation.data(), id)) error('WORKOUT_CHANGED');
        assertScope(); return { id, name: existing.name, previousName: source.name, skipped: true };
      }
      for (let suffix = 1; suffix <= 100; suffix++) {
        const ending = suffix === 1 ? '' : ` (${suffix})`;
        const name = workoutName(Array.from(source.name).slice(0, 40 - ending.length).join('') + ending);
        const index = document(uid, 'workoutNames', await workoutNameKey(name)), reserved = await tx.get(index);
        if (reserved.exists()) continue;
        assertScope();
        tx.set(ref, { v: 1, name, payload, revision: 1, createdAt: now(), updatedAt: now() });
        tx.set(index, { v: 1, workoutId: id });
        return { id, name, previousName: source.name, renamed: name !== source.name, skipped: false };
      }
      error('DUPLICATE_WORKOUT_NAME');
    });
    assertScope();
    (result.skipped ? skipped : imported).push(result);
  }
  return { imported, skipped };
}
