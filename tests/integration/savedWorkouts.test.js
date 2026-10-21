import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { GoogleAuthProvider, signInAnonymously, signInWithCredential, signOut } from 'firebase/auth';
import { auth } from '../../src/services/firebase.js';
import { userDoc, userCollection, captureGuestData, importGuestData } from '../../src/services/repository.js';
import { createAccountWorkoutRepository } from '../../src/services/workoutRepository.js';
import { createWorkoutSnapshot, workoutNameKey } from '../../src/domain/savedWorkouts.js';
import { DEFAULT_SCHEDULE_I18N, EXERCISES_I18N } from '../../src/locale.js';

let environment, uid;
const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'demo-fitness-planner';
const snapshot = () => createWorkoutSnapshot(DEFAULT_SCHEDULE_I18N.zh[0], EXERCISES_I18N.zh);
before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  environment = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
});
beforeEach(async () => {
  await signOut(auth); uid = (await signInAnonymously(auth)).user.uid; await environment.clearFirestore();
});
after(async () => { await signOut(auth); await environment.cleanup(); });

test('anonymous account owners save cloud templates; stranger and signed-out template/name-index access is denied', async () => {
  const repository = createAccountWorkoutRepository(uid), saved = await repository.create({ name: 'Private workout', snapshot: snapshot() });
  const key = await workoutNameKey(saved.name);
  const template = userDoc(uid, 'workoutTemplates', saved.id), reservation = userDoc(uid, 'workoutNames', key);
  assert.equal((await assertSucceeds(getDoc(template))).data().revision, 1);
  assert.equal((await assertSucceeds(getDoc(reservation))).data().workoutId, saved.id);
  await assertSucceeds(getDocs(userCollection(uid, 'workoutTemplates')));
  for (const target of [template, reservation]) {
    for (const other of [environment.authenticatedContext('stranger').firestore(), environment.unauthenticatedContext().firestore()]) {
      await assertFails(getDoc(doc(other, target.path)));
      await assertFails(setDoc(doc(other, target.path), { unexpected: true }));
    }
  }
});

test('real transactions reserve normalized names across clients and keep rename/index/revision consistent', async () => {
  const first = createAccountWorkoutRepository(uid), second = createAccountWorkoutRepository(uid);
  const attempts = await Promise.allSettled([first.create({ name: 'Ａ  Workout', snapshot: snapshot() }), second.create({ name: 'a workout', snapshot: snapshot() })]);
  assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(value => value.status === 'rejected').reason.message, 'DUPLICATE_WORKOUT_NAME');
  const saved = attempts.find(value => value.status === 'fulfilled').value;
  const original = (await getDoc(userDoc(uid, 'workoutTemplates', saved.id))).data();
  await first.rename(saved.id, 'Renamed workout', 1);
  const changed = (await getDoc(userDoc(uid, 'workoutTemplates', saved.id))).data();
  assert.equal(changed.revision, 2); assert.equal(changed.payload, original.payload);
  assert.equal(changed.createdAt.toMillis(), original.createdAt.toMillis());
  assert.equal((await getDoc(userDoc(uid, 'workoutNames', await workoutNameKey(saved.name)))).exists(), false);
  assert.equal((await getDoc(userDoc(uid, 'workoutNames', await workoutNameKey(changed.name)))).data().workoutId, saved.id);
  await assert.rejects(first.remove(saved.id, 1), /WORKOUT_CHANGED/);
  await second.remove(saved.id, 2);
  assert.equal((await getDocs(userCollection(uid, 'workoutTemplates'))).size, 0);
  assert.equal((await getDocs(userCollection(uid, 'workoutNames'))).size, 0);
});

test('private rules reject extra fields, oversized payloads, changed payload/createdAt and invalid revision/index schemas', async () => {
  const saved = await createAccountWorkoutRepository(uid).create({ name: 'Workout', snapshot: snapshot() });
  const ref = userDoc(uid, 'workoutTemplates', saved.id);
  await assertFails(updateDoc(ref, { payload: '{}', revision: 2, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { name: 'Changed', revision: 3, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { private: true, revision: 2, updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(ref, { createdAt: serverTimestamp(), revision: 2, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(userDoc(uid, 'workoutTemplates', '12345678901234567890'), { v: 1, name: 'Too big', payload: 'x'.repeat(20001), revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(setDoc(userDoc(uid, 'workoutNames', 'invalid'), { v: 1, workoutId: saved.id }));
});

test('eight preparation prescriptions fit the shallow private document validation budget', async () => {
  const routine = Array.from({ length: 8 }, (_, index) => `bf_B0${index + 1}`);
  const prescriptions = routine.map(id => ({ id, phase: 'strength', sets: 2, value: '6', unit: 'reps', restSeconds: 60, perSide: true,
    preparation: { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: true, instruction: 'not retained' } }));
  const value = createWorkoutSnapshot({ routine, prescriptions }, EXERCISES_I18N.zh);
  const saved = await createAccountWorkoutRepository(uid).create({ name: 'Eight planned preparations', snapshot: value });
  assert.ok((await getDoc(userDoc(uid, 'workoutTemplates', saved.id))).exists());
});

test('guest-to-existing-Google migration renames collisions explicitly, rebuilds indexes and is safe to retry', async () => {
  const credential = GoogleAuthProvider.credential(JSON.stringify({ sub: 'saved-workouts-existing-google', email: 'workouts@example.test' }));
  const target = (await signInWithCredential(auth, credential)).user.uid;
  const targetRepository = createAccountWorkoutRepository(target), name = '課'.repeat(40);
  const original = await targetRepository.create({ name, snapshot: snapshot() });
  const originalDocument = (await getDoc(userDoc(target, 'workoutTemplates', original.id))).data();
  await signOut(auth); const guest = (await signInAnonymously(auth)).user.uid;
  const guestRepository = createAccountWorkoutRepository(guest);
  await guestRepository.create({ name, snapshot: snapshot() });
  const custom = createWorkoutSnapshot({ routine: ['custom_migration'] }, { custom_migration: { name: 'Custom exercise', type: 'lower', tip: 'PRIVATE_NOT_MIGRATED' } });
  await guestRepository.create({ name: 'Custom workout', snapshot: custom });
  const records = JSON.parse(JSON.stringify(await captureGuestData(guest)));
  assert.equal(records.filter(record => record.group === 'workoutTemplates').length, 2);
  assert.equal(records.some(record => record.group === 'workoutNames'), false);
  assert.ok(records.filter(record => record.group === 'workoutTemplates').every(record => record.sourceUid === guest && Number.isSafeInteger(record.data.createdAt)));
  await signInWithCredential(auth, credential);
  const result = await importGuestData(target, records);
  const renamed = result.workouts.imported.find(item => item.renamed);
  assert.equal(renamed.previousName, name); assert.ok(renamed.name.endsWith(' (2)')); assert.equal(Array.from(renamed.name).length, 40);
  assert.equal(result.workouts.imported.length, 2);
  const repeated = await importGuestData(target, records);
  assert.equal(repeated.workouts.imported.length, 0); assert.equal(repeated.workouts.skipped.length, 2);
  const templates = await getDocs(userCollection(target, 'workoutTemplates')), names = await getDocs(userCollection(target, 'workoutNames'));
  assert.equal(templates.size, 3); assert.equal(names.size, 3);
  assert.deepEqual((await getDoc(userDoc(target, 'workoutTemplates', original.id))).data(), originalDocument);
  for (const item of result.workouts.imported) {
    const record = (await getDoc(userDoc(target, 'workoutTemplates', item.id))).data();
    assert.equal(record.revision, 1); assert.equal(record.name, item.name);
    assert.equal((await getDoc(userDoc(target, 'workoutNames', await workoutNameKey(item.name)))).data().workoutId, item.id);
    assert.ok(!record.payload.includes('PRIVATE_NOT_MIGRATED'));
  }
  await assert.rejects(guestRepository.create({ name: 'Wrong identity', snapshot: snapshot() }), /WORKOUT_AUTH_CHANGED/);
});
