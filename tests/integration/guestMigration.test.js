import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAuthProvider, signInAnonymously, signInWithCredential, signOut } from 'firebase/auth';
import { getDoc, setDoc } from 'firebase/firestore';
import { auth } from '../../src/services/firebase.js';
import { captureGuestData, importGuestData, userDoc } from '../../src/services/repository.js';
import { createGuestMigration } from '../../src/services/guestMigration.js';
if (process.env.NODE_ENV !== 'test' || process.env.VITE_USE_FIREBASE_EMULATORS !== 'true' || process.env.VITE_FIREBASE_PROJECT_ID !== 'demo-fitness-planner') throw new Error('This test requires the demo-fitness-planner Auth/Firestore emulators; run through scripts/integration.mjs.');

const values = new Map();
const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
const subject = `migration-recovery-${Date.now()}`;
const credential = value => GoogleAuthProvider.credential(JSON.stringify({ sub: value, email: `${value}@example.test` }));
after(async () => { await signOut(auth); });

test('emulator: durable pre-switch backup recovers under exact Google account; interrupted/repeated import preserves target data', async () => {
  const target = (await signInWithCredential(auth, credential(subject))).user;
  await setDoc(userDoc(target.uid, 'metrics', '2026-10-20'), { date: '2026-10-20', weight: 80 });
  await signOut(auth);
  const guest = (await signInAnonymously(auth)).user;
  await setDoc(userDoc(guest.uid, 'metrics', '2026-10-20'), { date: '2026-10-20', weight: 70 });
  await setDoc(userDoc(guest.uid, 'metrics', '2026-10-21'), { date: '2026-10-21', weight: 71 });
  const options = { storage, currentUser: () => auth.currentUser, capture: captureGuestData, importRecords: importGuestData };
  await createGuestMigration(options).prepare(guest.uid, subject);
  assert.equal(values.size, 1, 'backup exists while still guest, before UID switch');
  // Simulate process interruption between backup and credential signin, then a different login.
  await signInWithCredential(auth, credential(`${subject}-wrong`));
  assert.equal(createGuestMigration(options).pending(auth.currentUser).length, 0);
  assert.equal((await getDoc(userDoc(auth.currentUser.uid, 'metrics', '2026-10-21'))).exists(), false);
  await signInWithCredential(auth, credential(subject));
  const recovered = createGuestMigration(options).pending(auth.currentUser)[0];
  const interrupted = createGuestMigration({ ...options, importRecords: async (uid, records) => { await importGuestData(uid, records); throw new Error('killed-after-commit'); } });
  await assert.rejects(interrupted.finish(recovered, auth.currentUser), /killed-after-commit/);
  assert.equal(values.size, 1);
  const resumed = createGuestMigration(options);
  await resumed.finish(resumed.pending(auth.currentUser)[0], auth.currentUser);
  assert.equal((await getDoc(userDoc(target.uid, 'metrics', '2026-10-20'))).data().weight, 80);
  assert.equal((await getDoc(userDoc(target.uid, 'metrics', '2026-10-21'))).data().weight, 71);
  assert.equal(values.size, 0);
});
