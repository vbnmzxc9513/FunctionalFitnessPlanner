import { spawn } from 'node:child_process';

const env = {
  ...process.env, NODE_ENV: 'test', VITE_USE_FIREBASE_EMULATORS: 'true',
  VITE_FIREBASE_PROJECT_ID: 'demo-fitness-planner', VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-fitness-planner.firebaseapp.com',
  VITE_FIREBASE_APP_ID: '1:123:web:demo', VITE_APP_ID: 'my-fitness-app-yp',
};
async function run(args) {
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  const code = await new Promise(resolve => child.on('exit', resolve));
  if (code !== 0) process.exit(code || 1);
}
if (!process.argv.includes('--browser-only')) await run(['--test', '--test-concurrency=1', 'tests/integration/firestore.test.js', 'tests/integration/training.test.js', 'tests/integration/period.test.js']);
await run(['scripts/browser-smoke.mjs']);
await run(['scripts/coaching-smoke.mjs']);
await run(['scripts/selection-smoke.mjs']);
await run(['scripts/period-smoke.mjs']);

await run(['scripts/compact-smoke.mjs']);
await run(['scripts/recovery-smoke.mjs']);
