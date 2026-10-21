import { createSharePayload, shareDay, validateSharePayload } from './sharing.js';

export const MAX_PLAN_DAYS = 28;
export const MAX_PLAN_SHARE_LENGTH = 14000;
export const MAX_PLAN_NAME_LENGTH = 40;
const invalid = () => { throw new Error('INVALID_PLAN_SHARE'); };
const exactKeys = (value, allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== allowed.length || Object.keys(value).some(key => !allowed.includes(key))) invalid();
};
function publicName(value) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()
    || value.length > MAX_PLAN_NAME_LENGTH || Array.from(value).some(char => char.codePointAt(0) < 32 || char.codePointAt(0) === 127)) invalid();
  return value;
}
function dateNumber(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid();
  const number = Date.parse(`${value}T12:00:00Z`);
  if (!Number.isFinite(number) || new Date(number).toISOString().slice(0, 10) !== value) invalid();
  return number / 86400000;
}

export function validatePlanPayload(payload) {
  exactKeys(payload, ['v', 'name', 'days']);
  if (payload.v !== 2 || !Array.isArray(payload.days) || payload.days.length < 1 || payload.days.length > MAX_PLAN_DAYS) invalid();
  let previous = -1;
  const days = payload.days.map((day, index) => {
    exactKeys(day, ['name', 'offset', 'items']);
    if (!Number.isInteger(day.offset) || day.offset < 0 || day.offset > 27 || day.offset <= previous || index === 0 && day.offset !== 0) invalid();
    previous = day.offset;
    let items;
    try { items = validateSharePayload({ v: 1, items: day.items }).items; } catch { invalid(); }
    return { name: publicName(day.name), offset: day.offset, items };
  });
  return { v: 2, name: publicName(payload.name), days };
}

// Only the explicitly public plan name and generated day labels cross this
// boundary. Original dates, day titles, notes, health, weights and identity do not.
export function createPlanPayload(sessions, { name, exercises, level = 1 } = {}) {
  if (!Array.isArray(sessions) || !sessions.length || sessions.length > MAX_PLAN_DAYS
    || sessions.some(day => !day || typeof day !== 'object')) invalid();
  const dated = sessions.some(day => day.date !== undefined);
  const offset = sessions.some(day => day.offset !== undefined);
  if (dated && sessions.some(day => day.date === undefined) || !dated && offset && sessions.some(day => !Number.isInteger(day.offset))) invalid();
  const rows = sessions.map((day, index) => ({ day, order: dated ? dateNumber(day.date) : offset ? day.offset : index })).sort((a, b) => a.order - b.order);
  const first = rows[0].order;
  return validatePlanPayload({ v: 2, name: String(name ?? '').trim(), days: rows.map(({ day, order }, index) => ({
    name: `第 ${index + 1} 天`, offset: order - first, items: createSharePayload(day, exercises, level).items,
  })) });
}

export function rebuildPlanDays(payload, lang = 'zh') {
  return validatePlanPayload(payload).days.map((day, index) => ({
    ...shareDay({ v: 1, items: day.items }, lang), day: index + 1,
    name: day.name, theme: day.name, offset: day.offset,
  }));
}

export function encodePlanPayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(validatePlanPayload(payload)));
  if (Math.ceil(bytes.length * 4 / 3) > MAX_PLAN_SHARE_LENGTH) throw new Error('PLAN_SHARE_TOO_LONG');
  const encoded = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  if (encoded.length > MAX_PLAN_SHARE_LENGTH) throw new Error('PLAN_SHARE_TOO_LONG');
  return encoded;
}

export function decodePlanPayload(encoded) {
  if (typeof encoded !== 'string' || !encoded.length) invalid();
  if (encoded.length > MAX_PLAN_SHARE_LENGTH) throw new Error('PLAN_SHARE_TOO_LONG');
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) invalid();
  try {
    const raw = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
    return validatePlanPayload(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(raw, char => char.charCodeAt(0)))));
  } catch { invalid(); }
}

export function readSharedPlanLocation(location = globalThis.location) {
  const hash = location?.hash || '';
  if (hash.startsWith('#plan=')) {
    const id = hash.slice(6);
    return /^[a-f0-9]{32}$/.test(id) ? { id } : { error: 'INVALID_PLAN_SHARE' };
  }
  if (!hash.startsWith('#program=')) return null;
  try { return { payload: decodePlanPayload(hash.slice(9)) }; }
  catch (error) { return { error: error.message === 'PLAN_SHARE_TOO_LONG' ? error.message : 'INVALID_PLAN_SHARE' }; }
}
