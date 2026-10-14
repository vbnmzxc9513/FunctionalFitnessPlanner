import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES_I18N, DEFAULT_SCHEDULE_I18N } from '../../src/locale.js';
import { countCompleted, normalizeSchedule } from '../../src/domain/training.js';
import { exercisePhase, moveWithinPhase } from '../../src/domain/phases.js';
import { sessionSections, estimateSessionMinutes } from '../../src/domain/sessions.js';
import { validateGeneratedPlan } from '../../src/domain/planning.js';

const exercises = EXERCISES_I18N.zh;
const plan = () => structuredClone({ conclusion: 'Phased weekly example', schedule: DEFAULT_SCHEDULE_I18N.zh });

test('default training starts with warm-up, prepares the first lift and gives a finishing decision', () => {
  const value = validateGeneratedPlan(plan(), exercises, 40);
  const monday = value.schedule[0];
  const sections = sessionSections(monday, exercises);
  assert.equal(sections[0].phase, 'warmup');
  assert.equal(sections[0].preparation[0].id, 'bf_B01');
  assert.ok(sections.find(section => section.phase === 'cooldown').items.length);
  assert.equal(countCompleted([monday]).total, monday.routine.length, 'preparation adds no separate completion slot');
});
test('preparation and recovery decisions survive normalized storage without being replaced by global difficulty', () => {
  const value = plan();
  const normalized = normalizeSchedule(value.schedule, exercises);
  assert.deepEqual(normalized[0].prescriptions, value.schedule[0].prescriptions);
  assert.equal(normalized[1].sessionType, 'recovery');
  assert.ok(normalized[1].cooldownNote);
  const noPrep = structuredClone(normalized[0]); noPrep.prescriptions.forEach(dose => delete dose.preparation);
  assert.ok(estimateSessionMinutes(normalized[0], exercises) > estimateSessionMinutes(noPrep, exercises));
});
test('generation rejects missing warm-up, backwards phase order, missing prep and a fatiguing prep set', () => {
  const missing = plan(); missing.schedule[0].routine = missing.schedule[0].routine.filter(id => id !== 'bf_A01');
  missing.schedule[0].prescriptions = missing.schedule[0].prescriptions.filter(dose => dose.id !== 'bf_A01');
  assert.throws(() => validateGeneratedPlan(missing, exercises, 40), /AI_WARMUP_MISSING/);
  const backwards = plan(); backwards.schedule[0].routine.reverse();
  assert.throws(() => validateGeneratedPlan(backwards, exercises, 40), /INVALID_AI_PHASE_ORDER/);
  const noPrep = plan(); noPrep.schedule[0].prescriptions.forEach(dose => delete dose.preparation);
  assert.throws(() => validateGeneratedPlan(noPrep, exercises, 40), /AI_PREPARATION_MISSING/);
  const heavy = plan(); heavy.schedule[0].prescriptions.find(dose => dose.preparation).preparation.sets = 5;
  assert.throws(() => validateGeneratedPlan(heavy, exercises, 40), /INVALID_AI_PREPARATION/);
});
test('recovery rejects hidden strength work and rest days require no warm-up or finishing exercises', () => {
  const value = plan(); value.schedule[0].sessionType = 'recovery';
  assert.throws(() => validateGeneratedPlan(value, exercises, 40), /INVALID_AI_RECOVERY/);
  const rest = plan(); rest.schedule[0] = { ...rest.schedule[0], sessionType: 'rest', routine: [], prescriptions: [] };
  assert.doesNotThrow(() => validateGeneratedPlan(rest, exercises, 40));
});
test('legacy grouping leaves the saved IDs untouched and within-phase moves preserve phase boundaries', () => {
  const legacy = { routine: ['bf_B01', 'bf_A01', 'bf_H01', 'bf_B06'] };
  const original = [...legacy.routine];
  const sections = sessionSections(legacy, exercises);
  assert.deepEqual(legacy.routine, original);
  assert.deepEqual(sections.find(section => section.phase === 'strength').items.map(item => item.id), ['bf_B01', 'bf_B06']);
  const moved = moveWithinPhase(legacy, 'bf_B06', -1, exercises);
  assert.deepEqual(moved.routine, ['bf_B06', 'bf_A01', 'bf_H01', 'bf_B01']);
  assert.equal(exercisePhase(moved, 'bf_A01', exercises.bf_A01), 'warmup');
});
