import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createWorkoutRepository } from '../services/workoutRepository.js';
import { createWorkoutSnapshot } from '../domain/savedWorkouts.js';

/** One instance belongs in App; dialogs receive this store instead of subscribing again. */
export function useSavedWorkouts(uid) {
  const accountUid = uid || null;
  const scopeKey = accountUid ? `account:${accountUid}` : 'device';
  const repository = useMemo(() => createWorkoutRepository(accountUid), [accountUid]);
  const [state, setState] = useState({ scopeKey: null, items: [], loaded: false, error: null });
  const [pending, setPending] = useState({ scopeKey: null, count: 0 });
  const [refresh, setRefresh] = useState(0);
  const active = useRef(null);
  useEffect(() => {
    let live = true;
    active.current = repository;
    const unsubscribe = repository.subscribe(items => {
      if (live) setState({ scopeKey, items, loaded: true, error: null });
    }, error => {
      if (live) setState({ scopeKey, items: [], loaded: true, error });
    });
    return () => { live = false; if (active.current === repository) active.current = null; unsubscribe(); };
  }, [repository, scopeKey, refresh]);

  const invoke = useCallback(async action => {
    if (active.current !== repository) throw new Error('WORKOUT_AUTH_CHANGED');
    repository.assertScope();
    setPending(value => ({ scopeKey, count: value.scopeKey === scopeKey ? value.count + 1 : 1 }));
    try {
      const result = await action();
      if (active.current !== repository) throw new Error('WORKOUT_AUTH_CHANGED');
      repository.assertScope();
      return result;
    } finally {
      setPending(value => value.scopeKey === scopeKey ? { scopeKey, count: Math.max(0, value.count - 1) } : value);
    }
  }, [repository, scopeKey]);
  const create = useCallback(({ name, day, exercises, level = 1 }) => invoke(() => repository.create({ name,
    snapshot: createWorkoutSnapshot(day, exercises, level) })), [invoke, repository]);
  const rename = useCallback((id, name, revision) => invoke(() => repository.rename(id, name, revision)), [invoke, repository]);
  const remove = useCallback((id, revision) => invoke(() => repository.remove(id, revision)), [invoke, repository]);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  const current = state.scopeKey === scopeKey ? state : { items: [], loaded: false, error: null };
  return { uid: accountUid, scope: accountUid ? 'account' : 'device', scopeKey, ...current,
    busy: pending.scopeKey === scopeKey && pending.count > 0, create, rename, remove, reload };
}
