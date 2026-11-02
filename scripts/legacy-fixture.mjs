import legacyPlans from '../tests/fixtures/legacyWeeklyPlans.json' with { type: 'json' };
import { normalizePlanningContext } from '../src/domain/planning.js';
import { getWeekString } from '../src/domain/dates.js';

// Frozen from the generator at 748c1ef, before independent warmup rows existed.
// Calling today's generator here would fabricate an impossible >8-row legacy
// record and stop testing the actual historical sequence/adoption contract.
export function legacyFixture(now = new Date(), overrides = {}) {
  const week = getWeekString(now);
  const context = normalizePlanningContext({ healthStatus: 'unrestricted', targetRegions: ['upper', 'core'], stiffnessRegions: ['shoulder'], ...overrides.context });
  const focus = overrides.focus || 'coordination';
  const plan = structuredClone(legacyPlans[focus] || legacyPlans.coordination);
  return { week, plan: { ...plan, language: 'zh', source: 'template' }, profile: { week, focus, time: '30', goal: '', context }, completed: {}, logs: [], readiness: [] };
}
