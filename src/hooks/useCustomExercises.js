import { useEffect, useMemo, useState } from 'react';
import { setDoc } from 'firebase/firestore';
import { EXERCISES_I18N } from '../locale.js';
import { auth } from '../services/firebase.js';
import { userDoc } from '../services/repository.js';
import { createCustomExercise, customExerciseForStorage, hydrateCustomExercise, readDeviceExercises, writeDeviceExercise, DEVICE_EXERCISES_KEY } from '../domain/customExercises.js';

export function useCustomExercises({ user, cloudExercises, lang, t, showToast, operation }) {
  const [adding, setAdding] = useState(false);
  const [deviceCustom, setDeviceCustom] = useState(() => {
    try { return !user ? readDeviceExercises() : {}; } catch { return {}; }
  });

  useEffect(() => {
    if (user) return;
    const changed = event => {
      if (event.key === DEVICE_EXERCISES_KEY) {
        try { setDeviceCustom(readDeviceExercises()); } catch { /* Keep usable in-memory definitions; do not overwrite corrupt storage. */ }
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [user]);

  const exercises = useMemo(() => {
    const merged = { ...EXERCISES_I18N[lang] };
    for (const [id, custom] of Object.entries(user ? cloudExercises : deviceCustom)) {
      merged[id] = { ...merged[id], ...hydrateCustomExercise(custom) };
    }
    return merged;
  }, [lang, cloudExercises, deviceCustom, user]);

  const addExercise = async input => {
    if (adding) throw new Error('CUSTOM_BUSY');
    const uid = user?.uid || null;
    if ((auth.currentUser?.uid || null) !== uid) throw new Error('SESSION_CHANGED');
    const exercise = createCustomExercise(input);
    const id = `custom_${crypto.randomUUID().replaceAll('-', '_')}`;
    setAdding(true);
    try {
      if (uid) {
        await setDoc(userDoc(uid, 'exercises', 'custom'), { exercises: { [id]: customExerciseForStorage(exercise) } }, { merge: true });
        if (auth.currentUser?.uid !== uid) throw new Error('SESSION_CHANGED');
      } else {
        const next = writeDeviceExercise(id, exercise);
        setDeviceCustom(next);
      }
      showToast(t('toastExerciseAdded'));
      return { id, exercise };
    } finally {
      setAdding(false);
    }
  };

  const organizeExercise = (id, groups) => operation(async () => {
    if (!exercises[id] || exercises[id].deleted || !Array.isArray(groups) || groups.some(group => !['warmup', 'training', 'cooldown'].includes(group))) {
      throw new Error('INVALID_LIBRARY_GROUPS');
    }
    await setDoc(userDoc(user.uid, 'exercises', 'custom'), { exercises: { [id]: { libraryGroups: [...new Set(groups)] } } }, { merge: true });
  });

  const toggleActive = id => operation(() => setDoc(
    userDoc(user.uid, 'exercises', 'custom'),
    { exercises: { [id]: { active: exercises[id].active === false } } },
    { merge: true },
  ));

  const deleteExercise = id => {
    if (!user && id.startsWith('custom_')) {
      if (window.confirm(t('confirmDeleteExercise'))) {
        try { setDeviceCustom(writeDeviceExercise(id, { ...exercises[id], deleted: true, active: false })); }
        catch { showToast(t('toastExerciseFail')); }
      }
      return;
    }
    if (window.confirm(t('confirmDeleteExercise'))) {
      operation(
        () => setDoc(userDoc(user.uid, 'exercises', 'custom'), { exercises: { [id]: { deleted: true, active: false } } }, { merge: true }),
        'toastExerciseDeleted',
      );
    }
  };

  return { exercises, adding, addExercise, organizeExercise, toggleActive, deleteExercise };
}
