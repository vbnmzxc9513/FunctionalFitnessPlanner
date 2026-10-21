import { PUBLIC_APP_LOCATION } from '../domain/publicOrigin.js';
import { collection, doc, getDoc, getDocs, limit, orderBy, documentId, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { auth, db, appId } from './firebase.js';
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
  const batch = writeBatch(db), header = sharedRef(id);
  batch.set(ownerRef(id), { uid, createdAt: serverTimestamp() });
  batch.set(header, { v: 2, name: payload.name, dayCount: payload.days.length, createdAt: serverTimestamp() });
  payload.days.forEach((day, index) => {
    const ref = doc(header, 'days', String(index));
    batch.set(ref, { index, name: day.name, offset: day.offset, routine: day.items.map(item => item.id), sessionType: days[index].sessionType });
    day.items.forEach((item, slot) => batch.set(doc(ref, 'doses', String(slot)), item));
  });
  assertUser(uid);
  await batch.commit();
  assertUser(uid);
  return id;
}

export async function loadSharedPlan(id) {
  if (!validId(id)) invalid();
  const header = sharedRef(id), snapshot = await getDoc(header);
  if (!snapshot.exists()) throw new Error('SHARED_PLAN_NOT_FOUND');
  const data = snapshot.data();
  if (!exact(data, ['v', 'name', 'dayCount', 'createdAt']) || data.v !== 2 || !Number.isInteger(data.dayCount) || data.dayCount < 1 || data.dayCount > 28) invalid();
  const dayRecords = await getDocs(query(collection(header, 'days'), orderBy(documentId()), limit(28)));
  if (dayRecords.size !== data.dayCount) invalid();
  const ordered = dayRecords.docs.sort((a, b) => Number(a.id) - Number(b.id));
  const days = await Promise.all(ordered.map(async (record, index) => {
    const day = record.data();
    if (record.id !== String(index) || !exact(day, ['index', 'name', 'offset', 'routine', 'sessionType']) || day.index !== index
      || !Array.isArray(day.routine) || day.routine.length > 8) invalid();
    const doses = await getDocs(query(collection(record.ref, 'doses'), orderBy(documentId()), limit(8)));
    if (doses.size !== day.routine.length) invalid();
    const items = doses.docs.map((dose, slot) => {
      if (dose.id !== String(slot) || dose.data().id !== day.routine[slot]) invalid();
      return dose.data();
    });
    const rebuilt = rebuildPlanDays({ v: 2, name: data.name, days: [{ name: day.name, offset: 0, items }] })[0];
    if (day.sessionType !== rebuilt.sessionType) invalid();
    return { name: day.name, offset: day.offset, items };
  }));
  return validatePlanPayload({ v: 2, name: data.name, days });
}
