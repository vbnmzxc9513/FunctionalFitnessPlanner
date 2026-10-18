import test from 'node:test';
import { LEGACY_DEFAULT_SCHEDULE_I18N } from '../../src/locale.js';
import assert from 'node:assert/strict';
import { monthlyStats, calculateStats } from '../../src/domain/training.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { generatePeriodPlan, sanitizePeriodSession } from '../../src/domain/periodPlanning.js';
import { plannedSnapshot, validateTrainingLog } from '../../src/domain/coaching.js';
import { applyLocalPeriod, localPeriodState, normalizePeriodDraft, upsertLocalPeriodLog, localPeriodProgressView, periodFromWeeklyDraft } from '../../src/domain/periodDraft.js';

const profile = { context: { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable'], trainingDays: [1, 2, 3, 4, 5, 6, 7] }, focus: 'strength', time: '30', goal: '' };
const range = { from: '2020-01-06', to: '2020-01-13' };
const generated = generatePeriodPlan(catalogExercises(), profile, range, { today: range.from }, 'en');
const fixture = () => ({ version: 1, range, profile, sessionsByDate: Object.fromEntries(generated.sessions.map(session => [session.date, { ...session, revision: 1 }])),
  logs: [], readiness: [], progressByWeek: {}, weeklySummaries: generated.weeklySummaries });
function logFor(session, actualDate) {
  const dose = session.prescriptions.find(item => item.phase === 'strength') || session.prescriptions[0];
  return validateTrainingLog({ schemaVersion: 1, week: session.week, day: session.day, date: actualDate, exerciseId: dose.id, variant: 'bodyweight', loadKg: null, loadBasis: 'none', resistanceLabel: '',
    unit: dose.unit, perSide: dose.perSide, sets: [{ value: 1, otherSide: dose.perSide ? 1 : null }], rir: null, quality: 'good', symptoms: 'none', nextDay: 'pending', planned: plannedSnapshot(dose) });
}
test('local completion stores and restores its factual date rather than the scheduled date', () => {
  const draft = fixture(); const session = draft.sessionsByDate['2020-01-06']; const log = logFor(session, '2020-01-07');
  const updated = upsertLocalPeriodLog(draft, log, true, '2020-01-07'); const key = `day${log.day}_${log.exerciseId}`;
  assert.equal(updated.progressByWeek[log.week].completedAt[key], '2020-01-07');
  assert.equal(normalizePeriodDraft(JSON.parse(JSON.stringify(updated))).progressByWeek[log.week].completedAt[key], '2020-01-07');
  assert.equal(upsertLocalPeriodLog(updated, log, true, '2020-01-08').progressByWeek[log.week].completedAt[key], '2020-01-07');
});
test('a supplemental log protects its scheduled slot independently of the actual logging date', () => {
  const draft = fixture(); const scheduled = draft.sessionsByDate['2020-01-08']; draft.logs = [logFor(scheduled, '2020-01-07')];
  const state = localPeriodState(draft, range, '2020-01-07');
  assert.ok(state.protectedDates.includes('2020-01-08'));
  assert.ok(!state.protectedDates.includes('2020-01-07'));
  const preview = { ...generated, profile, expectedState: state.expectedState, sessions: generated.sessions.map(session => ({ ...session, theme: 'Changed' })) };
  const result = applyLocalPeriod(draft, preview, '2020-01-07');
  assert.deepEqual(result.sessionsByDate['2020-01-08'], scheduled);
  assert.throws(() => applyLocalPeriod({ ...draft, conclusion: 'new actuals' }, preview, '2020-01-07'), /PERIOD_CHANGED/);
});
test('restoration rejects invalid range and mismatched date identity and bounds public summaries', () => {
  const draft = fixture();
  assert.equal(normalizePeriodDraft({ ...draft, range: { from: range.to, to: range.from } }), null);
  assert.equal(normalizePeriodDraft({ ...draft, range: { from: range.from, to: '2020-02-10' } }), null);
  const date = range.from;
  for (const patch of [{ date: '2020-01-07' }, { week: '2020-W03' }, { day: 7 }]) {
    const bad = structuredClone(draft); bad.sessionsByDate[date] = { ...bad.sessionsByDate[date], ...patch };
    assert.ok(!normalizePeriodDraft(bad).sessionsByDate[date]);
  }
  const clean = normalizePeriodDraft({ ...draft, weeklySummaries: [{ ...generated.weeklySummaries[0], minutes: 999999, trainingSessions: -3, privateNote: 'excluded' }] });
  assert.equal(clean.weeklySummaries[0].minutes, 6720); assert.equal(clean.weeklySummaries[0].trainingSessions, 0);
  assert.equal(clean.weeklySummaries[0].privateNote, undefined);
});

test('local statistics use native Sunday sessions and calendar month boundaries without inventing facts', () => {
  const exercises = catalogExercises();
  const result = generatePeriodPlan(exercises, profile, { from: '2019-06-30', to: '2019-07-02' }, { today: '2019-06-30' }, 'en');
  const sessionsByDate = Object.fromEntries(result.sessions.map(session => [session.date, session]));
  const sunday = sessionsByDate['2019-06-30']; const tuesday = sessionsByDate['2019-07-02'];
  assert.ok(sunday.routine.length && tuesday.routine.length);
  const sundayKey = `day7_${sunday.routine[0]}`; const tuesdayKey = `day2_${tuesday.routine[0]}`;
  const draft = { sessionsByDate, progressByWeek: {
    [sunday.week]: { completed: { [sundayKey]: true }, completedAt: { [sundayKey]: '2019-06-30' } },
    [tuesday.week]: { completed: { [tuesdayKey]: true }, completedAt: { [tuesdayKey]: '2019-07-02' } },
  } };
  const original = structuredClone(draft);
  const progress = localPeriodProgressView(draft, exercises);
  assert.deepEqual(draft, original);
  assert.deepEqual(progress[sunday.week].completedAt, draft.progressByWeek[sunday.week].completedAt);
  assert.equal(progress[sunday.week].totalExercises, sunday.routine.length);
  assert.equal(progress[sunday.week].exerciseTypes[sundayKey], exercises[sunday.routine[0]].type);
  const months = monthlyStats(progress, {}, [{ day: 1, routine: ['legacy_only'] }], exercises);
  assert.deepEqual(months.map(month => [month.monthKey, month.completed, month.total]), [
    ['2019-07', 1, result.sessions.filter(session => session.date.startsWith('2019-07')).reduce((sum, day) => sum + day.routine.length, 0)],
    ['2019-06', 1, sunday.routine.length],
  ]);
  const stats = calculateStats(progress, exercises);
  assert.equal(stats.totalCompleted, 2);
  assert.equal(stats.dailyMap[`${sunday.week}-7`], 1);
  assert.equal(stats.totalActiveDays, 2);
  const unstarted = localPeriodProgressView({ sessionsByDate, progressByWeek: {} }, exercises);
  assert.equal(calculateStats(unstarted, exercises).totalCompleted, 0);
  assert.equal(Object.keys(unstarted[sunday.week].completed || {}).length, 0);
});

test('local range replacement uses fixed neighbors on both sides and leaves their sessions unchanged', () => {
  const exercises = catalogExercises();
  for (const [date, beforeDate, afterDate] of [['2020-01-11', '2020-01-09', '2020-01-12'], ['2020-01-12', '2020-01-10', '2020-01-13']]) {
    const make = value => generatePeriodPlan(exercises, profile, { from: value, to: value }, { today: value }, 'en').sessions[0];
    const before = make(beforeDate), after = make(afterDate);
    const replacementRange = { from: date, to: date };
    const draft = { version: 1, range: replacementRange, sessionsByDate: { [beforeDate]: before, [afterDate]: after }, profile, progressByWeek: {}, logs: [], readiness: [] };
    const original = structuredClone(draft);
    const state = localPeriodState(draft, replacementRange, date);
    assert.deepEqual(state.previousSessions.map(session => session.date).sort(), [beforeDate, afterDate]);
    const generated = generatePeriodPlan(exercises, profile, replacementRange, { today: date, ...state }, 'en');
    assert.ok(!generated.sessions[0].prescriptions.some(dose => dose.phase === 'strength'));
    const updated = applyLocalPeriod(draft, { ...generated, profile, expectedState: state.expectedState }, date);
    assert.deepEqual(updated.sessionsByDate[beforeDate], before);
    assert.deepEqual(updated.sessionsByDate[afterDate], after);
    assert.deepEqual(draft, original);
  }
});


test('legacy weekly conversion, partial replacement and reload retain factual records without inventing targets', () => {
  const week = '2020-W02';
  const oldLog = validateTrainingLog({ schemaVersion: 1, week, day: 2, date: '2020-01-07', exerciseId: 'dead_bug',
    variant: 'bodyweight', loadKg: null, loadBasis: 'none', resistanceLabel: '', unit: 'reps', perSide: true,
    sets: [{ value: 6, otherSide: 6 }], rir: null, quality: 'good', symptoms: 'none', nextDay: 'pending',
    planned: { sets: 2, value: '6', unit: 'reps', perSide: true, phase: 'legacy', restSeconds: 60 } });
  const source = { week, plan: { schedule: structuredClone(LEGACY_DEFAULT_SCHEDULE_I18N.zh), conclusion: 'Saved legacy plan' }, profile,
    completed: { day1_single_dl: true }, completedAt: { day1_single_dl: '2020-01-06' }, logs: [oldLog], readiness: [] };
  source.plan.schedule[1].prescriptions = [{ id: 'dead_bug', sets: 2, value: '6', unit: 'reps', perSide: true, restSeconds: 60, privateActual: 99 }];
  const converted = periodFromWeeklyDraft(source);
  assert.ok(converted);
  const monday = converted.sessionsByDate['2020-01-06'], tuesday = converted.sessionsByDate['2020-01-07'];
  assert.equal(monday.legacy, true);
  assert.deepEqual(monday.prescriptions, []);
  assert.equal(monday.warmupNote, undefined);
  assert.equal(tuesday.prescriptions[0].phase, undefined);
  assert.equal(tuesday.prescriptions[0].preparation, undefined);
  assert.equal(tuesday.prescriptions[0].privateActual, undefined);
  const replacementRange = { from: '2020-01-06', to: '2020-01-08' };
  const state = localPeriodState(converted, replacementRange, replacementRange.from);
  assert.deepEqual(state.protectedDates.sort(), ['2020-01-06', '2020-01-07']);
  const generated = generatePeriodPlan(catalogExercises(), profile, replacementRange, { today: replacementRange.from, ...state, existingSessions: state.sessionsByDate }, 'en');
  const updated = applyLocalPeriod(converted, { ...generated, profile, expectedState: state.expectedState }, replacementRange.from);
  const restored = normalizePeriodDraft(JSON.parse(JSON.stringify(updated)));
  assert.deepEqual(restored.sessionsByDate['2020-01-06'], monday);
  assert.deepEqual(restored.sessionsByDate['2020-01-07'], tuesday);
  assert.deepEqual(restored.sessionsByDate['2020-01-09'], converted.sessionsByDate['2020-01-09']);
  assert.deepEqual(restored.logs, [oldLog]);
  assert.deepEqual(restored.progressByWeek[week], { completed: source.completed, completedAt: source.completedAt });
  const replaced = restored.sessionsByDate['2020-01-08'];
  assert.equal(replaced.legacy, undefined);
  assert.doesNotThrow(() => sanitizePeriodSession(replaced));
  assert.throws(() => sanitizePeriodSession(monday));
});

test('incomplete native sessions require explicit legacy conversion markers and cannot bypass strict replacement', () => {
  const converted = periodFromWeeklyDraft({ week: '2020-W02', plan: { schedule: LEGACY_DEFAULT_SCHEDULE_I18N.zh }, profile });
  const date = '2020-01-06';
  const unmarked = structuredClone(converted);
  delete unmarked.sessionsByDate[date].legacy;
  assert.equal(normalizePeriodDraft(unmarked).sessionsByDate[date], undefined);
  const dirty = structuredClone(converted);
  dirty.sessionsByDate[date].healthNotes = 'private';
  assert.equal(normalizePeriodDraft(dirty).sessionsByDate[date].healthNotes, undefined);
  const replacementRange = { from: date, to: date };
  const state = localPeriodState(converted, replacementRange, date);
  assert.throws(() => applyLocalPeriod(converted, { range: replacementRange, sessions: [converted.sessionsByDate[date]], profile,
    expectedState: state.expectedState }, date));
});
