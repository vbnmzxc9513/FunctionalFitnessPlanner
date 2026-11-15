import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createWorkoutRepository } from '../services/workoutRepository.js';
import { createWorkoutSnapshot } from '../domain/savedWorkouts.js';

const sorted = items => [...items].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0) || a.id.localeCompare(b.id));

/** One instance belongs in App; dialogs receive this store instead of subscribing again. */
export function useSavedWorkouts(uid) {
  const accountUid = uid || null;
  const scopeKey = accountUid ? `account:${accountUid}` : 'device';
  const repository = useMemo(() => createWorkoutRepository(accountUid), [accountUid]);
  // Receipts belong to this repository instance, never a later account. A write
  // resolves before its subscription necessarily catches up with that revision.
  const receipts = useMemo(() => ({ repository, pending: new Map(), latest: new Map(), confirmed: new Map(), removed: new Map(), deletedAt: new Map(), sequence: 0 }), [repository]);
  const [state, setState] = useState({ scopeKey: null, items: [], loaded: false, error: null });
  const [pending, setPending] = useState({ scopeKey: null, count: 0 });
  const [refresh, setRefresh] = useState(0);
  const active = useRef(null);
  useEffect(() => {
    let live = true;
    active.current = repository;
    const unsubscribe = repository.subscribe(items => {
      if (!live) return;
      receipts.sequence++;
      const merged = new Map();
      for (const item of items) {
        receipts.confirmed.set(item.id, Math.max(receipts.confirmed.get(item.id) || 0, item.revision));
        if ((receipts.removed.get(item.id) || 0) >= item.revision) continue;
        const latest = receipts.latest.get(item.id);
        merged.set(item.id, latest && latest.revision > item.revision ? latest : item);
        if (!latest || item.revision >= latest.revision) receipts.latest.set(item.id, item);
        const receipt = receipts.pending.get(item.id);
        if (receipt && item.revision >= receipt.revision) receipts.pending.delete(item.id);
      }
      const receivedIds = new Set(items.map(item => item.id));
      for (const [id, latest] of receipts.latest) {
        // Once a subscription has actually seen this ID, its later absence is
        // a deletion. It also invalidates a write still awaiting resolution.
        if (!receivedIds.has(id) && receipts.confirmed.has(id)) {
          receipts.removed.set(id, Math.max(receipts.removed.get(id) || 0, latest.revision));
          receipts.deletedAt.set(id, receipts.sequence);
          receipts.pending.delete(id);
          receipts.latest.delete(id);
        }
      }
      for (const [id, receipt] of receipts.pending) if (!merged.has(id)) merged.set(id, receipt);
      setState({ scopeKey, items: sorted(merged.values()), loaded: true, error: null });
    }, error => {
      if (live) setState(value => ({ scopeKey, items: value.scopeKey === scopeKey ? value.items : [], loaded: true, error }));
    });
    return () => { live = false; if (active.current === repository) active.current = null; unsubscribe(); };
  }, [repository, scopeKey, refresh, receipts]);

  const invoke = useCallback(async (action, removed) => {
    if (active.current !== repository) throw new Error('WORKOUT_AUTH_CHANGED');
    repository.assertScope();
    const startedAt = receipts.sequence;
    setPending(value => ({ scopeKey, count: value.scopeKey === scopeKey ? value.count + 1 : 1 }));
    try {
      const result = await action();
      if (active.current !== repository) throw new Error('WORKOUT_AUTH_CHANGED');
      repository.assertScope();
      if (removed) {
        const revision = Math.max(removed.revision || 0, receipts.latest.get(removed.id)?.revision || 0);
        receipts.removed.set(removed.id, revision);
        receipts.pending.delete(removed.id);
        receipts.latest.delete(removed.id);
        setState(value => ({ scopeKey, items: value.scopeKey === scopeKey ? value.items.filter(item => item.id !== removed.id) : [], loaded: true, error: null }));
      } else if (result?.id) {
        if ((receipts.removed.get(result.id) || 0) >= result.revision || (receipts.deletedAt.get(result.id) || 0) > startedAt) throw new Error('WORKOUT_CHANGED');
        const latest = receipts.latest.get(result.id);
        const item = latest && latest.revision >= result.revision ? latest : result;
        receipts.latest.set(item.id, item);
        if ((receipts.confirmed.get(item.id) || 0) < item.revision) receipts.pending.set(item.id, item);
        setState(value => ({ scopeKey, items: sorted([...(value.scopeKey === scopeKey ? value.items : []).filter(existing => existing.id !== item.id), item]), loaded: true, error: null }));
      }
      return result;
    } finally {
      setPending(value => value.scopeKey === scopeKey ? { scopeKey, count: Math.max(0, value.count - 1) } : value);
    }
  }, [repository, scopeKey, receipts]);
  const create = useCallback(({ name, day, exercises, level = 1, ...metadata }) => invoke(() => repository.create({ name, ...metadata,
    snapshot: createWorkoutSnapshot(day, exercises, level) })), [invoke, repository]);
  const rename = useCallback((id, name, revision) => invoke(() => repository.rename(id, name, revision)), [invoke, repository]);
  const update = useCallback((id, { day, exercises, level = 1, ...input }, revision) => invoke(() => repository.update(id, {
    ...input, ...(day ? { snapshot: createWorkoutSnapshot(day, exercises, level) } : {}),
  }, revision)), [invoke, repository]);
  const setPinned = useCallback((id, pinned, revision) => invoke(() => repository.setPinned(id, pinned, revision)), [invoke, repository]);
  const markUsed = useCallback((id, revision) => invoke(() => repository.markUsed(id, revision)), [invoke, repository]);
  const remove = useCallback((id, revision) => invoke(() => repository.remove(id, revision), { id, revision }), [invoke, repository]);
  const reload = useCallback(() => setRefresh(value => value + 1), []);
  const current = state.scopeKey === scopeKey ? state : { items: [], loaded: false, error: null };
  return { uid: accountUid, scope: accountUid ? 'account' : 'device', scopeKey, ...current,
    busy: pending.scopeKey === scopeKey && pending.count > 0, create, rename, update, setPinned, markUsed, remove, reload };
}
