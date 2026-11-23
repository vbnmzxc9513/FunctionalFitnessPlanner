import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase.js';

const env = import.meta.env || globalThis.process?.env || {};
let functionsInstance = null;
let memberCallable = null;
let memberCoachCallable = null;
let appCheckInitialized = false;

function isMembershipActive(data) {
  if (!data || data.active !== true) return false;
  if (data.expiresAt) {
    const millis = typeof data.expiresAt.toMillis === 'function'
      ? data.expiresAt.toMillis()
      : Date.parse(String(data.expiresAt));
    if (Number.isFinite(millis) && millis < Date.now()) return false;
  }
  return true;
}

/**
 * Subscribe to the signed-in user's own `aiMembers/{uid}` document.
 * Non-members or environments where member rules are not deployed yet silently
 * resolve to `{ active: false, loaded: true }` without breaking the app.
 */
export function subscribeAiMembership(uid, onChange) {
  if (!uid) {
    onChange({ active: false, loaded: true, tier: null, dailyLimit: null });
    return () => {};
  }
  const ref = doc(db, 'aiMembers', uid);
  return onSnapshot(
    ref,
    snapshot => {
      const data = snapshot.exists() ? snapshot.data() : null;
      const active = isMembershipActive(data);
      onChange({
        active,
        loaded: true,
        tier: active ? (data.tier || 'member') : null,
        dailyLimit: active && Number.isInteger(data.dailyLimit) ? data.dailyLimit : null,
      });
    },
    () => {
      onChange({ active: false, loaded: true, tier: null, dailyLimit: null });
    },
  );
}

async function getMemberFunctions() {
  const [{ getApp }, { connectFunctionsEmulator, getFunctions, httpsCallable }] = await Promise.all([
    import('firebase/app'),
    import('firebase/functions'),
  ]);
  if (!functionsInstance) {
    const emulating = env.DEV && env.VITE_USE_FIREBASE_EMULATORS === 'true';
    if (!appCheckInitialized && !emulating && env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) {
      appCheckInitialized = true;
      try {
        const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
        initializeAppCheck(getApp(), {
          provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY),
          isTokenAutoRefreshEnabled: true,
        });
      } catch {
        /* App Check may already be initialized by aiTrial.js */
      }
    }
    functionsInstance = getFunctions(getApp(), env.VITE_AI_TRIAL_REGION || 'asia-east1');
    if (emulating) connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
  }
  return { functions: functionsInstance, httpsCallable };
}

async function getMemberCallable() {
  if (memberCallable) return memberCallable;
  const { functions, httpsCallable } = await getMemberFunctions();
  memberCallable = httpsCallable(functions, 'requestMemberAiPeriodChunk', { timeout: 95000 });
  return memberCallable;
}

async function getMemberCoachCallable() {
  if (memberCoachCallable) return memberCoachCallable;
  const { functions, httpsCallable } = await getMemberFunctions();
  memberCoachCallable = httpsCallable(functions, 'requestMemberAiCoachReply', { timeout: 65000 });
  return memberCoachCallable;
}

function mapMemberCallableError(error, signal) {
  if (signal?.aborted || error?.message === 'ABORTED') return new Error('ABORTED');
  const code = String(error?.message || '');
  const allowed = /^AI_MEMBER_(SIGN_IN_REQUIRED|NOT_ACTIVE|DAILY_LIMIT|INVALID_INPUT|FAILED|UNAVAILABLE)$/;
  if (allowed.test(code)) return new Error(code);
  if (error?.code === 'functions/permission-denied') return new Error('AI_MEMBER_NOT_ACTIVE');
  if (error?.code === 'functions/resource-exhausted') return new Error('AI_MEMBER_DAILY_LIMIT');
  if (error?.code === 'functions/unauthenticated') return new Error('AI_MEMBER_SIGN_IN_REQUIRED');
  if (error?.code === 'functions/invalid-argument') return new Error('AI_MEMBER_INVALID_INPUT');
  return new Error('AI_MEMBER_UNAVAILABLE');
}

/**
 * Invoke the server-side Cloud Function proxy for active members.
 * The Gemini API key stays strictly inside Firebase Secret Manager.
 */
export async function requestMemberAiPeriodChunk({
  prompt,
  includeReport = false,
  model = 'gemini-2.5-flash',
  signal,
} = {}) {
  if (signal?.aborted) throw new Error('ABORTED');
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new Error('AI_MEMBER_SIGN_IN_REQUIRED');
  }
  try {
    const callable = await getMemberCallable();
    const { data } = await callable({ prompt, includeReport: !!includeReport, model });
    if (signal?.aborted) throw new Error('ABORTED');
    if (!data || typeof data !== 'object') throw new Error('AI_EMPTY_RESPONSE');
    return data;
  } catch (error) {
    throw mapMemberCallableError(error, signal);
  }
}

/**
 * Invoke the server-side Cloud Function proxy for active member AI Coach chat.
 * Returns the trimmed assistant reply string.
 */
export async function requestMemberAiCoachReply({
  systemContext = '',
  messages = [],
  model = 'gemini-2.5-flash',
  signal,
} = {}) {
  if (signal?.aborted) throw new Error('ABORTED');
  if (!auth.currentUser || auth.currentUser.isAnonymous) {
    throw new Error('AI_MEMBER_SIGN_IN_REQUIRED');
  }
  try {
    const callable = await getMemberCoachCallable();
    const { data } = await callable({ systemContext, messages, model });
    if (signal?.aborted) throw new Error('ABORTED');
    const reply = typeof data?.reply === 'string' ? data.reply.trim() : '';
    if (!reply) throw new Error('AI_EMPTY_RESPONSE');
    return reply;
  } catch (error) {
    if (error?.message === 'AI_EMPTY_RESPONSE') throw error;
    throw mapMemberCallableError(error, signal);
  }
}
