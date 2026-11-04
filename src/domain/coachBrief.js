import { normalizePlanningContext, competitionDaysAway } from './planning.js';
import { planningRestriction } from './templatePlanner.js';
import { recoveryDecision } from './recovery.js';
import { enumeratePeriodDates } from './periodPlanning.js';
import { estimateSessionMinutes } from './sessions.js';
import { matchesTrainingTarget } from './trainingTargets.js';
import { scheduledMobility } from './mobility.js';

/** Explain existing rules, without predicting ungenerated sessions or clearing limits. */
export function planningGuidance(context, time, range) {
  const profile = normalizePlanningContext(context);
  let dates = [];
  try { dates = enumeratePeriodDates(range); } catch { /* Legacy weekly intake has no range. */ }
  const eligibleDays = dates.length ? [...new Set(dates.map(date => new Date(`${date}T12:00:00Z`).getUTCDay() || 7))]
    .filter(day => profile.trainingDays.includes(day)) : profile.trainingDays;
  const issues = [];
  const restriction = planningRestriction(profile);
  if (restriction !== 'normal') issues.push('restriction');
  if (!eligibleDays.length) issues.push('noDays');
  else if (eligibleDays.every(day => profile.badmintonDays.includes(day))) issues.push('courtOnly');
  if (Number(time) < 15) issues.push('short');
  const recovery = recoveryDecision(profile);
  if (recovery.action !== 'normal') issues.push(recovery.action);
  if (dates.some(date => { const away = competitionDaysAway(profile.competitionDate, date); return away !== null && away <= 10 && away >= -5; })) issues.push('competition');
  return { issues, recovery: recovery.action, restriction };
}

/** Counts and coverage come from actual prescriptions, never the requested intent. */
export function coachPlanFacts(preview, exercises) {
  const sessions = preview.sessions || [];
  const count = { strength: 0, control: 0, recovery: 0, rest: 0 };
  for (const day of sessions) {
    if (!day.routine?.length || day.sessionType === 'rest') count.rest++;
    else if (day.sessionType === 'recovery') count.recovery++;
    else if (day.prescriptions?.some(dose => dose.phase === 'strength')) count.strength++;
    else if (day.prescriptions?.some(dose => ['skill', 'accessory'].includes(dose.phase))) count.control++;
    else count.unspecified = (count.unspecified || 0) + 1;
  }
  const active = sessions.filter(day => day.routine?.length);
  const minutes = active.map(day => estimateSessionMinutes(day, exercises));
  const context = normalizePlanningContext(preview.profile?.context);
  const targeted = context.targetRegions.filter(region => sessions.some(day => day.prescriptions?.some(dose =>
    ['strength', 'accessory'].includes(dose.phase) && matchesTrainingTarget(region, dose.id, exercises[dose.id]))));
  const selected = context.weeklyExerciseIds;
  const mobility = scheduledMobility(sessions, exercises);
  return { count, minMinutes: minutes.length ? Math.min(...minutes) : 0, maxMinutes: minutes.length ? Math.max(...minutes) : 0,
    mobilityCount: mobility.filter(row => row.dates.length).length,
    missingMobility: mobility.filter(row => !row.dates.length).map(row => row.area),
    targeted, missingTargets: context.targetRegions.filter(region => !targeted.includes(region)),
    selectedCount: selected.length, scheduledChoices: selected.filter(id => sessions.some(day => day.routine?.includes(id))).length };
}
