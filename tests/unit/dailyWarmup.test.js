import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises, validSequenceDose, exerciseEligibilityIssues, eligibleExercises } from '../../src/domain/exerciseCatalog.js';
import { generateTemplatePlan, manualPlanningExercises } from '../../src/domain/templatePlanner.js';
import { estimateSessionMinutes, doseSeconds } from '../../src/domain/sessions.js';
import { getExerciseGuide } from '../../src/data/exerciseGuides.js';
import { buildPlanningPrompt } from '../../src/domain/coachingPrompt.js';
import { getQuickWorkouts, getQuickWorkout, DAILY_WARMUP_IDS, dailyWarmupPrescriptions, isDailyWarmupComplete, expandLegacyWarmup } from '../../src/domain/quickWorkouts.js';
import { mobilityAreas } from '../../src/domain/mobility.js';

const exercises = catalogExercises();
const context = { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable'], badmintonDays: [2, 5, 6], badmintonMinutes: 60, badmintonIntensity: 'mixed' };
const options = { currentDate: '2026-10-19', currentWeek: '2026-W43' };
const generate = (profile = context, minutes = 35, catalog = exercises, extra = {}) => generateTemplatePlan(catalog, profile, minutes, 'zh', { ...options, ...extra });

test('four versioned recipes use curated distinct movements, isolated copies and actual calculated doses', () => {
  const recipes = getQuickWorkouts();
  assert.equal(recipes.length, 4);
  assert.deepEqual(recipes.map(recipe => recipe.routine.length), [3, 3, 3, 8]);
  for (const recipe of recipes) {
    assert.equal(recipe.version, 1);
    assert.equal(recipe.scope, 'segment');
    assert.equal(new Set(recipe.routine).size, recipe.routine.length);
    assert.equal(recipe.estimatedMinutes, estimateSessionMinutes(recipe, exercises));
    assert.ok(recipe.estimatedMinutes >= 3 && recipe.estimatedMinutes <= 8);
    for (const lang of ['zh', 'en']) for (const id of recipe.routine) {
      assert.ok(exercises[id]?.active);
      assert.ok(getExerciseGuide(id, exercises[id], lang).guide, `${id} bilingual guide`);
    }
  }
  const modified = getQuickWorkout('daily-warmup'); modified.prescriptions[0].value = '999'; modified.tags.push('other');
  assert.equal(getQuickWorkout('daily-warmup').prescriptions[0].value, '4');
  assert.ok(!getQuickWorkout('daily-warmup').tags.includes('other'));
  assert.equal(getQuickWorkout('missing'), null);
  assert.deepEqual(getQuickWorkout('hip-internal-rotation').routine, ['bf_A15', 'bf_B16', 'bf_B17']);
  assert.deepEqual(getQuickWorkout('foot-arch-control').routine, ['bf_B13', 'bf_B14', 'bf_B15']);
  assert.deepEqual(getQuickWorkout('scapular-upward-rotation').routine, ['bf_A07', 'bf_C12', 'bf_C13']);
});

test('daily warmup has eight real identities, honest sides/cycles and no invented complete-region credit', () => {
  assert.deepEqual(DAILY_WARMUP_IDS, ['bf_A16', 'bf_A17', 'bf_A10', 'bf_A18', 'bf_A07', 'bf_A06', 'bf_A15', 'bf_A19']);
  const doses = dailyWarmupPrescriptions();
  assert.equal(new Set(doses.map(dose => dose.id)).size, 8);
  assert.equal(doses.filter(dose => dose.perSide).length, 3);
  assert.ok(doses.every(dose => dose.sets === 1 && dose.unit === 'reps' && !dose.preparation));
  const seconds = doses.reduce((sum, dose) => sum + doseSeconds(dose, exercises[dose.id]), 0);
  assert.ok(seconds > 300 && seconds < 420, `actual warmup ${seconds} seconds including changes`);
  assert.equal(getQuickWorkout('daily-warmup').estimatedMinutes, 7);
  assert.deepEqual(mobilityAreas('bf_A18'), []);
  assert.deepEqual(mobilityAreas('bf_A07'), []);
  assert.deepEqual(mobilityAreas('bf_A19'), ['hamstrings', 'ankle']);
  assert.match(getExerciseGuide('bf_A17').guide.steps.join(' '), /不另加側弓步/);
  assert.match(getExerciseGuide('bf_A19').guide.easier, /肩腕支撐或上舉受限/);
  assert.match(getExerciseGuide('bf_B16').guide.mistake, /腳向內移/);
});

test('normal training and court recovery retain independent warmups with real main work and preparation within time', () => {
  for (const minutes of [15, 20, 30, 35, 40]) {
    const plan = generate(context, minutes);
    const training = plan.schedule.filter(day => day.sessionType === 'training');
    assert.ok(training.length);
    for (const day of training) {
      assert.ok(isDailyWarmupComplete(day));
      assert.deepEqual(day.routine.slice(0, 8), DAILY_WARMUP_IDS);
      assert.ok(day.prescriptions.some(dose => ['strength', 'skill'].includes(dose.phase)));
      const main = day.prescriptions.find(dose => dose.phase === 'strength');
      if (main) assert.ok(main.preparation);
      assert.ok(estimateSessionMinutes(day, exercises) <= minutes);
      assert.ok(day.routine.length <= 24);
      assert.ok(!day.routine.some(id => ['bf_A01', 'bf_I01', 'bf_A12', 'bf_A13'].includes(id)));
    }
    for (const day of plan.schedule.filter(day => day.sessionType === 'recovery')) assert.ok(isDailyWarmupComplete(day));
  }
});

test('clinical restrictions, unavailable movements, fatigue, short sessions and taper retain explicit exceptions', () => {
  for (const change of [{ healthStatus: 'unknown' }, { healthNotes: '肩部震波' }, { healthNotes: '膝痛' }]) {
    assert.ok(generate({ ...context, ...change }).schedule.every(day => !day.routine.length));
  }
  const restricted = manualPlanningExercises(exercises, { ...context, healthNotes: 'shoulder therapy' });
  for (const id of ['bf_A16', 'bf_A17', 'bf_A18', 'bf_A19', 'bf_C12', 'bf_C13']) assert.equal(restricted[id], undefined);
  const disabled = { ...exercises, bf_A19: { ...exercises.bf_A19, active: false } };
  const selected = generate(context, 35, disabled);
  assert.ok(selected.schedule.every(day => !day.routine.includes('bf_A19') && !isDailyWarmupComplete(day)));
  assert.ok(selected.schedule.filter(day => day.routine.length).every(day => day.warmupNote.includes('精簡') && day.warmupNote.includes(exercises.bf_A19.name)));
  for (const minutes of [5, 10]) {
    const short = generate(context, minutes);
    assert.ok(short.schedule.every(day => !isDailyWarmupComplete(day) && estimateSessionMinutes(day, exercises) <= minutes));
  }
  const tired = generate({ ...context, recoveryNotes: '睡不好、累' });
  assert.ok(tired.schedule.filter(day => day.routine.length).every(isDailyWarmupComplete));
  const taper = { ...context, competitionDate: '2026-10-26' };
  assert.ok(generate(taper).schedule.every(day => !isDailyWarmupComplete(day)));
  assert.ok(generate({ ...taper, warmupFamiliar: true }).schedule.some(isDailyWarmupComplete));
});

test('legacy sequences and eight-step guides remain intact; explicit conversion previews never mutate historical data', () => {
  for (const [id, minutes] of [['bf_A12', 6], ['bf_A13', 10]]) {
    assert.ok(validSequenceDose(id, exercises[id].prescription));
    assert.ok(!validSequenceDose(id, { ...exercises[id].prescription, value: '2' }));
    for (const lang of ['zh', 'en']) assert.equal(getExerciseGuide(id, exercises[id], lang).guide.steps.length, 8);
    assert.equal(exercises[id].sequenceMinutes, minutes);
    assert.equal(manualPlanningExercises(exercises, context)[id], undefined);
    const legacy = { day: 1, routine: [id, 'bf_B01'], prescriptions: [{ id, ...exercises[id].prescription, phase: 'warmup' }, { id: 'bf_B01', ...exercises.bf_B01.prescription, phase: 'strength' }], sessionType: 'training' };
    const snapshot = structuredClone(legacy);
    const converted = expandLegacyWarmup(legacy);
    assert.deepEqual(legacy, snapshot);
    assert.ok(isDailyWarmupComplete(converted));
    assert.equal(converted.routine.length, 9);
    assert.deepEqual(converted.prescriptions.at(-1), legacy.prescriptions.at(-1));
    assert.ok(!converted.prescriptions.some(dose => dose.unit === 'minutes'));
  }
});

test('AI instruction uses shared actual recipe and protects clinical limits and honest completion', () => {
  const prompt = buildPlanningPrompt({ availableExercises: exercises, context, dailyTime: 35 });
  for (const id of DAILY_WARMUP_IDS) assert.ok(prompt.includes(id));
  for (const text of ['八筆獨立', '24 個獨立', '不強塞', '徒手 Y/T', '90/90 髖轉換不同於 D09', '僅保留讀取歷史']) assert.ok(prompt.includes(text));
  assert.ok(prompt.includes(JSON.stringify(dailyWarmupPrescriptions())));
});

test('every catalog movement uses a type accepted by completion and saved-workout storage', () => {
  const allowedTypes = new Set(['mobility', 'lower', 'core', 'upper_pull', 'upper_push', 'full', 'power']);
  for (const exercise of Object.values(exercises)) assert.ok(allowedTypes.has(exercise.type), `${exercise.id}: ${exercise.type}`);
  assert.equal(exercises.bf_C12.type, 'upper_push');
  assert.equal(exercises.bf_C13.type, 'upper_push');
});


test('recipe conflict reasons identify the actual eligibility prerequisite and equipment alternatives', () => {
  const profile = { healthStatus: 'unrestricted', experience: 'beginner', equipment: [], partnerAvailable: false };
  assert.deepEqual(exerciseEligibilityIssues(undefined, profile), [{ code: 'missing' }]);
  assert.deepEqual(exerciseEligibilityIssues({ ...exercises.bf_C12, active: false }, profile), [{ code: 'disabled' }]);
  const cableOrBand = { ...exercises.bf_C01, equipmentOptions: [['cable'], ['band']] };
  assert.deepEqual(exerciseEligibilityIssues(cableOrBand, profile), [{ code: 'equipment', missingOptions: [['cable'], ['band']] }]);
  assert.deepEqual(exerciseEligibilityIssues(cableOrBand, { ...profile, equipment: ['band'] }), []);
  assert.ok(exerciseEligibilityIssues(exercises.bf_C12, { ...profile, healthStatus: 'restricted' }).some(issue => issue.code === 'health'));
  assert.ok(exerciseEligibilityIssues({ name: 'Custom' }, { ...profile, healthStatus: 'unknown' }).some(issue => issue.code === 'unknown_treatment'));
  assert.ok(exerciseEligibilityIssues({ ...exercises.bf_C12, requiresPartner: true }, profile).some(issue => issue.code === 'partner'));
  for (const healthStatus of ['unrestricted', 'unknown', 'restricted']) for (const equipment of [[], ['band'], ['dumbbell', 'cable']]) {
    const conditions = { ...profile, healthStatus, equipment };
    const eligible = eligibleExercises(exercises, conditions);
    for (const [id, exercise] of Object.entries(exercises)) assert.equal(!!eligible[id], exerciseEligibilityIssues(exercise, conditions).length === 0, id);
  }
});


test('AI prompt keeps real prior-plan facts within the hosted bound without repeating old prose or private fields', () => {
  const profile = { ...context, targetRegions: ['serratus', 'rotator_cuff', 'calves', 'glutes'] };
  const previousPlan = generate(profile, 40);
  previousPlan.privateResistance = 'PRIVATE_PREVIOUS_RESISTANCE';
  previousPlan.schedule[0].coachAdvice += ' PRIVATE_PREVIOUS_ADVICE';
  for (const lang of ['zh', 'en']) {
    const prompt = buildPlanningPrompt({ availableExercises: catalogExercises(lang), context: profile, dailyTime: 40, lang, previousPlan });
    assert.ok(Buffer.byteLength(prompt) < 60000, `${lang}: ${Buffer.byteLength(prompt)} bytes`);
    assert.ok(prompt.includes('doseFields'));
    assert.ok(prompt.includes(previousPlan.schedule[0].routine.at(-1)));
    assert.ok(!prompt.includes('PRIVATE_PREVIOUS_RESISTANCE'));
    assert.ok(!prompt.includes('PRIVATE_PREVIOUS_ADVICE'));
  }
});
