import { isCalendarDate, localDate } from './dates.js';

export const METRIC_LIMITS = {
  height: [1, 300], weight: [1, 500], age: [1, 120], bodyFat: [0, 100], bmr: [1, 10000],
  muscleLarm: [0, 100], muscleRarm: [0, 100], muscleLleg: [0, 150], muscleRleg: [0, 150], muscleTrunk: [0, 300],
};

function isValidMetricValue(key, raw) {
  if (raw === '' || raw === null || raw === undefined) return false;
  const limit = METRIC_LIMITS[key];
  if (!limit) return false;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < limit[0] || value > limit[1]) return false;
  if (key === 'age' && !Number.isInteger(value)) return false;
  return true;
}

export const emptyMetrics = (date = localDate()) => Object.fromEntries([['date', date], ...Object.keys(METRIC_LIMITS).map(key => [key, ''])]);
export const metricsForm = (date, record) => Object.fromEntries([['date', date], ...Object.keys(METRIC_LIMITS).map(key => [key, record?.[key] ?? ''])]);

export function parseMetrics(form) {
  if (!isCalendarDate(form.date)) throw new Error('INVALID_METRICS');
  const values = { date: form.date };
  for (const [key, [min, max]] of Object.entries(METRIC_LIMITS)) {
    if (form[key] === '' || form[key] === null || form[key] === undefined) continue;
    const value = Number(form[key]);
    if (!Number.isFinite(value) || value < min || value > max || (key === 'age' && !Number.isInteger(value))) throw new Error('INVALID_METRICS');
    values[key] = value;
  }
  if (Object.keys(values).length === 1) throw new Error('INVALID_METRICS');
  return values;
}

/**
 * Compute per-field fallback values for `targetDate`:
 * 1) Existing value on `targetDate` itself (from `sameDateRecord` or `history`),
 * 2) Otherwise the most recent earlier record (`record.date < targetDate`) containing a valid value for that field.
 */
export function fallbackMetricsForDate(targetDate, history = [], sameDateRecord = null) {
  if (!isCalendarDate(targetDate)) return {};
  const list = Array.isArray(history) ? history : [];
  const sameDate = sameDateRecord || list.find(item => item?.date === targetDate) || null;
  const earlier = list
    .filter(item => isCalendarDate(item?.date) && item.date < targetDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  const fallback = {};
  for (const key of Object.keys(METRIC_LIMITS)) {
    if (sameDate && isValidMetricValue(key, sameDate[key])) {
      fallback[key] = Number(sameDate[key]);
      continue;
    }
    for (const prev of earlier) {
      if (isValidMetricValue(key, prev[key])) {
        fallback[key] = Number(prev[key]);
        break;
      }
    }
  }
  return fallback;
}

/**
 * Merge newly entered metric values with fallback values for any omitted (blank) fields,
 * producing a clean Firestore-valid payload containing only `date` and valid `METRIC_LIMITS` keys.
 */
export function mergeMetricsRecord(parsed, fallback = {}) {
  if (!parsed || !isCalendarDate(parsed.date)) throw new Error('INVALID_METRICS');
  const merged = { date: parsed.date };
  for (const key of Object.keys(METRIC_LIMITS)) {
    if (isValidMetricValue(key, parsed[key])) {
      merged[key] = Number(parsed[key]);
    } else if (fallback && isValidMetricValue(key, fallback[key])) {
      merged[key] = Number(fallback[key]);
    }
  }
  if (Object.keys(merged).length === 1) throw new Error('INVALID_METRICS');
  return merged;
}
