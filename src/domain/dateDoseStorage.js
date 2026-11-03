import { DOSES_PER_CHUNK, MAX_DAY_EXERCISES } from './plannerLimits.js';

/** New date storage packs two independently editable doses per bounded document. */
export function dateDoseKeys(date, metadata) {
  return metadata.v === 3
    ? Array.from({ length: Math.ceil(metadata.routine.length / DOSES_PER_CHUNK) }, (_, slot) => `${date}__${slot}`)
    : metadata.routine.map(id => `${date}_${id}`);
}

/** Compatibility adapter returns the existing single-dose record shape. */
export function dateDoseRecord(date, metadata, records, exerciseId) {
  const index = metadata.routine.indexOf(exerciseId);
  if (index < 0) return null;
  if (metadata.v !== 3) return records[`${date}_${exerciseId}`] || null;
  const record = records[`${date}__${Math.floor(index / DOSES_PER_CHUNK)}`];
  const expectedSize = Math.min(DOSES_PER_CHUNK, metadata.routine.length - Math.floor(index / DOSES_PER_CHUNK) * DOSES_PER_CHUNK);
  if (!record || record.v !== 3 || record.date !== date || record.revision !== metadata.revision
    || Object.keys(record).some(key => !['v', 'date', 'revision', 'items'].includes(key))
    || !Array.isArray(record.items) || record.items.length !== expectedSize || metadata.routine.length > MAX_DAY_EXERCISES) return null;
  if (record.items.some((dose, slot) => dose?.id !== metadata.routine[Math.floor(index / DOSES_PER_CHUNK) * DOSES_PER_CHUNK + slot])) return null;
  const dose = record.items[index % DOSES_PER_CHUNK];
  if (dose?.id !== exerciseId) return null;
  return { date, exerciseId, revision: record.revision, dose };
}

export function dateDoseDocuments(session, revision) {
  return dateDoseKeys(session.date, { ...session, v: 3 }).map((id, slot) => ({ id,
    data: { v: 3, date: session.date, revision, items: session.prescriptions.slice(slot * DOSES_PER_CHUNK, (slot + 1) * DOSES_PER_CHUNK) } }));
}
