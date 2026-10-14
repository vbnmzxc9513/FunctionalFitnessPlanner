import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString, defineInt } from 'firebase-functions/params';
import { createTrialService, TrialError } from './core.js';
import { firestoreQuota } from './quota.js';
import { planSchema } from './schema.js';
import { buildPlanningPrompt } from './shared/domain/coachingPrompt.js';
import { catalogExercises, eligibleExercises, EQUIPMENT } from './shared/domain/exerciseCatalog.js';
import { normalizePlanningContext, validateGeneratedPlan } from './shared/domain/planning.js';

initializeApp();
const db = getFirestore();
const geminiKey = defineSecret('FITNESS_TRIAL_GEMINI_KEY');
const enabled = defineString('AI_TRIAL_ENABLED', { default: 'false' });
const dailyCap = defineInt('AI_TRIAL_DAILY_CALL_CAP', { default: 0 });
const MODEL = 'gemini-2.5-flash';

const service = createTrialService({
  config: async () => {
    if (enabled.value() !== 'true' || dailyCap.value() < 1) return { enabled: false };
    // Operator-controlled kill switch and cap, never writable/readable by a client.
    const control = (await db.doc('aiTrialConfig/runtime').get()).data();
    return { enabled: control?.enabled === true, dailyCap: Math.min(dailyCap.value(), control?.dailyCap ?? 0) };
  },
  quota: firestoreQuota(db, () => FieldValue.serverTimestamp()),
  domain: { prompt: buildPlanningPrompt, catalog: catalogExercises, eligible: eligibleExercises,
    normalizeContext: normalizePlanningContext, validate: validateGeneratedPlan, equipment: EQUIPMENT },
  generate: async prompt => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(45000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey.value() },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: {
        temperature: 0.3, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json', responseSchema: planSchema,
      } }),
    });
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 200000) throw new Error('GENERATION_FAILED');
    // Stream-bound the provider response instead of trusting a Content-Length header.
    const reader = response.body.getReader();
    const chunks = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 200000) { await reader.cancel(); throw new Error('RESULT_TOO_LARGE'); }
      chunks.push(value);
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const candidate = result.candidates?.[0];
    if (candidate?.finishReason !== 'STOP') throw new Error('INCOMPLETE_RESULT');
    return JSON.parse(candidate.content.parts.filter(part => !part.thought).map(part => part.text || '').join(''));
  },
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
