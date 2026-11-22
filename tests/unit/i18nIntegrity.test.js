import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTranslator } from '../../src/i18n/index.js';
import { TRANSLATIONS } from '../../src/locale.js';
import { PROMOTION_TRANSLATIONS } from '../../src/i18n/promotion.js';
import { UX_TRANSLATIONS } from '../../src/i18n/ux.js';
import { EXPORT_TEXT } from '../../src/i18n/export.js';
import { LIBRARY_TEXT } from '../../src/i18n/library.js';
import { SAVED_WORKOUTS_TEXT } from '../../src/i18n/savedWorkouts.js';
import { SELECTION_TRANSLATIONS } from '../../src/i18n/selection.js';
import { WEEK_PLAN_TEXT } from '../../src/i18n/weekPlan.js';
import { WEEKLY_BALANCE_TEXT } from '../../src/i18n/weeklyBalance.js';
import { coachText } from '../../src/i18n/coach.js';
import { coachPlanningText } from '../../src/i18n/coachPlanning.js';
import { journeyText } from '../../src/i18n/journey.js';
import { periodText, periodQuestionnaireText } from '../../src/i18n/period.js';
import { getCachedExerciseGuides, loadExerciseGuides } from '../../src/data/exerciseGuidesLoader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function assertParity(name, zhMap, enMap) {
  const zhKeys = Object.keys(zhMap).sort();
  const enKeys = Object.keys(enMap).sort();
  assert.deepEqual(zhKeys, enKeys, `${name}: zh and en keys must match`);
  for (const key of zhKeys) {
    const zhVal = zhMap[key];
    const enVal = enMap[key];
    if (typeof zhVal === 'string') {
      assert.ok(zhVal.trim().length > 0, `${name}.zh.${key} must be non-empty`);
      assert.ok(typeof enVal === 'string' && enVal.trim().length > 0, `${name}.en.${key} must be non-empty string`);
    } else if (Array.isArray(zhVal)) {
      assert.ok(Array.isArray(enVal) && zhVal.length === enVal.length && zhVal.length > 0, `${name}.${key} array parity`);
    } else if (zhVal && typeof zhVal === 'object') {
      assert.ok(enVal && typeof enVal === 'object', `${name}.${key} object parity`);
      assertParity(`${name}.${key}`, zhVal, enVal);
    }
  }
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(full));
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

test('createTranslator handles fallback precedence, 7-day dayShort normalization, and unknown key passthrough', () => {
  const tZh = createTranslator('zh');
  const tEn = createTranslator('en');
  const tFallback = createTranslator('fr');

  // UX overrides TRANSLATIONS when both define the same key (e.g., navTrain)
  assert.equal(tZh('navTrain'), UX_TRANSLATIONS.zh.navTrain);
  assert.notEqual(UX_TRANSLATIONS.zh.navTrain, TRANSLATIONS.zh.navTrain);
  assert.equal(tEn('navTrain'), UX_TRANSLATIONS.en.navTrain);

  // PROMOTION overrides TRANSLATIONS if present or provides promotion-only keys
  assert.equal(tZh('promoLoginTitle'), PROMOTION_TRANSLATIONS.zh.promoLoginTitle);
  assert.equal(tEn('promoLoginTitle'), PROMOTION_TRANSLATIONS.en.promoLoginTitle);

  // Falls back to TRANSLATIONS
  assert.equal(tZh('appTitle'), TRANSLATIONS.zh.appTitle);
  assert.equal(tEn('appTitle'), TRANSLATIONS.en.appTitle);

  // 7-day dayShort normalization from 5-day TRANSLATIONS.dayShort
  assert.equal(TRANSLATIONS.zh.dayShort.length, 5);
  assert.deepEqual(tZh('dayShort'), ['週一', '週二', '週三', '週四', '週五', '週六', '週日']);
  assert.deepEqual(tEn('dayShort'), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

  // Unknown key passes through verbatim
  assert.equal(tZh('nonExistentTranslationKeyXYZ'), 'nonExistentTranslationKeyXYZ');
  assert.equal(tEn('nonExistentTranslationKeyXYZ'), 'nonExistentTranslationKeyXYZ');

  // Unsupported language code falls back to zh
  assert.equal(tFallback('appTitle'), TRANSLATIONS.zh.appTitle);
});

test('all src/i18n/ modules have matching non-empty zh and en entries and valid translator helpers', async () => {
  assertParity('UX_TRANSLATIONS', UX_TRANSLATIONS.zh, UX_TRANSLATIONS.en);
  assertParity('PROMOTION_TRANSLATIONS', PROMOTION_TRANSLATIONS.zh, PROMOTION_TRANSLATIONS.en);
  assertParity('EXPORT_TEXT', EXPORT_TEXT.zh, EXPORT_TEXT.en);
  assertParity('LIBRARY_TEXT', LIBRARY_TEXT.zh, LIBRARY_TEXT.en);
  assertParity('SAVED_WORKOUTS_TEXT', SAVED_WORKOUTS_TEXT.zh, SAVED_WORKOUTS_TEXT.en);
  assertParity('SELECTION_TRANSLATIONS', SELECTION_TRANSLATIONS.zh, SELECTION_TRANSLATIONS.en);
  assertParity('WEEK_PLAN_TEXT', WEEK_PLAN_TEXT.zh, WEEK_PLAN_TEXT.en);
  assertParity('WEEKLY_BALANCE_TEXT', WEEKLY_BALANCE_TEXT.zh, WEEKLY_BALANCE_TEXT.en);
  assertParity('TRANSLATIONS', TRANSLATIONS.zh, TRANSLATIONS.en);

  // Verify function-based i18n modules return distinct non-empty localized strings for zh and en
  assert.ok(coachText('zh', 'logTitle') && coachText('en', 'logTitle') && coachText('zh', 'logTitle') !== coachText('en', 'logTitle'));
  assert.ok(coachPlanningText('zh', 'focus') && coachPlanningText('en', 'focus') && coachPlanningText('zh', 'focus') !== coachPlanningText('en', 'focus'));
  assert.ok(journeyText('zh', 'today') && journeyText('en', 'today') && journeyText('zh', 'today') !== journeyText('en', 'today'));
  assert.ok(periodText('zh')('title') && periodText('en')('title') && periodText('zh')('title') !== periodText('en')('title'));
  const tZh = createTranslator('zh');
  assert.equal(periodQuestionnaireText('zh', tZh)('quizGoalTitle') !== 'quizGoalTitle', true);
  assert.equal(periodQuestionnaireText('zh', tZh)('appTitle'), TRANSLATIONS.zh.appTitle);

  // Verify internal zh/en dictionaries inside function-only modules also match key-for-key
  const [coachSrc, cpSrc, journeySrc, periodSrc] = await Promise.all([
    fs.readFile(path.join(ROOT, 'src/i18n/coach.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'src/i18n/coachPlanning.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'src/i18n/journey.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'src/i18n/period.js'), 'utf8'),
  ]);
  const { strings, additions } = new Function(`${coachSrc.replace(/export function coachText[\s\S]*/, '')}\nreturn { strings, additions };`)();
  assertParity('coach.strings', strings.zh, strings.en);
  assertParity('coach.additions', additions.zh, additions.en);

  const { copy: cpZh, en: cpEn } = new Function(`${cpSrc.replace(/export const coachPlanningText[\s\S]*/, '')}\nreturn { copy, en };`)();
  assertParity('coachPlanning', cpZh, cpEn);

  const { messages } = new Function(`${journeySrc.replace(/export function journeyText[\s\S]*/, '')}\nreturn { messages };`)();
  assertParity('journey', messages.zh, messages.en);

  const { copy: pCopy, questionnaireCopy } = new Function(`${periodSrc.replace(/export const periodText[\s\S]*?;\n/, '').replace(/export const periodQuestionnaireText[\s\S]*/, '')}\nreturn { copy, questionnaireCopy };`)();
  assertParity('period.copy', pCopy.zh, pCopy.en);
  assertParity('period.questionnaireCopy', questionnaireCopy.zh, questionnaireCopy.en);
});

test('no remaining references to deleted src/*Locale.js files exist in src/ or tests/', async () => {
  const files = [
    ...await listFiles(path.join(ROOT, 'src')),
    ...await listFiles(path.join(ROOT, 'tests')),
  ];
  const offenders = [];
  for (const file of files) {
    if (file.endsWith('i18nIntegrity.test.js')) continue;
    const text = await fs.readFile(file, 'utf8');
    if (/[A-Za-z]Locale\.js/.test(text)) {
      offenders.push(path.relative(ROOT, file));
    }
  }
  assert.deepEqual(offenders, [], `Found stale *Locale.js references: ${offenders.join(', ')}`);
});

test('loadExerciseGuides caches the dynamic module promise and resolves guide helpers', async () => {
  assert.equal(getCachedExerciseGuides(), null);
  const first = loadExerciseGuides();
  const second = loadExerciseGuides();
  assert.strictEqual(first, second, 'in-flight promise must be cached across concurrent callers');

  const mod = await first;
  assert.strictEqual(getCachedExerciseGuides(), mod);
  assert.equal(typeof mod.getExerciseGuide, 'function');
  assert.ok(mod.EXERCISE_GUIDES && mod.GUIDE_TEXT);
  assert.equal(mod.GUIDE_TEXT.zh.title, '動作說明');
  assert.equal(mod.GUIDE_TEXT.en.title, 'Movement guide');
  assert.equal(mod.getExerciseGuide('bf_A12', {}, 'en').guide.steps.length, 8);

  const resolvedAgain = await loadExerciseGuides();
  assert.strictEqual(resolvedAgain, mod, 'resolved module must remain cached');
});
