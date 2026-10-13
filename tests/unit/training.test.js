import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFeedback, availableSchedule, calculateStats, countCompleted, monthlyStats, normalizeSchedule, prescription } from '../../src/domain/training.js';
import { getWeekString, dateForWeekDay, isCalendarDate, localDate } from '../../src/domain/dates.js';
import { emptyMetrics, parseMetrics } from '../../src/domain/metrics.js';
import { DEFAULT_SCHEDULE_I18N, EXERCISES_I18N, TRANSLATIONS } from '../../src/locale.js';

const schedule = DEFAULT_SCHEDULE_I18N.zh;
const exercises = EXERCISES_I18N.zh;
test('ISO weeks cross year boundaries and month dates correctly', () => {
  assert.equal(getWeekString(new Date(2025, 11, 29)), '2026-W01');
  assert.equal(dateForWeekDay('2026-W01', 1), '2025-12-29');
  assert.equal(dateForWeekDay('2026-W40', 1), '2026-09-28');
  assert.equal(getWeekString(new Date(2026, 0, 1), -1), '2025-W52');
  assert.equal(dateForWeekDay('bad', 1), null);
  assert.equal(localDate(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(isCalendarDate('2026-02-30'), false);
});
test('feedback is idempotent and replacing feedback recalculates from the original base', () => {
  const first = applyFeedback({ difficultyLevel: 1 }, {}, 1);
  const second = applyFeedback({ difficultyLevel: first.difficultyLevel }, first, 1);
  assert.deepEqual(second, first);
  assert.equal(applyFeedback({ difficultyLevel: 2 }, second, 0).difficultyLevel, 1);
  assert.equal(applyFeedback({ difficultyLevel: 2 }, second, -1).difficultyLevel, 0);
  assert.equal(applyFeedback({ difficultyLevel: 0 }, {}, -1).difficultyLevel, 0);
});
test('weekly counts use active slots, preserving removed exercise history without inflating completion', () => {
  const completed = { day1_thoracic: true, day1_removed: true };
  assert.deepEqual(countCompleted(schedule, completed), { completed: 1, total: 23 });
  assert.deepEqual(countCompleted([{ day: 1, routine: ['thoracic', 'thoracic'] }], completed), { completed: 1, total: 1 });
});
test('23 of 23 default exercises means 100%, with slots split across calendar months', () => {
  const completed = Object.fromEntries(schedule.flatMap(day => day.routine.map(id => [`day${day.day}_${id}`, true])));
  const months = monthlyStats({ '2026-W40': { completed, scheduleSnapshot: schedule } }, {}, []);
  assert.equal(months.length, 2);
  assert.equal(months.reduce((sum, month) => sum + month.total, 0), 23);
  for (const month of months) assert.equal(month.completed / month.total, 1);
  assert.deepEqual(months.map(month => month.monthKey), ['2026-10', '2026-09']);
});
test('saved historical plans provide denominators for legacy progress', () => {
  const legacy = { '2026-W12': { completed: { day1_thoracic: true } } };
  const plan = [{ day: 1, routine: ['thoracic'] }];
  assert.equal(monthlyStats(legacy, { '2026-W12': { schedule: plan } }, schedule)[0].total, 1);
});
test('new activity uses actual completion dates, retains type snapshots, and includes weekends', () => {
  const stats = calculateStats({ '2026-W40': { completed: { day1_old: true, day2_old: false }, completedAt: { day1_old: '2026-10-03' }, exerciseTypes: { day1_old: 'core' } } }, {});
  assert.equal(stats.totalCompleted, 1);
  assert.equal(stats.totalActiveDays, 1);
  assert.equal(stats.dailyMap['2026-W40-6'], 1);
  assert.equal(stats.typeStats.core, 1);
});
test('legacy exact names are canonicalized consistently and substring guesses are rejected', () => {
  const legacy = schedule.map(day => ({ ...day, routine: day.day === 1 ? [exercises.thoracic.name, 'not_thoracic'] : day.routine }));
  assert.deepEqual(normalizeSchedule(legacy, exercises, schedule)[0].routine, ['thoracic']);
  assert.equal(normalizeSchedule([], exercises, schedule), schedule);
});
test('disabled/deleted exercises leave default schedules, while empty days remain valid', () => {
  const modified = Object.fromEntries(Object.entries(exercises).map(([id, exercise]) => [id, { ...exercise, active: false }]));
  assert.ok(availableSchedule(schedule, modified).every(day => day.routine.length === 0));
  assert.equal(prescription('custom_stretch', 'mobility', 1).unit, 'seconds');
});
test('metrics reject invalid dates, negative/nonfinite values and fractional age without erasing blanks', () => {
  assert.deepEqual(parseMetrics({ ...emptyMetrics('2026-10-13'), weight: '70' }), { date: '2026-10-13', weight: 70 });
  for (const fields of [{ weight: '-1' }, { bodyFat: '101' }, { weight: 'NaN' }, { age: '20.5' }, { date: '2026-02-30', weight: '70' }, {}]) {
    assert.throws(() => parseMetrics({ ...emptyMetrics('2026-10-13'), ...fields }), /INVALID_METRICS/);
  }
});
test('translations have matching keys and default exercise IDs', () => {
  assert.deepEqual(Object.keys(TRANSLATIONS.zh).sort(), Object.keys(TRANSLATIONS.en).sort());
  assert.deepEqual(Object.keys(EXERCISES_I18N.zh).sort(), Object.keys(EXERCISES_I18N.en).sort());
});
