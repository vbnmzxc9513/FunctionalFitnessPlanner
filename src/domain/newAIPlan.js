import { validateGeneratedPlan } from './planning.js';
import { generateTemplatePlan } from './templatePlanner.js';
import { DAILY_WARMUP_IDS, dailyWarmupPrescriptions, isDailyWarmupComplete } from './quickWorkouts.js';

/** New AI responses share the fixed planner's contextual opening policy.
 * Saved plans, manual edits and legacy readers continue using the generic
 * validator. The reference is pure rule evaluation, never a fallback result or
 * a source of fabricated completion records. */
export function validateNewAIPlan(raw, exercises, dailyTime, options = {}) {
  const plan = validateGeneratedPlan(raw, exercises, dailyTime, { calendarDays: options.calendarDays });
  if (plan.schedule.some(day => day.routine.some(id => ['bf_A12', 'bf_A13'].includes(id)))) throw new Error('AI_LEGACY_WARMUP');
  if (plan.schedule.some(day => day.prescriptions.some(dose => dose.id === 'bf_A01' && ['warmup', 'recovery'].includes(dose.phase)))) throw new Error('AI_AEROBIC_WARMUP');
  const reference = generateTemplatePlan(exercises, options.context, dailyTime, options.lang, {
    ...options, calendarDays: options.calendarDays || plan.schedule.map(day => day.day),
  });
  for (const day of plan.schedule) {
    if (day.sessionType === 'rest') continue;
    const expected = reference.schedule.find(item => item.day === day.day);
    if (isDailyWarmupComplete(expected)) {
      if (!isDailyWarmupComplete(day)) throw new Error('AI_DAILY_WARMUP_MISSING');
      const canonical = dailyWarmupPrescriptions(day.sessionType === 'recovery' ? 'recovery' : 'warmup');
      if (!DAILY_WARMUP_IDS.every((id, index) => day.routine[index] === id && Object.entries(canonical[index])
        .every(([field, value]) => day.prescriptions.find(dose => dose.id === id)?.[field] === value))) throw new Error('AI_DAILY_WARMUP_DOSE');
    } else if (isDailyWarmupComplete(day)) {
      // Short/restricted recovery and unfamiliar taper are explicit exceptions;
      // they cannot be presented as permission for the complete opening.
      throw new Error('AI_DAILY_WARMUP_CONTEXT');
    }
  }
  return plan;
}
