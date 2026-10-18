import { useEffect, useState } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { dateForWeekDay } from '../domain/dates.js';
import { assembleDateSessions, dateSessionQueries } from '../services/periodRepository.js';

const empty = () => ({ sessionsByDate: {}, loaded: false, error: null });
export function useDateSessions(uid, week) {
  const [state, setState] = useState(() => ({ ...empty(), uid: null, week: null }));
  useEffect(() => {
    if (!uid || !dateForWeekDay(week)) return;
    let active = true;
    const snapshots = {};
    const bounds = dateSessionQueries(uid, dateForWeekDay(week), dateForWeekDay(week, 7));
    const unsubscribe = Object.entries(bounds).map(([field, source]) => onSnapshot(source, snapshot => {
      if (!active) return;
      snapshots[field] = Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]));
      if (!snapshots.sessions || !snapshots.doses) return;
      try {
        const sessionsByDate = assembleDateSessions(snapshots.sessions, snapshots.doses);
        setState({ uid, week, sessionsByDate, loaded: true, error: null });
      } catch (error) {
        // Keep native dates reserved during separate listener deliveries. The
        // consumer sees an explicit error and never executes a legacy session.
        setState({ uid, week, sessionsByDate: Object.fromEntries(Object.keys(snapshots.sessions).map(date => [date, null])), loaded: false, error });
      }
    }, error => { if (active) setState({ uid, week, ...empty(), error }); }));
    return () => { active = false; unsubscribe.forEach(stop => stop()); };
  }, [uid, week]);
  return state.uid === uid && state.week === week ? state : empty();
}
