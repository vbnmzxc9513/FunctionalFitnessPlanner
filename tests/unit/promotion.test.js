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

test('preview private records are whitelisted, deduplicated and survive replacement of their original targets', () => {
  const week = '2020-W42';
  const profile = { context: { badmintonDays: [], healthStatus: 'unrestricted' }, time: '30', focus: 'strength', goal: '' };
  const plan = { ...generateTemplatePlan(catalogExercises('zh'), profile.context, profile.time, 'zh', { currentDate: '2020-10-14', currentWeek: week }), source: 'template', language: 'zh' };
  const log = { week, day: 3, exerciseId: 'bf_B01', date: '2020-10-14', variant: 'bodyweight', loadKg: null, loadBasis: 'none', resistanceLabel: '', unit: 'reps', perSide: false,
    sets: [{ value: 6, otherSide: null }], rir: 3, quality: 'good', symptoms: 'none', nextDay: 'good', planned: { sets: 1, value: '6', unit: 'reps', perSide: false, phase: 'strength', restSeconds: 60 }, schemaVersion: 1 };
  const readiness = { date: '2020-10-14', sleepHours: 7, fatigue: 0, soreness: 0, symptoms: 'none', yesterdayCourtMinutes: 0, yesterdayCourtRpe: null, todayCourtIntensity: 'none', schemaVersion: 1 };
  const restored = normalizePromotionDraft({ week, plan, profile, logs: [log, log, { ...log, apiKey: 'secret' }, { ...log, week: '2020-W41' }],
    readiness: [readiness, readiness, { ...readiness, privateNote: 'secret' }], targetUid: 'account-a', uid: 'untrusted-account' }, week, true);
  assert.equal(restored.logs.length, 1);
  assert.deepEqual(restored.logs[0], log);
  assert.deepEqual(restored.readiness, [readiness]);
  assert.equal(restored.targetUid, 'account-a');
  assert.equal(Object.hasOwn(restored, 'uid'), false);
  assert.equal(Object.hasOwn(restored.plan, 'logs'), false);
  assert.equal(Object.hasOwn(restored.plan, 'readiness'), false);
  assert.equal(Object.hasOwn(normalizePromotionDraft({ ...restored, targetUid: 'account-a' }, week), 'targetUid'), false);
});

test('adjusted preview restores and binds a completed strength slot after unfinished warm-up removal', async () => {
  const { adaptDayForReadiness } = await import('../../src/domain/coaching.js');
  const week = '2020-W42'; const exercises = catalogExercises('zh');
  const profile = { context: { healthStatus: 'unrestricted' }, time: '30', focus: 'strength', goal: '' };
  const baselinePlan = { ...generateTemplatePlan(exercises, profile.context, profile.time, 'zh', { currentDate: '2020-10-14', currentWeek: week }), source: 'template', language: 'zh' };
  const original = baselinePlan.schedule.find(day => day.prescriptions.some(dose => dose.phase === 'strength'));
  const strength = original.prescriptions.find(dose => dose.phase === 'strength');
  const completed = { [`day${original.day}_${strength.id}`]: true };
  const adapted = adaptDayForReadiness(original, { action: 'rest', reasonCodes: ['worsening_symptoms'] }, completed, exercises, 'zh');
  assert.equal(adapted.prescriptions.some(dose => dose.phase === 'warmup'), false);
  assert.deepEqual(adapted.prescriptions, [strength]);
  const plan = { ...baselinePlan, schedule: baselinePlan.schedule.map(day => day.day === original.day ? adapted : day) };
  const draft = { week, plan, baselinePlan, profile, completed, adjustment: { days: [original.day], completed }, logs: [], readiness: [] };
  const restored = normalizePromotionDraft(JSON.parse(JSON.stringify(draft)), week);
  assert.ok(restored);
  assert.deepEqual(restored.plan.schedule.find(day => day.day === original.day), adapted);
  assert.deepEqual(restored.completed, completed);
  assert.ok(normalizePromotionDraft({ ...restored, targetUid: 'adopting-account' }, week, true));

  const reduced = adaptDayForReadiness(original, { action: 'reduce', reasonCodes: ['elevated_load'] }, {}, exercises, 'zh');
  const laterRest = adaptDayForReadiness(reduced, { action: 'rest', reasonCodes: ['worsening_symptoms'] }, completed, exercises, 'zh');
  const laterDraft = { ...draft, plan: { ...plan, schedule: plan.schedule.map(day => day.day === original.day ? laterRest : day) }, adjustment: { days: [original.day], completed: {} } };
  assert.ok(normalizePromotionDraft(laterDraft, week));
  // Cancelling a retained main slot would make it unfinished without a warm-up.
  // The App validates this candidate before touching either live state or storage.
  const unchangedOriginal = JSON.stringify(draft);
  const cancelledOriginal = { ...draft, completed: { [`day${original.day}_${strength.id}`]: false } };
  assert.equal(normalizePromotionDraft(cancelledOriginal, week), null);
  assert.equal(JSON.stringify(draft), unchangedOriginal);
  assert.ok(normalizePromotionDraft(draft, week));
  const unchangedReduced = JSON.stringify(laterDraft);
  const cancelledReduced = { ...laterDraft, completed: { [`day${original.day}_${strength.id}`]: false } };
  assert.equal(normalizePromotionDraft(cancelledReduced, week), null);
  assert.equal(JSON.stringify(laterDraft), unchangedReduced);
  assert.ok(normalizePromotionDraft(laterDraft, week));


  const addedId = structuredClone(draft);
  addedId.plan.schedule.find(day => day.day === original.day).routine.push('bf_ZZZ');
  assert.equal(normalizePromotionDraft(addedId, week), null);
  const inflated = structuredClone(draft);
  inflated.plan.schedule.find(day => day.day === original.day).prescriptions[0].sets += 1;
  assert.equal(normalizePromotionDraft(inflated, week), null);
  const changedDone = structuredClone(draft);
  changedDone.plan.schedule.find(day => day.day === original.day).prescriptions[0].restSeconds += 1;
  assert.equal(normalizePromotionDraft(changedDone, week), null);
  const changedBaseline = structuredClone(draft);
  changedBaseline.baselinePlan.schedule[0].routine = [];
  assert.equal(normalizePromotionDraft(changedBaseline, week), null);
  const unprovenDay = structuredClone(draft);
  unprovenDay.adjustment.days = [];
  assert.equal(normalizePromotionDraft(unprovenDay, week), null);
});

test('recovery preview proof keeps existing low-load walking and video prediction without adding IDs', async () => {
  const { adaptDayForReadiness } = await import('../../src/domain/coaching.js');
  const week = '2020-W42'; const exercises = catalogExercises('zh');
  const profile = { context: { healthStatus: 'unrestricted', equipment: ['screen'] }, time: '60', focus: 'strength', goal: '' };
  const baselinePlan = { ...generateTemplatePlan(exercises, profile.context, profile.time, 'zh', { currentDate: '2020-10-14', currentWeek: week }), source: 'template', language: 'zh' };
  const original = baselinePlan.schedule.find(day => day.sessionType === 'training');
  const warmup = original.prescriptions.find(dose => dose.phase === 'warmup');
  const strength = original.prescriptions.find(dose => dose.phase === 'strength');
  original.prescriptions = [warmup, { id: 'bf_G07', ...exercises.bf_G07.prescription, phase: 'skill' }, strength,
    { id: 'bf_I01', ...exercises.bf_I01.prescription, phase: 'recovery' }, { id: 'bf_D09', ...exercises.bf_D09.prescription, phase: 'cooldown' }];
  original.routine = original.prescriptions.map(dose => dose.id);
  const adapted = adaptDayForReadiness(original, { action: 'recover', reasonCodes: ['high_recovery_need'] }, {}, exercises, 'zh');
  assert.ok(adapted.routine.includes('bf_G07'));
  assert.ok(adapted.routine.includes('bf_I01'));
  assert.equal(adapted.prescriptions.find(dose => dose.id === 'bf_G07').phase, 'recovery');
  const draft = { week, baselinePlan, plan: { ...baselinePlan, schedule: baselinePlan.schedule.map(day => day.day === original.day ? adapted : day) },
    profile, completed: {}, adjustment: { days: [original.day], completed: {} } };
  assert.ok(normalizePromotionDraft(JSON.parse(JSON.stringify(draft)), week));
});
