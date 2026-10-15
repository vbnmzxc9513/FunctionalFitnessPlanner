import { isCalendarDate } from './dates.js';

export const WEEKLY_FOCUSES = ['balanced', 'strength', 'stability', 'coordination'];
export const TARGET_REGIONS = ['legs', 'posterior', 'upper', 'core'];
export const STIFFNESS_REGIONS = ['hip', 'ankle', 'thoracic', 'shoulder'];
export const selectedRegions = (value, allowed) => allowed.filter(item => Array.isArray(value) && value.includes(item)).slice(0, 2);
export const TARGET_PATTERNS = { legs: ['squat_lunge'], posterior: ['hinge'], upper: ['push', 'pull'], core: ['core'] };

// Only bounded planning intent, never health notes, factual logs or AI-generated claims.
export function createWeeklyIntent(context = {}, focus = 'balanced', dailyTime = 30) {
  return {
    focus: WEEKLY_FOCUSES.includes(focus) ? focus : 'balanced',
    targetRegions: selectedRegions(context.targetRegions, TARGET_REGIONS),
    stiffnessRegions: selectedRegions(context.stiffnessRegions, STIFFNESS_REGIONS),
    badmintonDays: [...new Set((Array.isArray(context.badmintonDays) ? context.badmintonDays : []).filter(day => Number.isInteger(day) && day >= 1 && day <= 7))].sort(),
    dailyTime: Number(dailyTime), competitionDate: isCalendarDate(context.competitionDate) ? context.competitionDate : '',
  };
}

export function normalizeWeeklyIntent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !['focus', 'targetRegions', 'stiffnessRegions', 'badmintonDays', 'dailyTime', 'competitionDate'].includes(key))
    || !WEEKLY_FOCUSES.includes(value.focus) || !Number.isFinite(value.dailyTime) || value.dailyTime < 5 || value.dailyTime > 240
    || !Array.isArray(value.badmintonDays) || value.badmintonDays.length > 7 || value.badmintonDays.some(day => !Number.isInteger(day) || day < 1 || day > 7)
    || (value.competitionDate !== '' && !isCalendarDate(value.competitionDate))) return null;
  for (const [key, allowed] of [['targetRegions', TARGET_REGIONS], ['stiffnessRegions', STIFFNESS_REGIONS]]) {
    if (!Array.isArray(value[key]) || value[key].length > 2 || value[key].some(item => !allowed.includes(item)) || new Set(value[key]).size !== value[key].length) return null;
  }
  return createWeeklyIntent(value, value.focus, value.dailyTime);
}
