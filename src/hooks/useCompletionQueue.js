import { useEffect, useRef, useState } from 'react';
import { createCompletionQueue } from '../domain/completionQueue.js';

export function useCompletionQueue({ save, onError, onSaved, confirmedProgress }) {
  const [state, setState] = useState({ pending: {}, errors: {} });
  const handlers = useRef({ save, onError, onSaved });
  const queue = useRef(null);
  useEffect(() => { handlers.current = { save, onError, onSaved }; }, [save, onError, onSaved]);
  useEffect(() => {
    const current = createCompletionQueue({
      save: item => handlers.current.save(item), onChange: setState,
      onError: (item, error) => handlers.current.onError?.(item, error),
      onSaved: item => handlers.current.onSaved?.(item),
    });
    queue.current = current;
    const leave = event => {
      if (current.isPending()) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', leave);
    return () => { current.dispose(); window.removeEventListener('beforeunload', leave); };
  }, []);
  useEffect(() => { queue.current?.observe(confirmedProgress); }, [confirmedProgress]);
  return { state, pending: Object.keys(state.pending).length > 0,
    enqueue: item => queue.current?.enqueue(item), isPending: () => queue.current?.isPending() === true };
}
