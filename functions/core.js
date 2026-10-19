import { createHash } from 'node:crypto';

export class TrialError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new TrialError(code); };
const text = (value, maximum) => {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > maximum) fail('AI_TRIAL_INVALID_INPUT');
  return value.trim();
};

// Accept bounded facts, never a client model, prompt, exercise catalogue or fabricated history.
export function normalizeTrialInput(raw, normalizeContext, allowedEquipment) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || JSON.stringify(raw).length > 12000) fail('AI_TRIAL_INVALID_INPUT');
  if (['prompt', 'model', 'availableExercises', 'candidates', 'apiKey'].some(key => Object.hasOwn(raw, key))) fail('AI_TRIAL_INVALID_INPUT');
  const dailyTime = Number(raw.dailyTime);
  if (!Number.isInteger(dailyTime) || dailyTime < 10 || dailyTime > 60 || !['zh', 'en'].includes(raw.lang || 'zh')) fail('AI_TRIAL_INVALID_INPUT');
  const context = raw.context || {};
  if (typeof context !== 'object' || Array.isArray(context)) fail('AI_TRIAL_INVALID_INPUT');
  if (context.equipment !== undefined && (!Array.isArray(context.equipment) || context.equipment.length > allowedEquipment.length || context.equipment.some(item => !allowedEquipment.includes(item)))) fail('AI_TRIAL_INVALID_INPUT');
  if (context.badmintonDays !== undefined && (!Array.isArray(context.badmintonDays) || context.badmintonDays.length > 7 || context.badmintonDays.some(day => !Number.isInteger(day) || day < 1 || day > 7))) fail('AI_TRIAL_INVALID_INPUT');
  const normalized = normalizeContext({ ...context, healthNotes: text(context.healthNotes, 2000), recoveryNotes: text(context.recoveryNotes, 2000) });
  for (const key of ['targetRegions', 'stiffnessRegions', 'sorenessRegions', 'weeklyExerciseIds']) {
    const value = context[key];
    if (value !== undefined && (!Array.isArray(value) || value.length > (key === 'weeklyExerciseIds' ? 8 : key === 'targetRegions' ? 4 : 2) || new Set(value).size !== value.length
      || value.some(item => !normalized[key].includes(item)))) fail('AI_TRIAL_INVALID_INPUT');
  }
  // Missing health status is uncertainty, not a declaration of unrestricted loading.
  if (!Object.hasOwn(context, 'healthStatus') && normalized.healthStatus !== 'restricted') normalized.healthStatus = 'unknown';
  return { dailyTime, lang: raw.lang || 'zh', userGoal: text(raw.userGoal, 300), userMessage: text(raw.userMessage, 500), context: normalized };
}

export function utcPeriod(now) {
  const currentDate = now.toISOString().slice(0, 10);
  const thursday = new Date(`${currentDate}T00:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday - new Date(Date.UTC(year, 0, 1))) / 86400000 + 1) / 7);
  return { currentDate, currentWeek: `${year}-W${String(week).padStart(2, '0')}` };
}

export function createTrialService({ config, quota, generate, domain, clock = () => new Date() }) {
  return async ({ uid, provider, appVerified, data }) => {
    if (!uid || provider !== 'google.com') fail('AI_TRIAL_SIGN_IN_REQUIRED');
    if (!appVerified) fail('AI_TRIAL_APP_CHECK_REQUIRED');
    const settings = await config();
    if (settings.enabled !== true || !Number.isInteger(settings.dailyCap) || settings.dailyCap < 1 || settings.dailyCap > 100) fail('AI_TRIAL_DISABLED');
    const input = normalizeTrialInput(data, domain.normalizeContext, domain.equipment);
    const period = utcPeriod(clock());
    const candidates = domain.eligible(domain.catalog(input.lang), input.context);
    const prompt = domain.prompt({ ...input, ...period, currentLevel: 1, availableExercises: candidates });
    // Conservative UTF-8 bound also bounds possible token input; no history/custom catalogue.
    if (Buffer.byteLength(prompt, 'utf8') > 60000) fail('AI_TRIAL_INVALID_INPUT');
    const hash = createHash('sha256').update(JSON.stringify({ ...input, currentWeek: period.currentWeek })).digest('hex');
    const reservation = await quota.reserve({ uid, hash, ...period, dailyCap: settings.dailyCap });
    if (reservation.plan) return { plan: domain.validate(reservation.plan, candidates, input.dailyTime), ...period };
    try {
      const raw = await generate(prompt);
      if (!raw || JSON.stringify(raw).length > 60000) throw new Error('INVALID_RESULT');
      const plan = domain.validate(raw, candidates, input.dailyTime);
      if (plan.schedule.some(day => day.prescriptions.some(dose => dose.preparation?.instruction.length > 1000))) throw new Error('INVALID_RESULT');
      await quota.complete({ uid, hash, currentWeek: period.currentWeek, plan });
      return { plan, ...period };
    } catch {
      // No refund: a timeout or invalid response may already have incurred API costs.
      // State stays reserved if Firestore itself is unavailable; repeated calls cannot bill again.
      try { await quota.fail({ uid, hash, currentWeek: period.currentWeek }); } catch { /* preserve reservation */ }
      fail('AI_TRIAL_FAILED');
    }
  };
}
