import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aiCustomExerciseError,
  buildCustomExercisePrompt,
  parseAiCustomExerciseDraft,
} from '../../src/domain/aiCustomExercise.js';
import { createCustomExercise } from '../../src/domain/customExercises.js';
import { EQUIPMENT } from '../../src/domain/exerciseCatalog.js';

test('buildCustomExercisePrompt includes exercise name, body parts, and equipment in zh and en', () => {
  const zh = buildCustomExercisePrompt({ name: '槓鈴羅馬尼亞硬舉', lang: 'zh' });
  assert.match(zh.userMessage, /槓鈴羅馬尼亞硬舉/);
  assert.match(zh.systemContext, /glutes/);
  assert.match(zh.systemContext, /hamstrings/);
  for (const eq of EQUIPMENT) {
    assert.ok(zh.systemContext.includes(eq), `missing equipment ${eq} in zh prompt`);
  }

  const en = buildCustomExercisePrompt({ name: 'Dumbbell Arnold Press', lang: 'en' });
  assert.match(en.userMessage, /Dumbbell Arnold Press/);
  assert.match(en.systemContext, /English/i);
  assert.match(en.systemContext, /shoulder/);
});

test('parseAiCustomExerciseDraft parses raw JSON and markdown-fenced JSON into valid custom exercise drafts', () => {
  const payload = {
    name: '啞鈴羅馬尼亞硬舉',
    purpose: 'training',
    bodyParts: ['hamstrings', 'glutes', 'back'],
    equipment: ['dumbbell'],
    description: '起始姿勢：雙腳與肩同寬、微彎膝蓋。\n動作要領：髖關節向後折疊，啞鈴貼近大腿下放。\n注意重點：保持脊椎中立，避免圓背。',
    prescription: {
      sets: 3,
      value: '8-12',
      unit: 'reps',
      restSeconds: 75,
      perSide: false,
    },
  };

  const direct = parseAiCustomExerciseDraft(JSON.stringify(payload), '羅馬尼亞硬舉');
  assert.equal(direct.name, '啞鈴羅馬尼亞硬舉');
  assert.equal(direct.purpose, 'training');
  assert.deepEqual(direct.bodyParts, ['hamstrings', 'glutes', 'back']);
  assert.deepEqual(direct.equipment, ['dumbbell']);
  assert.equal(direct.prescription.value, '8–12');
  assert.equal(direct.prescription.sets, 3);
  assert.equal(direct.prescription.restSeconds, 75);
  assert.equal(direct.prescription.perSide, false);
  const created = createCustomExercise(direct);
  assert.equal(created.manuallyCreated, true);
  assert.equal(created.tip, direct.description);

  const fenced = parseAiCustomExerciseDraft(`Here is the JSON:\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``, 'fallback');
  assert.equal(fenced.name, direct.name);
  assert.deepEqual(fenced.bodyParts, direct.bodyParts);
});

test('parseAiCustomExerciseDraft filters invalid bodyParts/equipment and clamps out-of-range dose values', () => {
  const noisy = {
    name: '  單腳箱跳\u0007  ',
    purpose: 'invalid_purpose',
    bodyParts: ['quadriceps', 'not_a_part', 'unclassified', 'glutes', 'calves', 'core'],
    equipment: ['platform', 'spaceship', 'platform'],
    description: '  保持膝蓋對齊腳尖落地。  ',
    prescription: {
      sets: 9,
      value: '150-200',
      unit: 'reps',
      restSeconds: 600,
      perSide: 1,
    },
  };

  const draft = parseAiCustomExerciseDraft(noisy, '單腳箱跳');
  assert.equal(draft.name, '單腳箱跳');
  assert.equal(draft.purpose, 'training');
  assert.deepEqual(draft.bodyParts, ['quadriceps', 'glutes', 'calves']);
  assert.deepEqual(draft.equipment, ['platform']);
  assert.equal(draft.prescription.sets, 5);
  assert.equal(draft.prescription.value, '100');
  assert.equal(draft.prescription.restSeconds, 300);
  assert.equal(draft.prescription.perSide, true);
  assert.doesNotThrow(() => createCustomExercise(draft));
});

test('parseAiCustomExerciseDraft falls back cleanly when optional fields are missing or malformed', () => {
  const minimal = parseAiCustomExerciseDraft({
    purpose: 'cooldown',
    bodyParts: [],
    equipment: [],
    prescription: { sets: null, value: 'bad', unit: 'unknown', restSeconds: '' },
  }, '鴿式伸展');

  assert.equal(minimal.name, '鴿式伸展');
  assert.equal(minimal.purpose, 'cooldown');
  assert.deepEqual(minimal.bodyParts, ['unclassified']);
  assert.deepEqual(minimal.equipment, []);
  assert.equal(minimal.prescription.sets, 1);
  assert.equal(minimal.prescription.unit, 'seconds');
  assert.equal(minimal.prescription.value, '30');
  assert.equal(minimal.prescription.restSeconds, 0);
  assert.doesNotThrow(() => createCustomExercise(minimal));
});

test('parseAiCustomExerciseDraft rejects empty or non-JSON responses', () => {
  assert.throws(() => parseAiCustomExerciseDraft('', '深蹲'), /AI_EXERCISE_EMPTY/);
  assert.throws(() => parseAiCustomExerciseDraft('not valid json at all', '深蹲'), /AI_EXERCISE_PARSE_FAILED/);
  assert.throws(() => parseAiCustomExerciseDraft({}, ''), /CUSTOM_NAME/);
});

test('aiCustomExerciseError returns bilingual messages for known and unknown codes', () => {
  assert.match(aiCustomExerciseError(new Error('CUSTOM_NAME'), 'zh'), /動作名稱/);
  assert.match(aiCustomExerciseError(new Error('CUSTOM_NAME'), 'en'), /exercise name/i);
  assert.match(aiCustomExerciseError(new Error('AI_NOT_CONFIGURED'), 'zh'), /API Key|手動/);
  assert.match(aiCustomExerciseError(new Error('AI_NOT_CONFIGURED'), 'en'), /manually/i);
  assert.match(aiCustomExerciseError(new Error('AI_MEMBER_DAILY_LIMIT'), 'zh'), /額度/);
  assert.match(aiCustomExerciseError(new Error('API_KEY_INVALID'), 'en'), /invalid/i);
  assert.match(aiCustomExerciseError(new Error('SOMETHING_ELSE'), 'zh'), /生成失敗/);
  assert.match(aiCustomExerciseError(new Error('SOMETHING_ELSE'), 'en'), /generation failed/i);
});
