import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const env = {
  ...process.env, NODE_ENV: 'test', VITE_USE_FIREBASE_EMULATORS: 'true',
  VITE_FIREBASE_PROJECT_ID: 'demo-fitness-planner', VITE_FIREBASE_API_KEY: 'demo-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-fitness-planner.firebaseapp.com',
  VITE_FIREBASE_APP_ID: '1:123:web:demo', VITE_APP_ID: 'my-fitness-app-yp',
};

export const DATA_TESTS = [
  'tests/integration/firestore.test.js',
  'tests/integration/training.test.js',
  'tests/integration/period.test.js',
  'tests/integration/sharedPlans.test.js',
  'tests/integration/savedWorkouts.test.js',
  'tests/integration/guestMigration.test.js',
  'tests/integration/plannerAdaptersV3.test.js',
];

export const CORE_BROWSER_TESTS = [
  'tests/integration/planShareDialog.browser.mjs',
  'tests/integration/savedWorkouts.browser.mjs',
  'tests/integration/assignmentSafety.browser.mjs',
  'scripts/usability-direct-day.mjs',
  'scripts/exercise-browser-smoke.mjs',
  'scripts/navigation-smoke.mjs',
  'scripts/workout-planner-smoke.mjs',
  'scripts/combo-local-operations-smoke.mjs',
  'scripts/completion-feedback-smoke.mjs',
];

export const EXTENDED_BROWSER_TESTS = [
  'scripts/planner-redesign-smoke.mjs',
  'scripts/ux-followup-review.mjs',
  'scripts/browser-smoke.mjs',
  'scripts/coaching-smoke.mjs',
  'scripts/selection-smoke.mjs',
  'scripts/period-smoke.mjs',
  'scripts/compact-smoke.mjs',
  'scripts/recovery-smoke.mjs',
  'scripts/coach-review-smoke.mjs',
  'scripts/targets-smoke.mjs',
  'scripts/planner-requests-smoke.mjs',
  'scripts/coach-guided-smoke.mjs',
  'scripts/performance-smoke.mjs',
];

async function run(args) {
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  const code = await new Promise(resolve => child.on('exit', resolve));
  if (code !== 0) process.exit(code || 1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = process.argv.slice(2);
  const dataOnly = args.includes('--data-only');
  const coreBrowserOnly = args.includes('--core-browser');
  const browserOnly = args.includes('--browser-only');

  if (dataOnly) {
    await run(['--test', '--test-concurrency=1', ...DATA_TESTS]);
  } else if (coreBrowserOnly) {
    for (const script of CORE_BROWSER_TESTS) await run([script]);
  } else {
    if (!browserOnly) await run(['--test', '--test-concurrency=1', ...DATA_TESTS]);
    for (const script of [...CORE_BROWSER_TESTS, ...EXTENDED_BROWSER_TESTS]) await run([script]);
  }
}
