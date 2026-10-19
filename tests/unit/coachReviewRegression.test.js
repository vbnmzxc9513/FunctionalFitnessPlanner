import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { generatePeriodPlan } from '../../src/domain/periodPlanning.js';
import { classifyBalanceExercise } from '../../src/domain/weeklyBalance.js';
import { recoveryDecision } from '../../src/domain/recovery.js';
import { estimateSessionMinutes, doseSeconds } from '../../src/domain/sessions.js';
import { scheduledMobility, mobilityAreas } from '../../src/domain/mobility.js';
import { periodProfile } from '../../src/domain/periodDraft.js';
import { buildPlanningPrompt } from '../../src/domain/coachingPrompt.js';

const exercises = catalogExercises();
const context = { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable'], trainingDays: [1, 2, 3, 4, 5], badmintonDays: [2, 3, 5], badmintonMinutes: 90, badmintonIntensity: 'mixed' };
const make = (patch = {}, { time = 35, focus = 'balanced', to = '2026-10-23' } = {}) => generatePeriodPlan(exercises, { time, focus, context: { ...context, ...patch } }, { from: '2026-10-19', to }, { today: '2026-10-19' });
const formal = plan => plan.sessions.flatMap(day => day.prescriptions.filter(dose => dose.phase === 'strength'));
const patterns = doses => new Set(doses.flatMap(dose => classifyBalanceExercise(dose.id, exercises[dose.id]).patterns));

test('positive and unrecognized recovery notes cannot silently become fatigue, including compound negation', () => {
  const baseline = make();
  for (const recoveryNotes of ['沒有疲勞', '不疲勞', '睡得很好', '睡得很好，沒有疲勞', '沒有疲勞，精神很好', 'well rested, no fatigue', 'not tired', '想好好訓練']) {
    assert.equal(recoveryDecision({ recoveryNotes }).action, 'normal', recoveryNotes);
    assert.deepEqual(make({ recoveryNotes }).sessions, baseline.sessions, recoveryNotes);
  }
  for (const recoveryNotes of ['有點累', '睡不好、累', '沒有疲勞，但睡眠不足', 'poor sleep', 'tired']) assert.equal(recoveryDecision({ recoveryNotes }).action, 'reduce', recoveryNotes);
  assert.equal(recoveryDecision({ recoveryState: 'recover', recoveryNotes: '睡得很好' }).action, 'recover');
  assert.equal(recoveryDecision({ recoveryState: 'normal', recoveryNotes: '上週有點累' }).action, 'normal');
});

test('one-session weeks retain available push/pull and use repeatable lower-body A/B across four weeks', () => {
  for (const badmintonDays of [[2, 3, 5], [2, 4, 5], [2, 5, 6]]) for (const time of [30, 35, 40]) {
    const result = make({ badmintonDays }, { time, to: '2026-11-15' });
    for (const summary of result.weeklySummaries) {
      const doses = formal({ sessions: result.sessions.filter(day => day.week === summary.week) });
      for (const pattern of ['squat_lunge', 'hinge', 'push', 'pull']) assert.ok(patterns(doses).has(pattern), `${time} ${badmintonDays} ${summary.week} ${pattern}`);
    }
    assert.ok(formal(result).some(dose => dose.id === 'bf_B01'));
    assert.ok(formal(result).some(dose => dose.id === 'bf_B10'));
    assert.ok(result.sessions.every(day => estimateSessionMinutes(day, exercises) <= time));
  }
  const chosen = make({ weeklyExerciseIds: ['bf_C11'] });
  assert.ok(formal(chosen).some(dose => dose.id === 'bf_C11'));
});

test('single-leg stability preserves a knee-dominant main lift instead of duplicating two hinges', () => {
  const result = make({}, { focus: 'stability', to: '2026-11-15' });
  for (const day of result.sessions.filter(day => day.sessionType === 'training')) {
    const doses = day.prescriptions.filter(dose => dose.phase === 'strength');
    assert.ok(doses.some(dose => dose.id === 'bf_B05'));
    assert.ok(patterns(doses).has('squat_lunge'));
    assert.equal(doses.filter(dose => patterns([dose]).has('hinge')).length, 1);
  }
});

test('all ordinary warm-ups and court-day recovery use the eight-part stretching flow without aerobic substitutes', () => {
  for (const recoveryState of ['normal', 'reduce', 'recover']) {
    const result = make({ recoveryState, weeklyExerciseIds: ['bf_A01'] });
    for (const day of result.sessions.filter(day => day.routine.length)) {
      assert.equal(day.routine[0], 'bf_A13');
      assert.equal(day.prescriptions[0].value, '10');
      assert.ok(!day.routine.some(id => ['bf_A01', 'bf_I01'].includes(id)));
      assert.ok(estimateSessionMinutes(day, exercises) <= 35);
    }
    assert.ok(scheduledMobility(result.sessions).every(row => row.dates.length > 0));
  }
});

test('fatigue reduces actual formal work and extra step practice while preserving the full stretching opening', () => {
  const normal = make({ badmintonMinutes: 120 });
  const reduced = make({ badmintonMinutes: 120, recoveryState: 'reduce' });
  assert.ok(formal(reduced).length < formal(normal).length);
  assert.ok(reduced.sessions.filter(day => day.sessionType === 'training').every(day => day.routine[0] === 'bf_A13' && day.prescriptions.every(dose => dose.phase !== 'skill')));
  assert.ok(reduced.sessions.every(day => estimateSessionMinutes(day, exercises) <= 35));
});

test('movement-limiting or unclear soreness avoids existing loaded work and the full affected flow, while clinical restrictions stay protected', () => {
  for (const sorenessImpact of ['unknown', 'limited']) {
    const plan = make({ sorenessRegions: ['posterior', 'calf'], sorenessImpact });
    assert.equal(formal(plan).length, 0);
    assert.ok(plan.sessions.every(day => day.routine.every(id => !mobilityAreas(id).some(area => ['hamstrings', 'hip_rotation', 'ankle'].includes(area)))));
  }
  assert.ok(make({ sorenessRegions: ['posterior'], sorenessImpact: 'mild' }).sessions.some(day => day.routine.includes('bf_A13')));
  for (const patch of [{ healthNotes: '肩部震波' }, { healthStatus: 'unknown' }, { healthNotes: 'new knee pain' }, { recoveryNotes: 'new weakness and numbness' }]) assert.ok(make(patch).sessions.every(day => !day.routine.length));
});

test('three genuinely light short court sessions do not permanently block a second strength day', () => {
  const result = make({ badmintonDays: [2, 4, 5], badmintonMinutes: 30, badmintonIntensity: 'light' }, { to: '2026-11-15' });
  assert.ok(result.weeklySummaries.every(week => week.strengthSessions === 2));
  const hard = make({ badmintonIntensity: 'hard' });
  assert.equal(formal(hard).length, 0);
  assert.match(hard.conclusion, /若每週固定如此/);
  const fatigued = make({ badmintonDays: [2, 5, 6], badmintonIntensity: 'hard', recoveryState: 'recover' });
  assert.ok(!fatigued.conclusion.includes('目前高強度球日與可用時段沒有留下合適肌力日'), 'fatigue must not be misreported as a lack of suitable weekdays');
});

test('new movement patterns receive counted preparation and post-preparation rest; completed prescriptions stay unchanged', () => {
  const original = make();
  const main = formal(original);
  assert.ok(main.every(dose => dose.preparation && dose.preparation.restSeconds === 30));
  const prep = main[0].preparation;
  assert.equal(doseSeconds(prep, exercises[main[0].id], true) - doseSeconds({ ...prep, restSeconds: 0 }, exercises[main[0].id], true), 30);
  const saved = original.sessions[0], copy = structuredClone(saved);
  const rebuilt = generatePeriodPlan(exercises, { time: 35, focus: 'stability', context: { ...context, recoveryState: 'recover' } }, original.range, { today: '2026-10-19', existingSessions: { [saved.date]: saved }, protectedDates: [saved.date] });
  assert.deepEqual(rebuilt.sessions[0], copy);
});

test('familiarity confirms stretching only, not new taper strength or treatment clearance', () => {
  const range = { from: '2026-11-09', to: '2026-11-13' };
  const input = { time: 35, context: { ...context, competitionDate: '2026-11-16', warmupFamiliar: true } };
  const taper = generatePeriodPlan(exercises, input, range, { today: range.from });
  assert.ok(taper.sessions.some(day => day.routine.includes('bf_A13')));
  assert.equal(formal(taper).length, 0);
  const restricted = generatePeriodPlan(exercises, { ...input, context: { ...input.context, healthNotes: 'shoulder shockwave' } }, range, { today: range.from });
  assert.ok(restricted.sessions.every(day => !day.routine.length));
  const earlier = make({}, { time: 25 });
  const onlyCompactHistory = generatePeriodPlan(exercises, { time: 35, context: { ...context, competitionDate: '2026-11-16' } }, range, { today: range.from, previousSessions: earlier.sessions });
  assert.ok(onlyCompactHistory.sessions.every(day => !day.routine.includes('bf_A13')), 'a familiar six-minute flow does not authorize a new ten-minute taper flow');
  assert.ok(onlyCompactHistory.sessions.some(day => day.routine.includes('bf_A12')));
  const restored = periodProfile({ ...input, context: { ...input.context, recoveryState: 'reduce', sorenessImpact: 'mild' } });
  assert.equal(restored.context.recoveryState, 'reduce');
  assert.equal(restored.context.warmupFamiliar, true);
});

test('AI strategy uses the same stretching, recovery interpretation and complementary pattern rules', () => {
  const prompt = buildPlanningPrompt({ availableExercises: exercises, context, dailyTime: 35 });
  for (const term of ['直接 bf_A13', '暖身不安排 bf_A01', '不能只減暖身', 'profile.recoveryState', '每週重置而永久漏推', '單腳穩定不應同堂兩個髖鉸鏈']) assert.ok(prompt.includes(term), term);
});
