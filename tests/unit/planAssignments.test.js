import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentRange, planOffsets, materializeAssignments, validateAssignmentConsent } from '../../src/domain/planAssignments.js';
import { applyLocalPeriod, localPeriodState, normalizePeriodDraft } from '../../src/domain/periodDraft.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { generatePeriodPlan } from '../../src/domain/periodPlanning.js';

const today = '2026-10-19';
const exercises = catalogExercises();
const profile = { time: '40', context: { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable'], trainingDays: [1, 2, 3, 4, 5, 6, 7] } };
const range = { from: today, to: '2026-10-23' };
const generated = generatePeriodPlan(exercises, profile, range, { today }, 'zh');

test('date mapping preserves source intervals and rejects duplicate, past and oversized spans', () => {
  assert.deepEqual(planOffsets([{ date: today }, { date: '2026-10-22' }]), [0, 3]);
  assert.deepEqual(planOffsets([{ offset: 0 }, { offset: 5 }]), [0, 5]);
  for (const dates of [[today, today], ['2026-10-18'], [today, '2026-11-16'], ['2026-02-31'], []]) assert.throws(() => assignmentRange(dates, today));
  assert.deepEqual(assignmentRange([today, '2026-10-23'], today), range);
});
test('copies preserve validated movements and doses while excluding original notes, dates and factual records', () => {
  const source = generated.sessions[0];
  const [copy] = materializeAssignments([{ ...source, coachAdvice: 'PRIVATE', concept: 'PRIVATE', logs: ['PRIVATE'] }], ['2026-10-26'], { today, exercises, name: 'Monday strength' });
  assert.equal(copy.date, '2026-10-26'); assert.equal(copy.day, 1); assert.equal(copy.week, '2026-W44');
  assert.equal(copy.theme, source.theme);
  assert.equal(materializeAssignments([{ routine: source.routine, prescriptions: source.prescriptions }], ['2026-10-26'], { today, exercises, name: 'Monday strength' })[0].theme, 'Monday strength'); assert.deepEqual(copy.routine, source.routine); assert.deepEqual(copy.prescriptions, source.prescriptions);
  assert.equal(JSON.stringify(copy).includes('PRIVATE'), false);
  copy.prescriptions[0].sets = 4; assert.notEqual(source.prescriptions[0].sets, 4);
  assert.throws(() => materializeAssignments([{ ...source, routine: ['missing'] }], [today], { today, exercises }));
});
test('consent refuses every recorded date even with explicit replacement, and requires consent for unstarted plans', () => {
  const state = { sessionsByDate: { [today]: generated.sessions[0] }, protectedDates: [] };
  assert.throws(() => validateAssignmentConsent(state, [today]), /DATE_CONFLICT/);
  assert.doesNotThrow(() => validateAssignmentConsent(state, [today], [today]));
  assert.throws(() => validateAssignmentConsent({ ...state, protectedDates: [today] }, [today], [today]), /DATE_PROTECTED/);
});
test('nonconsecutive device assignments never create gap days and retain earlier sessions and logs', () => {
  const dates = [today, '2026-10-23'];
  const sessions = materializeAssignments([generated.sessions[0], generated.sessions[2]], dates, { today, exercises });
  const empty = localPeriodState(null, range, today);
  const first = applyLocalPeriod(null, { range, selectedDates: dates, sessions, profile, weeklySummaries: [], conclusion: '', expectedState: empty.expectedState }, today);
  assert.deepEqual(Object.keys(first.sessionsByDate).sort(), dates);
  assert.deepEqual(normalizePeriodDraft(JSON.parse(JSON.stringify(first))).dates, dates);
  const nextRange = { from: '2026-10-26', to: '2026-10-26' };
  const state = localPeriodState(first, nextRange, today);
  const next = applyLocalPeriod(first, { range: nextRange, selectedDates: [nextRange.from], sessions: materializeAssignments([sessions[0]], [nextRange.from], { today, exercises }), profile, conclusion: '', weeklySummaries: [], expectedState: state.expectedState }, today);
  assert.deepEqual(next.sessionsByDate[today], first.sessionsByDate[today]);
  assert.equal(Object.keys(next.sessionsByDate).length, 3);
});
