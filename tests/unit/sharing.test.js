import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCHEDULE_I18N, EXERCISES_I18N } from '../../src/locale.js';
import { countCompleted } from '../../src/domain/training.js';
import { sessionSections } from '../../src/domain/sessions.js';
import { createSharePayload, decodeSharePayload, encodeSharePayload, MAX_SHARE_LENGTH,
  readShareFromLocation, shareDay, shareUrl, validateSharePayload } from '../../src/domain/sharing.js';

const monday = () => structuredClone(DEFAULT_SCHEDULE_I18N.zh[0]);
const payload = () => createSharePayload(monday(), EXERCISES_I18N.zh);
const unsafeEncoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');

test('sharing whitelists catalog motions and numeric doses, excluding all private fields and instructions', () => {
  const day = monday();
  Object.assign(day, { theme: 'PRIVATE_THEME', concept: 'PRIVATE_CONCEPT', coachAdvice: 'PRIVATE_COACH',
    warmupNote: 'PRIVATE_WARMUP', cooldownNote: 'PRIVATE_COOLDOWN', healthNotes: 'PRIVATE_HEALTH',
    uid: 'PRIVATE_UID', week: '2026-W42', apiKey: 'PRIVATE_KEY', completions: { secret: true } });
  day.prescriptions.find(dose => dose.preparation).preparation.instruction = 'PRIVATE_INSTRUCTION';
  const result = createSharePayload(day, { ...EXERCISES_I18N.zh, bf_B01: { name: 'PRIVATE_NAME' } });
  const json = JSON.stringify(result);
  assert.ok(!json.includes('PRIVATE_')); assert.ok(!json.includes('2026')); assert.ok(!json.includes('instruction'));
  assert.deepEqual(Object.keys(result), ['v', 'items']);
  assert.ok(result.items.every(item => typeof item.id === 'string'));
  const publicDay = shareDay(result, 'en');
  assert.ok(publicDay.prescriptions.find(dose => dose.preparation).preparation.instruction.startsWith('Use bodyweight'));
  assert.ok(!JSON.stringify(publicDay).includes('PRIVATE_'));
});

test('Unicode numeric ranges round-trip and preparation does not add completion slots', () => {
  const value = payload();
  value.items.find(item => item.id === 'bf_B01').value = '6–8';
  value.items.find(item => item.id === 'bf_B01').preparation.value = '4–6';
  const encoded = encodeSharePayload(value);
  assert.match(encoded, /^[\w-]+$/);
  assert.deepEqual(decodeSharePayload(encoded), value);
  const day = shareDay(value);
  const sections = sessionSections(day, EXERCISES_I18N.zh);
  assert.equal(sections[0].preparation.length, 1);
  assert.equal(countCompleted([day]).total, value.items.length);
  assert.equal(day.prescriptions.find(dose => dose.preparation).preparation.value, '4–6');
});

test('custom and unsupported legacy exercises are rejected without silently omitting a motion', () => {
  const custom = monday(); custom.routine.push('custom-secret-health-name');
  assert.throws(() => createSharePayload(custom), /UNSUPPORTED_SHARE/);
  assert.throws(() => createSharePayload({ routine: ['thoracic'] }), /UNSUPPORTED_SHARE/);
  const legacy = createSharePayload({ routine: ['bf_B01', 'bf_A01', 'bf_H01'] });
  assert.deepEqual(legacy.items.map(item => item.id), ['bf_A01', 'bf_B01', 'bf_H01']);
  assert.equal(legacy.items[1].sets, EXERCISES_I18N.zh.bf_B01.prescription.sets);
});

test('all bundled defaults can be safely shared, including recovery and empty rest days', () => {
  for (const day of DEFAULT_SCHEDULE_I18N.zh) assert.doesNotThrow(() => encodeSharePayload(createSharePayload(day)));
  const result = readShareFromLocation({ hash: `#workout=${encodeSharePayload(createSharePayload({ routine: [] }))}` });
  assert.equal(result.day.sessionType, 'rest'); assert.deepEqual(result.day.routine, []);
});

test('untrusted public payloads reject extra fields, arbitrary instructions, script text and prototype properties', () => {
  const examples = [
    value => { value.healthNotes = 'secret'; },
    value => { value.items[0].name = '<img src=x onerror=alert(1)>'; },
    value => { value.items[0].value = '<script>alert(1)</script>'; },
    value => { value.items.find(item => item.preparation).preparation.instruction = 'secret'; },
    value => { Object.defineProperty(value, '__proto__', { enumerable: true, value: { malicious: true } }); },
  ];
  for (const change of examples) {
    const value = payload(); change(value);
    assert.throws(() => decodeSharePayload(unsafeEncoded(value)), /INVALID_SHARE/);
  }
});

test('untrusted links reject malformed encoding, invalid UTF-8, oversized links and incompatible versions', () => {
  for (const encoded of ['', '!!!!', '%E4%BD%A0', 'a'.repeat(MAX_SHARE_LENGTH + 1), '_w', unsafeEncoded({ v: 2, items: [] })]) {
    assert.throws(() => decodeSharePayload(encoded), /INVALID_SHARE/);
    assert.deepEqual(readShareFromLocation({ hash: `#workout=${encoded}` }), { day: null, error: 'INVALID_SHARE' });
  }
  assert.equal(readShareFromLocation({ hash: '' }), null);
  assert.equal(readShareFromLocation({ hash: '#other' }), null);
});

test('untrusted doses reject duplicates, unknown IDs, phase reversal, missing fields and excessive preparation', () => {
  const mutations = [
    value => { value.items.push(value.items[0]); },
    value => { value.items[0].id = 'unknown'; },
    value => { value.items.reverse(); },
    value => { value.items[0].phase = 'invented'; },
    value => { delete value.items[0].perSide; },
    value => { value.items[0].sets = 6; },
    value => { value.items[0].value = '0'; },
    value => { value.items[0].value = '8–4'; },
    value => { value.items[0].restSeconds = 301; },
    value => { value.items.find(item => item.preparation).preparation.sets = 3; },
    value => { value.items.find(item => item.preparation).preparation.value = '9'; },
    value => { value.items.find(item => item.preparation).preparation.unit = 'minutes'; },
    value => { value.items[0].preparation = value.items.find(item => item.preparation).preparation; },
    value => { value.items.push(...structuredClone(value.items)); },
  ];
  for (const mutate of mutations) { const value = payload(); mutate(value); assert.throws(() => validateSharePayload(value), /INVALID_SHARE/); }
});

test('public jumping doses count both sides, prohibit extra rope work and cannot bypass limits with timed sets', () => {
  const jumping = createSharePayload({ routine: ['bf_A01', 'bf_E03'] });
  assert.doesNotThrow(() => validateSharePayload(jumping));
  jumping.items[1].sets = 5; jumping.items[1].value = '3';
  assert.throws(() => validateSharePayload(jumping), /INVALID_SHARE/);
  jumping.items[1].sets = 2; jumping.items[1].unit = 'seconds';
  assert.throws(() => validateSharePayload(jumping), /INVALID_SHARE/);
  assert.throws(() => createSharePayload({ routine: ['bf_E03', 'bf_I04'] }), /INVALID_SHARE/);
  jumping.items[1].unit = 'reps'; jumping.items[1].phase = 'cooldown';
  assert.throws(() => validateSharePayload(jumping), /INVALID_SHARE/);
});

test('share URLs remove query strings and dates and expose only validated public workout content', () => {
  const url = shareUrl(payload(), { origin: 'https://example.com', pathname: '/planner/', search: '?key=secret', hash: '#old' });
  assert.ok(url.startsWith('https://example.com/planner/#workout='));
  assert.ok(!url.includes('secret')); assert.ok(!url.includes('?'));
  const read = readShareFromLocation({ hash: new URL(url).hash });
  assert.deepEqual(read.day.routine, monday().routine);
});
