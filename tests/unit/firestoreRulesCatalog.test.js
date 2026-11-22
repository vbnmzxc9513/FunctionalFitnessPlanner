import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';

function topLevelAlternations(pattern) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '|' && depth === 0) {
      parts.push(pattern.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(pattern.slice(start));
  return parts;
}

test('firestore.rules publicCatalogId regex matches catalogExercises() if and only if in catalog', async () => {
  const rules = await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const match = rules.match(/function publicCatalogId\(id\)\s*\{[\s\S]*?id\.matches\('([^']+)'\)/);
  assert.ok(match, 'publicCatalogId(id) regex must exist in firestore.rules');
  const pattern = match[1];
  const regex = new RegExp(pattern);

  const catalog = catalogExercises();
  const catalogIds = Object.keys(catalog);
  assert.ok(catalogIds.length > 0);

  for (const id of catalogIds) {
    assert.equal(regex.test(id), true, `Catalog ID ${id} should match publicCatalogId regex`);
  }

  const innerMatch = pattern.match(/^\^\((.+)\)\$$/);
  assert.ok(innerMatch, 'publicCatalogId regex must be anchored ^(...)$');
  const nonBfLiterals = topLevelAlternations(innerMatch[1]).filter(part => !part.startsWith('bf_'));
  assert.ok(nonBfLiterals.length > 0, 'Expected non-bf_ literal alternations in publicCatalogId');
  for (const id of nonBfLiterals) {
    assert.match(id, /^[a-z0-9_]+$/, `Non-bf_ literal ${id} should be a plain identifier`);
    assert.equal(Object.hasOwn(catalog, id), true, `Non-bf_ literal ${id} must exist in catalogExercises()`);
  }
  const nonBfCatalogIds = catalogIds.filter(id => !id.startsWith('bf_')).sort();
  assert.deepEqual([...nonBfLiterals].sort(), nonBfCatalogIds, 'Non-bf_ regex literals must bijectively match non-bf_ catalog IDs');

  for (const letter of 'ABCDEFGHI') {
    for (let num = 0; num <= 99; num++) {
      const id = `bf_${letter}${String(num).padStart(2, '0')}`;
      const expected = Object.hasOwn(catalog, id);
      assert.equal(regex.test(id), expected, `ID ${id} expected ${expected} in catalog`);
    }
  }

  for (const invalid of ['', 'custom_1', 'bf_Z01', 'squat', 'bf_B12', 'bf_C15', 'bf_D01']) {
    assert.equal(regex.test(invalid), false, `Invalid ID ${JSON.stringify(invalid)} must not match`);
  }
});
