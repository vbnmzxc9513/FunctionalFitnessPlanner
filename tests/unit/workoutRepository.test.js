import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountWorkoutRepository, createDeviceWorkoutRepository, DEVICE_WORKOUTS_KEY } from '../../src/services/workoutRepository.js';
import { createWorkoutSnapshot } from '../../src/domain/savedWorkouts.js';

const empty = createWorkoutSnapshot({ routine: [] });
const memory = () => { const values = new Map(); return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; };

test('device collection truly persists across repository instances, renames with stable id, and rejects normalized duplicates', async () => {
  const storage = memory(); let sequence = 0;
  const options = { storage: () => storage, identity: () => null, clock: () => 100, id: () => `workout${++sequence}` };
  const first = createDeviceWorkoutRepository(options);
  const saved = await first.create({ name: 'Ａ  Workout', snapshot: empty });
  const second = createDeviceWorkoutRepository(options);
  assert.equal((await second.list())[0].id, saved.id);
  await assert.rejects(second.create({ name: 'a workout', snapshot: empty }), /DUPLICATE_WORKOUT_NAME/);
  const other = await first.create({ name: 'Other', snapshot: empty });
  await assert.rejects(first.rename(saved.id, 'OTHER', saved.revision), /DUPLICATE_WORKOUT_NAME/);
  const renamed = await second.rename(saved.id, 'Changed', saved.revision);
  assert.equal(renamed.id, saved.id); assert.equal(renamed.revision, 2);
  await assert.rejects(first.remove(saved.id, 1), /WORKOUT_CHANGED/);
  await second.remove(saved.id, 2);
  assert.deepEqual((await first.list()).map(item => item.id), [other.id]);
});

test('device storage failures never resolve as success and corrupt storage is not reset or overwritten', async () => {
  const storage = memory(), repository = createDeviceWorkoutRepository({ storage: () => storage, identity: () => null });
  storage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(repository.create({ name: 'Failed', snapshot: empty }), /WORKOUT_STORAGE_FAILED/);
  assert.deepEqual(await repository.list(), []);
  storage.values.set(DEVICE_WORKOUTS_KEY, '{broken');
  await assert.rejects(repository.list(), /INVALID_SAVED_WORKOUT/);
  await assert.rejects(repository.create({ name: 'Must not overwrite', snapshot: empty }), /INVALID_SAVED_WORKOUT/);
  assert.equal(storage.values.get(DEVICE_WORKOUTS_KEY), '{broken');
  await assert.rejects(createDeviceWorkoutRepository({ storage: () => { throw Error('blocked'); }, identity: () => null }).list(), /WORKOUT_STORAGE_FAILED/);
});

test('device operations captured before account login cannot write into the device collection afterward', async () => {
  let identity = null;
  let waiting;
  const storage = memory(), repository = createDeviceWorkoutRepository({ storage: () => storage, identity: () => identity,
    locks: { request: (_name, work) => new Promise((resolve, reject) => { waiting = () => { try { resolve(work()); } catch (error) { reject(error); } }; }) } });
  const pending = repository.create({ name: 'Old device action', snapshot: empty });
  identity = { uid: 'account-b', isAnonymous: false }; waiting();
  await assert.rejects(pending, /WORKOUT_AUTH_CHANGED/); assert.equal(storage.values.size, 0);
});

function cloud() {
  const documents = new Map(); let user = { uid: 'a', isAnonymous: false }, sequence = 0;
  const make = uid => createAccountWorkoutRepository(uid, {
    identity: () => user, document: (owner, group, id) => `${owner}/${group}/${id}`, collection: (owner, group) => `${owner}/${group}`,
    allocate: () => `workout${++sequence}`, now: () => ({ toMillis: () => 100 }),
    transaction: async action => {
      const writes = [];
      const result = await action({
        get: async ref => ({ exists: () => documents.has(ref), data: () => documents.get(ref) }),
        set: (ref, value) => writes.push(() => documents.set(ref, value)),
        update: (ref, value) => writes.push(() => documents.set(ref, { ...documents.get(ref), ...value })),
        delete: ref => writes.push(() => documents.delete(ref)),
      });
      writes.forEach(write => write()); return result;
    },
    subscribe: (path, next) => { next({ docs: [...documents].filter(([key]) => key.startsWith(path + '/')).map(([key, value]) => ({ id: key.split('/').at(-1), data: () => value })) }); return () => {}; },
  });
  return { documents, make, login: value => { user = value; } };
}

test('account name reservations reject another client duplicate; rename/delete are transactional with stable id and immutable payload', async () => {
  const data = cloud(), first = data.make('a'), second = data.make('a');
  const saved = await first.create({ name: 'Workout', snapshot: empty });
  await assert.rejects(second.create({ name: 'WORKOUT', snapshot: empty }), /DUPLICATE_WORKOUT_NAME/);
  const original = data.documents.get(`a/workoutTemplates/${saved.id}`);
  const renamed = await second.rename(saved.id, 'Changed', 1);
  assert.equal(renamed.id, saved.id); assert.equal(renamed.revision, 2);
  const document = data.documents.get(`a/workoutTemplates/${saved.id}`);
  assert.equal(document.payload, original.payload); assert.equal(document.createdAt, original.createdAt);
  assert.equal([...data.documents.keys()].filter(key => key.includes('/workoutNames/')).length, 1);
  await assert.rejects(first.rename(saved.id, 'Stale', 1), /WORKOUT_CHANGED/);
  await first.remove(saved.id, 2); assert.equal(data.documents.size, 0);
  assert.ok(await second.create({ name: 'Changed', snapshot: empty }), 'deleted name can be reused');
});

test('account data is isolated by owner and stale operations reject after logout or switching uid', async () => {
  const data = cloud(), a = data.make('a');
  const saved = await a.create({ name: 'Private A', snapshot: empty });
  data.login({ uid: 'b', isAnonymous: false });
  await assert.rejects(a.rename(saved.id, 'Must not rename A', 1), /WORKOUT_AUTH_CHANGED/);
  const b = data.make('b'); let rows;
  b.subscribe(items => { rows = items; }, error => { throw error; }); assert.deepEqual(rows, []);
  await b.create({ name: 'Private A', snapshot: empty });
  assert.equal([...data.documents.keys()].filter(key => key.includes('/workoutTemplates/')).length, 2);
  data.login(null); await assert.rejects(b.remove(saved.id, 1), /WORKOUT_AUTH_CHANGED/);
  data.login({ uid: 'a', isAnonymous: true });
  const guestSaved = await a.create({ name: 'Anonymous owner', snapshot: empty });
  assert.ok(data.documents.has(`a/workoutTemplates/${guestSaved.id}`), 'signed-in anonymous owners use their own cloud scope');
});

test('account reads reject malformed persisted payloads instead of showing partially sanitized data', async () => {
  const data = cloud(), repository = data.make('a');
  const saved = await repository.create({ name: 'Workout', snapshot: empty });
  data.documents.get(`a/workoutTemplates/${saved.id}`).payload = '{"v":1,"healthNotes":"secret"}';
  let failure;
  repository.subscribe(() => assert.fail('must not deliver invalid records'), error => { failure = error; });
  assert.match(failure.message, /INVALID_SAVED_WORKOUT/);
});
