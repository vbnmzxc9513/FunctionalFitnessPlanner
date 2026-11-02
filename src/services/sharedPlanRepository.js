import { PUBLIC_APP_LOCATION } from '../domain/publicOrigin.js';
import { collection, doc, getDoc, getDocs, limit, orderBy, documentId, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db, appId } from './firebase.js';
import { DOSES_PER_CHUNK, MAX_DAY_EXERCISES } from '../domain/plannerLimits.js';
import { encodePlanPayload, rebuildPlanDays, validatePlanPayload } from '../domain/sharedPlans.js';

const sharedRef = id => doc(db, 'artifacts', appId, 'sharedPlans', id);
const ownerRef = id => doc(db, 'artifacts', appId, 'shareOwners', id);
const validId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
const assertUser = uid => { if (!uid || auth.currentUser?.uid !== uid) throw new Error('SESSION_CHANGED'); };
const exact = (data, keys) => data && typeof data === 'object' && Object.keys(data).length === keys.length && Object.keys(data).every(key => keys.includes(key));
const invalid = () => { throw new Error('INVALID_PLAN_SHARE'); };

export function buildSharedPlanUrl(id, location = PUBLIC_APP_LOCATION) {
  if (!validId(id)) invalid();
  return `${location.origin}${location.pathname}#plan=${id}`;
}
export function buildEmbeddedPlanUrl(payload, location = PUBLIC_APP_LOCATION) {
  return `${location.origin}${location.pathname}#program=${encodePlanPayload(payload)}`;
}

export async function createSharedPlan(uid, value) {
  assertUser(uid);
  const payload = validatePlanPayload(value), days = rebuildPlanDays(payload);
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const id = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  const header = sharedRef(id);
  if (payload.v === 2) {
    const batch = writeBatch(db);
    batch.set(ownerRef(id), { uid, createdAt: serverTimestamp() });
    batch.set(header, { v: 2, name: payload.name, dayCount: payload.days.length, createdAt: serverTimestamp() });
    payload.days.forEach((day, index) => {
      const ref = doc(header, 'days', String(index));
      batch.set(ref, { index, name: day.name, offset: day.offset, routine: day.items.map(item => item.id), sessionType: days[index].sessionType });
      day.items.forEach((item, slot) => batch.set(doc(ref, 'doses', String(slot)), item));
    });
    assertUser(uid); await batch.commit(); assertUser(uid);
  } else {
    const initial = writeBatch(db);
    initial.set(ownerRef(id), { uid, createdAt: serverTimestamp() });
    initial.set(header, { v: 3, name: payload.name, dayCount: payload.days.length, createdAt: serverTimestamp(), status: 'building', completedDays: 0 });
    assertUser(uid); await initial.commit(); assertUser(uid);
    // Each committed checkpoint proves one immutable, complete day. Readers
    // cannot access any portion until the final checkpoint seals publication.
    for (const [index, day] of payload.days.entries()) {
      const batch = writeBatch(db), ref = doc(header, 'days', String(index));
      batch.set(ref, { index, name: day.name, offset: day.offset, routine: day.items.map(item => item.id), sessionType: days[index].sessionType });
      for (let slot = 0; slot * DOSES_PER_CHUNK < day.items.length; slot++) {
        batch.set(doc(ref, 'doses', String(slot)), { v: 3, items: day.items.slice(slot * DOSES_PER_CHUNK, (slot + 1) * DOSES_PER_CHUNK) });
      }
      const chunkCount = Math.ceil(day.items.length / DOSES_PER_CHUNK);
      for (let group = 0; group * 6 < chunkCount; group++) batch.set(doc(ref, 'doses', `proof${group}`), { v: 3, count: Math.min(6, chunkCount - group * 6) });
      batch.update(header, { completedDays: index + 1, status: index + 1 === payload.days.length ? 'complete' : 'building' });
      assertUser(uid); await batch.commit(); assertUser(uid);
    }
  }
  return id;
}

export async function loadSharedPlan(id) {
  if (!validId(id)) invalid();
  const header = sharedRef(id), snapshot = await getDoc(header);
  if (!snapshot.exists()) throw new Error('SHARED_PLAN_NOT_FOUND');
  const data = snapshot.data();
  if (!(data.v === 2 ? exact(data, ['v', 'name', 'dayCount', 'createdAt']) : data.v === 3 && exact(data, ['v', 'name', 'dayCount', 'createdAt', 'status', 'completedDays']) && data.status === 'complete' && data.completedDays === data.dayCount) || !Number.isInteger(data.dayCount) || data.dayCount < 1 || data.dayCount > 28) invalid();
  const dayRecords = await getDocs(query(collection(header, 'days'), orderBy(documentId()), limit(28)));
  if (dayRecords.size !== data.dayCount) invalid();
  const ordered = dayRecords.docs.sort((a, b) => Number(a.id) - Number(b.id));
  const days = await Promise.all(ordered.map(async (record, index) => {
    const day = record.data();
    if (record.id !== String(index) || !exact(day, ['index', 'name', 'offset', 'routine', 'sessionType']) || day.index !== index
      || !Array.isArray(day.routine) || day.routine.length > (data.v === 2 ? 8 : MAX_DAY_EXERCISES)) invalid();
    const doseLimit = data.v === 2 ? 8 : Math.ceil(MAX_DAY_EXERCISES / DOSES_PER_CHUNK) + 2;
    const doses = await getDocs(query(collection(record.ref, 'doses'), orderBy(documentId()), limit(doseLimit)));
    const expected = data.v === 2 ? day.routine.length : Math.ceil(day.routine.length / DOSES_PER_CHUNK);
    if (doses.size !== expected + (data.v === 3 ? Math.ceil(expected / 6) : 0)) invalid();
    if (data.v === 3) for (let group = 0; group * 6 < expected; group++) {
      const proof = doses.docs.find(record => record.id === `proof${group}`)?.data();
      if (!exact(proof, ['v', 'count']) || proof.v !== 3 || proof.count !== Math.min(6, expected - group * 6)) invalid();
    }
    const records = doses.docs.filter(record => !record.id.startsWith('proof')).sort((a, b) => Number(a.id) - Number(b.id));
    const items = records.flatMap((dose, slot) => {
      if (dose.id !== String(slot)) invalid();
      if (data.v === 2) return [dose.data()];
      const chunk = dose.data();
      if (!exact(chunk, ['v', 'items']) || chunk.v !== 3 || !Array.isArray(chunk.items)
        || chunk.items.length !== Math.min(DOSES_PER_CHUNK, day.routine.length - slot * DOSES_PER_CHUNK)) invalid();
      return chunk.items;
    });
    if (items.some((item, slot) => item.id !== day.routine[slot])) invalid();
    const rebuilt = rebuildPlanDays({ v: data.v, name: data.name, days: [{ name: day.name, offset: 0, items }] })[0];
    if (day.sessionType !== rebuilt.sessionType) invalid();
    return { name: day.name, offset: day.offset, items };
  }));
  return validatePlanPayload({ v: data.v, name: data.name, days });
}
