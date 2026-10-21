// Recovery records contain application data and the Google account subject, never OAuth credentials.
export const GUEST_MIGRATION_PREFIX = 'fitness_guest_migration_v1_';
const googleSubject = user => !user?.isAnonymous && user?.providerData?.find(item => item.providerId === 'google.com')?.uid;
const sessionChanged = () => { throw new Error('SESSION_CHANGED'); };

export function credentialGoogleSubject(credential) {
  try {
    const encoded = credential?.idToken?.split('.')[1];
    const value = JSON.parse(globalThis.atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof value.sub === 'string' && value.sub) return value.sub;
  } catch { /* Without an account identifier we cannot safely recover a UID switch. */ }
  throw new Error('MIGRATION_ACCOUNT_UNAVAILABLE');
}

export function createGuestMigration({ storage, legacyStorage, currentUser, capture, importRecords }) {
  const key = sourceUid => `${GUEST_MIGRATION_PREFIX}${sourceUid}`;
  const read = sourceUid => {
    try {
      const value = JSON.parse(storage.getItem(key(sourceUid)) || 'null');
      return value?.v === 1 && value.sourceUid === sourceUid && typeof value.googleSubject === 'string'
        && Array.isArray(value.records) && (value.targetUid === null || typeof value.targetUid === 'string') ? value : null;
    } catch { return null; }
  };
  const write = value => {
    const serialized = JSON.stringify(value);
    storage.setItem(key(value.sourceUid), serialized);
    if (storage.getItem(key(value.sourceUid)) !== serialized) throw new Error('MIGRATION_STORAGE_UNAVAILABLE');
    return value;
  };
  const matches = (value, user) => !!googleSubject(user) && googleSubject(user) === value.googleSubject
    && (!value.targetUid || value.targetUid === user.uid) && value.sourceUid !== user.uid;
  const pending = user => {
    const values = [];
    // Older versions already bound their session backup to the destination UID.
    // Upgrade it only while that exact Google-authenticated UID is active.
    if (googleSubject(user) && legacyStorage) {
      const sourceUid = `legacy:${user.uid}`;
      try {
        const records = JSON.parse(legacyStorage.getItem(`guest_migration_${user.uid}`) || 'null');
        if (Array.isArray(records) && !read(sourceUid)) {
          const legacy = { v: 1, sourceUid, googleSubject: googleSubject(user), targetUid: user.uid, records };
          try { write(legacy); } catch { values.push(legacy); }
        }
      } catch { /* Preserve the legacy session backup if durable storage fails. */ }
    }
    try {
      for (let index = 0; index < storage.length; index++) {
        const name = storage.key(index);
        if (!name?.startsWith(GUEST_MIGRATION_PREFIX)) continue;
        const value = read(name.slice(GUEST_MIGRATION_PREFIX.length));
        if (value && matches(value, user)) values.push(value);
      }
    } catch { /* Storage unavailable: no unsafe fallback to another account. */ }
    return values;
  };
  return {
    pending,
    async prepare(sourceUid, subject) {
      if (currentUser()?.uid !== sourceUid || !currentUser()?.isAnonymous || !subject) sessionChanged();
      const existing = read(sourceUid);
      if (existing && existing.googleSubject !== subject) throw new Error('MIGRATION_ALREADY_PENDING');
      const records = await capture(sourceUid);
      if (currentUser()?.uid !== sourceUid || !currentUser()?.isAnonymous) sessionChanged();
      return write({ v: 1, sourceUid, googleSubject: subject, targetUid: null, records });
    },
    async finish(value, verifiedUser) {
      if (currentUser()?.uid !== verifiedUser?.uid || !matches(value, verifiedUser)) sessionChanged();
      const latest = read(value.sourceUid);
      if (latest && JSON.stringify(latest) !== JSON.stringify(value)) throw new Error('MIGRATION_CHANGED');
      // Bind only after Firebase returns a verified user. A resumed unbound backup must
      // match the verified provider subject before it can ever acquire a target UID.
      const bound = write({ ...value, targetUid: verifiedUser.uid });
      const result = await importRecords(verifiedUser.uid, bound.records);
      if (currentUser()?.uid !== verifiedUser.uid) sessionChanged();
      // A different tab may have replaced the recovery record; never erase its backup.
      if (storage.getItem(key(bound.sourceUid)) === JSON.stringify(bound)) {
        storage.removeItem(key(bound.sourceUid));
        if (bound.sourceUid === `legacy:${verifiedUser.uid}`) legacyStorage?.removeItem(`guest_migration_${verifiedUser.uid}`);
      }
      return result;
    },
  };
}
