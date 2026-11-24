import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { DEFAULT_PLANNING_CONTEXT } from '../../src/domain/planning.js';
import { DAILY_WARMUP_IDS } from '../../src/domain/quickWorkouts.js';
import {
  MAX_CHAT_TURNS,
  MAX_COACH_CONTEXT_BYTES,
  MAX_PLANNER_HANDOFF_CHARS,
  MAX_REFINEMENT_MESSAGE_CHARS,
  MAX_USER_MESSAGE_CHARS,
  buildCoachChatSystemContext,
  buildCoachQuickPrompts,
  buildCoachToPlannerNote,
  buildEligibleCatalogDigest,
  buildRefinementMessage,
  normalizeCoachHistory,
  parseCoachActionSuggestions,
  sanitizeRecentLogs,
  stripStreamingSwapTags,
} from '../../src/domain/aiCoachChat.js';
import { streamCoachReply } from '../../src/services/gemini.js';

const exercises = catalogExercises('zh');

test('buildCoachChatSystemContext embeds factual snapshot, recentLogs, cues, eligibleCatalog, safety rules, and stays <= 24KB', () => {
  const activeSession = {
    date: '2026-11-23',
    day: 1,
    theme: '羽球下肢分腿與核心穩定',
    sessionType: 'training',
    routine: ['bf_A04', 'bf_B01', 'bf_D01'],
    prescriptions: [
      { id: 'bf_A04', sets: 1, value: '6', unit: 'reps', restSeconds: 0, perSide: true, phase: 'warmup' },
      { id: 'bf_B01', sets: 3, value: '8', unit: 'reps', restSeconds: 60, perSide: true, phase: 'strength' },
      { id: 'bf_D01', sets: 2, value: '8', unit: 'reps', restSeconds: 45, perSide: true, phase: 'accessory' },
    ],
  };

  const exerciseLogs = [
    {
      date: '2026-11-20',
      exerciseId: 'bf_B01',
      variant: 'dumbbell',
      loadKg: 8,
      loadBasis: 'per_dumbbell',
      resistanceLabel: '聯絡 test@example.com 0912-345-678',
      unit: 'reps',
      perSide: true,
      sets: [{ value: 8, otherSide: 8 }, { value: 8, otherSide: 8 }, { value: 9, otherSide: 8 }],
      rir: 2,
      quality: 'good',
      nextDay: 'good',
    },
    {
      date: '2026-11-22',
      exerciseId: 'bf_D01',
      variant: 'bodyweight',
      loadKg: null,
      loadBasis: 'none',
      resistanceLabel: '',
      unit: 'reps',
      perSide: true,
      sets: [{ value: 10, otherSide: 10 }],
      rir: null,
      quality: 'unknown',
      nextDay: 'pending',
    },
  ];

  const context = buildCoachChatSystemContext({
    today: '2026-11-23',
    lang: 'zh',
    activeSession,
    schedule: [activeSession],
    exercises,
    profile: {
      focus: 'strength',
      time: '35',
      goal: '提升後場殺球穩定與弓步急停',
      context: { ...DEFAULT_PLANNING_CONTEXT, badmintonDays: [2, 5], equipment: ['dumbbell'], competitionDate: '2026-12-20' },
    },
    recentSummary: {
      lookbackDays: 28,
      hasHistory: true,
      trainingDays: 6,
      completedCount: 42,
      loggedSetsCount: 18,
      mobilityGaps: [{ area: 'thoracic', gapDays: 5 }],
    },
    readiness: {
      date: '2026-11-23',
      sleepHours: 7.5,
      fatigue: 2,
      soreness: 2,
      symptoms: 'none',
      yesterdayCourtMinutes: 90,
      todayCourtIntensity: 'none',
    },
    metrics: [{ date: '2026-11-20', weight: 68.5 }],
    exerciseLogs,
  });

  assert.ok(Buffer.byteLength(context, 'utf8') <= MAX_COACH_CONTEXT_BYTES);
  assert.match(context, /2026-11-23/);
  assert.match(context, /羽球下肢分腿與核心穩定/);
  assert.match(context, /2026-12-20/);
  assert.match(context, /"completedCount":42/);
  assert.match(context, /醫療診斷/);
  assert.match(context, /不可編造/);
  assert.match(context, /\[\[SWAP:oldId->newId/);

  const jsonStart = context.indexOf('\n{');
  assert.ok(jsonStart > 0);
  const snapshot = JSON.parse(context.slice(jsonStart + 1));

  // Active session non-compact exercises include cue, easier, harder
  const splitSquat = snapshot.activeSession.exercises.find(item => item.id === 'bf_B01');
  assert.ok(splitSquat);
  assert.ok(splitSquat.cue && splitSquat.cue.length <= 70);
  assert.ok(splitSquat.easier && splitSquat.easier.length <= 50);
  assert.ok(splitSquat.harder && splitSquat.harder.length <= 50);

  // Recent logs sorted newest first, PII stripped, empty/unknown/pending fields omitted
  assert.equal(snapshot.recentLogs.length, 2);
  assert.equal(snapshot.recentLogs[0].date, '2026-11-22');
  assert.equal(snapshot.recentLogs[0].id, 'bf_D01');
  assert.equal(Object.hasOwn(snapshot.recentLogs[0], 'quality'), false);
  assert.equal(Object.hasOwn(snapshot.recentLogs[0], 'reserve'), false);
  assert.equal(Object.hasOwn(snapshot.recentLogs[0], 'nextDay'), false);

  assert.equal(snapshot.recentLogs[1].date, '2026-11-20');
  assert.equal(snapshot.recentLogs[1].setsDone, 3);
  assert.equal(snapshot.recentLogs[1].actualReps, '8/8,8/8,9/8');
  assert.match(snapshot.recentLogs[1].resistance, /dumbbell 8kg\/hand/);
  assert.doesNotMatch(snapshot.recentLogs[1].resistance, /test@example\.com/);
  assert.doesNotMatch(snapshot.recentLogs[1].resistance, /0912/);
  assert.equal(snapshot.recentLogs[1].quality, 'good');
  assert.equal(snapshot.recentLogs[1].reserve, 'RIR 2');
  assert.equal(snapshot.recentLogs[1].nextDay, 'good');

  // Eligible catalog digest is grouped and contains valid IDs
  assert.ok(snapshot.eligibleCatalog);
  assert.ok(Array.isArray(snapshot.eligibleCatalog.lower) && snapshot.eligibleCatalog.lower.length > 0);
  assert.ok(snapshot.eligibleCatalog.lower.some(entry => entry.startsWith('bf_B01:')));
});

test('sanitizeRecentLogs caps to limit and buildEligibleCatalogDigest filters by profile equipment', () => {
  const manyLogs = Array.from({ length: 20 }, (_, i) => ({
    date: `2026-11-${String(i + 1).padStart(2, '0')}`,
    exerciseId: 'bf_B01',
    variant: 'bodyweight',
    sets: [{ value: 10, otherSide: null }],
    unit: 'reps',
    perSide: false,
  }));
  const limited = sanitizeRecentLogs(manyLogs, exercises, 12);
  assert.equal(limited.length, 12);
  assert.equal(limited[0].date, '2026-11-20');
  assert.equal(limited[11].date, '2026-11-09');

  const noEquipDigest = buildEligibleCatalogDigest(exercises, { context: { ...DEFAULT_PLANNING_CONTEXT, equipment: [] } });
  const allNoEquipIds = Object.values(noEquipDigest).flat().map(item => item.split(':')[0]);
  // bf_B10 (goblet squat) requires dumbbell so must not appear when equipment is empty
  assert.equal(allNoEquipIds.includes('bf_B10'), false);
  // Locked warmup IDs are excluded from swap digest
  for (const warmupId of DAILY_WARMUP_IDS) {
    assert.equal(allNoEquipIds.includes(warmupId), false);
  }
});

test('buildCoachChatSystemContext strictly enforces 24KB UTF-8 byte budget even with huge inputs and logs', () => {
  const hugeExercises = { ...exercises };
  const hugeRoutine = [];
  for (let i = 0; i < 120; i += 1) {
    const id = `custom_huge_${i}`;
    hugeExercises[id] = {
      name: `超長自訂羽球動作名稱_${i}_${'爆發力與核心穩定'.repeat(20)}`,
      type: 'lower',
      tip: '提示'.repeat(100),
      easier: '降階動作說明'.repeat(30),
      harder: '進階動作說明'.repeat(30),
    };
    hugeRoutine.push(id);
  }
  const hugeSession = {
    date: '2026-11-23',
    day: 1,
    theme: '超長主題'.repeat(40),
    sessionType: 'training',
    routine: hugeRoutine,
    prescriptions: hugeRoutine.map(id => ({ id, sets: 3, value: '10', unit: 'reps', restSeconds: 60, perSide: false, phase: 'strength' })),
  };
  const hugeLogs = Array.from({ length: 40 }, (_, i) => ({
    date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
    exerciseId: `custom_huge_${i}`,
    variant: 'other',
    resistanceLabel: '超長阻力描述'.repeat(50),
    sets: [{ value: 12, otherSide: null }, { value: 12, otherSide: null }],
    unit: 'reps',
    perSide: false,
    rir: 2,
    quality: 'good',
    nextDay: 'good',
  }));

  const context = buildCoachChatSystemContext({
    today: '2026-11-23',
    lang: 'en',
    activeSession: hugeSession,
    schedule: Array.from({ length: 7 }, (_, i) => ({ ...hugeSession, day: i + 1, date: `2026-11-${23 + i}` })),
    exercises: hugeExercises,
    profile: {
      goal: 'Very long goal '.repeat(200),
      context: {
        ...DEFAULT_PLANNING_CONTEXT,
        healthNotes: 'Long health notes '.repeat(200),
        recoveryNotes: 'Long recovery notes '.repeat(200),
      },
    },
    recentSummary: {
      hasHistory: true,
      trainingDays: 10,
      completedCount: 80,
      loggedSetsCount: 30,
      mobilityGaps: Array.from({ length: 8 }, (_, idx) => ({ area: `area_${idx}`, gapDays: idx + 1 })),
    },
    exerciseLogs: hugeLogs,
  });

  assert.ok(Buffer.byteLength(context, 'utf8') <= MAX_COACH_CONTEXT_BYTES);
  assert.match(context, /medical diagnoses/i);
  assert.match(context, /NEVER fabricate/i);
});

test('parseCoachActionSuggestions strips all markers, validates swaps strictly, and caps at 2', () => {
  const activeSession = {
    date: '2026-11-23',
    routine: [...DAILY_WARMUP_IDS, 'bf_B01', 'bf_C03', 'bf_D01'],
  };
  const eligible = {
    bf_B01: exercises.bf_B01,
    bf_B06: exercises.bf_B06,
    bf_C03: exercises.bf_C03,
    bf_C07: exercises.bf_C07,
    bf_D01: exercises.bf_D01,
    bf_D03: exercises.bf_D03,
    bf_disabled: { name: 'Disabled move', active: false },
    bf_deleted: { name: 'Deleted move', deleted: true },
  };

  const reply = [
    '今天膝蓋微痠，可以微調下肢與核心負荷。',
    '',
    '[[SWAP:bf_A04->bf_B06|不可替換鎖定暖身]]',
    '[[SWAP:bf_B01->bf_B06|減少前膝壓力改練臀橋]]',
    '[[SWAP:bf_B01->bf_D03|重複舊動作應被忽略]]',
    '[[SWAP:bf_C03->bf_disabled|停用動作應被拒絕]]',
    '[[SWAP:bf_C03->bf_deleted|刪除動作應被拒絕]]',
    '[[SWAP:bf_C03->unknown_999|未知動作應被拒絕]]',
    '[[SWAP:bf_C03->bf_D01|已在課表中應被拒絕]]',
    '[[SWAP:bf_C03->bf_C03|同動作應被拒絕]]',
    '[[SWAP:not_in_session->bf_C07|不在今日課表應被拒絕]]',
    '[[SWAP:malformed_tag_without_arrow]]',
    '[[SWAP:bf_C03->bf_C07|改練前鋸肌推更友善肩膀]]',
    '[[SWAP:bf_D01->bf_D03|第三個有效替換超過上限 2 應被截斷]]',
  ].join('\n');

  const { cleanText, swaps } = parseCoachActionSuggestions(reply, {
    activeSession,
    eligibleExercises: eligible,
  });

  // Zero raw [[SWAP:...]] markers may leak into cleanText
  assert.doesNotMatch(cleanText, /\[\[SWAP/i);
  assert.equal(cleanText, '今天膝蓋微痠，可以微調下肢與核心負荷。');

  // Only 2 valid, deduplicated swaps accepted
  assert.equal(swaps.length, 2);
  assert.deepEqual(swaps[0], {
    oldId: 'bf_B01',
    oldName: exercises.bf_B01.name,
    newId: 'bf_B06',
    newName: exercises.bf_B06.name,
    reason: '減少前膝壓力改練臀橋',
  });
  assert.deepEqual(swaps[1], {
    oldId: 'bf_C03',
    oldName: exercises.bf_C03.name,
    newId: 'bf_C07',
    newName: exercises.bf_C07.name,
    reason: '改練前鋸肌推更友善肩膀',
  });
});

test('stripStreamingSwapTags removes complete and partial trailing swap markers cleanly', () => {
  const partial = '可以改練臀橋減輕膝蓋負荷。\n[[SWAP:bf_B01->bf_B0';
  assert.equal(stripStreamingSwapTags(partial), '可以改練臀橋減輕膝蓋負荷。');
  const complete = '建議微調如下：\n[[SWAP:bf_B01->bf_B06|減輕壓力]]\n記得慢速控制。';
  assert.equal(stripStreamingSwapTags(complete), '建議微調如下：\n記得慢速控制。');
});

test('buildCoachToPlannerNote creates concise <= 600-char notes in zh and en without swap tags', () => {
  const history = [
    { role: 'user', text: '我這週三跟週五有打球，右膝微痠。' },
    { role: 'model', text: '### 建議重點\n- 減少前膝剪力，改用**臀橋**與**側棒式**。\n[[SWAP:bf_B01->bf_B06|減少壓力]]' },
    { role: 'user', text: '下週想加強揮拍核心抗旋轉與肩胛穩定。' },
    { role: 'model', text: '可以安排 Pallof press 與前鋸肌訓練，並在打球隔天以恢復為主。'.repeat(15) },
  ];

  const noteZh = buildCoachToPlannerNote(history, 'zh');
  assert.ok(noteZh.length > 0 && noteZh.length <= MAX_PLANNER_HANDOFF_CHARS);
  assert.match(noteZh, /延續 AI 教練討論/);
  assert.match(noteZh, /右膝微痠/);
  assert.doesNotMatch(noteZh, /\[\[SWAP/);
  assert.doesNotMatch(noteZh, /\*\*/);

  const noteEn = buildCoachToPlannerNote(history, 'en');
  assert.ok(noteEn.length > 0 && noteEn.length <= MAX_PLANNER_HANDOFF_CHARS);
  assert.match(noteEn, /From AI Coach discussion:/);
  assert.doesNotMatch(noteEn, /\[\[SWAP/);

  assert.equal(buildCoachToPlannerNote([], 'zh'), '');
});

test('streamCoachReply streams SSE chunks, skips thought parts, and falls back cleanly on server failure', async () => {
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();

  try {
    // 1. Streaming SSE with thought part skipped and incremental onChunk updates
    const chunks = [];
    globalThis.fetch = async url => {
      assert.match(url, /streamGenerateContent\?alt=sse/);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(
            'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"internal reasoning"},{"text":"你好，"}]}}]}\n\n',
          ));
          controller.enqueue(encoder.encode(
            'data: {"candidates":[{"content":{"parts":[{"text":"今天建議先暖身。"}]}}]}\n\n',
          ));
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream };
    };

    const reply = await streamCoachReply({
      systemContext: 'Coach system',
      messages: [{ role: 'user', text: '今天怎麼練？' }],
      apiKey: 'AIzaTestKey',
      model: 'gemini-2.5-flash',
      onChunk: text => chunks.push(text),
    });

    assert.equal(reply, '你好，今天建議先暖身。');
    assert.deepEqual(chunks, ['你好，', '你好，今天建議先暖身。']);

    // 2. Fallback from failed pro stream -> flash stream -> generateCoachReply
    const calledUrls = [];
    globalThis.fetch = async url => {
      calledUrls.push(url);
      if (url.includes('streamGenerateContent')) {
        return {
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: { code: 500, message: 'Internal error' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'Fallback reply ok' }] } }] }),
      };
    };

    const fallbackChunks = [];
    const fallbackReply = await streamCoachReply({
      systemContext: 'Coach system',
      messages: [{ role: 'user', text: 'Hi' }],
      apiKey: 'AIzaTestKey',
      model: 'gemini-2.5-pro',
      onChunk: text => fallbackChunks.push(text),
    });

    assert.equal(fallbackReply, 'Fallback reply ok');
    assert.deepEqual(fallbackChunks, ['Fallback reply ok']);
    assert.equal(calledUrls.length, 3);
    assert.match(calledUrls[0], /gemini-2\.5-pro:streamGenerateContent/);
    assert.match(calledUrls[1], /gemini-2\.5-flash:streamGenerateContent/);
    assert.match(calledUrls[2], /gemini-2\.5-flash:generateContent/);

    // 3. Auth error (401) must NOT fallback
    let authCalls = 0;
    globalThis.fetch = async () => {
      authCalls += 1;
      return {
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { code: 401, message: 'API key not valid' } }),
      };
    };
    await assert.rejects(
      () => streamCoachReply({
        systemContext: 'Coach system',
        messages: [{ role: 'user', text: 'Hi' }],
        apiKey: 'bad-key',
        model: 'gemini-2.5-pro',
      }),
      { message: 'API_KEY_INVALID' },
    );
    assert.equal(authCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('buildCoachQuickPrompts returns 4 tailored badminton prompts for zh and en', () => {
  const activeWithHistory = buildCoachQuickPrompts({
    activeSession: { theme: '下肢弓步肌力', sessionType: 'training', routine: ['bf_B01'] },
    recentSummary: { hasHistory: true, mobilityGaps: [{ area: 'thoracic', gapDays: 6 }] },
    readiness: { fatigue: 4, yesterdayCourtMinutes: 120 },
    lang: 'zh',
  });
  assert.equal(activeWithHistory.length, 4);
  for (const item of activeWithHistory) {
    assert.ok(item.id && item.label && item.prompt);
  }
  assert.match(activeWithHistory[0].label, /28/);
  assert.match(activeWithHistory[1].prompt, /下肢弓步肌力/);
  assert.match(activeWithHistory[2].label, /疲勞/);

  const freshRestEn = buildCoachQuickPrompts({
    activeSession: { theme: 'Rest', sessionType: 'rest', routine: [] },
    recentSummary: { hasHistory: false, mobilityGaps: [] },
    readiness: null,
    lang: 'en',
  });
  assert.equal(freshRestEn.length, 4);
  assert.match(freshRestEn[0].label, /baseline/i);
  assert.match(freshRestEn[1].label, /rest/i);
  assert.match(freshRestEn[2].label, /balance/i);
});

test('normalizeCoachHistory filters invalid items, trims text, merges duplicate roles, caps turns, and starts with user', () => {
  const raw = [
    { role: 'model', text: 'Leading model greeting should be dropped' },
    { role: 'system', text: 'Invalid role ignored' },
    { role: 'user', text: '   ' },
    { role: 'user', text: 'First user line' },
    { role: 'user', text: 'Second consecutive user line' },
    { role: 'model', text: 'A'.repeat(4500) },
    { role: 'user', text: 'B'.repeat(2000) },
  ];

  const normalized = normalizeCoachHistory(raw);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].role, 'user');
  assert.equal(normalized[0].text, 'First user line\n\nSecond consecutive user line');
  assert.equal(normalized[1].role, 'model');
  assert.equal(normalized[1].text.length, 4000);
  assert.equal(normalized[2].role, 'user');
  assert.equal(normalized[2].text.length, MAX_USER_MESSAGE_CHARS);

  // Enforce maxTurns cap while ensuring result still starts with user
  const longThread = [];
  for (let i = 0; i < MAX_CHAT_TURNS + 5; i += 1) {
    longThread.push({ role: 'user', text: `User turn ${i}` });
    longThread.push({ role: 'model', text: `Model turn ${i}` });
  }
  const capped = normalizeCoachHistory(longThread);
  assert.equal(capped.length, MAX_CHAT_TURNS * 2);
  assert.equal(capped[0].role, 'user');
  assert.equal(capped.at(-1).text, `Model turn ${MAX_CHAT_TURNS + 4}`);
});

test('buildRefinementMessage summarizes draft without duplicating locked warmup IDs and stays <= 1800 chars', () => {
  const sessions = Array.from({ length: 28 }, (_, i) => ({
    date: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
    day: (i % 7) + 1,
    sessionType: i % 2 === 0 ? 'training' : 'recovery',
    theme: `羽球週期第 ${i + 1} 天訓練主題`,
    routine: [...DAILY_WARMUP_IDS, 'bf_B01', 'dead_bug'],
  }));

  const msg = buildRefinementMessage(sessions, '週三腿部改輕一點，多加肩胛穩定', 'zh', '右肩近期偶爾緊繃，避免過頭大重量');
  assert.ok(msg.length > 0 && msg.length <= MAX_REFINEMENT_MESSAGE_CHARS);
  assert.match(msg, /週三腿部改輕一點，多加肩胛穩定/);
  assert.match(msg, /右肩近期偶爾緊繃，避免過頭大重量/);
  assert.match(msg, /bf_B01/);
  assert.doesNotMatch(msg, /bf_A04/);

  const longOriginal = buildRefinementMessage(sessions, '調整負荷', 'en', 'Original injury note '.repeat(40));
  assert.ok(longOriginal.length <= MAX_REFINEMENT_MESSAGE_CHARS);
  assert.match(longOriginal, /Original athlete note:/);

  assert.equal(buildRefinementMessage(sessions, '   ', 'zh', 'ignored when feedback empty'), '');
});
