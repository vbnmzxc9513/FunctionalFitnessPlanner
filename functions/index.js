import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString, defineInt } from 'firebase-functions/params';
import { createTrialService, TrialError } from './core.js';
import { createMemberPeriodService, MemberAiError } from './memberPeriod.js';
import { buildCoachGenerationConfig, createMemberCoachService, MemberCoachError } from './memberCoach.js';
import { firestoreQuota } from './quota.js';
import { planSchema, periodChunkSchema } from './schema.js';
import { buildPlanningPrompt } from './shared/domain/coachingPrompt.js';
import { catalogExercises, eligibleExercises, EQUIPMENT } from './shared/domain/exerciseCatalog.js';
import { validateNewAIPlan } from './shared/domain/newAIPlan.js';
import { normalizePlanningContext } from './shared/domain/planning.js';

initializeApp();
const db = getFirestore();
const geminiKey = defineSecret('FITNESS_TRIAL_GEMINI_KEY');
const enabled = defineString('AI_TRIAL_ENABLED', { default: 'false' });
const dailyCap = defineInt('AI_TRIAL_DAILY_CALL_CAP', { default: 0 });
const MODEL = 'gemini-2.5-flash';

async function readBoundedResponseJson(response, maxBytes = 200000) {
  if (!response.ok || Number(response.headers.get('content-length') || 0) > maxBytes) throw new Error('GENERATION_FAILED');
  // Stream-bound the provider response instead of trusting a Content-Length header.
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > maxBytes) { await reader.cancel(); throw new Error('RESULT_TOO_LARGE'); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function callGeminiBounded({ prompt, model, schema }) {
  const isFlash = String(model || '').includes('flash');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey.value() },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        ...(isFlash ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });
  const result = await readBoundedResponseJson(response);
  const candidate = result.candidates?.[0];
  if (candidate?.finishReason !== 'STOP') throw new Error('INCOMPLETE_RESULT');
  return JSON.parse(candidate.content.parts.filter(part => !part.thought).map(part => part.text || '').join(''));
}

async function callGeminiCoachBounded({ systemContext, messages, model }) {
  const payload = {
    ...(systemContext ? { systemInstruction: { parts: [{ text: systemContext }] } } : {}),
    contents: messages.map(item => ({ role: item.role, parts: [{ text: item.text }] })),
    generationConfig: buildCoachGenerationConfig(model),
  };
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey.value() },
    body: JSON.stringify(payload),
  });
  const result = await readBoundedResponseJson(response);
  const candidate = result.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const reply = parts.filter(part => !part.thought).map(part => part.text || '').join('').trim();
  if (!reply) throw new Error('EMPTY_COACH_REPLY');
  return { reply };
}

const getMemberDoc = async uid => (await db.doc(`aiMembers/${uid}`).get()).data() || null;

const consumeMemberQuota = async ({ uid, utcDate, dailyLimit }) => {
  const ref = db.doc(`aiMemberQuota/${utcDate}_${uid}`);
  return db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    const count = snapshot.exists ? Number(snapshot.data()?.count || 0) : 0;
    if (count >= dailyLimit) return false;
    tx.set(ref, { count: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
};

const service = createTrialService({
  config: async () => {
    if (enabled.value() !== 'true' || dailyCap.value() < 1) return { enabled: false };
    // Operator-controlled kill switch and cap, never writable/readable by a client.
    const control = (await db.doc('aiTrialConfig/runtime').get()).data();
    return { enabled: control?.enabled === true, dailyCap: Math.min(dailyCap.value(), control?.dailyCap ?? 0) };
  },
  quota: firestoreQuota(db, () => FieldValue.serverTimestamp()),
  domain: { prompt: buildPlanningPrompt, catalog: catalogExercises, eligible: eligibleExercises,
    normalizeContext: normalizePlanningContext, validate: validateNewAIPlan, equipment: EQUIPMENT },
  generate: prompt => callGeminiBounded({ prompt, model: MODEL, schema: planSchema }),
});

const memberService = createMemberPeriodService({
  getMember: getMemberDoc,
  consumeQuota: consumeMemberQuota,
  generate: ({ prompt, model, includeReport }) => callGeminiBounded({
    prompt,
    model,
    schema: periodChunkSchema(includeReport),
  }),
});

const memberCoachService = createMemberCoachService({
  getMember: getMemberDoc,
  consumeQuota: consumeMemberQuota,
  generate: ({ systemContext, messages, model }) => callGeminiCoachBounded({
    systemContext,
    messages,
    model,
  }),
});

export const requestAiTrialPlan = onCall({
  region: 'asia-east1', enforceAppCheck: true, secrets: [geminiKey],
  maxInstances: 2, concurrency: 1, timeoutSeconds: 60, memory: '256MiB',
}, async request => {
  try {
    return await service({ uid: request.auth?.uid, provider: request.auth?.token?.firebase?.sign_in_provider,
      appVerified: !!request.app, data: request.data });
  } catch (error) {
    const code = error instanceof TrialError ? error.code : 'AI_TRIAL_FAILED';
    const status = code === 'AI_TRIAL_SIGN_IN_REQUIRED' ? 'unauthenticated'
      : code === 'AI_TRIAL_INVALID_INPUT' ? 'invalid-argument'
        : code === 'AI_TRIAL_APP_CHECK_REQUIRED' ? 'permission-denied'
          : ['AI_TRIAL_WEEK_EXHAUSTED', 'AI_TRIAL_DAILY_LIMIT', 'AI_TRIAL_BUSY'].includes(code) ? 'resource-exhausted' : 'unavailable';
    // No provider error, clinical prompt, UID, response text or secret in logs/client errors.
    throw new HttpsError(status, code);
  }
});

export const requestMemberAiPeriodChunk = onCall({
  region: 'asia-east1', enforceAppCheck: false, secrets: [geminiKey],
  maxInstances: 4, concurrency: 2, timeoutSeconds: 60, memory: '256MiB',
}, async request => {
  try {
    return await memberService({
      uid: request.auth?.uid,
      provider: request.auth?.token?.firebase?.sign_in_provider,
      data: request.data,
    });
  } catch (error) {
    const code = error instanceof MemberAiError ? error.code : 'AI_MEMBER_FAILED';
    const status = code === 'AI_MEMBER_SIGN_IN_REQUIRED' ? 'unauthenticated'
      : code === 'AI_MEMBER_NOT_ACTIVE' ? 'permission-denied'
        : code === 'AI_MEMBER_INVALID_INPUT' ? 'invalid-argument'
          : code === 'AI_MEMBER_DAILY_LIMIT' ? 'resource-exhausted' : 'unavailable';
    throw new HttpsError(status, code);
  }
});

export const requestMemberAiCoachReply = onCall({
  region: 'asia-east1', enforceAppCheck: false, secrets: [geminiKey],
  maxInstances: 4, concurrency: 2, timeoutSeconds: 60, memory: '256MiB',
}, async request => {
  try {
    return await memberCoachService({
      uid: request.auth?.uid,
      provider: request.auth?.token?.firebase?.sign_in_provider,
      data: request.data,
    });
  } catch (error) {
    const code = error instanceof MemberCoachError ? error.code : 'AI_MEMBER_FAILED';
    const status = code === 'AI_MEMBER_SIGN_IN_REQUIRED' ? 'unauthenticated'
      : code === 'AI_MEMBER_NOT_ACTIVE' ? 'permission-denied'
        : code === 'AI_MEMBER_INVALID_INPUT' ? 'invalid-argument'
          : code === 'AI_MEMBER_DAILY_LIMIT' ? 'resource-exhausted' : 'unavailable';
    throw new HttpsError(status, code);
  }
});
