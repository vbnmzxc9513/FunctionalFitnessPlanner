import { DAILY_WARMUP_IDS, isDailyWarmupComplete } from '../../src/domain/quickWorkouts.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { generatePeriodPlan } from '../../src/domain/periodPlanning.js';
import { estimateSessionMinutes } from '../../src/domain/sessions.js';
import { mobilityAreas, scheduledMobility } from '../../src/domain/mobility.js';
import { buildWeeklyChoiceReport, recommendWeeklyChoices, weeklyChoiceBlockReason } from '../../src/domain/weeklyChoices.js';
import { manualPlanningExercises } from '../../src/domain/templatePlanner.js';
import { classifyBalanceExercise } from '../../src/domain/weeklyBalance.js';

const exercises = catalogExercises();
const context = { healthStatus: 'unrestricted', recoveryState: 'normal', equipment: ['dumbbell', 'band', 'cable'], badmintonDays: [2, 3, 5], badmintonMinutes: 90, badmintonIntensity: 'mixed' };
const range = { from: '2026-10-19', to: '2026-10-23' };
const choices = ['bf_B01', 'bf_B02', 'bf_B11', 'bf_B10', 'bf_B06', 'bf_A06', 'bf_H03'];
const make = (patch = {}, time = 40, catalog = exercises, options = {}) => generatePeriodPlan(catalog, { time, context: { ...context, ...patch } }, range, { today: range.from, ...options });
const formal = day => day.prescriptions.filter(dose => ['strength', 'accessory', 'skill'].includes(dose.phase));

test('a normal 40-minute moderate 235 week has two spaced main sessions, with real preparation and bounded starting doses', () => {
  const result = make();
  const training = result.sessions.filter(day => day.sessionType === 'training');
  assert.deepEqual(training.map(day => day.day), [1, 4]);
  assert.ok(training[0].prescriptions.filter(dose => dose.phase === 'strength').every(dose => dose.preparation));
  assert.ok(training[1].coachAdvice.includes('昨天有球局'));
  for (const day of training) {
    for (const pattern of ['squat_lunge', 'hinge', 'push', 'pull']) assert.ok(day.prescriptions.some(dose => dose.phase === 'strength' && classifyBalanceExercise(dose.id, exercises[dose.id]).patterns.includes(pattern)));
    assert.ok(day.prescriptions.filter(dose => dose.phase === 'strength').every(dose => dose.sets <= 2));
  }
  assert.ok(result.sessions.filter(day => [2, 3, 5].includes(day.day)).every(day => day.sessionType === 'recovery' && formal(day).length === 0));
  for (const day of result.sessions) assert.ok(estimateSessionMinutes(day, exercises) <= 40);
});

test('five selected lower-body movements and selected mobility are actually distributed, not blocked by repeated selected defaults', () => {
  for (const time of [30, 35, 40]) {
    const profile = { ...context, weeklyExerciseIds: choices };
    const result = make({ weeklyExerciseIds: choices }, time);
    const report = buildWeeklyChoiceReport({ schedule: result.sessions, weeklyIntent: { weeklyExerciseIds: choices } }, exercises, profile, manualPlanningExercises(exercises, profile), '2026-W43');
    assert.ok(report.every(item => item.reason === 'planned'), `${time} min: ${JSON.stringify(report)}`);
    for (const day of result.sessions) {
      assert.ok(day.routine.length <= 24 && estimateSessionMinutes(day, exercises) <= time);
      assert.deepEqual(day.routine.slice(0, 8), DAILY_WARMUP_IDS);
    }
    assert.deepEqual(result.sessions.filter(day => formal(day).length).map(day => day.day), [1, 4]);
  }
});

test('aerobic and conditioning moves (A01, I01–I04) are selectable without stretch_opening/metadata blocks while legacy A12/A13 stay excluded', () => {
  const fullContext = { ...context, equipment: ['dumbbell', 'band', 'cable', 'foam_roller', 'jump_rope', 'racket', 'shuttlecock'], partnerAvailable: true };
  const available = manualPlanningExercises(exercises, fullContext);
  const recommended = recommendWeeklyChoices(exercises, fullContext, 'balanced', available);
  for (const id of ['bf_A01', 'bf_I01', 'bf_I02', 'bf_I03', 'bf_I04']) {
    assert.equal(weeklyChoiceBlockReason(id, exercises, fullContext, available), null, `${id} should not be blocked`);
    assert.ok(recommended.includes(id), `${id} should appear in eligible recommendations`);
  }
  for (const id of ['bf_A12', 'bf_A13']) {
    assert.equal(weeklyChoiceBlockReason(id, exercises, fullContext, available), 'stretch_opening');
  }
  const withAerobic = make({ weeklyExerciseIds: ['bf_A01', 'bf_I02'] }, 40);
  assert.ok(withAerobic.sessions.some(day => day.routine.includes('bf_A01')));
  assert.ok(withAerobic.sessions.some(day => day.routine.includes('bf_I02')));
  for (const day of withAerobic.sessions.filter(item => item.routine.length)) {
    assert.deepEqual(day.routine.slice(0, 8), DAILY_WARMUP_IDS);
  }
});

test('starred favorite exercises are softly preferred within matching movement-pattern slots without breaking balance or warmup', () => {
  const withFavs = {
    ...exercises,
    bf_B02: { ...exercises.bf_B02, libraryGroups: ['training'] },
    bf_C02: { ...exercises.bf_C02, libraryGroups: ['training'] },
  };
  const result = make({ trainingDays: [1, 4], badmintonDays: [] }, 40, withFavs);
  const trainingDays = result.sessions.filter(day => day.sessionType === 'training');
  assert.ok(trainingDays.some(day => day.routine.includes('bf_B02')), 'starred lateral lunge should be preferred for squat/lunge slot');
  assert.ok(trainingDays.some(day => day.routine.includes('bf_C02')), 'starred cable chest press should be preferred for push slot');
  for (const day of trainingDays) {
    assert.deepEqual(day.routine.slice(0, 8), DAILY_WARMUP_IDS);
    assert.ok(estimateSessionMinutes(day, withFavs) <= 40);
  }
});

test('legacy flow availability does not change the independent opening or invent coverage for unlisted stretches', () => {
  const modified = Object.fromEntries(Object.entries(exercises).map(([id, exercise]) => [id, ['A12', 'A13'].includes(exercise.catalogCode) ? { ...exercise, active: false } : exercise]));
  const result = make({ trainingDays: [1, 4], badmintonDays: [] }, 40, modified);
  assert.ok(result.sessions.filter(day => day.routine.length).every(isDailyWarmupComplete));
  assert.ok(scheduledMobility(result.sessions, modified).filter(row => ['thoracic', 'hip_rotation', 'hamstrings', 'ankle'].includes(row.area)).every(row => row.dates.length > 0));
  for (const day of result.sessions.filter(day => day.sessionType === 'training')) {
    assert.ok(day.prescriptions.filter(dose => dose.phase === 'warmup').length >= 8);
    assert.ok(day.routine.every(id => modified[id].active !== false));
    assert.ok(day.routine.length <= 24 && estimateSessionMinutes(day, modified) <= 40);
  }
  const limited = Object.fromEntries(Object.entries(modified).map(([id, exercise]) => [id, mobilityAreas(id, modified).includes('shoulder') ? { ...exercise, active: false } : exercise]));
  const gap = make({ badmintonDays: [] }, 40, limited);
  assert.deepEqual(scheduledMobility(gap.sessions, limited).find(row => row.area === 'shoulder').dates, []);
});

test('legacy compact-flow preferences are excluded from new plans while keeping independent warmups', () => {
  const result = make({ weeklyExerciseIds: ['bf_A12'] });
  assert.ok(result.sessions.every(day => !day.routine.includes('bf_A12')));
  assert.ok(result.sessions.some(isDailyWarmupComplete));
  for (const day of result.sessions) assert.ok(day.routine.filter(id => exercises[id].sequenceMinutes).length <= 1);
  assert.ok(scheduledMobility(result.sessions).every(row => row.dates.length > 0));
});

test('more time and selections never force work through recovery, hard court load, symptoms, taper or a protected date', () => {
  for (const patch of [{ recoveryState: 'reduce' }, { recoveryState: 'recover' }, { healthNotes: '肩部震波' }, { healthStatus: 'unknown' }, { competitionDate: '2026-10-25' }, { sorenessRegions: ['legs'], sorenessImpact: 'limited' }]) {
    const base = make(patch);
    const selected = make({ ...patch, weeklyExerciseIds: choices });
    assert.deepEqual(selected.sessions.map(day => day.prescriptions), base.sessions.map(day => day.prescriptions));
  }
  const hard = make({ badmintonIntensity: 'hard', badmintonMinutes: 120 });
  assert.ok(hard.sessions.every(day => day.sessionType === 'recovery'));
  const protectedDay = make().sessions[0];
  const result = make({ weeklyExerciseIds: choices }, 40, exercises, { existingSessions: { [protectedDay.date]: protectedDay }, protectedDates: [protectedDay.date] });
  assert.deepEqual(result.sessions[0], protectedDay);
});
