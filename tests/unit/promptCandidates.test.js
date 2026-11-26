import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanningPrompt } from '../../src/domain/coachingPrompt.js';
import { DEFAULT_MAX_PROMPT_BYTES, selectPromptCandidates, utf8Bytes } from '../../src/domain/promptCandidates.js';
import { catalogExercises, eligibleExercises, EQUIPMENT } from '../../src/domain/exerciseCatalog.js';
import { normalizePlanningContext } from '../../src/domain/planning.js';
import { generateTemplatePlan } from '../../src/domain/templatePlanner.js';
import { DAILY_WARMUP_IDS } from '../../src/domain/quickWorkouts.js';
import { validateNewAIPlan } from '../../src/domain/newAIPlan.js';
import { exerciseTrainingTargets } from '../../src/domain/trainingTargets.js';
import { createTrialService } from '../../functions/core.js';
import { firestoreQuota } from '../../functions/quota.js';

function fakeFirestore() {
  const documents = new Map();
  let tail = Promise.resolve();
  return {
    documents,
    doc: path => ({ path }),
    runTransaction: callback => {
      const promise = tail.then(async () => {
        const changes = new Map();
        const result = await callback({
          get: async ref => ({ exists: documents.has(ref.path), data: () => structuredClone(documents.get(ref.path)) }),
          set: (ref, value) => changes.set(ref.path, structuredClone(value)),
          update: (ref, value) => changes.set(ref.path, { ...documents.get(ref.path), ...structuredClone(value) }),
        });
        for (const [path, value] of changes) documents.set(path, value);
        return result;
      });
      tail = promise.catch(() => {});
      return promise;
    },
  };
}

function buildSyntheticCustomExercises(count = 200) {
  const result = {};
  for (let i = 0; i < count; i++) {
    const id = `custom_synth_${String(i).padStart(3, '0')}`;
    const categories = ['lower', 'upper', 'core', 'conditioning', 'recovery'];
    const category = categories[i % categories.length];
    result[id] = {
      id,
      name: `Synthetic Movement ${i}`,
      type: category === 'lower' ? 'lower' : category === 'upper' ? 'upper_push' : category === 'core' ? 'core' : 'mobility',
      category,
      equipmentOptions: [[]],
      shoulderLoaded: false,
      active: true,
      prescription: { sets: 2, value: '8', unit: 'reps', restSeconds: 60, perSide: false },
      tip: 'Control every repetition smoothly with steady trunk alignment and breathing.',
    };
  }
  return result;
}

function extractCandidateJson(prompt) {
  const marker = 'restrictionTags 表示需核對的姿勢或支撐限制，不是個人治療放行。\n';
  const start = prompt.indexOf(marker);
  assert.ok(start >= 0, 'candidate section header missing');
  const afterHeader = prompt.slice(start + marker.length);
  const endMarker = '\n\n【輸出要求】';
  const end = afterHeader.indexOf(endMarker);
  assert.ok(end >= 0, 'candidate section footer missing');
  const section = afterHeader.slice(0, end);
  const jsonStart = section.indexOf('[');
  assert.ok(jsonStart >= 0, 'candidate JSON array missing');
  return {
    prefix: section.slice(0, jsonStart),
    candidates: JSON.parse(section.slice(jsonStart)),
  };
}

test('typical eligible catalog stays unbudgeted and full 121-exercise catalog stays bounded under 60,000 UTF-8 bytes', () => {
  for (const lang of ['zh', 'en']) {
    const catalog = catalogExercises(lang);
    const gymContext = normalizePlanningContext({
      healthStatus: 'unrestricted',
      equipment: ['dumbbell', 'band', 'foam_roller'],
      partnerAvailable: false,
      experience: 'advanced',
    });
    const gymEligible = eligibleExercises(catalog, gymContext);
    const gymEntries = Object.entries(gymEligible).filter(([, exercise]) => !exercise.legacySequence && exercise.active !== false && !exercise.deleted);
    const gymPrompt = buildPlanningPrompt({
      availableExercises: gymEligible,
      context: gymContext,
      dailyTime: 40,
      lang,
      currentDate: '2026-10-19',
      currentWeek: '2026-W43',
    });
    assert.ok(Buffer.byteLength(gymPrompt, 'utf8') < 60000);
    const gymParsed = extractCandidateJson(gymPrompt);
    assert.equal(gymParsed.prefix, '');
    assert.equal(gymParsed.candidates.length, gymEntries.length);

    const context = normalizePlanningContext({
      healthStatus: 'unrestricted',
      equipment: EQUIPMENT,
      partnerAvailable: true,
      experience: 'advanced',
    });
    const eligible = eligibleExercises(catalog, context);
    const expectedEntries = Object.entries(eligible).filter(([, exercise]) => !exercise.legacySequence && exercise.active !== false && !exercise.deleted);
    assert.equal(expectedEntries.length, 121);

    const prompt = buildPlanningPrompt({
      availableExercises: eligible,
      context,
      dailyTime: 40,
      lang,
      currentDate: '2026-10-19',
      currentWeek: '2026-W43',
    });

    const bytes = Buffer.byteLength(prompt, 'utf8');
    assert.ok(bytes < 60000, `${lang} full-catalog prompt exceeded 60KB: ${bytes}`);
    assert.ok(bytes <= DEFAULT_MAX_PROMPT_BYTES, `${lang} full-catalog prompt exceeded ${DEFAULT_MAX_PROMPT_BYTES}: ${bytes}`);
    assert.equal(bytes, utf8Bytes(prompt));

    const { candidates } = extractCandidateJson(prompt);
    const candidateIds = new Set(candidates.map(item => item.id));
    for (const id of DAILY_WARMUP_IDS) assert.equal(candidateIds.has(id), true);
  }
});

test('selectPromptCandidates fast path returns all candidates unmodified with budgeted: false', () => {
  const items = [
    { id: 'bf_B01', category: 'lower', priority: true },
    { id: 'bf_C01', category: 'upper', priority: true },
    { id: 'custom_1', category: 'core' },
  ];
  const result = selectPromptCandidates(items, { baseBytes: 1000, maxBytes: DEFAULT_MAX_PROMPT_BYTES });
  assert.equal(result.budgeted, false);
  assert.equal(result.totalEligible, 3);
  assert.equal(result.includedCount, 3);
  assert.equal(result.omittedCount, 0);
  assert.deepEqual(result.candidates, items);
});

test('selectPromptCandidates supports [id, exercise] tuple entries and serialized-only objects with deterministic tiering', () => {
  const catalog = catalogExercises('en');
  const entries = Object.entries(catalog)
    .filter(([, exercise]) => !exercise.legacySequence && exercise.active !== false && !exercise.deleted)
    .map(([id, exercise]) => [id, exercise, { id, category: exercise.category, priority: !!exercise.priority }]);
  const result = selectPromptCandidates(entries, {
    profile: {
      weeklyExerciseIds: ['bf_C11', 'bf_B10'],
      targetRegions: ['serratus'],
      stiffnessRegions: ['ankle'],
    },
    previousPlan: { schedule: [{ day: 1, routine: ['bf_B05', 'bf_C04'] }] },
    baseBytes: 49500,
    maxBytes: 51500,
  });
  assert.equal(result.budgeted, true);
  assert.ok(result.includedCount > 0 && result.includedCount < result.totalEligible);
  assert.equal(result.includedCount + result.omittedCount, result.totalEligible);
  const selectedIds = new Set(result.candidates.map(item => item.id));
  for (const id of [...DAILY_WARMUP_IDS, 'bf_C11', 'bf_B10', 'bf_B05', 'bf_C04', 'bf_C07', 'bf_A02', 'bf_H01']) {
    assert.equal(selectedIds.has(id), true, `protected id ${id} should survive budgeting`);
  }

  const serializedOnly = Object.entries(catalog)
    .filter(([, exercise]) => !exercise.legacySequence && exercise.active !== false && !exercise.deleted)
    .map(([id, exercise]) => ({ id, category: exercise.category, priority: !!exercise.priority }));
  const serializedResult = selectPromptCandidates(serializedOnly, {
    profile: { targetRegions: ['serratus'], stiffnessRegions: ['ankle'] },
    baseBytes: 48000,
    maxBytes: 50000,
  });
  assert.equal(serializedResult.budgeted, true);
  const serializedIds = new Set(serializedResult.candidates.map(item => item.id));
  for (const id of [...DAILY_WARMUP_IDS, 'bf_C07', 'bf_A02', 'bf_H01']) {
    assert.equal(serializedIds.has(id), true, `serialized-only protected id ${id} should survive budgeting`);
  }
});

test('323-exercise worst-case stress test stays under 60KB, protects critical tiers, and is deterministic in zh and en', () => {
  const synthetic = buildSyntheticCustomExercises(200);

  for (const lang of ['zh', 'en']) {
    const catalog = catalogExercises(lang);
    const context = normalizePlanningContext({
      healthStatus: 'unrestricted',
      equipment: EQUIPMENT,
      partnerAvailable: true,
      experience: 'advanced',
    });
    const eligible = eligibleExercises(catalog, context);
    const combined = { ...eligible, ...synthetic };
    assert.equal(Object.keys(combined).length, 323);

    const previousPlan = generateTemplatePlan(catalog, context, 40, lang, {
      currentDate: '2026-10-19',
      currentWeek: '2026-W43',
    });
    const weeklyExerciseIds = ['bf_C11', 'bf_B10', 'bf_D03', 'bf_E01', 'bf_F02', 'bf_G02', 'bf_H03', 'bf_I01'];
    const targetRegions = ['serratus', 'rotator_cuff', 'calves', 'glutes'];
    const stressContext = normalizePlanningContext({
      ...context,
      targetRegions,
      stiffnessRegions: ['hip', 'shoulder'],
      sorenessRegions: ['legs', 'posterior'],
      weeklyExerciseIds,
      healthNotes: 'H'.repeat(2000),
      recoveryNotes: 'R'.repeat(2000),
    });

    const input = {
      availableExercises: combined,
      context: stressContext,
      dailyTime: 40,
      lang,
      userGoal: 'G'.repeat(300),
      userMessage: 'M'.repeat(500),
      previousPlan,
      currentDate: '2026-10-19',
      currentWeek: '2026-W43',
    };

    const promptA = buildPlanningPrompt(input);
    const promptB = buildPlanningPrompt(input);

    assert.equal(promptA, promptB, `${lang} prompt must be byte-for-byte deterministic`);
    const bytes = Buffer.byteLength(promptA, 'utf8');
    assert.ok(bytes < 60000, `${lang} stress prompt exceeded 60,000 bytes: ${bytes}`);
    assert.ok(bytes <= DEFAULT_MAX_PROMPT_BYTES, `${lang} stress prompt exceeded ${DEFAULT_MAX_PROMPT_BYTES}: ${bytes}`);

    const { prefix, candidates } = extractCandidateJson(promptA);
    assert.match(prefix, /已依每日暖身、本週手選、前期課表、目標部位與僵硬部位優先保留 \d+\/321 項候選動作以符合提示上限；未列項目不可引用。/);

    const selectedIds = new Set(candidates.map(item => item.id));
    for (const id of DAILY_WARMUP_IDS) {
      assert.equal(selectedIds.has(id), true, `${lang} warmup ${id} must be retained`);
    }
    for (const id of weeklyExerciseIds) {
      assert.equal(selectedIds.has(id), true, `${lang} weekly choice ${id} must be retained`);
    }
    for (const day of previousPlan.schedule) {
      for (const id of day.routine) {
        assert.equal(selectedIds.has(id), true, `${lang} previousPlan id ${id} must be retained`);
      }
    }
    const targetMatchedIds = Object.entries(eligible)
      .filter(([id, exercise]) => !exercise.legacySequence && exercise.active !== false
        && exerciseTrainingTargets(id, exercise).some(region => targetRegions.includes(region)))
      .map(([id]) => id);
    for (const id of targetMatchedIds) {
      assert.equal(selectedIds.has(id), true, `${lang} targetRegion id ${id} must be retained`);
    }
    assert.ok(
      candidates.filter(item => item.id.startsWith('custom_synth_')).length < 200,
      'synthetic low-priority custom items should be budgeted before protected tiers',
    );
  }
});

test('createTrialService succeeds with worst-case full-equipment + max-length clinical/recovery notes in zh and en', async () => {
  const domain = {
    prompt: buildPlanningPrompt,
    catalog: catalogExercises,
    eligible: eligibleExercises,
    normalizeContext: normalizePlanningContext,
    validate: validateNewAIPlan,
    equipment: EQUIPMENT,
  };

  for (const lang of ['zh', 'en']) {
    const db = fakeFirestore();
    const quota = firestoreQuota(db, () => 'server-timestamp');
    const catalog = catalogExercises(lang);
    const fullContext = {
      healthStatus: 'unrestricted',
      equipment: EQUIPMENT,
      partnerAvailable: true,
      experience: 'advanced',
      targetRegions: ['serratus', 'rotator_cuff', 'calves', 'glutes'],
      stiffnessRegions: ['hip', 'shoulder'],
      sorenessRegions: ['legs', 'posterior'],
      weeklyExerciseIds: ['bf_C11', 'bf_B10', 'bf_D03', 'bf_E01', 'bf_F02', 'bf_G02', 'bf_H03', 'bf_I01'],
      healthNotes: '傷'.repeat(2000),
      recoveryNotes: '累'.repeat(2000),
    };
    const validPlan = generateTemplatePlan(
      eligibleExercises(catalog, normalizePlanningContext(fullContext)),
      normalizePlanningContext(fullContext),
      40,
      lang,
      { currentDate: '2026-10-14', currentWeek: '2026-W42' },
    );

    let capturedPrompt = '';
    const service = createTrialService({
      domain,
      quota,
      clock: () => new Date('2026-10-14T12:00:00Z'),
      config: async () => ({ enabled: true, dailyCap: 5 }),
      generate: async prompt => {
        capturedPrompt = prompt;
        return validPlan;
      },
    });

    const result = await service({
      uid: `trial-user-${lang}`,
      provider: 'google.com',
      appVerified: true,
      data: {
        dailyTime: 40,
        lang,
        userGoal: '目'.repeat(300),
        userMessage: '備'.repeat(500),
        context: fullContext,
      },
    });

    assert.equal(result.currentDate, '2026-10-14');
    assert.equal(result.currentWeek, '2026-W42');
    assert.ok(Buffer.byteLength(capturedPrompt, 'utf8') <= 60000, `${lang} trial prompt must stay <= 60000 bytes`);
  }
});
