import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { createMobilityContext, mobilityAreas, mobilityEvidence, scheduledMobility, datedPlanningSessions } from '../../src/domain/mobility.js';
import { generatePeriodPlan } from '../../src/domain/periodPlanning.js';
import { generateTemplatePlan } from '../../src/domain/templatePlanner.js';
import { buildPlanningPrompt } from '../../src/domain/coachingPrompt.js';
import { estimateSessionMinutes } from '../../src/domain/sessions.js';

const exercises = catalogExercises();
const today = '2026-10-19';
const context = { healthStatus: 'unrestricted', equipment: ['dumbbell', 'cable'], trainingDays: [1, 2, 3, 4, 5, 6, 7], badmintonDays: [2, 4, 5] };
const log = (id, date = '2026-10-18', patch = {}) => ({ week: '2026-W42', day: 7, exerciseId: id, date, variant: 'bodyweight', loadKg: null, loadBasis: 'none', resistanceLabel: '', unit: 'reps', perSide: false,
  sets: [{ value: 4, otherSide: null }], rir: null, quality: 'good', symptoms: 'none', nextDay: 'pending', planned: { sets: 1, value: '4', unit: 'reps', perSide: false, phase: 'warmup', restSeconds: 20 }, schemaVersion: 1, ...patch });
const intent = patch => createMobilityContext({ date: today, today, exercises, context: {}, ...patch });
const plan = (patch = {}, profile = context, time = 30) => generatePeriodPlan(exercises, { context: profile, time }, { from: today, to: '2026-11-01' }, { today, ...patch });

test('eight regions track mobility without counting lifting, scapular activation, rolling or forged codes', () => {
  assert.deepEqual(mobilityAreas('bf_A13'), ['thoracic', 'hip_front', 'hip_rotation', 'adductors', 'quads', 'hamstrings', 'ankle']);
  assert.deepEqual(mobilityAreas('bf_A15'), ['hip_rotation']);
  assert.deepEqual(mobilityAreas('bf_A14'), ['quads']);
  for (const id of ['bf_B10', 'bf_A07', 'bf_H09', 'bf_D09']) assert.deepEqual(mobilityAreas(id), []);
  assert.deepEqual(mobilityAreas('fake', { fake: exercises.bf_A09 }), []);
  const rows = scheduledMobility([{ date: today, routine: ['bf_A13', 'bf_A13', 'bf_A09'] }]);
  assert.ok(rows.every(row => row.dates.length === 1));
});

test('dated actual records and completedAt establish coverage; old plans, zero-work and future logs do not', () => {
  const past = { date: '2026-10-18', routine: ['bf_A13'] };
  const unknown = intent({ sessions: [past] });
  assert.ok(unknown.ranked.every(area => area.dates.length === 0));
  const evidence = mobilityEvidence({ today, date: today, exercises, sessions: [past], logs: [log('bf_A09'), log('bf_A06', '2026-10-20'), log('bf_A02', '2026-10-18', { sets: [{ value: 0, otherSide: null }] })], progressByWeek: { '2026-W42': { completed: { day7_bf_A15: true, day7_bf_A14: true }, completedAt: { day7_bf_A15: '2026-10-18' } } } });
  assert.deepEqual(evidence.rows.map(row => row.id).sort(), ['bf_A09', 'bf_A15']);
  const actual = intent({ logs: [log('bf_A09')] });
  assert.deepEqual(actual.ranked.find(row => row.area === 'shoulder').dates, ['2026-10-18']);
});

test('recent actual hinge and upper-body work change regional priorities; planned work remains explicitly uncertain', () => {
  const hinge = intent({ logs: [log('bf_B11')] });
  const upper = intent({ logs: [log('bf_C01')] });
  assert.ok(['hip_rotation', 'hamstrings'].includes(hinge.ranked[0].area));
  assert.ok(['shoulder', 'thoracic'].includes(upper.ranked[0].area));
  assert.ok(hinge.ranked[0].reasons.includes('recorded_training'));
  const planned = intent({ sessions: [{ date: '2026-10-18', routine: ['bf_B11'] }] });
  assert.ok(planned.ranked.find(row => row.area === 'hamstrings').reasons.includes('planned_training'));
  assert.ok(!planned.ranked.some(row => row.reasons.includes('recorded_training')));
  const first = plan({ logs: [log('bf_B11')] }).sessions;
  const second = plan({ logs: [log('bf_C01')] }).sessions;
  assert.notEqual(first[1].warmupNote, second[1].warmupNote);
});

test('recent court reports override an assumed court day and keep unknowns distinct', () => {
  const profile = { badmintonDays: [7] };
  const ready = { date: today, sleepHours: 8, fatigue: 0, soreness: 0, symptoms: 'none', yesterdayCourtMinutes: 0, yesterdayCourtRpe: null, todayCourtIntensity: 'none', schemaVersion: 1 };
  assert.ok(intent({ context: profile }).ranked.some(row => row.reasons.includes('planned_court')));
  assert.ok(!intent({ context: profile, readiness: [ready] }).ranked.some(row => row.reasons.some(reason => reason.includes('court'))));
  assert.ok(intent({ readiness: [{ ...ready, yesterdayCourtMinutes: 60, yesterdayCourtRpe: 6 }] }).ranked.some(row => row.reasons.includes('reported_court')));
});

test('longer gaps outrank recently repeated regions even without strength work for the neglected area', () => {
  const recent = ['2026-10-17', '2026-10-18'].flatMap(date => ['bf_A06', 'bf_A09', 'bf_A04', 'bf_A15', 'bf_A05', 'bf_A03', 'bf_A02'].map(id => log(id, date)));
  const result = intent({ logs: recent });
  assert.equal(result.ranked[0].area, 'quads');
  assert.ok(result.ranked[0].reasons.includes('maintenance'));
  const period = plan({}, { ...context, equipment: [], badmintonDays: [1, 2, 3, 4, 5, 6, 7] }, 15);
  assert.ok(scheduledMobility(period.sessions.slice(0, 7)).every(row => row.dates.length >= 1));
  assert.ok(scheduledMobility(period.sessions.slice(7)).every(row => row.dates.length >= 1));
  assert.ok(period.sessions.every(day => day.sessionType === 'recovery' && day.routine.length <= 3 && estimateSessionMinutes(day, exercises) <= 15));
});

test('prospective coverage crosses ISO weeks, ignores future neighbors and preserves logged dates', () => {
  const future = { date: '2026-10-25', routine: ['bf_A13'] };
  assert.ok(intent({ sessions: [future] }).ranked.every(area => area.dates.length === 0));
  const nextWeek = createMobilityContext({ date: '2026-10-26', today, sessions: [future], exercises, context: {} });
  assert.deepEqual(nextWeek.ranked.find(row => row.area === 'quads').dates, ['2026-10-25']);
  const base = plan(); const protectedDay = base.sessions[1]; const snapshot = structuredClone(protectedDay);
  const changed = plan({ existingSessions: { [protectedDay.date]: protectedDay }, protectedDates: [protectedDay.date], logs: [log('bf_B11')] });
  assert.deepEqual(changed.sessions[1], snapshot);
  assert.ok(changed.sessions.every(day => estimateSessionMinutes(day, exercises) <= 30));
  assert.deepEqual(datedPlanningSessions({ '2026-W42': { schedule: [{ day: 7, routine: ['bf_A01'] }] } }, { a: future }).map(day => day.date), ['2026-10-18', '2026-10-25']);
});

test('clinical limits, worsening logs and unavailable drills cannot become aggressive stretching', () => {
  const restricted = plan({ logs: [log('bf_B11')] }, { ...context, healthNotes: 'shoulder shockwave' });
  assert.ok(restricted.sessions.every(day => day.routine.every(id => id === 'bf_I01')));
  const tired = generateTemplatePlan(exercises, context, 30, 'zh', { currentDate: today, currentWeek: '2026-W43', logs: [log('bf_B11', '2026-10-18', { symptoms: 'worse' })] });
  assert.ok(tired.schedule.every(day => day.sessionType === 'rest' && day.routine.length === 0));
  const disabled = Object.fromEntries(Object.entries(exercises).map(([id, e]) => [id, ['A14', 'A15', 'A09'].includes(e.catalogCode) ? { ...e, active: false } : e]));
  const result = generateTemplatePlan(disabled, context, 30, 'en', { currentDate: today, currentWeek: '2026-W43' });
  assert.ok(result.schedule.every(day => !day.routine.some(id => ['bf_A14', 'bf_A15', 'bf_A09'].includes(id))));
});

test('AI receives bounded mobility facts and rules without raw resistance descriptions', () => {
  const prompt = buildPlanningPrompt({ availableExercises: exercises, currentDate: today, context, logs: [log('bf_B11', '2026-10-18', { resistanceLabel: 'PRIVATE_RESISTANCE_NOTE' })] });
  for (const text of ['mobilityHistory', 'recorded_training', '滾動七天', '髖內外旋', '不是', '已記錄']) assert.ok(prompt.includes(text), text);
  assert.ok(!prompt.includes('PRIVATE_RESISTANCE_NOTE'));
});

test('same-day readiness symptoms and fatigue keep their existing rest and recovery priority', () => {
  const ready = { date: today, sleepHours: 8, fatigue: 0, soreness: 0, symptoms: 'worse', yesterdayCourtMinutes: 0, yesterdayCourtRpe: null, todayCourtIntensity: 'none', schemaVersion: 1 };
  const stopped = plan({ readiness: [ready] });
  assert.ok(stopped.sessions.every(day => !day.routine.length));
  const fatigued = plan({ readiness: [{ ...ready, symptoms: 'none', fatigue: 4 }] });
  assert.ok(fatigued.sessions.every(day => !day.routine.includes('bf_A13') && !day.warmupNote.includes('活動度重點')));
});

test('regional history during whole-week replanning does not reserve replaced future strength sessions', () => {
  const original = generateTemplatePlan(exercises, context, 30, 'en', { currentDate: today, currentWeek: '2026-W43' });
  const history = original.schedule.map(day => ({ ...day, date: `2026-10-${18 + day.day}` }));
  const replan = generateTemplatePlan(exercises, context, 30, 'en', { currentDate: today, currentWeek: '2026-W43', mobilitySessions: history });
  assert.equal(replan.schedule.filter(day => day.prescriptions.some(dose => dose.phase === 'strength')).length, original.schedule.filter(day => day.prescriptions.some(dose => dose.phase === 'strength')).length);
});
