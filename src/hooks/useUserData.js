import { useEffect, useState } from 'react';
import { documentId, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { userCollection, userDoc, weekHistoryQuery, weekHistoryStart } from '../services/repository.js';
import { getWeekString } from '../domain/dates.js';

export function useUserData(uid, weeks = 104, measurements = 365, currentWeek = getWeekString()) {
  const [data, setData] = useState({ progress: {}, plans: {}, metrics: [], exercises: {}, difficultyLevel: 1, loaded: {} });
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!uid) return;
    let active = true;
    const failed = err => { if (active) { console.error('Cloud subscription failed:', err.code, err.message); setError(err); } };
    const update = partial => { if (active) setData(prev => ({ ...prev, ...partial, loaded: { ...prev.loaded, ...Object.fromEntries(Object.keys(partial).map(key => [key, true])) } })); };
    const snapshots = (source, field, transform) => onSnapshot(
      source,
      snapshot => update({ [field]: transform(snapshot) }), failed,
    );
    const map = snapshot => Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]));
    const unsubscribes = [
      snapshots(weekHistoryQuery(uid, 'progress', weeks, currentWeek), 'progress', map),
      snapshots(weekHistoryQuery(uid, 'plans', weeks, currentWeek), 'plans', map),
      snapshots(query(userCollection(uid, 'progress'), orderBy(documentId()), limit(1)), 'oldestWeek', snapshot => snapshot.docs[0]?.id || ''),
      snapshots(query(userCollection(uid, 'metrics'), orderBy('date', 'desc'), limit(measurements)), 'metrics', snapshot => snapshot.docs.map(item => ({ ...item.data(), id: item.id })).sort((a, b) => a.id.localeCompare(b.id))),
      onSnapshot(userDoc(uid, 'profile', 'settings'), snapshot => update({ difficultyLevel: snapshot.data()?.difficultyLevel ?? 1 }), failed),
      onSnapshot(userDoc(uid, 'exercises', 'custom'), snapshot => update({ exercises: snapshot.data()?.exercises || {} }), failed),
    ];
    return () => { active = false; unsubscribes.forEach(unsubscribe => unsubscribe()); };
  }, [uid, weeks, measurements, currentWeek]);
  return { ...data, error, hasMoreProgress: !!data.oldestWeek && data.oldestWeek < weekHistoryStart(currentWeek, weeks) };
}
