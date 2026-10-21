import { useEffect, useRef, useState } from 'react';
import { GoogleAuthProvider, linkWithPopup, onAuthStateChanged, signInAnonymously, signInWithCredential, signInWithCustomToken, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '../services/firebase.js';
import { captureGuestData, importGuestData } from '../services/repository.js';

import { createGuestMigration, credentialGoogleSubject } from '../services/guestMigration.js';

const migration = createGuestMigration({ storage: { get length() { return localStorage.length; }, key: index => localStorage.key(index), getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value), removeItem: key => localStorage.removeItem(key) }, legacyStorage: { getItem: key => sessionStorage.getItem(key), removeItem: key => sessionStorage.removeItem(key) }, currentUser: () => auth.currentUser, capture: captureGuestData, importRecords: importGuestData });

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [migrationPending, setMigrationPending] = useState(false);
  const [migrationSummary, setMigrationSummary] = useState(null);
  useEffect(() => onAuthStateChanged(auth, current => {
    setUser(current);
    setMigrationPending(migration.pending(current).length > 0);
    if (!current && globalThis.__initial_auth_token) {
      signInWithCustomToken(auth, globalThis.__initial_auth_token).catch(() => setError('toastLoginFail')).finally(() => setLoading(false));
    } else setLoading(false);
  }, () => { setError('toastLoginFail'); setLoading(false); }), []);

  const run = async action => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    setError('');
    try { await action(); } catch (err) { console.error('Authentication failed', err.code); setError('toastLoginFail'); }
    finally { busyRef.current = false; setBusy(false); }
  };

  const finishMigration = async (value, current) => {
    try {
      const result = await migration.finish(value, current);
      if (auth.currentUser?.uid === current.uid) setMigrationSummary({ uid: current.uid, renamed: [...(result?.workouts?.imported || []), ...(result?.workouts?.skipped || [])].filter(item => item.renamed || item.previousName !== item.name) });
    } catch {
      setError('migrationFailed');
    } finally { setMigrationPending(migration.pending(auth.currentUser).length > 0); }
  };

  const googleLogin = () => run(async () => {
    const provider = new GoogleAuthProvider();
    if (!auth.currentUser?.isAnonymous) { await signInWithPopup(auth, provider); return; }
    const guest = auth.currentUser;
    try {
      // Linking a new Google account keeps the anonymous UID and all its records.
      const result = await linkWithPopup(auth.currentUser, provider);
      setUser(result.user);
    } catch (err) {
      if (err.code !== 'auth/credential-already-in-use') throw err;
      const credential = GoogleAuthProvider.credentialFromError(err);
      if (!credential) throw err;
      const backup = await migration.prepare(guest.uid, credentialGoogleSubject(credential));
      // Durable storage succeeded before the only operation that switches UID.
      if (auth.currentUser?.uid !== guest.uid) throw new Error('SESSION_CHANGED');
      const result = await signInWithCredential(auth, credential);
      await finishMigration(backup, result.user);
    }
  });

  const retryMigration = () => run(async () => {
    const current = auth.currentUser;
    for (const backup of migration.pending(current)) await finishMigration(backup, current);
  });
  return { user, loading, busy, error, migrationPending, migrationRenames: migrationSummary && migrationSummary.uid === user?.uid ? migrationSummary.renamed : [], dismissMigrationSummary: () => setMigrationSummary(null), googleLogin, retryMigration,
    guestLogin: () => run(() => signInAnonymously(auth)), logout: () => run(() => signOut(auth)) };
}
