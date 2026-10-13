import { isCalendarDate, localDate } from './dates.js';

export const METRIC_LIMITS = {
  height: [1, 300], weight: [1, 500], age: [1, 120], bodyFat: [0, 100], bmr: [1, 10000],
  muscleLarm: [0, 100], muscleRarm: [0, 100], muscleLleg: [0, 150], muscleRleg: [0, 150], muscleTrunk: [0, 300],
};
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
