import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { DEFAULT_PLANNING_CONTEXT } from '../../src/domain/planning.js';
import { DAILY_WARMUP_IDS } from '../../src/domain/quickWorkouts.js';
import {
  MAX_CHAT_TURNS,
  MAX_COACH_CONTEXT_BYTES,
  MAX_REFINEMENT_MESSAGE_CHARS,
  MAX_USER_MESSAGE_CHARS,
  buildCoachChatSystemContext,
  buildCoachQuickPrompts,
  buildRefinementMessage,
  normalizeCoachHistory,
} from '../../src/domain/aiCoachChat.js';

const exercises = catalogExercises('zh');

test('buildCoachChatSystemContext embeds factual snapshot, safety rules, and stays <= 24KB', () => {
  const activeSession = {
    date: '2026-11-23',
    day: 1,
    theme: '羽球下肢分腿與核心穩定',
    sessionType: 'training',
    routine: ['bf_A04', 'bf_B01', 'dead_bug'],
    prescriptions: [
      { id: 'bf_A04', sets: 1, value: '6', unit: 'reps', restSeconds: 0, perSide: true, phase: 'warmup' },
      { id: 'bf_B01', sets: 3, value: '8', unit: 'reps', restSeconds: 60, perSide: true, phase: 'strength' },
      { id: 'dead_bug', sets: 2, value: '8', unit: 'reps', restSeconds: 45, perSide: true, phase: 'accessory' },
    ],
  };

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
  });

  assert.ok(Buffer.byteLength(context, 'utf8') <= MAX_COACH_CONTEXT_BYTES);
  assert.match(context, /2026-11-23/);
  assert.match(context, /羽球下肢分腿與核心穩定/);
  assert.match(context, /2026-12-20/);
  assert.match(context, /"completedCount":42/);
  assert.match(context, /醫療診斷/);
  assert.match(context, /不可編造/);
});

test('buildCoachChatSystemContext strictly enforces 24KB UTF-8 byte budget even with huge inputs', () => {
  const hugeExercises = { ...exercises };
  const hugeRoutine = [];
  for (let i = 0; i < 120; i += 1) {
    const id = `custom_huge_${i}`;
    hugeExercises[id] = {
      name: `超長自訂羽球動作名稱_${i}_${'爆發力與核心穩定'.repeat(20)}`,
      type: 'lower',
      tip: '提示'.repeat(100),
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
  });

  assert.ok(Buffer.byteLength(context, 'utf8') <= MAX_COACH_CONTEXT_BYTES);
  assert.match(context, /medical diagnoses/i);
  assert.match(context, /NEVER fabricate/i);
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
