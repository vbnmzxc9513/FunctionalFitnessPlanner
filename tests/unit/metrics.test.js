import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyMetrics,
  fallbackMetricsForDate,
  mergeMetricsRecord,
  parseMetrics,
} from '../../src/domain/metrics.js';

test('fallbackMetricsForDate prefers same-date values and otherwise inherits per-field from latest earlier records', () => {
  const history = [
    { id: '2026-11-10', date: '2026-11-10', height: 175, age: 30, weight: 71, bodyFat: 19 },
    { id: '2026-11-20', date: '2026-11-20', weight: 70.2, bmr: 1680 },
    { id: '2026-11-28', date: '2026-11-28', weight: 68, bodyFat: 16 }, // future relative to 2026-11-25
  ];

  // New date 2026-11-25 inherits latest earlier value per field, ignoring 2026-11-28
  const fbNew = fallbackMetricsForDate('2026-11-25', history);
  assert.deepEqual(fbNew, {
    height: 175,
    weight: 70.2,
    age: 30,
    bodyFat: 19,
    bmr: 1680,
  });

  // Same-date record takes priority over older history while still filling fields missing on that date
  const fbSame = fallbackMetricsForDate('2026-11-20', history);
  assert.deepEqual(fbSame, {
    height: 175,
    weight: 70.2,
    age: 30,
    bodyFat: 19,
    bmr: 1680,
  });
});

test('mergeMetricsRecord preserves blank fields on both same-date updates and new-date entries without leaking id or invalid fields', () => {
  const history = [
    { id: '2026-11-25', date: '2026-11-25', height: 175, weight: 70, age: 30, bodyFat: 18.5, bmr: 1650 },
  ];

  // Scenario 1: New date 2026-11-26, user only enters weight 69.5 and leaves everything else blank
  const parsedNew = parseMetrics({ ...emptyMetrics('2026-11-26'), weight: '69.5' });
  const mergedNew = mergeMetricsRecord(parsedNew, fallbackMetricsForDate('2026-11-26', history));
  assert.deepEqual(mergedNew, {
    date: '2026-11-26',
    height: 175,
    weight: 69.5,
    age: 30,
    bodyFat: 18.5,
    bmr: 1650,
  });
  assert.equal('id' in mergedNew, false);

  // Scenario 2: Same date 2026-11-25, user clears bodyFat (blank) and edits weight to 69.8
  const parsedSame = parseMetrics({ ...emptyMetrics('2026-11-25'), weight: '69.8' });
  const mergedSame = mergeMetricsRecord(parsedSame, fallbackMetricsForDate('2026-11-25', history));
  assert.deepEqual(mergedSame, {
    date: '2026-11-25',
    height: 175,
    weight: 69.8,
    age: 30,
    bodyFat: 18.5,
    bmr: 1650,
  });

  // Scenario 3: Out-of-range/corrupt fallback fields are ignored cleanly
  const mergedSanitized = mergeMetricsRecord(parsedNew, { id: 'bad', height: 9999, age: 25.5, bodyFat: 17 });
  assert.deepEqual(mergedSanitized, {
    date: '2026-11-26',
    weight: 69.5,
    bodyFat: 17,
  });
});
