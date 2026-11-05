import test from 'node:test';
import assert from 'node:assert/strict';
import { completionKey, createCompletionQueue } from '../../src/domain/completionQueue.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const item = (id, value = true) => ({ uid: 'one', week: '2026-W46', day: 1, id, value });

test('a server echo before promise resolution and a newer conflicting snapshot both settle correctly', async () => {
  const first = deferred(), second = deferred(); let state;
  const queue = createCompletionQueue({ save: entry => entry.id === 'a' ? first.promise : second.promise, onChange: value => { state = value; } });
  queue.observe({ '2026-W46': { completed: {} } }); queue.enqueue(item('a'));
  queue.observe({ '2026-W46': { completed: { day1_a: true } } });
  assert.equal(queue.isPending(), true, 'an echo alone does not claim a transaction succeeded');
  first.resolve(); await flush(); assert.equal(queue.isPending(), false);
  queue.enqueue(item('b')); second.resolve(); await flush();
  assert.equal(queue.isPending(), true, 'retain selection while its snapshot is delayed');
  queue.observe({ '2026-W46': { completed: { day1_a: true, day1_b: false } } });
  assert.equal(queue.isPending(), false, 'a newer authoritative snapshot supersedes the local selection');
  assert.deepEqual(state.pending, {});
});

test('each tap publishes pending intent immediately, with ordered writes and no duplicate in-flight toggle', async () => {
  const first = deferred(), second = deferred(), calls = [], saved = []; let state;
  const queue = createCompletionQueue({ save: entry => { calls.push(entry.id); return entry.id === 'a' ? first.promise : second.promise; }, onChange: value => { state = value; }, onSaved: entry => saved.push(entry.id) });
  assert.equal(queue.enqueue(item('a')), true);
  assert.equal(queue.enqueue(item('b')), true);
  assert.equal(queue.enqueue(item('a', false)), false);
  assert.deepEqual(Object.values(state.pending).map(value => value.value), [true, true]);
  assert.deepEqual(calls, ['a']); assert.deepEqual(saved, []);
  first.resolve(); await flush();
  assert.ok(state.pending[completionKey('2026-W46', 1, 'a')], 'hold intent until the snapshot catches up');
  queue.observe({ '2026-W46': { completed: { day1_a: true } } });
  assert.deepEqual(calls, ['a', 'b']); assert.deepEqual(saved, ['a']);
  assert.equal(state.pending[completionKey('2026-W46', 1, 'a')], undefined);
  second.resolve(); await flush(); queue.observe({ '2026-W46': { completed: { day1_a: true, day1_b: true } } }); assert.equal(queue.isPending(), false);
  assert.deepEqual(saved, ['a', 'b']);
});

test('failure removes only that optimistic value, keeps later writes running and allows an explicit retry', async () => {
  const first = deferred(), second = deferred(); let state; const failures = [];
  const queue = createCompletionQueue({ save: entry => entry.id === 'a' ? first.promise : second.promise, onChange: next => { state = next; }, onError: entry => failures.push(entry.id) });
  queue.enqueue(item('a', false)); queue.enqueue(item('b'));
  first.reject(new Error('offline')); await flush();
  const key = completionKey('2026-W46', 1, 'a');
  assert.equal(state.pending[key], undefined); assert.equal(state.errors[key], true);
  assert.ok(state.pending[completionKey('2026-W46', 1, 'b')]); assert.deepEqual(failures, ['a']);
  second.resolve(); await flush();
  queue.enqueue(item('a', false)); assert.equal(state.errors[key], undefined);
  await flush(); // This deliberately failing retry is reported again, not silently dropped.
  assert.deepEqual(failures, ['a', 'a']);
});

test('account teardown cancels unstarted writes and never updates the new account UI', async () => {
  const first = deferred(), calls = [], changes = [], saved = [];
  const queue = createCompletionQueue({ save: entry => { calls.push(entry.id); return first.promise; }, onChange: value => changes.push(value), onSaved: entry => saved.push(entry.id) });
  queue.enqueue(item('a')); queue.enqueue(item('b')); const before = changes.length;
  queue.dispose(); first.resolve(); await flush();
  assert.deepEqual(calls, ['a']); assert.deepEqual(saved, []); assert.equal(changes.length, before);
  assert.equal(queue.enqueue(item('c')), false); assert.equal(queue.isPending(), false);
});
