import { useEffect, useRef } from 'react';
import { createBackNavigation } from '../domain/backNavigation.js';

let navigation;
export function replaceNavigationLocation(next) {
  if (navigation) navigation.replaceLocation(next);
  else window.history.replaceState(null, '', next);
}

export function useBackNavigation(active, onBack, priority = 0) {
  const callback = useRef(onBack);
  useEffect(() => { callback.current = onBack; });
  useEffect(() => {
    if (!active) return;
    navigation ||= createBackNavigation(window);
    return navigation.register(Symbol('back layer'), () => callback.current(), priority);
  }, [active, priority]);
}
