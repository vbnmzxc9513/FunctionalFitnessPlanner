import { useEffect, useState } from 'react';
import { GoogleAuthProvider, linkWithPopup, onAuthStateChanged, signInAnonymously, signInWithCredential, signInWithCustomToken, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from '../services/firebase.js';
import { captureGuestData, importGuestData } from '../services/repository.js';

const migrationKey = uid => `guest_migration_${uid}`;

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [migrationPending, setMigrationPending] = useState(false);
  useEffect(() => onAuthStateChanged(auth, current => {
    setUser(current);
    setMigrationPending(!!current && !!sessionStorage.getItem(migrationKey(current.uid)));
    if (!current && globalThis.__initial_auth_token) {
      signInWithCustomToken(auth, globalThis.__initial_auth_token).catch(() => setError('toastLoginFail')).finally(() => setLoading(false));
    } else setLoading(false);
  }, () => { setError('toastLoginFail'); setLoading(false); }), []);

  const run = async action => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await action(); } catch (err) { console.error('Authentication failed', err.code); setError('toastLoginFail'); }
    finally { setBusy(false); }
  };

  const finishMigration = async (uid, records) => {
    // Retain a browser-session backup if a network interruption occurs after sign-in.
    sessionStorage.setItem(migrationKey(uid), JSON.stringify(records));
    setMigrationPending(true);
    try {
      await importGuestData(uid, records);
      sessionStorage.removeItem(migrationKey(uid));
      setMigrationPending(false);
    } catch {
      setError('migrationFailed');
    }
  };

  const googleLogin = () => run(async () => {
    const provider = new GoogleAuthProvider();
    if (!auth.currentUser?.isAnonymous) { await signInWithPopup(auth, provider); return; }
    try {
      // Linking a new Google account keeps the anonymous UID and all its records.
      const result = await linkWithPopup(auth.currentUser, provider);
      setUser(result.user);
    } catch (err) {
      if (err.code !== 'auth/credential-already-in-use') throw err;
      const credential = GoogleAuthProvider.credentialFromError(err);
      if (!credential) throw err;
      const records = await captureGuestData(auth.currentUser.uid);
      const result = await signInWithCredential(auth, credential);
      await finishMigration(result.user.uid, records);
    }
  });

  const retryMigration = () => run(async () => {
    const current = auth.currentUser;
    if (!current) return;
    const records = JSON.parse(sessionStorage.getItem(migrationKey(current.uid)) || '[]');
    await finishMigration(current.uid, records);
  });
  return { user, loading, busy, error, migrationPending, googleLogin, retryMigration,
    guestLogin: () => run(() => signInAnonymously(auth)), logout: () => run(() => signOut(auth)) };
}
