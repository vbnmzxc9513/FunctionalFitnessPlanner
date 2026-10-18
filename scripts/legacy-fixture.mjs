import { EXERCISES_I18N } from '../src/locale.js';
import { generateTemplatePlan } from '../src/domain/templatePlanner.js';
import { normalizePlanningContext } from '../src/domain/planning.js';
import { getWeekString } from '../src/domain/dates.js';

// Legacy records predate date-first planning. Seed a validated historical shape
// so legacy execution, private records and atomic adoption remain regression tested.
export function legacyFixture(now = new Date(), overrides = {}) {
  const week = getWeekString(now);
  const context = normalizePlanningContext({ healthStatus: 'unrestricted', targetRegions: ['upper', 'core'], stiffnessRegions: ['shoulder'], ...overrides.context });
  const focus = overrides.focus || 'coordination';
  const plan = generateTemplatePlan(EXERCISES_I18N.zh, context, '30', 'zh', { focus, currentWeek: week });
  return { week, plan: { ...plan, language: 'zh', source: 'template' }, profile: { week, focus, time: '30', goal: '', context }, completed: {}, logs: [], readiness: [] };
}
