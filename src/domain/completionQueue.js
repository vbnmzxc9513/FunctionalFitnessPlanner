export const completionKey = (week, day, id) => `${week}:${day}:${id}`;

// Serialize writes to the same progress document while acknowledging each tap
// immediately. Pending intent is UI state, never a persisted completion fact.
export function createCompletionQueue({ save, onChange, onError, onSaved }) {
  const pending = new Map(), errors = new Set(), waiting = [];
  let running = false, disposed = false;
  let observed = {};
  const matches = item => !!observed[item.week]?.completed?.[`day${item.day}_${item.id}`] === item.value;
  const publish = () => {
    if (!disposed) onChange({ pending: Object.fromEntries([...pending].map(([key, item]) => [key, { value: item.value }])), errors: Object.fromEntries([...errors].map(key => [key, true])) });
  };
  const drain = async () => {
    if (running || disposed) return;
    running = true;
    try {
      while (waiting.length && !disposed) {
        const item = waiting.shift();
        try {
          await save(item);
          item.saved = true;
          item.observedAtSave = observed;
          if (matches(item) || item.sawTarget) pending.delete(item.key);
          if (!disposed) onSaved?.(item);
        } catch (error) {
          pending.delete(item.key);
          if (!disposed) { errors.add(item.key); onError?.(item, error); }
        } finally {
          publish();
        }
      }
    } finally { running = false; }
  };
  return {
    enqueue(item) {
      const key = completionKey(item.week, item.day, item.id);
      if (disposed || pending.has(key)) return false;
      const entry = { ...item, key };
      errors.delete(key); pending.set(key, entry); waiting.push(entry); publish();
      void drain();
      return true;
    },
    observe(progress) {
      if (disposed) return;
      observed = progress;
      let changed = false;
      for (const [key, item] of pending) {
        if (matches(item)) item.sawTarget = true;
        // Keep the immediate checkbox until its server echo arrives; a newer
        // authoritative snapshot can also supersede a confirmed write.
        if (item.saved && (matches(item) || observed !== item.observedAtSave)) { pending.delete(key); changed = true; }
      }
      if (changed) publish();
    },
    isPending: () => pending.size > 0,
    dispose() { disposed = true; waiting.length = 0; pending.clear(); errors.clear(); },
  };
}
