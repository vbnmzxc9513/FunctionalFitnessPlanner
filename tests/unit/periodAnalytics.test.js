import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { generatePeriodPlan } from '../../src/domain/periodPlanning.js';
import { DEFAULT_PLANNING_CONTEXT } from '../../src/domain/planning.js';
import { buildPeriodAnalytics, summarizeRecentPerformance } from '../../src/domain/periodAnalytics.js';

const exercises = catalogExercises('zh');

test('summarizeRecentPerformance counts factual logs, completions, readiness and mobility gaps without guessing', () => {
  const summary = summarizeRecentPerformance({
    today: '2026-11-22',
    exercises,
    context: { ...DEFAULT_PLANNING_CONTEXT, equipment: ['dumbbell'] },
    logs: [
      { week: '2026-W47', day: 2, exerciseId: 'bf_B10', date: '2026-11-17', sets: [{ value: 8 }, { value: 8 }], nextDay: 'good' },
      { week: '2026-W47', day: 4, exerciseId: 'bf_C01', date: '2026-11-19', sets: [{ value: 10 }, { value: 10 }], nextDay: 'pending' },
      // Outside 28-day window — must not be counted
      { week: '2026-W40', day: 1, exerciseId: 'bf_B10', date: '2026-10-01', sets: [{ value: 8 }], nextDay: 'good' },
    ],
    progressByWeek: {
      '2026-W47': {
        completed: { day2_bf_B10: true, day4_bf_C01: true, day5_bf_D02: false },
        completedAt: { day2_bf_B10: '2026-11-17', day4_bf_C01: '2026-11-19' },
        exerciseTypes: { day2_bf_B10: 'lower', day4_bf_C01: 'upper_pull' },
        feedbackProvided: true,
        feedbackValue: 0,
      },
    },
    readiness: [
      { date: '2026-11-21', sleepHours: 7.5, fatigue: 2, soreness: 1, symptoms: 'none', yesterdayCourtMinutes: 90, todayCourtIntensity: 'none' },
      { date: '2026-11-20', sleepHours: 6.5, fatigue: 3, soreness: 2, symptoms: 'none', yesterdayCourtMinutes: 0, todayCourtIntensity: 'hard' },
    ],
    metrics: [
      { date: '2026-11-01', weight: 70.5 },
      { date: '2026-11-20', weight: 69.8 },
    ],
  });

  assert.equal(summary.hasHistory, true);
  assert.equal(summary.trainingDays, 2);
  assert.equal(summary.loggedDays, 2);
  assert.equal(summary.loggedExercisesCount, 2);
  assert.equal(summary.loggedSetsCount, 4);
  assert.equal(summary.completedCount, 2);
  assert.equal(summary.positiveNextDayCount, 1);
  assert.equal(summary.pendingNextDayCount, 1);
  assert.equal(summary.latestFeedback, 0);
  assert.equal(summary.readiness.avgSleepHours, 7);
  assert.equal(summary.readiness.highFatigueDays, 1);
  assert.equal(summary.readiness.reportedCourtDays, 2);
  assert.equal(summary.metrics.weightKg, 69.8);
  assert.equal(summary.metrics.weightDeltaKg, -0.7);
  assert.equal(summary.mobilityGaps.length, 8);
});

test('summarizeRecentPerformance cleanly reports empty history for new users', () => {
  const summary = summarizeRecentPerformance({ today: '2026-11-22', exercises });
  assert.equal(summary.hasHistory, false);
  assert.equal(summary.trainingDays, 0);
  assert.equal(summary.completedCount, 0);
  assert.equal(summary.metrics, null);
});

test('buildPeriodAnalytics generates daily rhythm, 7 badminton pillars, and 8 mobility regions for Free Template plan', () => {
  const context = {
    ...DEFAULT_PLANNING_CONTEXT,
    trainingDays: [1, 2, 3, 4, 5],
    badmintonDays: [2, 5],
    equipment: ['dumbbell', 'band'],
    targetRegions: ['legs', 'scapular'],
  };
  const plan = generatePeriodPlan(
    exercises,
    { context, focus: 'balanced', time: '35' },
    { from: '2026-11-23', to: '2026-11-29' },
    { today: '2026-11-23' },
    'zh',
  );
  const analytics = buildPeriodAnalytics({
    sessions: plan.sessions,
    exercises,
    context,
    range: plan.range,
    lang: 'zh',
  });

  assert.equal(analytics.dailySeries.length, 7);
  assert.equal(analytics.totals.totalDays, 7);
  assert.equal(analytics.totals.courtDays, 2);
  assert.ok(analytics.totals.trainingDays >= 1);
  assert.equal(analytics.patternDistribution.length, 7);
  assert.equal(analytics.mobilityCoverage.length, 8);
  assert.ok(analytics.totals.coveredMobilityRegions >= 6);
  const squatPillar = analytics.patternDistribution.find(item => item.key === 'squat_lunge');
  const pullPillar = analytics.patternDistribution.find(item => item.key === 'pull');
  assert.equal(squatPillar.targeted, true);
  assert.equal(pullPillar.targeted, true);
  assert.equal(analytics.muscleCoverage.length, 9);
  assert.ok(analytics.totals.coveredMuscleGroups >= 3);
  assert.ok(analytics.muscleCoverage.some(item => item.days > 0 && item.exercises.length > 0));
});
