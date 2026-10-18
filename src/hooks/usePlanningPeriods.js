import { useEffect, useState } from 'react';
import { limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { userCollection } from '../services/repository.js';
import { enumeratePeriodDates } from '../domain/periodPlanning.js';
import { normalizeWeeklyIntent } from '../domain/trainingPreferences.js';

export function usePlanningPeriods(uid) {
  const [state, setState] = useState({ uid: null, periods: [], loaded: false, error: null });
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(query(userCollection(uid, 'planningPeriods'), orderBy('createdAt', 'desc'), limit(24)), snapshot => {
      const periods = snapshot.docs.flatMap(doc => {
        const value = doc.data();
        try {
          enumeratePeriodDates({ from: value.from, to: value.to });
          const intent = normalizeWeeklyIntent(value.weeklyIntent);
          return [{ periodId: doc.id, range: { from: value.from, to: value.to }, conclusion: typeof value.conclusion === 'string' ? value.conclusion : '',
            profile: intent ? { focus: intent.focus, time: String(intent.dailyTime), context: intent } : undefined, createdAt: value.createdAt?.toMillis?.() || 0 }];
        } catch { return []; }
      });
      setState({ uid, periods, loaded: true, error: null });
    }, error => setState({ uid, periods: [], loaded: false, error }));
  }, [uid]);
  return state.uid === uid ? state : { periods: [], loaded: !uid, error: null };
}
