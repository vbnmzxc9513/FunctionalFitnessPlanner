import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { auth } from './firebase.js';
import { catalogExercises, eligibleExercises } from '../domain/exerciseCatalog.js';
import { normalizePlanningContext, validateGeneratedPlan } from '../domain/planning.js';
import { getWeekString, isCalendarDate } from '../domain/dates.js';

const env = import.meta.env || globalThis.process?.env || {};
export const trialEnabled = () => env.VITE_AI_TRIAL_ENABLED === 'true';
let callable;
let appCheck;

// A local-noon date preserves the server's calendar day without a timezone shift.
export function trialWeekMatches(localWeek, utcDate) {
  return isCalendarDate(utcDate) && getWeekString(new Date(`${utcDate}T12:00:00`)) === localWeek;
}

export async function requestTrialPlan(args) {
  if (!trialEnabled()) throw new Error('AI_TRIAL_DISABLED');
  if (!auth.currentUser || auth.currentUser.isAnonymous || !auth.currentUser.providerData.some(provider => provider.providerId === 'google.com')) throw new Error('AI_TRIAL_SIGN_IN_REQUIRED');
  const now = new Date();
  const requestedWeek = args.currentWeek || getWeekString(now);
  if (requestedWeek !== getWeekString(now) || !trialWeekMatches(requestedWeek, now.toISOString().slice(0, 10))) throw new Error('AI_TRIAL_WEEK_MISMATCH');
  if (!callable) {
    const emulating = env.DEV && env.VITE_USE_FIREBASE_EMULATORS === 'true';
    if (!emulating && !env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) throw new Error('AI_TRIAL_DISABLED');
    if (!appCheck && !emulating) appCheck = initializeAppCheck(getApp(), {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY), isTokenAutoRefreshEnabled: true,
    });
    const functions = getFunctions(getApp(), env.VITE_AI_TRIAL_REGION || 'asia-east1');
    if (emulating) connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    callable = httpsCallable(functions, 'requestAiTrialPlan', { timeout: 65000 });
  }
  // Clinical constraints must never be silently truncated by context normalization.
  if (['healthNotes', 'recoveryNotes'].some(key => args.context?.[key] !== undefined
    && (typeof args.context[key] !== 'string' || args.context[key].length > 2000))) throw new Error('AI_TRIAL_INVALID_INPUT');
  // Keep the wire contract narrow, even when callers provide existing BYOK history.
  const input = { context: normalizePlanningContext(args.context), dailyTime: Number(args.dailyTime),
    lang: args.lang || 'zh', userGoal: args.userGoal || '', userMessage: args.userMessage || '' };
  if (!Object.hasOwn(args.context || {}, 'healthStatus') && input.context.healthStatus !== 'restricted') input.context.healthStatus = 'unknown';
  try {
    const { data } = await callable(input);
    if (!data || data.currentWeek !== requestedWeek || data.currentWeek !== getWeekString(new Date())
      || !trialWeekMatches(data.currentWeek, data.currentDate)) throw new Error('AI_TRIAL_WEEK_MISMATCH');
    return validateGeneratedPlan(data.plan, eligibleExercises(catalogExercises(input.lang), input.context), input.dailyTime);
  } catch (error) {
    const allowed = /^AI_TRIAL_(DISABLED|SIGN_IN_REQUIRED|APP_CHECK_REQUIRED|WEEK_EXHAUSTED|BUSY|DAILY_LIMIT|FAILED|INVALID_INPUT|WEEK_MISMATCH)$/;
    throw new Error(allowed.test(error.message) ? error.message : 'AI_TRIAL_FAILED');
  }
}
