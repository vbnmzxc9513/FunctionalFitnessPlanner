import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_DIR = path.join(ROOT_DIR, 'src');

async function collectFiles(dir, predicate) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

test('src/styles/tokens.css defines --brand-primary: #0369a1 and is imported by src/index.css', async () => {
  const tokensPath = path.join(SRC_DIR, 'styles', 'tokens.css');
  const tokensCss = await readFile(tokensPath, 'utf8');
  assert.match(tokensCss, /--brand-primary:\s*#0369a1\s*;/);
  assert.match(tokensCss, /:root\s*\{/);

  const indexCss = await readFile(path.join(SRC_DIR, 'index.css'), 'utf8');
  assert.match(
    indexCss,
    /@import\s+["']tailwindcss["']\s*;\s*\n\s*@import\s+["']\.\/styles\/tokens\.css["']\s*;/,
  );
});

test('no retired purple hex literals or --workout-purple identifier exist in src/**/*.css', async () => {
  const cssFiles = await collectFiles(SRC_DIR, name => name.endsWith('.css'));
  assert.ok(cssFiles.length > 0);

  const forbiddenPattern = /(#4934d6|#6d28d9|#7c3aed|#5b21b6|--workout-purple)/i;
  for (const cssFile of cssFiles) {
    const content = await readFile(cssFile, 'utf8');
    const match = content.match(forbiddenPattern);
    assert.equal(
      match,
      null,
      `Found retired purple token/hex ${match?.[0]} in ${path.relative(ROOT_DIR, cssFile)}`,
    );
  }
});

test('every relative .css import across src/**/*.{js,jsx} resolves to an existing file', async () => {
  const jsFiles = await collectFiles(SRC_DIR, name => name.endsWith('.js') || name.endsWith('.jsx'));
  assert.ok(jsFiles.length > 0);

  const importPattern = /(?:import\s+|from\s+)['"](\.[^'"]+\.css)['"]/g;
  let importCount = 0;

  for (const jsFile of jsFiles) {
    const content = await readFile(jsFile, 'utf8');
    for (const match of content.matchAll(importPattern)) {
      importCount++;
      const resolved = path.resolve(path.dirname(jsFile), match[1]);
      await assert.doesNotReject(
        () => access(resolved),
        `Broken CSS import "${match[1]}" in ${path.relative(ROOT_DIR, jsFile)}`,
      );
    }
  }

  assert.ok(importCount > 0, 'Expected at least one relative .css import in src/');
});
