import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { dateForWeekDay, getWeekString } from '../src/domain/dates.js';

if (process.env.VITE_FIREBASE_PROJECT_ID !== 'demo-fitness-planner') throw new Error('Completion checks require the demo emulator project');
const today = dateForWeekDay(getWeekString(new Date(), -1), 1);
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', '5197'], { env: process.env, stdio: 'ignore' });
const site = 'http://127.0.0.1:5197/FunctionalFitnessPlanner/';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(site)).ok) break; } catch { /* Starting. */ } await pause(150); }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const lang of ['zh', 'en']) {
    const context = await browser.createBrowserContext(), page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluateOnNewDocument(({ today, lang }) => {
      localStorage.setItem('app_lang', lang);
      const NativeDate = Date, now = new NativeDate(`${today}T12:00:00`).getTime();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    }, { today, lang });
    let mode = 'pass', failures = 0; const held = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) && !['data:', 'blob:'].includes(url.protocol)) return request.abort();
      if (url.port === '8080' && request.method() === 'POST' && url.pathname.endsWith(':batchGet')) {
        if (mode === 'hold') { held.push(request); return; }
        if (mode === 'fail') {
          mode = 'pass'; failures++;
          return request.respond({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': new URL(site).origin, 'access-control-allow-credentials': 'true' }, body: JSON.stringify({ error: { code: 403, status: 'PERMISSION_DENIED', message: 'Controlled save failure' } }) });
        }
      }
      return request.continue();
    });
    const clickText = async text => {
      await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button => button.innerText.trim() === text), {}, text);
      await page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.innerText.trim() === text).click(), text);
    };
    const click = async selector => { const element = await page.waitForSelector(selector, { visible: true }); await element.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' })); await element.tap(); await element.dispose(); };
    await page.goto(site, { waitUntil: 'domcontentloaded' });
    await clickText(lang === 'zh' ? '設定' : 'Settings');
    await clickText(lang === 'zh' ? '免註冊，建立匿名帳號' : 'Create an anonymous account');
    await page.waitForFunction(async () => !!(await import('/FunctionalFitnessPlanner/src/services/firebase.js')).auth.currentUser);
    const ids = await page.evaluate(async today => {
      const { auth, db } = await import('/FunctionalFitnessPlanner/src/services/firebase.js');
      if (db.app.options.projectId !== 'demo-fitness-planner') throw new Error('Wrong project');
      const { catalogExercises } = await import('/FunctionalFitnessPlanner/src/domain/exerciseCatalog.js');
      const { generatePeriodPlan } = await import('/FunctionalFitnessPlanner/src/domain/periodPlanning.js');
      const { loadPeriodState, applyPeriodPlan } = await import('/FunctionalFitnessPlanner/src/services/periodRepository.js');
      const profile = { time: '40', focus: 'balanced', context: { healthStatus: 'unrestricted', equipment: ['dumbbell'], trainingDays: [1] } };
      const range = { from: today, to: today };
      const plan = generatePeriodPlan(catalogExercises(), profile, range, { today });
      const state = await loadPeriodState(auth.currentUser.uid, range);
      await applyPeriodPlan(auth.currentUser.uid, { ...plan, range, profile, expectedState: state.expectedState });
      return plan.sessions[0].routine.slice(0, 3);
    }, today);
    await clickText(lang === 'zh' ? '今天' : 'Today');
    const row = id => `[data-testid="daily-exercise-list"] [data-testid="exercise-row-${id}"]`;
    const check = id => `${row(id)} .exercise-row-check`;
    await page.waitForSelector(check(ids[0]));
    const heroBefore = await page.$eval('[data-testid="session-hero"] .eyebrow', element => element.innerText);
    mode = 'hold';
    const start = await page.evaluate(() => performance.now());
    await click(check(ids[0]));
    await page.waitForSelector(`${check(ids[0])}[aria-pressed="true"]`, { timeout: 2000 });
    const feedbackMs = await page.evaluate(start => performance.now() - start, start);
    await page.waitForSelector(`[data-testid="completion-status-${ids[0]}"]`);
    assert.equal(await page.$eval(check(ids[0]), element => element.disabled), true, 'only the pending checkbox prevents duplicate taps');
    assert.equal(await page.$eval(check(ids[1]), element => element.disabled), false, 'another exercise remains tappable');
    await click(check(ids[1]));
    await page.waitForSelector(`${check(ids[1])}[aria-pressed="true"]`);
    await pause(1200);
    assert.ok(held.length, 'the real Firestore transaction is still waiting on the network');
    assert.equal(await page.$$eval('[data-testid^="completion-status-"]', elements => elements.length), 2);
    assert.equal(await page.$eval('[data-testid="session-hero"] .eyebrow', element => element.innerText), heroBefore, 'pending intent does not inflate completed statistics');
    // Details reflect the same pending value and remain available during saving.
    await click(`${row(ids[0])} [data-testid="exercise-open-${ids[0]}"]`);
    await page.waitForSelector('dialog[open]');
    assert.equal(await page.$eval('dialog[open] [data-testid="current-exercise"] button[aria-pressed]', element => element.getAttribute('aria-pressed')), 'true');
    await click('dialog[open] [data-detail-close]');
    await clickText(lang === 'zh' ? '設定' : 'Settings');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => ['登出', 'Logout'].includes(button.innerText.trim())).disabled), true);
    await clickText(lang === 'zh' ? '今天' : 'Today');
    await page.waitForSelector(`[data-testid="completion-status-${ids[0]}"]`);
    mode = 'pass'; await Promise.all(held.splice(0).map(request => request.continue()));
    await page.waitForFunction(() => !document.querySelector('[data-testid^="completion-status-"]'), { timeout: 20000 });
    for (const id of ids.slice(0, 2)) assert.equal(await page.$eval(check(id), element => element.getAttribute('aria-pressed')), 'true');
    // Failed undo immediately flips, then restores the confirmed true value.
    mode = 'fail'; await click(check(ids[0]));
    await page.waitForSelector(`[data-testid="completion-status-${ids[0]}"][role="alert"]`, { timeout: 10000 }).catch(async error => { console.log({ failures, state: await page.$eval(row(ids[0]), element => element.innerText) }); throw error; });
    assert.equal(failures, 1);
    assert.equal(await page.$eval(check(ids[0]), element => element.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval(check(ids[0]), element => element.disabled), false);
    await click(check(ids[0]));
    await page.waitForFunction(() => !document.querySelector('[data-testid^="completion-status-"]'), { timeout: 20000 });
    assert.equal(await page.$eval(check(ids[0]), element => element.getAttribute('aria-pressed')), 'false');
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector(check(ids[1]));
    assert.equal(await page.$eval(check(ids[0]), element => element.getAttribute('aria-pressed')), 'false');
    assert.equal(await page.$eval(check(ids[1]), element => element.getAttribute('aria-pressed')), 'true');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ lang, feedbackMs: Math.round(feedbackMs), heldNetworkMs: 1200, sequentialTaps: 'passed', failureUndoAndRetry: 'passed', persistedReload: 'passed' }));
    await context.close();
  }
} finally { await browser?.close(); server.kill(); }
