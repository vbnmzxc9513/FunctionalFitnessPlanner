import { TrialError } from './core.js';
const reject = code => { throw new TrialError(code); };

// Firebase Admin transactions retry conflicts; reserve completes before any Gemini call.
export function firestoreQuota(db, timestamp) {
  const weekly = (uid, week) => db.doc(`aiTrialQuota/weekly/users/${uid}/weeks/${week}`);
  return {
    reserve: async ({ uid, hash, currentWeek, currentDate, dailyCap }) => {
      const week = weekly(uid, currentWeek);
      const day = db.doc(`aiTrialQuota/days/${currentDate}/counter`);
      return db.runTransaction(async tx => {
        const [existing, daily] = await Promise.all([tx.get(week), tx.get(day)]);
        if (existing.exists) {
          const value = existing.data();
          if (value.hash !== hash) reject('AI_TRIAL_WEEK_EXHAUSTED');
          if (value.status === 'complete' && value.plan) return { plan: value.plan };
          reject(value.status === 'pending' ? 'AI_TRIAL_BUSY' : 'AI_TRIAL_WEEK_EXHAUSTED');
        }
        const count = daily.exists ? daily.data().count : 0;
        if (!Number.isInteger(count) || count < 0 || count >= dailyCap) reject('AI_TRIAL_DAILY_LIMIT');
        tx.set(week, { hash, status: 'pending', createdAt: timestamp(), expiresAt: new Date(new Date(`${currentDate}T00:00:00Z`).valueOf() + 30 * 86400000) });
        tx.set(day, { count: count + 1, updatedAt: timestamp() });
        return {};
      });
    },
    complete: ({ uid, hash, currentWeek, plan }) => db.runTransaction(async tx => {
      const ref = weekly(uid, currentWeek);
      const value = (await tx.get(ref)).data();
      if (value?.hash !== hash || value.status !== 'pending') reject('AI_TRIAL_FAILED');
      tx.update(ref, { status: 'complete', plan, updatedAt: timestamp() });
    }),
    fail: ({ uid, hash, currentWeek }) => db.runTransaction(async tx => {
      const ref = weekly(uid, currentWeek);
      const value = (await tx.get(ref)).data();
      if (value?.hash === hash && value.status === 'pending') tx.update(ref, { status: 'failed', updatedAt: timestamp() });
    }),
  };
}
