import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_TESTS, CORE_BROWSER_TESTS, EXTENDED_BROWSER_TESTS } from '../../scripts/integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const IMPORT_RE = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function extractRelativeSpecifiers(source) {
  const specs = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1] || match[2];
    if (spec && (spec.startsWith('./') || spec.startsWith('../'))) {
      specs.push(spec);
    }
  }
  return specs;
}

test('scripts/integration.mjs references only existing test and smoke script files with zero duplicates', () => {
  const allSuites = [...DATA_TESTS, ...CORE_BROWSER_TESTS, ...EXTENDED_BROWSER_TESTS];
  assert.equal(DATA_TESTS.length, 7);
  assert.equal(CORE_BROWSER_TESTS.length, 9);
  assert.equal(EXTENDED_BROWSER_TESTS.length, 13);
  assert.equal(new Set(allSuites).size, allSuites.length, 'integration tiers must not duplicate suites');

  for (const relativePath of allSuites) {
    assert.match(relativePath, /^(tests\/integration|scripts)\/.+\.(test\.js|browser\.mjs|mjs)$/);
    const fullPath = path.join(ROOT, relativePath);
    assert.equal(existsSync(fullPath), true, `Missing integration suite referenced by scripts/integration.mjs: ${relativePath}`);
  }
});

test('functions/build-shared.mjs copies every transitive src/domain and src/data import required by functions/index.js', async () => {
  const functionsIndexSource = await readFile(path.join(ROOT, 'functions', 'index.js'), 'utf8');
  const buildSharedSource = await readFile(path.join(ROOT, 'functions', 'build-shared.mjs'), 'utf8');

  const sharedEntries = extractRelativeSpecifiers(functionsIndexSource)
    .filter(spec => spec.startsWith('./shared/'))
    .map(spec => path.resolve(ROOT, 'src', spec.slice('./shared/'.length)));

  assert.ok(sharedEntries.length > 0, 'functions/index.js should import at least one ./shared/ module');

  const visited = new Set();
  const queue = [...sharedEntries];
  while (queue.length > 0) {
    const filePath = queue.shift();
    if (visited.has(filePath)) continue;
    visited.add(filePath);
    assert.equal(existsSync(filePath), true, `Missing shared dependency source file: ${path.relative(ROOT, filePath)}`);
    if (!filePath.endsWith('.js') && !filePath.endsWith('.mjs')) continue;
    const source = await readFile(filePath, 'utf8');
    for (const spec of extractRelativeSpecifiers(source)) {
      const target = path.resolve(path.dirname(filePath), spec);
      queue.push(target);
    }
  }

  const copiedDomainFiles = new Set();
  const domainArrayMatch = buildSharedSource.match(/for\s*\(\s*const\s+file\s+of\s*\[([^\]]+)\]/s);
  assert.ok(domainArrayMatch, 'functions/build-shared.mjs domain copy array not found');
  for (const match of domainArrayMatch[1].matchAll(/'([^']+)'/g)) {
    copiedDomainFiles.add(match[1]);
  }

  const copiedDataFiles = new Set();
  for (const match of buildSharedSource.matchAll(/copyFile\([^)]*'data',\s*'([^']+)'/g)) {
    copiedDataFiles.add(match[1]);
  }

  const domainPrefix = path.join(ROOT, 'src', 'domain') + path.sep;
  const dataPrefix = path.join(ROOT, 'src', 'data') + path.sep;
  for (const requiredFile of visited) {
    if (requiredFile.startsWith(domainPrefix)) {
      const name = requiredFile.slice(domainPrefix.length);
      assert.equal(copiedDomainFiles.has(name), true, `functions/build-shared.mjs is missing transitive domain file: ${name}`);
    } else if (requiredFile.startsWith(dataPrefix)) {
      const name = requiredFile.slice(dataPrefix.length);
      assert.equal(copiedDataFiles.has(name), true, `functions/build-shared.mjs is missing transitive data file: ${name}`);
    } else {
      assert.fail(`Unexpected shared dependency outside src/domain or src/data: ${path.relative(ROOT, requiredFile)}`);
    }
  }
});
