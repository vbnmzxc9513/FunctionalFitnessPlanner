import test from 'node:test';
import assert from 'node:assert/strict';
import { largePlannerDay } from '../fixtures/plannerV3.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { createWorkoutSnapshot, readWorkoutPayload, workoutPayload, readSavedWorkout } from '../../src/domain/savedWorkouts.js';
import { createSharePayload, decodeSharePayload, encodeSharePayload, shareDay } from '../../src/domain/sharing.js';
import { createPlanPayload, decodePlanPayload, encodePlanPayload } from '../../src/domain/sharedPlans.js';
import { dateDoseDocuments, dateDoseKeys, dateDoseRecord } from '../../src/domain/dateDoseStorage.js';
import { createManualSession, hydrateManualSession, prepareManualPreview, loadManualDraft, saveManualDraft } from '../../src/domain/manualPlanner.js';

const catalog = catalogExercises();
test('24 independent exercise snapshots preserve every phase, dose and preparation while v1 retains eight bound', () => {
  const day = largePlannerDay();
  const snapshot = createWorkoutSnapshot(day);
  assert.equal(snapshot.v, 3); assert.equal(snapshot.routine.length, 24);
  assert.deepEqual(readWorkoutPayload(workoutPayload(snapshot)), snapshot);
  assert.throws(() => readWorkoutPayload(JSON.stringify({ ...snapshot, v: 1 })), /INVALID_SAVED_WORKOUT/);
  assert.throws(() => createWorkoutSnapshot({ ...day, routine: [...day.routine, 'bf_C03'] }), /INVALID_SAVED_WORKOUT/);
  const legacy = createWorkoutSnapshot({ routine: ['bf_A13'] }); legacy.v = 1;
  assert.equal(readWorkoutPayload(JSON.stringify(legacy)).routine[0], 'bf_A13');
  const record = readSavedWorkout('legacy', { v: 1, name: 'Old', payload: JSON.stringify(legacy), revision: 1, createdAt: 0, updatedAt: 0 });
  assert.equal(record.scope, 'day'); assert.deepEqual(record.tags, []); assert.equal(record.pinned, false); assert.equal(record.lastUsedAt, null);
});

test('new workout/program payloads explicitly use v3, legacy hash payloads remain decodable and lengths never truncate', () => {
  const day = largePlannerDay('2026-11-02', 14), workout = createSharePayload(day);
  assert.equal(workout.v, 3); assert.equal(workout.items.length, 14);
  assert.deepEqual(shareDay(decodeSharePayload(encodeSharePayload(workout))).routine, day.routine);
  const plan = createPlanPayload([day], { name: 'Fourteen' });
  assert.deepEqual(decodePlanPayload(encodePlanPayload(plan)), plan);
  const legacy = createSharePayload({ routine: ['bf_A13'] }); legacy.v = 1;
  assert.deepEqual(decodeSharePayload(encodeSharePayload(legacy)), legacy);
  const oldPlan = { ...createPlanPayload([{ routine: ['bf_A13'] }], { name: 'Old program' }), v: 2 };
  assert.deepEqual(decodePlanPayload(encodePlanPayload(oldPlan)), oldPlan);
  const max = createPlanPayload(Array.from({ length: 28 }, (_, offset) => ({ ...largePlannerDay(), date: undefined, offset })), { name: 'Too long embedded' });
  assert.throws(() => encodePlanPayload(max), /PLAN_SHARE_TOO_LONG/);
  assert.equal(max.days.length, 28); assert.equal(max.days[0].items.length, 24);
});

test('chunk codec orders slots 10/11 numerically, rejects revision/order/cardinality mismatches and reads old records', () => {
  const day = largePlannerDay(), metadata = { ...day, v: 3, revision: 4 };
  const records = Object.fromEntries(dateDoseDocuments(day, 4).map(({ id, data }) => [id, data]));
  assert.equal(dateDoseKeys(day.date, metadata).length, 12);
  for (const id of day.routine) assert.deepEqual(dateDoseRecord(day.date, metadata, records, id).dose, day.prescriptions.find(dose => dose.id === id));
  const key = dateDoseKeys(day.date, metadata)[0];
  for (const change of [chunk => { chunk.revision = 3; }, chunk => { chunk.items.reverse(); }, chunk => { chunk.items.pop(); }, chunk => { chunk.secret = true; }]) {
    const broken = structuredClone(records); change(broken[key]);
    assert.equal(dateDoseRecord(day.date, metadata, broken, day.routine[0]), null);
  }
  const dose = day.prescriptions[0], old = { date: day.date, exerciseId: dose.id, revision: 2, dose };
  assert.deepEqual(dateDoseRecord(day.date, { routine: [dose.id] }, { [`${day.date}_${dose.id}`]: old }, dose.id), old);
});

test('blank drafts require explicit rest and preserve that choice locally without persisting a draft flag into dated preview', () => {
  const blank = createManualSession('2026-11-02');
  assert.throws(() => prepareManualPreview([blank], { today: blank.date, exercises: catalog, eligibleExercises: catalog }), /MANUAL_EMPTY_DAY/);
  const rest = { ...blank, explicitRest: true };
  let value; const storage = { setItem: (_key, serialized) => { value = serialized; }, getItem: () => value };
  saveManualDraft(null, [rest], { storage });
  assert.equal(loadManualDraft(null, { storage })[0].explicitRest, true);
  assert.equal(hydrateManualSession({ ...blank, explicitRest: undefined }).explicitRest, true);
  const preview = prepareManualPreview([rest], { today: blank.date, exercises: catalog, eligibleExercises: catalog });
  assert.equal(preview[0].sessionType, 'rest'); assert.equal(Object.hasOwn(preview[0], 'explicitRest'), false);
});
