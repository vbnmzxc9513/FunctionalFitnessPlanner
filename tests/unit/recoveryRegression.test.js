import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { generatePeriodPlan } from '../../src/domain/periodPlanning.js';
import { selectSavedPeriod } from '../../src/domain/periodDraft.js';
import { scheduledMobility, mobilityAreas } from '../../src/domain/mobility.js';
import { buildWeeklyChoiceReport } from '../../src/domain/weeklyChoices.js';
import { manualPlanningExercises } from '../../src/domain/templatePlanner.js';
import { estimateSessionMinutes } from '../../src/domain/sessions.js';

const exercises = catalogExercises();
const context = { healthStatus: 'unrestricted', badmintonDays: [2, 3, 5], badmintonMinutes: 120, badmintonIntensity: 'mixed', competitionDate: '2026-11-16', equipment: ['dumbbell'],
  weeklyExerciseIds: ['bf_B01', 'bf_B02', 'bf_B11', 'bf_B10', 'bf_B06'] };
const make = (patch = {}, minutes = 35) => generatePeriodPlan(exercises, { time: minutes, context: { ...context, ...patch } }, { from: '2026-10-19', to: '2026-10-23' }, { today: '2026-10-19' });

test('reported 235 court week retains low-volume strength without equating two-hour mixed play with hard play', () => {
  for (const equipment of [[], ['dumbbell']]) for (const recoveryNotes of ['', '有點累']) for (const minutes of [30, 35, 40]) {
    const result = make({ equipment, recoveryNotes }, minutes);
    const strength = result.sessions.filter(day => day.prescriptions.some(dose => dose.phase === 'strength'));
    assert.equal(strength.length, 1);
    assert.equal(strength[0].day, 1);
    assert.ok(strength[0].prescriptions.filter(dose => dose.phase === 'strength').every(dose => dose.sets === 1));
    assert.ok(result.sessions.filter(day => [2, 3, 5].includes(day.day)).every(day => day.sessionType === 'recovery'));
    assert.ok(result.sessions.every(day => estimateSessionMinutes(day, exercises) <= minutes));
    assert.ok(scheduledMobility(result.sessions).every(row => row.dates.length > 0));
    assert.match(result.conclusion, /2026-11-16.*尚未進入/);
  }
});

test('genuinely hard court play with fatigue can retain a recovery week while rotating all eight regions', () => {
  const result = make({ badmintonIntensity: 'hard', recoveryNotes: '有點累' });
  assert.ok(result.sessions.every(day => day.sessionType === 'recovery'));
  assert.ok(scheduledMobility(result.sessions).every(row => row.dates.length > 0));
  for (const day of result.sessions) {
    assert.ok(day.routine.length <= 3);
    assert.equal(day.routine[0], 'bf_A13');
    assert.equal(day.prescriptions[0].value, '10');
    assert.ok(!day.routine.some(id => ['bf_A01', 'bf_I01'].includes(id)));
  }
  assert.match(result.conclusion, /本段未排主要肌力/);
  assert.match(result.sessions[0].coachAdvice, /明天安排高強度球局/);
});

test('gentle recovery does not target the reported sore regions and never bypasses treatment limits', () => {
  const result = make({ badmintonIntensity: 'hard', sorenessRegions: ['posterior', 'calf'] });
  for (const day of result.sessions) for (const id of day.routine) assert.ok(!mobilityAreas(id).some(area => ['hip_rotation', 'hamstrings', 'ankle'].includes(area)));
  assert.ok(scheduledMobility(result.sessions).find(row => row.area === 'thoracic').dates.length > 0);
  const restricted = make({ healthNotes: 'shoulder shockwave' });
  assert.ok(restricted.sessions.every(day => day.routine.length === 0));
  assert.ok(make({ healthNotes: 'new knee pain' }).sessions.every(day => day.routine.length === 0));
});

test('server timestamp resolution cannot discard the matching local equipment questionnaire', () => {
  const saved = { periodId: 'same', createdAt: 1, profile: { context } };
  const cloud = { periodId: 'same', createdAt: 200, profile: { context: { badmintonDays: context.badmintonDays } } };
  const copy = structuredClone(saved);
  const result = selectSavedPeriod(saved, cloud);
  assert.deepEqual(result.profile.context.equipment, ['dumbbell']);
  assert.equal(result, saved);
  assert.deepEqual(saved, copy);
  assert.equal(selectSavedPeriod(saved, { ...cloud, periodId: 'new' }).periodId, 'new');
  assert.equal(selectSavedPeriod(null, cloud), cloud);
});

test('missing historical equipment is unknown, while explicitly unselected dumbbells remain unavailable', () => {
  const result = make({ badmintonIntensity: 'hard', recoveryNotes: '有點累' });
  const plan = { schedule: result.sessions, weeklyIntent: { weeklyExerciseIds: context.weeklyExerciseIds } };
  const cloudContext = { badmintonDays: [2, 3, 5], competitionDate: context.competitionDate };
  const report = buildWeeklyChoiceReport(plan, exercises, cloudContext, {}, '2026-W43');
  assert.ok(report.every(row => row.reason === 'no_strength'));
  const knownReport = buildWeeklyChoiceReport(plan, exercises, context, manualPlanningExercises(exercises, context), '2026-W43');
  assert.equal(knownReport.find(row => row.id === 'bf_B11').reason, 'no_strength');
  const none = { ...context, equipment: [] };
  const unavailable = buildWeeklyChoiceReport(plan, exercises, none, manualPlanningExercises(exercises, none), '2026-W43');
  assert.equal(unavailable.find(row => row.id === 'bf_B11').reason, 'equipment');
});
