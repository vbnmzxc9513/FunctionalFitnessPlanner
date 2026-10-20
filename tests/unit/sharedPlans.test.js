import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCHEDULE_I18N } from '../../src/locale.js';
import { createPlanPayload, validatePlanPayload, rebuildPlanDays, encodePlanPayload, decodePlanPayload,
  readSharedPlanLocation, MAX_PLAN_SHARE_LENGTH } from '../../src/domain/sharedPlans.js';
import { createSharePayload } from '../../src/domain/sharing.js';

const source = () => structuredClone(DEFAULT_SCHEDULE_I18N.zh[0]);
const plan = () => createPlanPayload([source()], { name: '公開課表' });
const encoded = payload => Buffer.from(JSON.stringify(payload)).toString('base64url');

test('v2 shares the explicit public name and relative dates, excluding every source free-text and private field', () => {
  const sessions = [3, 0, 7].map(offset => ({ ...source(), date: `2026-10-${String(19 + offset).padStart(2, '0')}`,
    name: 'PRIVATE_NAME', theme: 'PRIVATE_THEME', coachAdvice: 'PRIVATE_ADVICE', uid: 'PRIVATE_UID',
    healthNotes: 'PRIVATE_HEALTH', actualWeight: 70, completed: true, privateNote: 'PRIVATE_NOTE' }));
  const result = createPlanPayload(sessions, { name: '秋季羽球' });
  assert.deepEqual(result.days.map(day => day.offset), [0, 3, 7]);
  assert.equal(result.name, '秋季羽球');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(result).includes('2026'), false);
  assert.equal(JSON.stringify(result).includes('instruction'), false);
  assert.deepEqual(result.days[0].items, createSharePayload(source()).items);
});

test('28 days including rest days validate, reconstruct relative offsets and safe generic preparation', () => {
  const payload = createPlanPayload(Array.from({ length: 28 }, (_, offset) => ({ ...source(), offset })), { name: 'Four weeks' });
  assert.equal(payload.days.length, 28); assert.equal(payload.days.at(-1).offset, 27);
  const days = rebuildPlanDays(payload, 'en');
  assert.equal(days[2].offset, 2); assert.equal(days[2].theme, payload.days[2].name);
  assert.ok(days[0].prescriptions.find(dose => dose.preparation).preparation.instruction.startsWith('Use bodyweight'));
  const rest = rebuildPlanDays(createPlanPayload([{ routine: [] }], { name: 'Rest' }));
  assert.equal(rest[0].sessionType, 'rest'); assert.deepEqual(rest[0].routine, []);
});

test('day limits, date validity, interval uniqueness, names and exact public fields reject malformed payloads', () => {
  for (const sessions of [[], Array(29).fill(source()), [{ ...source(), date: '2026-02-31' }],
    [{ ...source(), date: '2026-10-19' }, source()], [{ ...source(), offset: 0 }, { ...source(), offset: 28 }],
    [{ ...source(), offset: 0 }, { ...source(), offset: 0 }]]) assert.throws(() => createPlanPayload(sessions, { name: 'Plan' }));
  for (const change of [p => { p.health = 'secret'; }, p => { p.days[0].date = '2026-10-19'; },
    p => { p.name = 'x'.repeat(41); }, p => { p.name = ' '; }, p => { p.days[0].name = 'bad\nname'; },
    p => { p.days[0].offset = 1; }, p => { p.days[0].items[0].actualWeight = 80; }]) {
    const value = plan(); change(value); assert.throws(() => validatePlanPayload(value), /INVALID_PLAN_SHARE/);
  }
});

test('custom or unknown exercises block the entire plan without silently dropping a day or motion', () => {
  assert.throws(() => createPlanPayload([source(), { routine: ['private-custom'] }], { name: 'Plan' }), /UNSUPPORTED_SHARE/);
  const value = plan(); value.days[0].items[0].id = 'unknown';
  assert.throws(() => validatePlanPayload(value), /INVALID_PLAN_SHARE/);
});

test('each day retains all v1 preparation, power, jump and sequence safety constraints', () => {
  const jump = createPlanPayload([{ routine: ['bf_E03'] }], { name: 'Jump' });
  jump.days[0].items[0].sets = 5; jump.days[0].items[0].value = '3'; jump.days[0].items[0].perSide = true;
  assert.throws(() => validatePlanPayload(jump), /INVALID_PLAN_SHARE/);
  const value = plan(); value.days[0].items.find(item => item.preparation).preparation.instruction = 'secret';
  assert.throws(() => validatePlanPayload(value), /INVALID_PLAN_SHARE/);
  assert.throws(() => createPlanPayload([{ routine: ['bf_E03', 'bf_I04'] }], { name: 'Jump and rope' }));
  const sequence = createPlanPayload([{ routine: ['bf_A13'] }], { name: 'Sequence' });
  sequence.days[0].items[0].value = '1'; assert.throws(() => validatePlanPayload(sequence), /INVALID_PLAN_SHARE/);
});

test('embedded plans round-trip, enforce the explicit 14000 bound, and do not replace legacy hashes', () => {
  const value = plan(); assert.deepEqual(decodePlanPayload(encodePlanPayload(value)), value);
  assert.deepEqual(readSharedPlanLocation({ hash: `#program=${encodePlanPayload(value)}` }), { payload: value });
  assert.deepEqual(readSharedPlanLocation({ hash: '#plan=0123456789abcdef0123456789abcdef' }), { id: '0123456789abcdef0123456789abcdef' });
  for (const hash of ['', '#other=abc', '#workout=legacy']) assert.equal(readSharedPlanLocation({ hash }), null);
  for (const hash of ['#plan=x', '#plan=../../secret', '#program=', '#program=_w', '#program=!!!!', `#program=${encoded({ v: 1, items: [] })}`]) {
    assert.deepEqual(readSharedPlanLocation({ hash }), { error: 'INVALID_PLAN_SHARE' });
  }
  assert.deepEqual(readSharedPlanLocation({ hash: '#program=' + 'a'.repeat(MAX_PLAN_SHARE_LENGTH + 1) }), { error: 'PLAN_SHARE_TOO_LONG' });
  const long = createPlanPayload(Array(28).fill(source()), { name: 'Long' });
  assert.throws(() => encodePlanPayload(long), /PLAN_SHARE_TOO_LONG/);
});
