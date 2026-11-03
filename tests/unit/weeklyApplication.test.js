import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyApplicationDraft } from '../../src/domain/weeklyApplication.js';
import { getQuickWorkout } from '../../src/domain/quickWorkouts.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';

const exercises = catalogExercises('zh');
const profile = { time: '40', focus: 'balanced', context: {} };
const source = () => ({ conclusion: 'Weekly preview', schedule: Array.from({ length: 5 }, (_, index) => ({
  day: index + 1, name: `Day ${index + 1}`, theme: 'Preparation', concept: '', coachAdvice: '',
  warmupNote: 'Follow each movement.', cooldownNote: 'No extra cooldown.', sessionType: 'recovery',
  routine: getQuickWorkout('daily-warmup').routine, prescriptions: getQuickWorkout('daily-warmup').prescriptions,
})) });
test('weekly preview preserves Monday–Friday dates midweek without shifting or dropping past days', () => {
  const plan = source(), original = structuredClone(plan);
  const foot = getQuickWorkout('foot-arch-control');
  plan.schedule[0].routine.push(...foot.routine);
  plan.schedule[0].prescriptions.push(...foot.prescriptions);
  plan.schedule[0].sessionType = 'training';
  const withTraining = structuredClone(plan);
  const draft = weeklyApplicationDraft(plan, profile, '2026-W45', { today: '2026-11-04', exercises });
  assert.deepEqual(draft.dates, ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
  assert.equal(draft.sessions[0].routine.length, 11);
  assert.deepEqual(draft.sessions[0].routine, withTraining.schedule[0].routine);
  assert.equal(draft.legacyWeek, '2026-W45');
  assert.deepEqual(plan, withTraining);
  assert.equal(original.schedule[0].routine.length, 8);
  assert.equal('completed' in draft, false);
});
test('weekly conversion rejects another week, duplicate days or an incomplete weekly preview', () => {
  assert.throws(() => weeklyApplicationDraft(source(), profile, '2026-W44', { today: '2026-11-04', exercises }), /INVALID_LEGACY_WEEK/);
  const duplicate = source(); duplicate.schedule[4].day = 1;
  assert.throws(() => weeklyApplicationDraft(duplicate, profile, '2026-W45', { today: '2026-11-04', exercises }), /INVALID_LEGACY_WEEK/);
  const incomplete = source(); incomplete.schedule.pop();
  assert.throws(() => weeklyApplicationDraft(incomplete, profile, '2026-W45', { today: '2026-11-04', exercises }), /INVALID_LEGACY_WEEK/);
});
