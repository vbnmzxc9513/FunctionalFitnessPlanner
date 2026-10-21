import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackNavigation } from '../../src/domain/backNavigation.js';

function fixture(href = 'https://planner.test/#program=full-fragment') {
  const entries = [{ href: 'https://previous.test/', state: null }, { href, state: null }];
  let index = 1;
  const listeners = {}, deferred = [];
  const browser = {
    location: { get href() { return entries[index].href; } },
    history: {
      get state() { return entries[index].state; },
      pushState(state, _, next) { entries.splice(++index); entries[index] = { state, href: new URL(next, entries[index - 1].href).href }; },
      replaceState(state, _, next) { entries[index] = { state, href: new URL(next, entries[index].href).href }; },
      back() { if (index > 0) { index--; browser.dispatchEvent({ type: 'popstate' }); } },
    },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    removeEventListener(name, fn) { listeners[name] = listeners[name].filter(value => value !== fn); },
    dispatchEvent(event) { for (const fn of listeners[event.type] || []) fn(event); },
  };
  const navigation = createBackNavigation(browser, callback => deferred.push(callback));
  return { browser, navigation, flush() { while (deferred.length) deferred.shift()(); } };
}

test('Back closes details then picker/day/week, without ever changing the incoming share fragment', () => {
  const f = fixture(), calls = [];
  const remove = {};
  for (const [name, priority] of [['week', 10], ['day', 40], ['picker', 60], ['details', 110]]) {
    remove[name] = f.navigation.register(name, () => { calls.push(name); remove[name](); }, priority);
  }
  f.flush();
  for (let i = 0; i < 4; i++) { f.browser.history.back(); f.flush(); assert.equal(f.browser.location.href, 'https://planner.test/#program=full-fragment'); }
  assert.deepEqual(calls, ['details', 'picker', 'day', 'week']);
  f.browser.history.back(); assert.equal(f.browser.location.href, 'https://previous.test/');
});
test('blocked unsaved edits retain their guard, UI close removes it, and next Back leaves root', () => {
  const f = fixture('https://planner.test/'); let blocked = 0;
  const close = f.navigation.register('edit', () => blocked++, 100); f.flush();
  f.browser.history.back(); f.flush(); assert.equal(blocked, 1);
  close(); f.flush(); assert.equal(f.browser.location.href, 'https://planner.test/');
  f.browser.history.back(); assert.equal(f.browser.location.href, 'https://previous.test/');
});
test('UI share exit removes the duplicate guard before replacing hash; Back cannot resurrect the share', () => {
  const f = fixture();
  const close = f.navigation.register('share', () => {}, 10); f.flush();
  f.navigation.replaceLocation('https://planner.test/'); close(); f.flush();
  assert.equal(f.browser.location.href, 'https://planner.test/');
  f.browser.history.back(); assert.equal(f.browser.location.href, 'https://previous.test/');
});
