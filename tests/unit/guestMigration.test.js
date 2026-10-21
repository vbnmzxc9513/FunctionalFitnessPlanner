import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestMigration, credentialGoogleSubject } from '../../src/services/guestMigration.js';

export function memoryStorage() {
  const values = new Map();
  return { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
const google = (uid = 'target', subject = 'google-subject') => ({ uid, isAnonymous: false, providerData: [{ providerId: 'google.com', uid: subject }] });
const guest = { uid: 'guest', isAnonymous: true };
const records = [{ group: 'metrics', id: '2026-10-20', data: { date: '2026-10-20', weight: 70 } }];
function fixture(extra = {}) {
  let user = guest;
  const storage = memoryStorage(), legacyStorage = memoryStorage(), imports = [];
  const options = { storage, legacyStorage, currentUser: () => user, capture: async () => records, importRecords: async (uid, value) => imports.push([uid, value]), ...extra };
  return { storage, legacyStorage, imports, setUser: value => { user = value; }, controller: () => createGuestMigration(options) };
}

test('credential identifier is retained without persisting tokens', () => {
  assert.equal(credentialGoogleSubject({ idToken: `header.${btoa(JSON.stringify({ sub: 'subject' }))}.signature` }), 'subject');
  assert.throws(() => credentialGoogleSubject({ accessToken: 'secret' }), /ACCOUNT_UNAVAILABLE/);
});
test('pre-switch backup survives process restart, cancellation and wrong next account', async () => {
  const f = fixture(), backup = await f.controller().prepare('guest', 'google-subject');
  assert.equal(f.storage.length, 1);
  assert.deepEqual(f.controller().pending(guest), []);
  assert.deepEqual(f.controller().pending(google('wrong', 'other-subject')), []);
  assert.deepEqual(f.controller().pending(null), []);
  assert.equal(f.imports.length, 0);
  f.setUser(google());
  const recovered = f.controller().pending(google());
  assert.equal(recovered.length, 1);
  await f.controller().finish(recovered[0], google());
  assert.deepEqual(f.imports, [['target', records]]);
  assert.equal(f.storage.length, 0);
  assert.equal(backup.targetUid, null);
});
test('storage/capture failures stop the switch before any import; a changed guest session cannot prepare', async () => {
  const broken = fixture({ storage: { getItem: () => null, setItem: () => { throw new Error('quota'); } } });
  await assert.rejects(broken.controller().prepare('guest', 'google-subject'), /quota/);
  const f = fixture(); f.setUser(google());
  await assert.rejects(f.controller().prepare('guest', 'google-subject'), /SESSION_CHANGED/);
});
test('interrupted import stays bound to exact UID and retries without recapturing', async () => {
  let attempts = 0;
  const f = fixture({ importRecords: async () => { if (++attempts === 1) throw new Error('offline'); } });
  const backup = await f.controller().prepare('guest', 'google-subject');
  f.setUser(google());
  await assert.rejects(f.controller().finish(backup, google()), /offline/);
  assert.equal(f.controller().pending(google('different-uid')).length, 0);
  assert.equal(f.controller().pending(google()).length, 1);
  await f.controller().finish(f.controller().pending(google())[0], google());
  assert.equal(attempts, 2); assert.equal(f.storage.length, 0);
});
test('auth change before and during import preserves backup and cannot import under another UID', async () => {
  let release;
  const f = fixture({ importRecords: () => new Promise(resolve => { release = resolve; }) });
  const backup = await f.controller().prepare('guest', 'google-subject');
  f.setUser(google('wrong', 'other'));
  await assert.rejects(f.controller().finish(backup, google()), /SESSION_CHANGED/);
  f.setUser(google());
  const finishing = f.controller().finish(backup, google());
  f.setUser(google('wrong', 'other')); release();
  await assert.rejects(finishing, /SESSION_CHANGED/);
  assert.equal(f.storage.length, 1);
});
test('legacy session backup upgrades only for its exact authenticated Google target and survives failures', async () => {
  const f = fixture();
  f.legacyStorage.setItem('guest_migration_target', JSON.stringify(records));
  assert.equal(f.controller().pending(google('other')).length, 0);
  assert.equal(f.controller().pending({ uid: 'target', isAnonymous: false, providerData: [] }).length, 0);
  f.setUser(google());
  assert.equal(f.controller().pending(google()).length, 1);
  assert.equal(f.storage.length, 1);
  assert.ok(f.legacyStorage.getItem('guest_migration_target'));
  await f.controller().finish(f.controller().pending(google())[0], google());
  assert.equal(f.legacyStorage.length, 0); assert.equal(f.storage.length, 0);
});
