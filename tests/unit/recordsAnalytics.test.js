import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRecordsAnalytics } from '../../src/domain/recordsAnalytics.js';
import { dateForWeekDay, getWeekString } from '../../src/domain/dates.js';

const EXERCISES = {
  bf_B01: { name: '高腳杯深蹲', type: 'lower', category: 'lower', bodyParts: ['quadriceps', 'glutes'] },
  bf_B11: { name: '啞鈴羅馬尼亞硬舉', type: 'lower', category: 'lower', bodyParts: ['hamstrings', 'glutes'] },
  bf_C01: { name: '單臂啞鈴划船', type: 'upper_pull', category: 'upper', bodyParts: ['back', 'arms'] },
  bf_C08: { name: '啞鈴胸推', type: 'upper_push', category: 'upper', bodyParts: ['chest', 'shoulder'] },
  bf_D01: { name: '死蟲核心穩定', type: 'core', category: 'core', bodyParts: ['core'] },
  bf_E01: { name: '分腿蹲跳', type: 'power', category: 'power', bodyParts: ['quadriceps', 'calves'] },
  bf_A02: { name: '踝關節動態暖身', type: 'mobility', category: 'warmup', bodyParts: ['ankle'] },
};

function addCompletion(progress, date, id) {
  const d = new Date(`${date}T12:00:00`);
  const week = getWeekString(d);
  const weekday = d.getDay() || 7;
  progress[week] ??= { completed: {}, completedAt: {}, exerciseTypes: {} };
  const key = `day${weekday}_${id}`;
  progress[week].completed[key] = true;
  progress[week].completedAt[key] = date;
  progress[week].exerciseTypes[key] = EXERCISES[id]?.type || 'full';
}

test('buildRecordsAnalytics handles empty progress cleanly', () => {
  const result = buildRecordsAnalytics({ allProgress: {}, exercises: EXERCISES, today: '2026-11-26', range: '4w', lang: 'zh' });
  assert.equal(result.totals.currentStreak, 0);
  assert.equal(result.totals.longestStreak, 0);
  assert.equal(result.totals.activeDays, 0);
  assert.equal(result.totals.completedCount, 0);
  assert.equal(result.totals.previousDeltaPct, null);
  assert.equal(result.radar.length, 5);
  assert.ok(result.radar.every(axis => axis.count === 0 && axis.score === 0));
  assert.equal(result.muscleCoverage.length, 9);
  assert.ok(result.muscleCoverage.every(group => group.count === 0 && group.intensity === 0 && group.daysSince === null));
  assert.equal(result.weeklySeries.length, 6);
  assert.equal(result.weeklySeries.at(-1).label, '本週');
  assert.match(result.balanceTip, /完成訓練動作/);
});

test('buildRecordsAnalytics calculates current streak (including yesterday grace) and longest streak', () => {
  const progress = {};
  // Older 4-day streak
  ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].forEach(d => addCompletion(progress, d, 'bf_B01'));
  // Recent 2-day streak ending yesterday (2026-11-25, today = 2026-11-26)
  ['2026-11-24', '2026-11-25'].forEach(d => addCompletion(progress, d, 'bf_D01'));

  const result = buildRecordsAnalytics({ allProgress: progress, exercises: EXERCISES, today: '2026-11-26', range: 'all', lang: 'zh' });
  assert.equal(result.totals.currentStreak, 2);
  assert.equal(result.totals.longestStreak, 4);
  assert.equal(result.totals.allTimeActiveDays, 6);
});

test('buildRecordsAnalytics filters ranges, computes period delta, radar balance tip, muscle recency, and weekly buckets', () => {
  const progress = {};
  // Previous 4-week window (before 2026-10-30): 4 completions
  addCompletion(progress, '2026-10-10', 'bf_B01');
  addCompletion(progress, '2026-10-12', 'bf_B01');
  addCompletion(progress, '2026-10-14', 'bf_C01');
  addCompletion(progress, '2026-10-16', 'bf_D01');

  // Current 4-week window (2026-10-30 .. 2026-11-26): 8 completions (+100% vs prev 4)
  addCompletion(progress, '2026-11-20', 'bf_B01');
  addCompletion(progress, '2026-11-20', 'bf_B11');
  addCompletion(progress, '2026-11-20', 'bf_A02'); // warmup — excluded from strength muscle map when strength moves exist
  addCompletion(progress, '2026-11-23', 'bf_B01');
  addCompletion(progress, '2026-11-23', 'bf_D01');
  addCompletion(progress, '2026-11-25', 'bf_B01');
  addCompletion(progress, '2026-11-25', 'bf_B11');
  addCompletion(progress, '2026-11-26', 'bf_D01');

  const r4w = buildRecordsAnalytics({ allProgress: progress, exercises: EXERCISES, today: '2026-11-26', range: '4w', lang: 'zh' });
  assert.equal(r4w.totals.completedCount, 8);
  assert.equal(r4w.totals.activeDays, 4);
  assert.equal(r4w.totals.previousDeltaPct, 100);

  // Radar check: lower=5, core=2, mobility=1, upper=0, power=0
  const byKey = Object.fromEntries(r4w.radar.map(a => [a.key, a]));
  assert.equal(byKey.lower.count, 5);
  assert.equal(byKey.core.count, 2);
  assert.equal(byKey.mobility.count, 1);
  assert.equal(byKey.upper.count, 0);
  assert.match(r4w.balanceTip, /相對較少/);

  // Muscle map check
  const mByKey = Object.fromEntries(r4w.muscleCoverage.map(m => [m.key, m]));
  assert.equal(mByKey.glutes.count, 5); // B01(3) + B11(2)
  assert.equal(mByKey.glutes.daysSince, 1); // 2026-11-25 vs 2026-11-26
  assert.equal(mByKey.glutes.intensity, 3);
  assert.equal(mByKey.core.daysSince, 0); // 2026-11-26
  assert.equal(mByKey.calves.count, 0); // warmup bf_A02 (ankle) excluded because strength moves exist
  assert.equal(mByKey.calves.daysSince, null);

  // 12-week range includes all 12 completions and 8 weekly buckets
  const r12w = buildRecordsAnalytics({ allProgress: progress, exercises: EXERCISES, today: '2026-11-26', range: '12w', lang: 'en' });
  assert.equal(r12w.totals.completedCount, 12);
  assert.equal(r12w.weeklySeries.length, 8);
  assert.equal(r12w.weeklySeries.at(-1).label, 'Now');
  assert.equal(r12w.weeklySeries.at(-1).days, 3); // Nov 23, 25, 26 are in current ISO week
  assert.equal(r12w.weeklySeries.at(-1).actions, 5);

  // Verify week range labels are valid
  const expectedCurrentMon = dateForWeekDay(getWeekString(new Date('2026-11-26T12:00:00')), 1);
  assert.ok(r12w.weeklySeries.at(-1).rangeLabel.startsWith(`${Number(expectedCurrentMon.slice(5, 7))}/${Number(expectedCurrentMon.slice(8))}`));
});
