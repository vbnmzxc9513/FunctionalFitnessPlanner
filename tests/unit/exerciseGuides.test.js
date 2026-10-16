import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_GUIDES, GUIDE_TEXT, getExerciseGuide } from '../../src/data/exerciseGuides.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';

const catalog = catalogExercises();

test('movement guides match real catalog identities, including the legacy dead_bug identity', () => {
  assert.equal(Object.keys(EXERCISE_GUIDES).length, 21);
  for (const [code, guide] of Object.entries(EXERCISE_GUIDES)) {
    assert.equal(catalog[guide.id]?.catalogCode, code, `${code} must describe its actual catalog movement`);
    assert.deepEqual(getExerciseGuide(guide.id, catalog[guide.id]).guide, guide.zh);
    // The guide must not introduce an independent prescription or overwrite catalog data.
    assert.deepEqual(Object.keys(guide).sort(), ['en', 'id', 'zh']);
  }
  assert.equal(getExerciseGuide('dead_bug', catalog.dead_bug, 'en').guide.start, EXERCISE_GUIDES.D01.en.start);
  assert.equal(getExerciseGuide('bf_D01', {}).guide, null);
});

test('both languages cover starting position, actionable steps, common errors and an easier option', () => {
  for (const guide of Object.values(EXERCISE_GUIDES)) {
    for (const lang of ['zh', 'en']) {
      assert.deepEqual(Object.keys(guide[lang]).sort(), ['easier', 'mistake', 'start', 'steps']);
      for (const key of ['start', 'mistake', 'easier']) assert.ok(guide[lang][key].trim().length >= 6, `${guide.id} ${lang} ${key}`);
      assert.ok(guide.id === 'bf_A12' ? guide[lang].steps.length === 8 : guide[lang].steps.length >= 2 && guide[lang].steps.length <= 3);
      for (const step of guide[lang].steps) assert.ok(step.trim().length > 10);
    }
  }
  assert.deepEqual(Object.keys(GUIDE_TEXT.zh).sort(), Object.keys(GUIDE_TEXT.en).sort());
  assert.match(GUIDE_TEXT.zh.safety, /疼痛.*停止/);
  assert.match(GUIDE_TEXT.en.safety, /Stop for pain/);
});

test('unknown and custom movements use their own cue without borrowing another movement guide', () => {
  const custom = { id: 'custom_1', catalogCode: 'B01', tip: 'My coach’s custom cue.' };
  const result = getExerciseGuide(custom.id, custom, 'en');
  assert.equal(result.guide, null);
  assert.equal(result.tip, custom.tip);
  assert.match(result.text.fallback, /not available/);
  assert.equal(getExerciseGuide('unlisted', {}, 'en').tip, GUIDE_TEXT.en.noTip);
  assert.equal(getExerciseGuide(undefined, { id: 'bf_B01' }, 'en').guide, EXERCISE_GUIDES.B01.en);
  assert.equal(getExerciseGuide('bf_B01', {}, 'unsupported').guide, EXERCISE_GUIDES.B01.zh);
});
