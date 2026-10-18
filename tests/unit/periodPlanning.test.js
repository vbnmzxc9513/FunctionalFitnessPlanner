import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlanningRange, enumeratePeriodDates, generatePeriodPlan, normalizePlanningRange, sanitizePeriodSession } from '../../src/domain/periodPlanning.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { normalizePlanningContext, estimateSessionMinutes, validateGeneratedDay } from '../../src/domain/planning.js';
import { normalizeSchedule, calculateStats } from '../../src/domain/training.js';
import { generateTemplatePlan } from '../../src/domain/templatePlanner.js';
import { trainingLogId } from '../../src/domain/coaching.js';
import { buildTrainingReport } from '../../src/domain/trainingExport.js';

const exercises = catalogExercises();
const context = { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable'], trainingDays: [1, 2, 3, 4, 5, 6, 7] };
const profile = { context, time: '30', focus: 'strength', goal: 'Repeatable training' };
const strength = session => session.prescriptions.some(dose => dose.phase === 'strength');
const plan = (from, to, options = {}, input = profile) => generatePeriodPlan(exercises, input, { from, to }, { today: from, ...options }, 'en');

test('planning ranges are inclusive, future-start capable and bounded across leap and ISO years', () => {
  assert.deepEqual(defaultPlanningRange('2026-12-29'), { from: '2026-12-29', to: '2027-01-04' });
  assert.deepEqual(normalizePlanningRange({ from: '2028-02-28', to: '2028-03-01' }, '2028-02-01'), { from: '2028-02-28', to: '2028-03-01' });
  assert.equal(enumeratePeriodDates({ from: '2028-02-28', to: '2028-03-01' }).length, 3);
  for (const range of [{ from: '2026-02-30', to: '2026-03-02' }, { from: '2026-10-01', to: '2026-10-29' }, { from: '2026-09-30', to: '2026-10-01' }]) {
    assert.throws(() => normalizePlanningRange(range, '2026-10-01'), /INVALID_PLANNING_RANGE/);
  }
  assert.equal(plan('2026-12-29', '2027-01-25').sessions.length, 28);
});

test('partial weeks allocate strength inside the range and weekends can be actual training days', () => {
  const result = plan('2026-10-17', '2026-10-18');
  assert.deepEqual(result.sessions.map(session => [session.date, session.day]), [['2026-10-17', 6], ['2026-10-18', 7]]);
  assert.equal(result.sessions.filter(strength).length, 1);
  assert.equal(result.weeklySummaries[0].strengthSessions, 1);
  for (const session of result.sessions) {
    assert.ok(estimateSessionMinutes(session, exercises) <= 30);
    assert.deepEqual(validateGeneratedDay(session, exercises, 30), Object.fromEntries(Object.entries(session).filter(([key]) => !['date', 'week'].includes(key))));
  }
});

test('training weekdays normalize explicitly and unselected days stay completely at rest', () => {
  assert.deepEqual(normalizePlanningContext({}).trainingDays, [1, 2, 3, 4, 5]);
  assert.deepEqual(normalizePlanningContext({ trainingDays: [7, 7, '1', 0, 8, 6] }).trainingDays, [6, 7]);
  const none = plan('2026-10-17', '2026-10-23', {}, { ...profile, context: { ...context, trainingDays: [] } });
  assert.ok(none.sessions.every(session => session.sessionType === 'rest' && !session.routine.length));
  const weekends = plan('2026-10-17', '2026-10-23', {}, { ...profile, context: { ...context, trainingDays: [6, 7] } });
  assert.ok(weekends.sessions.filter(session => session.day <= 5).every(session => session.sessionType === 'rest'));
});

test('strength spacing carries across Sunday and Monday including protected and prior sessions', () => {
  const sunday = plan('2026-10-18', '2026-10-18').sessions[0];
  assert.ok(strength(sunday));
  const result = plan('2026-10-18', '2026-10-25', { existingSessions: { [sunday.date]: sunday }, protectedDates: [sunday.date] });
  assert.deepEqual(result.sessions[0], sunday);
  const dates = result.sessions.filter(strength).map(session => Date.parse(`${session.date}T12:00:00Z`));
  assert.ok(dates.every((date, index) => !index || date - dates[index - 1] >= 2 * 86400000));
  const next = plan('2026-10-19', '2026-10-19', { previousSessions: [sunday] });
  assert.equal(next.sessions.filter(strength).length, 0);
});

test('protected dates retain original doses despite new availability/time and private fields are stripped', () => {
  const original = plan('2026-10-19', '2026-10-19').sessions[0];
  const withPrivate = { ...original, healthNotes: 'private', revision: 8, prescriptions: original.prescriptions.map(dose => ({ ...dose, factualLoad: 99 })) };
  const result = plan('2026-10-19', '2026-10-20', { existingSessions: { '2026-10-19': withPrivate }, protectedDates: ['2026-10-19'] }, { ...profile, time: 5, context: { ...context, trainingDays: [] } });
  assert.deepEqual(result.sessions[0], original);
  assert.deepEqual(sanitizePeriodSession(withPrivate, { exercises }), original);
  assert.equal(result.sessions[1].sessionType, 'rest');
  assert.throws(() => sanitizePeriodSession({ ...original, day: 7 }), /INVALID_PERIOD_SESSION/);
});

test('clinical restrictions, actual competition dates and complete warm-up timing survive range planning', () => {
  const restricted = plan('2026-10-17', '2026-10-30', {}, { ...profile, context: { ...context, healthNotes: 'numbness in leg', healthStatus: 'restricted' } });
  assert.ok(restricted.sessions.every(session => session.sessionType === 'rest'));
  const taper = plan('2026-10-17', '2026-10-25', {}, { ...profile, context: { ...context, competitionDate: '2026-10-20' } });
  assert.ok(taper.sessions.filter(session => session.date >= '2026-10-18' && session.date <= '2026-10-22').every(session => session.sessionType === 'rest'));
  const full = plan('2026-10-17', '2026-11-13');
  assert.ok(full.sessions.some(session => session.routine.includes('bf_A12')));
  for (const session of full.sessions) {
    assert.ok(session.routine.length <= 8);
    assert.ok(estimateSessionMinutes(session, exercises) <= 30);
    for (const dose of session.prescriptions.filter(dose => dose.id === 'bf_A12')) assert.deepEqual([dose.sets, dose.value, dose.unit], [1, '6', 'minutes']);
  }
});

test('seven-day schedules and weekend marks retain logging, statistics and report identity', () => {
  const sessions = plan('2026-10-12', '2026-10-18').sessions;
  assert.equal(normalizeSchedule(sessions, exercises).length, 7);
  assert.equal(trainingLogId({ week: '2026-W42', day: 7, exerciseId: 'bf_B01' }), '2026-W42-D7-bf_B01');
  const progress = { '2026-W42': { completed: { day7_bf_B01: true }, completedAt: { day7_bf_B01: '2026-10-18' } } };
  assert.equal(calculateStats(progress, exercises).totalCompleted, 1);
  assert.equal(buildTrainingReport({ from: '2026-10-18', to: '2026-10-18', today: '2026-10-18', progress, exercises }).counts.completion, 1);
  assert.equal(generateTemplatePlan(exercises, context, 30, 'en', { currentDate: '2026-10-18' }).schedule.length, 5);
});

test('protected strength dates consume the weekly budget before new dates are allocated', () => {
  const monday = plan('2026-10-19', '2026-10-19').sessions[0];
  const friday = plan('2026-10-23', '2026-10-23').sessions[0];
  assert.ok(strength(monday) && strength(friday));
  const result = plan('2026-10-19', '2026-10-25', { existingSessions: { [monday.date]: monday, [friday.date]: friday }, protectedDates: [monday.date, friday.date] });
  assert.deepEqual(result.sessions.filter(strength).map(session => session.date), [monday.date, friday.date]);
  assert.equal(result.weeklySummaries[0].strengthSessions, 2);
});

test('protected legacy sessions remain read-only with their original targets and missing preparation', () => {
  const legacy = { date: '2026-10-19', day: 1, name: 'Monday', theme: 'Old strength', concept: 'Original purpose', coachAdvice: 'Original advice',
    routine: ['bf_B01'], prescriptions: [{ id: 'bf_B01', sets: 2, value: '8', unit: 'reps', restSeconds: 60, perSide: false }], healthNotes: 'private' };
  const result = plan('2026-10-19', '2026-10-25', { existingSessions: { [legacy.date]: legacy }, protectedDates: [legacy.date] });
  const kept = result.sessions[0];
  assert.deepEqual(kept.prescriptions, legacy.prescriptions);
  assert.equal(kept.warmupNote, undefined);
  assert.equal(kept.sessionType, undefined);
  assert.equal(kept.prescriptions[0].phase, undefined);
  assert.equal(kept.prescriptions[0].preparation, undefined);
  assert.equal(kept.healthNotes, undefined);
  assert.equal(result.weeklySummaries[0].strengthSessions, 2);
  assert.ok(!result.sessions.filter(strength).some(session => session.date === '2026-10-20'));
  assert.throws(() => sanitizePeriodSession(kept, { exercises }), /INVALID_AI_SESSION/);
  const withoutTargets = { ...legacy, prescriptions: undefined };
  const noTargets = plan('2026-10-19', '2026-10-20', { existingSessions: { [legacy.date]: withoutTargets }, protectedDates: [legacy.date] }).sessions[0];
  assert.deepEqual(noTargets.prescriptions, []);
  assert.deepEqual(noTargets.routine, legacy.routine);
});

test('fixed Sunday and following Monday strength constrain a range ending Saturday or Sunday', () => {
  for (const [from, neighbor] of [['2026-10-17', '2026-10-18'], ['2026-10-18', '2026-10-19']]) {
    const fixed = plan(neighbor, neighbor).sessions[0];
    const original = structuredClone(fixed);
    assert.ok(strength(fixed));
    const result = plan(from, from, { previousSessions: [fixed], existingSessions: { [neighbor]: fixed } });
    assert.equal(result.sessions.length, 1);
    assert.equal(result.sessions[0].date, from);
    assert.equal(result.sessions.filter(strength).length, 0);
    assert.deepEqual(fixed, original);
    assert.ok(!result.sessions.some(session => session.date === neighbor));
  }
});

test('unchanged future strength consumes its ISO week budget without establishing taper familiarity', () => {
  const wednesday = plan('2026-10-21', '2026-10-21').sessions[0];
  const friday = plan('2026-10-23', '2026-10-23').sessions[0];
  const result = plan('2026-10-19', '2026-10-19', { previousSessions: [wednesday, friday] });
  assert.equal(result.sessions.filter(strength).length, 0);
  const future = plan('2026-10-26', '2026-10-26').sessions[0];
  const taper = plan('2026-10-17', '2026-10-17', { previousSessions: [future] }, { ...profile, context: { ...context, competitionDate: '2026-10-20' } });
  assert.notEqual(taper.sessions[0].sessionType, 'training');
});


test('a future plan before a future-start range does not establish taper familiarity', () => {
  const unperformed = plan('2026-11-02', '2026-11-02').sessions[0];
  assert.ok(strength(unperformed));
  const input = { ...profile, context: { ...context, competitionDate: '2026-11-16' } };
  const withoutHistory = plan('2026-11-09', '2026-11-15', { today: '2026-10-18' }, input);
  const withUnperformedPlan = plan('2026-11-09', '2026-11-15', { today: '2026-10-18', previousSessions: [unperformed] }, input);
  assert.ok(withoutHistory.sessions.every(session => session.sessionType !== 'training'));
  assert.deepEqual(withUnperformedPlan.sessions, withoutHistory.sessions);
});
