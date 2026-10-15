import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TRANSLATIONS } from '../../src/locale.js';
import { PROMOTION_TRANSLATIONS } from '../../src/promotionLocale.js';

test('planning and account entry text resolves in both languages without internal keys', async () => {
  const sources = await Promise.all(['Onboarding', 'Coach', 'LoginPrompt'].map(name => readFile(new URL(`../../src/components/${name}.jsx`, import.meta.url), 'utf8')));
  const usedKeys = new Set(sources.flatMap(source => [...source.matchAll(/\bt\('([^']+)'\)/g)].map(match => match[1])));
  for (const lang of ['zh', 'en']) {
    for (const key of usedKeys) {
      const value = PROMOTION_TRANSLATIONS[lang][key] ?? TRANSLATIONS[lang][key];
      assert.ok(value !== undefined && value !== key && value !== '', `${lang}: ${key}`);
    }
  }
  assert.deepEqual(Object.keys(PROMOTION_TRANSLATIONS.zh).sort(), Object.keys(PROMOTION_TRANSLATIONS.en).sort());
});

test('privacy notices distinguish free local planning, Gemini and each account storage state', () => {
  for (const lang of ['zh', 'en']) {
    const text = PROMOTION_TRANSLATIONS[lang];
    assert.match(text.byokDescription, /Gemini/);
    assert.match(text.templateDescription, lang === 'zh' ? /不會呼叫 AI/ : /does not call AI/);
    assert.match(text.accountStoragePublic, lang === 'zh' ? /本分頁/ : /this tab/);
    assert.match(text.accountStorageAnonymous, /Google/);
    assert.match(text.accountStorageGoogle, lang === 'zh' ? /跨裝置/ : /across devices/);
    assert.equal(new Set([text.accountStoragePublic, text.accountStorageAnonymous, text.accountStorageGoogle]).size, 3);
  }
});
