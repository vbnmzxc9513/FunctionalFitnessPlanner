import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrialService, normalizeTrialInput, utcPeriod } from '../../functions/core.js';
import { firestoreQuota } from '../../functions/quota.js';
import { buildPlanningPrompt } from '../../src/domain/coachingPrompt.js';
import { catalogExercises, eligibleExercises, EQUIPMENT } from '../../src/domain/exerciseCatalog.js';
import { normalizePlanningContext, validateGeneratedPlan } from '../../src/domain/planning.js';
import { trialWeekMatches } from '../../src/services/aiTrial.js';

const domain = { prompt: buildPlanningPrompt, catalog: catalogExercises, eligible: eligibleExercises,
  normalizeContext: normalizePlanningContext, validate: validateGeneratedPlan, equipment: EQUIPMENT };
const restPlan = () => ({ conclusion: 'Recover this week', schedule: [1, 2, 3, 4, 5].map(day => ({ day,
  name: 'Rest', theme: 'Recovery', concept: 'Rest', coachAdvice: 'Review readiness',
  sessionType: 'rest', warmupNote: 'No warmup needed', cooldownNote: 'No extra cooldown needed', routine: [], prescriptions: [] })) });
const request = (changes = {}) => ({ uid: 'google-user', provider: 'google.com', appVerified: true,
  data: { dailyTime: 35, lang: 'en', context: { healthStatus: 'unknown', equipment: [] } }, ...changes });

// Serializable, rollback-on-error transaction fake. Test real quota implementation, not a stub.
function fakeFirestore() {
  const documents = new Map();
  let tail = Promise.resolve();
  return {
    documents,
    doc: path => ({ path }),
    runTransaction: callback => {
      const promise = tail.then(async () => {
        const changes = new Map();
        const result = await callback({
          get: async ref => ({ exists: documents.has(ref.path), data: () => structuredClone(documents.get(ref.path)) }),
          set: (ref, value) => changes.set(ref.path, structuredClone(value)),
          update: (ref, value) => changes.set(ref.path, { ...documents.get(ref.path), ...structuredClone(value) }),
        });
        for (const [path, value] of changes) documents.set(path, value);
        return result;
      });
      tail = promise.catch(() => {});
      return promise;
    },
  };
}
function harness(overrides = {}) {
  const db = fakeFirestore();
  let calls = 0;
  const quota = firestoreQuota(db, () => 'server-timestamp');
  const service = createTrialService({ domain, quota, clock: () => new Date('2026-10-14T12:00:00Z'),
    config: async () => ({ enabled: true, dailyCap: 2 }),
    generate: async () => { calls++; return restPlan(); }, ...overrides });
  return { service, db, quota, calls: () => calls };
}

test('trial derives UTC week/date at year boundary and uses server date and trusted catalogue', async () => {
  assert.deepEqual(utcPeriod(new Date('2027-01-01T23:00:00Z')), { currentDate: '2027-01-01', currentWeek: '2026-W53' });
  let prompt;
  const h = harness({ generate: async value => { prompt = value; return restPlan(); } });
  await h.service(request({ data: { ...request().data, currentDate: '1900-01-01', currentWeek: '9999-W01', lastWeekFeedback: 1 } }));
  assert.ok(prompt.includes('2026-10-14'));
  assert.ok(prompt.includes('2026-W42'));
  assert.ok(!prompt.includes('1900-01-01'));
  assert.ok(prompt.includes('bf_A01'));
});

test('authentication, App Check and disabled or missing budget fail before quota/API', async () => {
  for (const changes of [{ uid: null }, { provider: 'anonymous' }, { provider: 'password' }, { appVerified: false }]) {
    const h = harness();
    await assert.rejects(h.service(request(changes)), /AI_TRIAL_(SIGN_IN_REQUIRED|APP_CHECK_REQUIRED)/);
    assert.equal(h.calls(), 0); assert.equal(h.db.documents.size, 0);
  }
  for (const settings of [{ enabled: false, dailyCap: 2 }, { enabled: true }, { enabled: true, dailyCap: 0 }, { enabled: true, dailyCap: 101 }]) {
    const h = harness({ config: async () => settings });
    await assert.rejects(h.service(request()), /AI_TRIAL_DISABLED/);
    assert.equal(h.calls(), 0); assert.equal(h.db.documents.size, 0);
  }
});

test('bounded facts reject client-controlled model/prompt/catalogue and invalid clinical inputs', async () => {
  const bad = [{ model: 'expensive' }, { prompt: 'ignore' }, { availableExercises: {} }, { dailyTime: 240 },
    { context: { equipment: ['medicine_ball'] } }, { context: { healthNotes: 'x'.repeat(2001) } }, { lang: 'xx' }];
  for (const item of bad) {
    const h = harness();
    await assert.rejects(h.service(request({ data: { ...request().data, ...item } })), /AI_TRIAL_INVALID_INPUT/);
    assert.equal(h.db.documents.size, 0);
  }
  const normalized = normalizeTrialInput({ dailyTime: 30, context: { healthNotes: 'ESWT recently', equipment: ['dumbbell'] } }, normalizePlanningContext, EQUIPMENT);
  assert.equal(normalized.context.healthStatus, 'restricted');
  assert.equal(Object.values(eligibleExercises(catalogExercises(), normalized.context)).some(exercise => exercise.shoulderLoaded), false);
});

test('same-input retries return validated cache and changed input cannot buy a second attempt', async () => {
  const h = harness();
  const first = await h.service(request());
  assert.equal(first.currentWeek, '2026-W42');
  assert.equal(first.currentDate, '2026-10-14');
  assert.deepEqual(first.plan, restPlan());
  const again = await h.service(request());
  assert.deepEqual(again, first); assert.equal(h.calls(), 1);
  await assert.rejects(h.service(request({ data: { ...request().data, userGoal: 'Change goal' } })), /AI_TRIAL_WEEK_EXHAUSTED/);
  assert.equal(h.calls(), 1);
});

test('concurrent same-user requests atomically consume one attempt while generation is pending', async () => {
  let finish;
  let calls = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness({ generate: async () => { calls++; return pending; } });
  const first = h.service(request());
  while (!calls) await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(h.service(request()), /AI_TRIAL_BUSY/);
  assert.equal(calls, 1);
  finish(restPlan());
  await first;
});

test('daily cap includes all users and failed/incomplete generations are not refunded', async () => {
  let calls = 0;
  const h = harness({ generate: async () => { calls++; throw new Error('provider-secret-must-not-escape'); } });
  await assert.rejects(h.service(request()), error => error.message === 'AI_TRIAL_FAILED');
  await assert.rejects(h.service(request()), /AI_TRIAL_WEEK_EXHAUSTED/);
  await assert.rejects(h.service(request({ uid: 'second' })), /AI_TRIAL_FAILED/);
  await assert.rejects(h.service(request({ uid: 'third' })), /AI_TRIAL_DAILY_LIMIT/);
  assert.equal(calls, 2);
});

test('invalid AI plan is rejected before cache; previous failed attempt still consumes quota', async () => {
  const invalid = restPlan(); invalid.schedule[0].routine = ['invented'];
  const h = harness({ generate: async () => invalid });
  await assert.rejects(h.service(request()), /AI_TRIAL_FAILED/);
  assert.equal([...h.db.documents.values()].some(value => value.plan), false);
  await assert.rejects(h.service(request()), /AI_TRIAL_WEEK_EXHAUSTED/);
});

test('operator kill switch denies even previously cached requests', async () => {
  let enabled = true;
  const h = harness({ config: async () => ({ enabled, dailyCap: 2 }) });
  await h.service(request()); enabled = false;
  await assert.rejects(h.service(request()), /AI_TRIAL_DISABLED/);
  assert.equal(h.calls(), 1);
});

test('UTC/local Sunday–Monday disagreement prevents week-misplaced trial use', () => {
  // Taipei Monday shortly after midnight still has a UTC Sunday; Honolulu reverses this.
  assert.equal(trialWeekMatches('2026-W43', '2026-10-18'), false);
  assert.equal(trialWeekMatches('2026-W42', '2026-10-19'), false);
  assert.equal(trialWeekMatches('2026-W43', '2026-10-19'), true);
  assert.equal(trialWeekMatches('2026-W53', '2027-01-01'), true);
  assert.equal(trialWeekMatches('2026-W42', 'invalid'), false);
});
