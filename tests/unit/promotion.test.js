import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePromotionCounts, normalizePromotionDraft } from '../../src/domain/promotion.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { generateTemplatePlan } from '../../src/domain/templatePlanner.js';

test('local promotion counts deduplicate milestones and retain no profile identifiers', () => {
  let counts = updatePromotionCounts({ uid: 'secret', health: 'private', key: 'private' }, 'first_plan', '2026-W42');
  counts = updatePromotionCounts(counts, 'first_plan', '2026-W42');
  counts = updatePromotionCounts(counts, 'first_completion', '2026-W42');
  counts = updatePromotionCounts(counts, 'next_week_visit', '2026-W42');
  assert.deepEqual(counts.counts, { first_plan: 1, first_completion: 1, next_week_visit: 0 });
  assert.deepEqual(Object.keys(counts), ['counts', 'firstWeek', 'lastVisitWeek']);
  counts = updatePromotionCounts(counts, 'next_week_visit', '2026-W43');
  counts = updatePromotionCounts(counts, 'next_week_visit', '2026-W43');
  assert.equal(counts.counts.next_week_visit, 1);
});

test('preview restoration verifies current week, profile, plan, completions and account binding', () => {
  const profile = { context: { badmintonDays: [2, 4, 5], healthStatus: 'unrestricted' }, time: '30', focus: 'stability', goal: 'Improve control' };
  const plan = { ...generateTemplatePlan(catalogExercises('zh'), profile.context, profile.time, 'zh', { currentDate: '2026-10-14', currentWeek: '2026-W42' }), source: 'template', language: 'zh' };
  const day = plan.schedule.find(value => value.routine.length);
  const key = `day${day.day}_${day.routine[0]}`;
  const draft = { week: '2026-W42', plan, profile, completed: { [key]: true, day1_fake: true }, targetUid: 'uid-a' };
  assert.deepEqual(normalizePromotionDraft(draft, draft.week).completed, { [key]: true });
  assert.equal(normalizePromotionDraft(draft, '2026-W43'), null);
  assert.equal(normalizePromotionDraft({ ...draft, targetUid: '' }, draft.week, true), null);
  assert.equal(normalizePromotionDraft(draft, draft.week, true).targetUid, 'uid-a');
  assert.equal(normalizePromotionDraft({ ...draft, plan: { ...plan, schedule: [] } }, draft.week), null);
  assert.equal(normalizePromotionDraft({ ...draft, plan: { ...plan, source: 'ai' } }, draft.week), null);
});
