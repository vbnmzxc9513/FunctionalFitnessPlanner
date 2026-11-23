import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { DEFAULT_PLANNING_CONTEXT } from '../../src/domain/planning.js';
import { DAILY_WARMUP_IDS, isDailyWarmupComplete } from '../../src/domain/quickWorkouts.js';
import {
  MAX_CONCLUSION_CHARS,
  buildAIPeriodChunkPrompt,
  formatCoachReportMarkdown,
  generateAIPeriodPlan,
  parseCoachReportMarkdown,
  splitPeriodIntoChunks,
} from '../../src/domain/aiPeriodPlanning.js';

const exercises = catalogExercises('zh');

function mockChunkResponse(prompt, includeReport) {
  const match = prompt.match(/editableDates 輸出 days 陣列（每天恰一筆，日期必須完全一致，不可包含受保護日期）：\n(\[.*\])/);
  assert.ok(match, 'Prompt should contain editableDates JSON');
  const editableDates = JSON.parse(match[1]);

  const days = editableDates.map((policy, index) => {
    if (policy.warmupMode === 'none' || policy.suggestedSessionType === 'rest') {
      return {
        date: policy.date,
        name: `休息日 ${policy.day}`,
        theme: '主動休息',
        concept: '保留身體恢復空間',
        coachAdvice: '睡眠與補水優先。',
        sessionType: 'rest',
        warmupNote: '今日為休息日，不需額外暖身。',
        cooldownNote: '今日為休息日，專注放鬆。',
        routine: [],
        prescriptions: [],
      };
    }
    if (policy.isCourtDay || policy.suggestedSessionType === 'recovery' || index % 2 === 1) {
      return {
        date: policy.date,
        name: `球日恢復 ${policy.day}`,
        theme: '球日關節維護與動態恢復',
        concept: '球日保持關節活動度不累積疲勞。',
        coachAdvice: '八段動態拉伸輕鬆完成即可。',
        sessionType: 'recovery',
        warmupNote: '以標準八段動態暖身柔和活動全身關節。',
        cooldownNote: '今日已含動態伸展，可選擇性補緩慢呼吸。',
        routine: [],
        prescriptions: [],
      };
    }
    return {
      date: policy.date,
      name: `肌力訓練 ${policy.day}`,
      theme: '羽球下肢煞車與核心穩定',
      concept: '建立弓步急停與軀幹抗旋轉控制。',
      coachAdvice: '主項保留 2 次餘力，隔天觀察腿部感受。',
      sessionType: 'training',
      warmupNote: '先完成八段動態暖身，再進入下肢準備組。',
      cooldownNote: '最後以胸椎與核心控制收尾。',
      routine: ['bf_B01', 'dead_bug'],
      prescriptions: [
        {
          id: 'bf_B01',
          sets: 2,
          value: '8',
          unit: 'reps',
          restSeconds: 60,
          perSide: true,
          phase: 'strength',
          preparation: {
            sets: 1,
            value: '5',
            unit: 'reps',
            restSeconds: 30,
            perSide: true,
            instruction: '徒手小幅度分腿下蹲感受重心穩定。',
          },
        },
        {
          id: 'dead_bug',
          sets: 2,
          value: '8',
          unit: 'reps',
          restSeconds: 45,
          perSide: true,
          phase: 'accessory',
        },
      ],
    };
  });

  return {
    days,
    ...(includeReport ? {
      report: {
        reviewAndPraise: '近 28 天你穩紮穩打完成了 4 堂紀錄，這份持續累積非常值得肯定！',
        reminders: ['週二與週五有羽球局，這兩天以八段動態恢復為主，避免下肢過度堆疊疲勞。', '胸椎與髖旋轉將透過每日暖身持續維持。'],
        planOverview: '這兩週以羽球下肢分腿煞車與核心抗旋為主軸，並透過跨週安排兼顧恢復節奏。',
        checkpoints: '期中觀察隔天腿部與肩部狀態，若連續兩次動作穩定可於下階段微調。',
      },
    } : {}),
  };
}

test('splitPeriodIntoChunks splits 14 days cleanly into ISO-week chunks of at most 7 days', () => {
  const dates = Array.from({ length: 14 }, (_, i) => (i < 8
    ? `2026-11-${String(23 + i).padStart(2, '0')}`
    : `2026-12-${String(i - 7).padStart(2, '0')}`));
  const chunks = splitPeriodIntoChunks(dates);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].dates.length, 7);
  assert.equal(chunks[1].dates.length, 7);
});

test('generateAIPeriodPlan runs 14-day multi-chunk AI plan, locks 8-item warm-up, preserves protected dates, and formats report <= 3800 chars', async () => {
  const context = {
    ...DEFAULT_PLANNING_CONTEXT,
    trainingDays: [1, 2, 3, 4, 5],
    badmintonDays: [2, 5],
    equipment: ['dumbbell', 'band'],
  };
  const protectedSession = {
    date: '2026-11-23',
    week: '2026-W48',
    day: 1,
    name: '已完成的週一',
    theme: '保留既有紀錄',
    concept: '不可覆寫',
    coachAdvice: '已保留',
    sessionType: 'training',
    warmupNote: '保留',
    cooldownNote: '保留',
    routine: ['bf_A04'],
    prescriptions: [{ id: 'bf_A04', sets: 1, value: '6', unit: 'reps', restSeconds: 0, perSide: true, phase: 'warmup' }],
  };

  let calls = 0;
  const progressEvents = [];
  const result = await generateAIPeriodPlan({
    exercises,
    profile: { context, focus: 'balanced', time: '35' },
    range: { from: '2026-11-23', to: '2026-12-06' },
    today: '2026-11-23',
    existingSessions: { '2026-11-23': protectedSession },
    protectedDates: ['2026-11-23'],
    lang: 'zh',
    onProgress: event => progressEvents.push(event),
    callChunk: async ({ prompt, includeReport }) => {
      calls += 1;
      assert.ok(Buffer.byteLength(prompt, 'utf8') <= 56000, 'Prompt must stay within 56KB budget');
      return mockChunkResponse(prompt, includeReport);
    },
  });

  assert.equal(calls, 2);
  assert.equal(progressEvents.length, 2);
  assert.equal(result.sessions.length, 14);
  assert.equal(result.source, 'ai');

  // Protected date preserved verbatim
  const day1 = result.sessions.find(day => day.date === '2026-11-23');
  assert.deepEqual(day1.routine, ['bf_A04']);
  assert.equal(day1.theme, '保留既有紀錄');

  // Every non-protected active day has the exact 8-item dynamic warm-up locked at the front
  for (const session of result.sessions) {
    if (session.date === '2026-11-23' || session.sessionType === 'rest') continue;
    assert.equal(isDailyWarmupComplete(session), true, `${session.date} should have complete 8-item warm-up`);
    assert.deepEqual(session.routine.slice(0, 8), [...DAILY_WARMUP_IDS]);
  }

  // Structured report round-trips through Markdown conclusion under Firestore 4000-char bound
  assert.ok(result.coachReport?.reviewAndPraise);
  assert.ok(result.conclusion.length <= MAX_CONCLUSION_CHARS);
  const parsed = parseCoachReportMarkdown(result.conclusion);
  assert.equal(parsed.reviewAndPraise, result.coachReport.reviewAndPraise);
  assert.deepEqual(parsed.reminders, result.coachReport.reminders);
  assert.equal(parsed.planOverview, result.coachReport.planOverview);
  assert.equal(parsed.checkpoints, result.coachReport.checkpoints);
});

test('generateAIPeriodPlan retries once with correction hint when AI omits preparation on first strength move', async () => {
  const context = { ...DEFAULT_PLANNING_CONTEXT, trainingDays: [1], badmintonDays: [] };
  let attempts = 0;

  const result = await generateAIPeriodPlan({
    exercises,
    profile: { context, focus: 'strength', time: '35' },
    range: { from: '2026-11-23', to: '2026-11-23' },
    today: '2026-11-23',
    lang: 'zh',
    callChunk: async ({ prompt, includeReport }) => {
      attempts += 1;
      const base = mockChunkResponse(prompt, includeReport);
      if (attempts === 1) {
        // First attempt omits preparation — must trigger validation retry
        delete base.days[0].prescriptions[0].preparation;
      } else {
        assert.match(prompt, /AI_PREPARATION_MISSING/);
      }
      return base;
    },
  });

  assert.equal(attempts, 2);
  assert.equal(result.sessions.length, 1);
  assert.ok(result.sessions[0].prescriptions.find(dose => dose.id === 'bf_B01')?.preparation);
});

test('formatCoachReportMarkdown truncates gracefully to MAX_CONCLUSION_CHARS', () => {
  const huge = formatCoachReportMarkdown({
    reviewAndPraise: '讚'.repeat(2000),
    reminders: ['提醒'.repeat(500), '提醒二'.repeat(500)],
    planOverview: '計畫'.repeat(2000),
    checkpoints: '檢核'.repeat(1000),
  }, 'zh');
  assert.ok(huge.length <= MAX_CONCLUSION_CHARS);
});

test('buildAIPeriodChunkPrompt enforces 56KB budget even with many custom exercises', () => {
  const bloated = { ...exercises };
  for (let i = 0; i < 300; i += 1) {
    bloated[`custom_item_${i}`] = {
      name: `自訂測試動作 ${i} ${'說明'.repeat(20)}`,
      type: 'lower',
      category: 'lower',
      tip: '穩定控制核心與下肢對齊。'.repeat(5),
      active: true,
    };
  }
  const prompt = buildAIPeriodChunkPrompt({
    chunkDates: ['2026-11-23'],
    policies: [{ date: '2026-11-23', day: 1, week: '2026-W48', protected: false, isTrainingDay: true, isCourtDay: false, warmupMode: 'daily_warmup', warmupMinutes: 10, remainingMinutes: 20, remainingSlots: 16 }],
    exercises: bloated,
    profile: { context: DEFAULT_PLANNING_CONTEXT, focus: 'balanced', time: '30' },
    time: 30,
    includeReport: true,
  });
  assert.ok(Buffer.byteLength(prompt, 'utf8') <= 56000);
});

test('generateAIPeriodPlan reconciles persistent LLM slips (overshoot, missing prep, unit text, ineligible ID, wrong phase, jump volume) while keeping all safety invariants', async () => {
  const { estimateSessionMinutes } = await import('../../src/domain/sessions.js');
  const { planningExercises } = await import('../../src/domain/planning.js');
  // Bodyweight-only context with tight 20-minute budget
  const context = {
    ...DEFAULT_PLANNING_CONTEXT,
    trainingDays: [1],
    badmintonDays: [],
    equipment: [],
  };
  const eligible = planningExercises(exercises, context);
  let attempts = 0;

  // Simulate an LLM that keeps making realistic slips on BOTH attempts
  const result = await generateAIPeriodPlan({
    exercises,
    profile: { context, focus: 'strength', time: '20' },
    range: { from: '2026-11-23', to: '2026-11-23' },
    today: '2026-11-23',
    lang: 'zh',
    callChunk: async ({ includeReport }) => {
      attempts += 1;
      return {
        days: [{
          date: '2026-11-23',
          name: '下肢訓練',
          theme: '煞車與爆發',
          concept: '建立下肢穩定與彈性',
          coachAdvice: '保留餘力，動作穩定優先。',
          sessionType: 'training',
          warmupNote: '先做八段動態暖身。',
          cooldownNote: '緩和呼吸收尾。',
          routine: [
            'bf_B01',            // valid bodyweight lower
            'nonexistent_id',    // hallucinated ID -> must be stripped
            'bf_C04',            // requires dumbbell/equipment -> ineligible -> must be stripped
            'bf_E01',            // jump exercise mislabeled as strength & > 24 contacts
            'dead_bug',          // valid core
            'plank',             // extra exercise causing overshoot on 20-min day
          ],
          prescriptions: [
            // Missing preparation & unit text inside value + excessive sets/rest
            { id: 'bf_B01', sets: 5, value: '10 次', unit: 'reps', restSeconds: 120, perSide: true, phase: 'strength' },
            { id: 'nonexistent_id', sets: 3, value: '10', unit: 'reps', restSeconds: 60, perSide: false, phase: 'strength' },
            { id: 'bf_C04', sets: 3, value: '10', unit: 'reps', restSeconds: 60, perSide: false, phase: 'strength' },
            { id: 'bf_E01', sets: 4, value: '10', unit: 'reps', restSeconds: 90, perSide: false, phase: 'strength' },
            { id: 'dead_bug', sets: 4, value: '12', unit: 'reps', restSeconds: 60, perSide: true, phase: 'accessory' },
            { id: 'plank', sets: 4, value: '45', unit: 'seconds', restSeconds: 60, perSide: false, phase: 'accessory' },
          ],
        }],
        ...(includeReport ? {
          report: {
            reviewAndPraise: '今天開始建立新的體能基準，一步一步累積最重要！',
            reminders: ['控制每日 20 分鐘上限，品質勝過組數。'],
            planOverview: '本週以穩定下肢煞車與核心控制為主軸。',
            checkpoints: '觀察翌日腿部疲勞狀態作為下週參考。',
          },
        } : {}),
      };
    },
  });

  assert.equal(attempts, 2, 'Should attempt strict retry once before deterministic reconciliation');
  assert.equal(result.sessions.length, 1);
  const day = result.sessions[0];
  assert.equal(isDailyWarmupComplete(day), true, 'Locked 8-item dynamic warm-up must remain intact');
  assert.deepEqual(day.routine.slice(0, 8), [...DAILY_WARMUP_IDS]);
  assert.ok(!day.routine.includes('nonexistent_id'), 'Unknown IDs must be stripped');
  assert.ok(!day.routine.includes('bf_C04'), 'Ineligible equipment IDs must be stripped');
  assert.ok(estimateSessionMinutes(day, eligible) <= 20, `Reconciled session must fit <= 20m (got ${estimateSessionMinutes(day, eligible)}m)`);
  const firstStrength = day.prescriptions.find(d => d.phase === 'strength');
  if (firstStrength) {
    assert.ok(firstStrength.preparation, 'First strength move must have a valid preparation set');
  }
  const jumpDose = day.prescriptions.find(d => d.id === 'bf_E01');
  if (jumpDose) {
    assert.equal(jumpDose.phase, 'skill', 'Power/jump move must be normalized to skill phase');
  }
});

test('generateAIPeriodPlan retries transient JSON truncation once and fails fast on auth/quota errors', async () => {
  const context = { ...DEFAULT_PLANNING_CONTEXT, trainingDays: [1], badmintonDays: [] };
  let calls = 0;
  const recovered = await generateAIPeriodPlan({
    exercises,
    profile: { context, focus: 'balanced', time: '35' },
    range: { from: '2026-11-23', to: '2026-11-23' },
    today: '2026-11-23',
    lang: 'zh',
    callChunk: async ({ prompt, includeReport }) => {
      calls += 1;
      if (calls === 1) throw new Error('AI_INCOMPLETE_RESULT');
      return mockChunkResponse(prompt, includeReport);
    },
  });
  assert.equal(calls, 2);
  assert.equal(recovered.sessions.length, 1);

  let authCalls = 0;
  await assert.rejects(
    () => generateAIPeriodPlan({
      exercises,
      profile: { context, focus: 'balanced', time: '35' },
      range: { from: '2026-11-23', to: '2026-11-23' },
      today: '2026-11-23',
      lang: 'zh',
      callChunk: async () => {
        authCalls += 1;
        throw new Error('API_KEY_INVALID');
      },
    }),
    { message: 'API_KEY_INVALID' },
  );
  assert.equal(authCalls, 1, 'Auth errors must fail immediately without retrying');
});

test('filterSupportedModels removes unstable/preview/non-text models and ranks gemini-2.5-flash first', async () => {
  const { filterSupportedModels } = await import('../../src/services/gemini.js');
  const options = filterSupportedModels([
    { name: 'models/gemini-3.0-pro-preview', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.0-flash-exp', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-flash-image', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-1.5-pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] },
  ]);
  assert.deepEqual(options.map(m => m.id), ['gemini-2.5-flash', 'gemini-2.5-pro']);
});
