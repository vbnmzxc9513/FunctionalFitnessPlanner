import { documentId, endAt, getDocs, limit, orderBy, query, startAfter, startAt } from 'firebase/firestore';
import { auth } from './firebase.js';
import { userCollection } from './userPaths.js';
import { validateExportRange } from '../domain/trainingExport.js';
import { trainingLogId } from '../domain/coaching.js';

const PAGE_SIZE = 200;
export const MAX_EXPORT_DOCUMENTS = 5000;
function assertAccount(uid) {
  if (!uid || auth.currentUser?.uid !== uid) throw new Error('SESSION_CHANGED');
}

async function readPages(uid, group, constraints) {
  const documents = []; let cursor;
  for (;;) {
    assertAccount(uid);
    const snapshot = await getDocs(query(userCollection(uid, group), ...constraints(cursor), limit(PAGE_SIZE)));
    assertAccount(uid);
    // An incomplete offline cache must never be called a complete cloud export.
    if (snapshot.metadata.fromCache) throw new Error('EXPORT_OFFLINE');
    if (documents.length + snapshot.size > MAX_EXPORT_DOCUMENTS) throw new Error('EXPORT_TOO_LARGE');
    documents.push(...snapshot.docs.map(item => ({ id: item.id, data: item.data() })));
    if (snapshot.size < PAGE_SIZE) return documents;
    cursor = snapshot.docs.at(-1);
  }
}

export async function loadTrainingExport(uid, { from, to, today, includeCompletions = true }) {
  assertAccount(uid);
  validateExportRange(from, to, today);
  const logs = await readPages(uid, 'trainingLogs', cursor => [orderBy('date'), cursor ? startAfter(cursor) : startAt(from), endAt(to)]);
  // completedAt is a per-item map. Scan the owner's progress pages rather than
  // assume a completion occurred during the week its plan was scheduled.
  const progress = includeCompletions ? await readPages(uid, 'progress', cursor => [orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : [])]) : [];
  assertAccount(uid);
  return { logs: logs.map(item => {
    try { return trainingLogId(item.data) === item.id ? item.data : null; } catch { return null; }
  }), progress: Object.fromEntries(progress.map(item => [item.id, item.data])) };
}
