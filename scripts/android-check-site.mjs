import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [origin = 'https://badminton-functional-fitness-planner.pages.dev', fixturePath] = process.argv.slice(2);
const base = new URL(origin);
assert.equal(base.protocol, 'https:');
assert.equal(base.username + base.password + base.port + base.search + base.hash, '');
assert.equal(base.pathname, '/');
assert.match(base.hostname, /^(?:[a-z0-9-]+\.)?badminton-functional-fitness-planner\.pages\.dev$/);
const temporary = mkdtempSync(join(tmpdir(), 'fitness-android-site-'));
try {
  function jsonAt(path, mime) {
    const file = join(temporary, path.replaceAll('/', '_'));
    // curl preserves the managed runtime's proxy/CA trust. No redirects are followed.
    const result = execFileSync('curl', ['--silent', '--show-error', '--fail', '--max-time', '30',
      '--proto', '=https', '--output', file, '--write-out', '%{http_code}\n%{content_type}\n',
      new URL(path, base).href], { encoding: 'utf8' }).trim().split('\n');
    assert.equal(result[0], '200', `${path} must return 200 without a redirect`);
    assert.match(result[1] || '', mime, `${path} has an incorrect Content-Type`);
    const json = JSON.parse(readFileSync(file, 'utf8'));
    console.log(`${path}: HTTP ${result[0]}, ${result[1]}, valid JSON`);
    return json;
  }
  const manifest = jsonAt('/manifest.webmanifest', /^application\/(?:manifest\+json|json)(?:;|$)/i);
  assert.equal(new URL(manifest.start_url, new URL('/manifest.webmanifest', base)).origin, base.origin);
  assert.equal(new URL(manifest.scope, new URL('/manifest.webmanifest', base)).href, `${base.origin}/`);
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
  const statements = jsonAt('/.well-known/assetlinks.json', /^application\/json(?:;|$)/i);
  assert.ok(Array.isArray(statements));
  if (fixturePath) {
    const [expected] = JSON.parse(readFileSync(fixturePath, 'utf8'));
    assert.ok(statements.some(statement =>
      statement.target?.namespace === 'android_app'
      && statement.target.package_name === expected.target.package_name
      && expected.target.sha256_cert_fingerprints.every(fingerprint => statement.target.sha256_cert_fingerprints?.includes(fingerprint))
      && statement.relation?.includes('delegate_permission/common.handle_all_urls')
    ), 'The deployed DAL must include this actual prototype APK certificate');
    console.log('Deployed DAL matches the prototype package and certificate fixture. Device verification still required.');
  } else {
    console.log(`DAL entries: ${statements.length}. Syntax/MIME checks do not prove TWA or App Links verification.`);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
