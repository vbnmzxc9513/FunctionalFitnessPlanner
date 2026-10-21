import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises, eligibleExercises } from '../../src/domain/exerciseCatalog.js';
import { SESSION_PHASES } from '../../src/domain/phases.js';
import { validateGeneratedDay } from '../../src/domain/planning.js';
import {
  addManualExercises, clearManualDraft, copyManualSession, createManualSession, filterManualExercises,
  hydrateManualSession, loadManualDraft, manualDraftStorageKey, prepareManualPreview,
  removeManualExercise, reorderManualExercise, saveManualDraft, updateManualPrescription, validateManualDates,
} from '../../src/domain/manualPlanner.js';

const exercises = catalogExercises();
const eligible = eligibleExercises(exercises, { equipment: ['dumbbell', 'band', 'cable', 'foam_roller', 'jump_rope', 'platform', 'racket', 'shuttlecock', 'ball', 'screen', 'pullup_bar'], partnerAvailable: true, experience: 'advanced', healthStatus: 'unrestricted' });
const options = phase => ({ exercises, eligibleExercises: eligible, phase });
const empty = () => createManualSession('2026-10-19');
const withWarmup = () => addManualExercises(empty(), ['bf_A13'], options('warmup'));
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test('nonconsecutive dates span at most 28 inclusive days and derive correct cross-year identity', () => {
  assert.deepEqual(validateManualDates(['2026-11-15', '2026-10-19', '2026-10-21']), ['2026-10-19', '2026-10-21', '2026-11-15']);
  assert.throws(() => validateManualDates(['2026-10-19', '2026-11-16']), /MANUAL_DATE_SPAN/);
  assert.throws(() => validateManualDates(['2026-10-18'], { today: '2026-10-19' }), /MANUAL_PAST_DATE/);
  assert.throws(() => validateManualDates(['2026-02-30']), /MANUAL_INVALID_DATES/);
  assert.throws(() => validateManualDates(['2026-10-19', '2026-10-19']), /MANUAL_INVALID_DATES/);
  assert.equal(createManualSession('2027-01-01').week, '2026-W53');
  assert.equal(createManualSession('2027-01-01').day, 5);
});

test('batch addition is all-or-nothing for capacity, duplicates and unavailable equipment', () => {
  let session = withWarmup();
  session = addManualExercises(session, ['bf_B01', 'bf_B02', 'bf_B03', 'bf_B05', 'bf_B06', 'bf_B07'], options('strength'));
  const before = structuredClone(session);
  assert.throws(() => addManualExercises(session, ['bf_C01', 'bf_C02'], options('accessory')), /MANUAL_CAPACITY/);
  assert.throws(() => addManualExercises(session, ['bf_B01'], options('strength')), /MANUAL_DUPLICATE_EXERCISE/);
  assert.throws(() => addManualExercises(empty(), ['bf_B01', 'bf_B01'], options('strength')), /MANUAL_DUPLICATE_EXERCISE/);
  const bodyweight = eligibleExercises(exercises, { equipment: [], partnerAvailable: false, experience: 'beginner', healthStatus: 'unrestricted' });
  assert.throws(() => addManualExercises(empty(), ['bf_B01', 'bf_B11'], { ...options('strength'), eligibleExercises: bodyweight }), /MANUAL_INELIGIBLE_EXERCISE/);
  assert.deepEqual(session, before, 'rejected additions do not partially mutate the draft');
  const eight = addManualExercises(session, ['bf_C07'], options('accessory'));
  assert.equal(eight.routine.length, 8);
});

test('the provided eligibility map remains authoritative for clinical, partner and enabled restrictions', () => {
  const restricted = eligibleExercises(exercises, { equipment: ['dumbbell', 'band'], partnerAvailable: false, experience: 'beginner', healthStatus: 'restricted' });
  for (const id of ['bf_C07', 'bf_G01']) {
    assert.equal(filterManualExercises(exercises, restricted, { query: id }).length, 0);
    assert.throws(() => addManualExercises(empty(), [id], { ...options('accessory'), eligibleExercises: restricted }), /MANUAL_INELIGIBLE_EXERCISE/);
  }
  assert.throws(() => addManualExercises(empty(), ['bf_B01'], { exercises, eligibleExercises: { bf_B01: { ...exercises.bf_B01, active: false } }, phase: 'strength' }), /MANUAL_INELIGIBLE_EXERCISE/);
});

test('required region tags and multilingual aliases find the intended catalog movements', () => {
  const expected = { legs: 'bf_B01', chest: 'bf_C11', back: 'bf_C01', serratus: 'bf_C07', thoracic: 'bf_A06', hip: 'bf_A15', leg_stretch: 'bf_H05' };
  for (const [region, id] of Object.entries(expected)) assert.ok(filterManualExercises(exercises, eligible, { region }).some(([value]) => value === id), region);
  for (const [query, id] of [['9090髖', 'bf_A13'], ['open book', 'bf_A06'], ['腿拉伸', 'bf_H05'], ['前锯肌', 'bf_C07'], ['A13', 'bf_A13']]) {
    assert.ok(filterManualExercises(exercises, eligible, { query }).some(([value]) => value === id), query);
  }
  assert.ok(filterManualExercises(exercises, eligible, { type: 'static', region: 'leg_stretch' }).every(([, exercise]) => exercise.category === 'recovery'));
});

test('a complete warmup consumes one slot and retains its fixed total time', () => {
  const session = withWarmup();
  assert.equal(session.routine.length, 1);
  assert.deepEqual(session.prescriptions[0], { id: 'bf_A13', phase: 'warmup', sets: 1, value: '10', unit: 'minutes', restSeconds: 0, perSide: false });
  assert.throws(() => addManualExercises(session, ['bf_A12'], options('warmup')), /MANUAL_SEQUENCE_LIMIT/);
  assert.throws(() => updateManualPrescription(session, 'bf_A13', { value: '4', unit: 'reps' }, { exercises }), /MANUAL_SEQUENCE_DOSE/);
  assert.doesNotThrow(() => prepareManualPreview([session], { exercises, eligibleExercises: eligible, today: '2026-10-19' }));
});

test('an exact exercise can move phase and change sets, per-side dose and rest without changing its neighbor', () => {
  const session = addManualExercises(withWarmup(), ['bf_B01', 'bf_B02'], options('strength'));
  const next = updateManualPrescription(session, 'bf_B02', { phase: 'accessory', sets: 3, value: '6–8', restSeconds: 45, perSide: false }, { exercises });
  assert.deepEqual(next.prescriptions.find(dose => dose.id === 'bf_B01'), session.prescriptions.find(dose => dose.id === 'bf_B01'));
  assert.deepEqual(next.prescriptions.find(dose => dose.id === 'bf_B02'), { id: 'bf_B02', phase: 'accessory', sets: 3, value: '6–8', unit: 'reps', restSeconds: 45, perSide: false });
  assert.equal(session.prescriptions.find(dose => dose.id === 'bf_B02').phase, 'strength');
  assert.doesNotThrow(() => validateGeneratedDay(next, exercises, 240));
  assert.throws(() => updateManualPrescription(next, 'bf_B02', { value: '9–2' }, { exercises }), /MANUAL_INVALID_DOSE/);
  assert.throws(() => updateManualPrescription(next, 'bf_B02', { restSeconds: 301 }, { exercises }), /MANUAL_INVALID_DOSE/);
});

test('all six phases survive hydration, copy, reorder and the native validator', () => {
  const ids = ['bf_A02', 'bf_F01', 'bf_B01', 'bf_C07', 'bf_A03', 'bf_H05'];
  let session = empty();
  SESSION_PHASES.forEach((phase, index) => { session = addManualExercises(session, [ids[index]], options(phase)); });
  const copy = copyManualSession(session, '2026-10-21', { exercises });
  assert.deepEqual(copy.prescriptions.map(dose => dose.phase), SESSION_PHASES);
  assert.deepEqual(copy.routine, session.routine);
  assert.equal(copy.day, 3);
  assert.doesNotThrow(() => prepareManualPreview([session, copy], { exercises, eligibleExercises: eligible, today: '2026-10-19' }));
  assert.deepEqual(hydrateManualSession(copy, exercises).routine, copy.routine);
});

test('moving or removing the first strength lift retains a visible preparation set for the next lift', () => {
  let session = addManualExercises(withWarmup(), ['bf_B01', 'bf_B02'], options('strength'));
  const moved = reorderManualExercise(session, 'bf_B02', -1, exercises);
  assert.deepEqual(moved.routine, ['bf_A13', 'bf_B02', 'bf_B01']);
  assert.ok(moved.prescriptions.find(dose => dose.id === 'bf_B02').preparation);
  assert.doesNotThrow(() => validateGeneratedDay(moved, exercises, 240));
  session = removeManualExercise(session, 'bf_B01', { exercises });
  assert.deepEqual(session.routine, ['bf_A13', 'bf_B02']);
  assert.ok(session.prescriptions.find(dose => dose.id === 'bf_B02').preparation);
});

test('preview blocks an unfinished training draft and never silently removes selections or shrinks time', () => {
  const session = addManualExercises(empty(), ['bf_B01'], options('strength'));
  const original = structuredClone(session);
  assert.throws(() => prepareManualPreview([session], { exercises, eligibleExercises: eligible }), /AI_WARMUP_MISSING/);
  assert.deepEqual(session, original);
  const complete = addManualExercises(session, ['bf_A13'], options('warmup'));
  assert.throws(() => prepareManualPreview([complete], { exercises, eligibleExercises: eligible, dailyTime: 10 }), /AI_SESSION_TOO_LONG/);
  assert.deepEqual(complete.routine, ['bf_A13', 'bf_B01']);
  assert.throws(() => addManualExercises(empty(), ['bf_F01'], options('strength')), /INVALID_AI_EXERCISE_PHASE/);
});

test('preview returns all dated public session fields, including rest days, and no factual logs', () => {
  const session = addManualExercises(withWarmup(), ['bf_B01'], options('strength'));
  const sessions = prepareManualPreview([{ ...session, actualWeight: 30, completed: true }, createManualSession('2026-10-21')], { exercises, eligibleExercises: eligible, today: '2026-10-19' });
  assert.equal(sessions.length, 2);
  for (const key of ['date', 'week', 'day', 'name', 'theme', 'concept', 'coachAdvice', 'warmupNote', 'cooldownNote', 'sessionType', 'routine', 'prescriptions']) assert.ok(Object.hasOwn(sessions[0], key), key);
  assert.equal(sessions[1].sessionType, 'rest');
  assert.equal(sessions[0].actualWeight, undefined);
  assert.equal(sessions[0].completed, undefined);
});

test('an exercise becoming ineligible or missing after restore remains visible and blocks preview', () => {
  const session = addManualExercises(withWarmup(), ['bf_B01'], options('strength'));
  const restored = hydrateManualSession(session, {});
  assert.deepEqual(restored.routine, session.routine);
  assert.throws(() => prepareManualPreview([restored], { exercises, eligibleExercises: {} }), error => error.message === 'MANUAL_INELIGIBLE_EXERCISE' && error.date === session.date);
});

test('saved drafts restore all dates and doses, isolate accounts and can be cleared after apply', () => {
  const storage = memoryStorage();
  const sessions = [addManualExercises(withWarmup(), ['bf_B01'], options('strength')), createManualSession('2026-10-21')];
  saveManualDraft('alice', sessions, { storage });
  assert.deepEqual(loadManualDraft('alice', { storage, exercises }), sessions);
  assert.equal(loadManualDraft('bob', { storage, exercises }), null);
  assert.equal(loadManualDraft(null, { storage, exercises }), null);
  assert.notEqual(manualDraftStorageKey('signed-out'), manualDraftStorageKey(), 'an account named like the guest scope still has a distinct key');
  saveManualDraft('bob', [createManualSession('2026-10-23')], { storage });
  clearManualDraft('alice', { storage });
  assert.equal(loadManualDraft('alice', { storage, exercises }), null);
  assert.equal(loadManualDraft('bob', { storage, exercises })[0].date, '2026-10-23');
});

test('corrupt or cross-scope saved drafts fail visibly and are not deleted or silently replaced', () => {
  const storage = memoryStorage(), key = manualDraftStorageKey('alice');
  storage.setItem(key, '{bad json');
  assert.throws(() => loadManualDraft('alice', { storage, exercises }), /MANUAL_INVALID_DRAFT/);
  assert.equal(storage.getItem(key), '{bad json');
  storage.setItem(key, 'null');
  assert.throws(() => loadManualDraft('alice', { storage, exercises }), /MANUAL_INVALID_DRAFT/);
  storage.setItem(key, JSON.stringify({ version: 1, scope: 'bob', sessions: [empty()] }));
  assert.throws(() => loadManualDraft('alice', { storage, exercises }), /MANUAL_INVALID_DRAFT/);
  const invalid = empty(); invalid.routine = ['bf_A13']; invalid.prescriptions = [{ ...exercises.bf_A13.prescription, id: 'bf_A13', phase: 'missing' }];
  assert.throws(() => hydrateManualSession(invalid, exercises), /MANUAL_INVALID_DRAFT/);
});

test('storage failures are surfaced instead of reporting that a draft was saved', () => {
  const storage = { setItem() { throw new Error('quota exceeded'); } };
  assert.throws(() => saveManualDraft('alice', [empty()], { storage }), /quota exceeded/);
});
