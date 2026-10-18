import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { trainingHistoryQueries } from '../services/trainingRepository.js';
import { dateForWeekDay, getWeekString } from '../domain/dates.js';
import { validateTrainingLog, validateReadiness, trainingLogId } from '../domain/coaching.js';

const empty = () => ({ logs: {}, readiness: {}, loaded: false, error: null, hasMore: false });
export function useTrainingData(uid, currentWeek = getWeekString(), weeks = 12) {
  const [state, setState] = useState(() => ({ ...empty(), uid: null, scope: '' }));
  const boundedWeeks = Math.max(1, Math.min(12, Number.isInteger(weeks) ? weeks : 12));
  const scope = `${currentWeek}/${boundedWeeks}`;
  useEffect(() => {
    if (!uid || !dateForWeekDay(currentWeek)) return;
    let active = true;
    const ready = new Set();
    const bounds = trainingHistoryQueries(uid, currentWeek, boundedWeeks);
    const unsubscribes = Object.entries(bounds).map(([field, source]) => onSnapshot(source, snapshot => {
      if (!active) return;
      const cap = boundedWeeks * (field === 'logs' ? 56 : 7);
      const records = {};
      for (const item of snapshot.docs.slice(0, cap)) {
        try {
          const record = field === 'logs' ? validateTrainingLog(item.data()) : validateReadiness(item.data());
          if ((field === 'logs' ? trainingLogId(record) : record.date) !== item.id) continue;
          records[item.id] = record;
        } catch { /* Invalid legacy/private documents never become coaching evidence. */ }
      }
      ready.add(field);
      setState(prev => ({ ...(prev.uid === uid && prev.scope === scope ? prev : empty()), uid, scope, [field]: records,
        loaded: ready.size === 2, hasMore: snapshot.size > cap || (prev.uid === uid && prev.scope === scope && prev.hasMore) }));
    }, error => { if (active) setState(prev => ({ ...(prev.uid === uid && prev.scope === scope ? prev : empty()), uid, scope, error })); }));
    return () => { active = false; unsubscribes.forEach(unsubscribe => unsubscribe()); };
  }, [uid, currentWeek, boundedWeeks, scope]);
  return state.uid === uid && state.scope === scope ? state : empty();
}
