// Generate a fixture from the ACTUAL APK certificate. Never deploy it to production.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';

const [apk, output] = process.argv.slice(2);
if (!apk || !output || !process.env.ANDROID_HOME) {
  throw new Error('Usage: ANDROID_HOME=... node scripts/android-association.mjs APK OUTPUT.json');
}
if (resolve(output).includes('/public/')) {
  throw new Error('Write the prototype fixture outside public/. Deploy explicitly to a test origin only.');
}
const tooling = JSON.parse(readFileSync(new URL('../android/prototype-tooling.json', import.meta.url), 'utf8'));
const signer = resolve(process.env.ANDROID_HOME, 'build-tools', tooling.androidBuildTools, 'apksigner');
const aapt = resolve(process.env.ANDROID_HOME, 'build-tools', tooling.androidBuildTools, 'aapt');
const certs = execFileSync(signer, ['verify', '--print-certs', apk], { encoding: 'utf8' });
const badging = execFileSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8' });
const packageName = badging.match(/^package: name='([^']+)'/m)?.[1];
const fingerprint = certs.match(/^Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})$/m)?.[1];
if (packageName !== 'io.github.vbnmzxc9513.functionalfitnessplanner.prototype' || !fingerprint) {
  throw new Error('Expected the signed Fitness Planner prototype APK');
}
const statement = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: packageName,
    sha256_cert_fingerprints: [fingerprint.toUpperCase().match(/.{2}/g).join(':')],
  },
}];
writeFileSync(output, `${JSON.stringify(statement, null, 2)}\n`);
console.log(`Prototype association fixture: ${output}`);
