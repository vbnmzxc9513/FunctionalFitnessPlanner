// Deterministic component integration: delayed ancillary writes, account scope and undo.
// This does not measure physical-device latency or write to a real account.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
const port = Number(process.env.COMBO_OPERATIONS_PORT || 5238), site = `http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', String(port)], { stdio: 'ignore', env: { ...process.env, SMOKE_DISABLE_HMR: '1' } });
let browser;
try {
  for (let n = 0; n < 100; n++) { try { if ((await fetch(site)).ok) break; } catch { /* starting */ } await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true); page.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else request.abort(); });
  await page.goto(site, { waitUntil: 'networkidle2' });
  await page.evaluate(async () => {
    const base = '/FunctionalFitnessPlanner';
    const mainSource = await (await fetch(`${base}/src/main.jsx`)).text();
    const reactURL = mainSource.match(/from "([^"]+\/react\.js\?[^"]+)"/)[1];
    const domURL = mainSource.match(/from "([^"]+\/react-dom_client\.js\?[^"]+)"/)[1];
    const [{ default: React }, { default: ReactDOM }, { default: ManualPlanner }, { catalogExercises }, { getQuickWorkouts }, { createWorkoutSnapshot }, { createManualSession }] = await Promise.all([
      import(reactURL), import(domURL), import(`${base}/src/components/ManualPlanner.jsx`), import(`${base}/src/domain/exerciseCatalog.js`), import(`${base}/src/domain/quickWorkouts.js`), import(`${base}/src/domain/savedWorkouts.js`), import(`${base}/src/domain/manualPlanner.js`),
    ]);
    document.querySelector('#root').style.display = 'none';
    const host = document.createElement('main'); document.body.append(host); const root = ReactDOM.createRoot(host);
    const exercises = catalogExercises('zh'); const warmup = getQuickWorkouts('zh').find(item => item.id === 'daily-warmup');
    const item = { id: 'saved-warmup', name: '常用暖身', snapshot: createWorkoutSnapshot(warmup, exercises), scope: 'selection', pinned: true, revision: 1 };
    window.pendingUses = [];
    const store = { items: [item], loaded: true, busy: true, scope: 'device', markUsed: () => new Promise((resolve, reject) => window.pendingUses.push({ resolve, reject })) };
    window.renderPlanner = uid => root.render(React.createElement(ManualPlanner, { uid, today: '2026-11-13', lang: 'zh', exercises, eligibleExercises: exercises, profile: { time: '120', context: { healthStatus: 'unrestricted', equipment: [] } }, initialSessions: [createManualSession('2026-11-16'), createManualSession('2026-11-18')], workoutStore: store }));
    window.renderPlanner('test-a');
  });
  const click = async selector => { const element = await page.waitForSelector(selector, { visible: true }); await element.click(); };
  // Use the domain key, avoiding assumptions about its account encoding.
  const sessions = uid => page.evaluate(async uid => { const { manualDraftStorageKey } = await import('/FunctionalFitnessPlanner/src/domain/manualPlanner.js'); return JSON.parse(localStorage.getItem(manualDraftStorageKey(uid))).sessions; }, uid);
  await click('[data-testid="manual-add-content"]');
  await click('dialog [data-testid="combo-add-saved-warmup"]');
  await page.waitForFunction(() => window.pendingUses.length === 1);
  assert.equal((await sessions('test-a'))[0].routine.length, 8, 'Draft addition completes while markUsed is unresolved and store.busy is true');
  await click('dialog [data-testid="combo-add-hip-internal-rotation"]');
  assert.equal((await sessions('test-a'))[0].routine.length, 10, 'Another combo can be added before ancillary write resolves');
  await click('dialog .combo-first-panel-footer button.manual-text-action');
  assert.equal((await sessions('test-a'))[0].routine.length, 8, 'Undo B retains A');
  await page.evaluate(() => window.pendingUses[0].reject(new Error('SIMULATED_NETWORK_FAILURE')));
  await page.waitForFunction(() => document.querySelector('dialog.combo-first-picker')?.textContent.includes('最近使用紀錄同步失敗'));
  assert.equal((await sessions('test-a'))[0].routine.length, 8, 'Ancillary failure does not roll back draft');
  await click('[data-testid="combo-panel-done"]');
  await click('[data-exercise-id="bf_A16"] button');
  const remove = await page.waitForSelector('button[aria-label="移除 嬰兒式動態後坐"]', { visible: true }); await remove.click();
  assert.equal((await sessions('test-a'))[0].routine.length, 7);
  await click('.manual-operation-notice button'); assert.equal((await sessions('test-a'))[0].routine.length, 8, 'Removal uses the same fresh parent undo');
  await click('[data-testid="manual-add-content"]'); await click('dialog [data-testid="combo-add-hip-internal-rotation"]'); await click('[data-testid="combo-panel-done"]');
  await click('.manual-session-heading summary');
  await page.$eval('[data-testid="manual-session-name"]', input => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '已修改名稱'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.$('.manual-operation-notice button'), null, 'Subsequent name edit invalidates earlier addition undo');
  await page.evaluate(() => window.renderPlanner('test-b'));
  await page.waitForFunction(() => document.querySelectorAll('.manual-exercise-row').length === 0);
  await click('[data-testid="manual-add-content"]'); await click('dialog [data-testid="combo-add-saved-warmup"]');
  await page.evaluate(() => window.renderPlanner('test-c'));
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  await page.evaluate(() => window.pendingUses[1].reject(new Error('OLD_ACCOUNT_REQUEST')));
  assert.equal((await sessions('test-c'))[0].routine.length, 0, 'Old account ancillary completion cannot write a new account draft');
  assert.equal((await sessions('test-b'))[0].routine.length, 8);
  assert.equal((await sessions('test-a'))[0].routine.length, 10);
  assert.ok(!await page.$eval('body', body => body.textContent.includes('OLD_ACCOUNT_REQUEST')));
  assert.deepEqual(errors, []);
  console.log('Delayed/failed markUsed, store.busy independence, continuous add, latest undo, removal undo, edit invalidation and account isolation passed.');
} finally { await browser?.close(); server.kill(); }
