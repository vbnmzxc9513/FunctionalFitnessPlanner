const MARKER = '__fitnessBackGuard';

// A single same-URL history entry lets Android/browser Back dismiss the top UI
// layer. No application data or share fragment is encoded in history state.
export function createBackNavigation(browser, defer = callback => setTimeout(callback, 0)) {
  const layers = new Map();
  const owner = `${Date.now()}:${Math.random()}`;
  let guarded = false, guardUrl = '', scheduled = false, replacing = null, removing = false;
  const url = () => browser.location.href;
  const reconcile = () => {
    scheduled = false;
    if (replacing !== null || removing) return;
    if (guarded && browser.history.state?.[MARKER] !== owner) guarded = false;
    if (layers.size && !guarded) {
      guardUrl = url();
      browser.history.pushState({ ...browser.history.state, [MARKER]: owner }, '', guardUrl);
      guarded = true;
    } else if (!layers.size && guarded) {
      guarded = false; removing = true;
      browser.history.back();
    }
  };
  const schedule = () => { if (!scheduled) { scheduled = true; defer(reconcile); } };
  const pop = () => {
    if (removing) { removing = false; schedule(); return; }
    if (replacing !== null) {
      const next = replacing; replacing = null;
      browser.history.replaceState(null, '', next);
      browser.dispatchEvent(new Event('hashchange'));
      schedule(); return;
    }
    if (guarded && url() === guardUrl && browser.history.state?.[MARKER] !== owner) {
      guarded = false;
      const top = [...layers.values()].sort((a, b) => b.priority - a.priority || b.order - a.order)[0];
      top?.back();
    } else {
      // A new incoming share URI is navigation, not a request to close a layer.
      guarded = browser.history.state?.[MARKER] === owner;
      guardUrl = url();
    }
    schedule();
  };
  let order = 0;
  browser.addEventListener('popstate', pop);
  return {
    replaceLocation(next) {
      if (guarded && browser.history.state?.[MARKER] === owner) {
        replacing = next; guarded = false; browser.history.back();
      } else { browser.history.replaceState(null, '', next); }
    },
    register(id, back, priority = 0) { layers.set(id, { back, priority, order: ++order }); schedule(); return () => { layers.delete(id); schedule(); }; },
    dispose() { browser.removeEventListener('popstate', pop); layers.clear(); },
  };
}
