const DAY_MS = 86400000;

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getWeekString(date = new Date(), offsetWeeks = 0) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + offsetWeeks * 7);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function dateForWeekDay(weekId, day = 1) {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekId);
  if (!match || +match[2] < 1 || +match[2] > 53 || !Number.isInteger(day) || day < 1 || day > 7) return null;
  const jan4 = new Date(Date.UTC(+match[1], 0, 4));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (+match[2] - 1) * 7 + day - 1);
  const result = jan4.toISOString().slice(0, 10);
  return getWeekString(new Date(`${result}T12:00:00`)) === weekId ? result : null;
}

export function getDateForWeekDay(weekId, day) {
  const date = dateForWeekDay(weekId, day);
  if (!date) return '';
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

export function formatMonth(monthKey, lang = 'zh') {
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-TW' : 'en', { year: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${monthKey}-01T00:00:00Z`));
}

export function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
