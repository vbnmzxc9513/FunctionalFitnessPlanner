import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { signInAnonymously, signOut } from 'firebase/auth';
import { auth } from '../src/services/firebase.js';
import { createSharedPlan } from '../src/services/sharedPlanRepository.js';
import { createPlanPayload, encodePlanPayload } from '../src/domain/sharedPlans.js';
import { createSharePayload, encodeSharePayload } from '../src/domain/sharing.js';
import { DEFAULT_SCHEDULE_I18N } from '../src/locale.js';

if (process.env.NODE_ENV !== 'test' || process.env.VITE_USE_FIREBASE_EMULATORS !== 'true' || process.env.VITE_FIREBASE_PROJECT_ID !== 'demo-fitness-planner') throw new Error('This test requires the demo-fitness-planner Auth/Firestore emulators; run through scripts/integration.mjs.');

const port = Number(process.env.NAVIGATION_SMOKE_PORT || 5202);
const site = `http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', String(port)], { env: process.env, stdio: 'ignore' });
let browser, page;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(site)).ok) break; } catch { /* Server is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const days = DEFAULT_SCHEDULE_I18N.zh.slice(0, 1);
  const payload = createPlanPayload(days, { name: 'Navigation A' });
  const user = (await signInAnonymously(auth)).user;
  const id = await createSharedPlan(user.uid, payload);
  await signOut(auth);
  const fragments = [`#plan=${id}`, `#program=${encodePlanPayload(payload)}`, `#workout=${encodeSharePayload(createSharePayload(days[0]))}`];
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const click = async selector => { await page.waitForSelector(selector, { visible: true }); await page.click(selector); };
  const clickText = async text => {
    await page.waitForFunction(value => [...document.querySelectorAll('button')].some(el => el.textContent.trim() === value && el.getBoundingClientRect().height), {}, text);
    await page.evaluate(value => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === value && el.getBoundingClientRect().height).click(), text);
  };
  const back = async () => { await page.evaluate(() => history.back()); await new Promise(resolve => setTimeout(resolve, 150)); };
  for (const fragment of fragments) {
    await page.goto(`${site}${fragment}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.shared-plan-page');
    await page.waitForFunction(() => !!history.state?.__fitnessBackGuard);
    assert.equal(new URL(page.url()).hash, fragment, 'cold share fragment preserved');
    assert.equal(await page.evaluate(() => localStorage.getItem('fitness_date_period_v1')), null, 'preview does not apply');
    await clickText('返回我的課表');
    await page.waitForFunction(() => !location.hash);
    await back();
    assert.equal(new URL(page.url()).hash, '', 'UI close plus Back never resurrects cold share');
  }
  const payloadB = createPlanPayload([{ routine: ['bf_A13'] }], { name: 'Navigation B warmup' });
  const longPayload = createPlanPayload(Array.from({ length: 28 }, () => ({ routine: [] })), { name: 'Long navigation C' });
  for (const day of longPayload.days) {
    for (const item of payload.days[0].items) {
      day.items.push(item);
      try { encodePlanPayload(longPayload); } catch { day.items.pop(); break; }
    }
  }
  for (const day of longPayload.days) {
    while (day.name.length < 40) {
      day.name += '長';
      try { encodePlanPayload(longPayload); } catch { day.name = day.name.slice(0, -1); break; }
    }
  }
  const longFragment = `#program=${encodePlanPayload(longPayload)}`;
  assert.ok(longFragment.length > 13900 && longFragment.length <= 14009, 'valid near-limit 14000-character program');
  await page.goto(`${site}${fragments[1]}`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.shared-plan-page');
  await click('[data-testid="shared-plan-import"]'); await click('[data-testid="assignment-preview"]');
  await page.waitForSelector('[data-testid="assignment-apply"]');
  const warmLinks = [
    [`#program=${encodePlanPayload(payloadB)}`, 'Navigation B warmup', 1],
    [longFragment, 'Long navigation C', 28],
    [fragments[0], 'Navigation A', 1],
    [fragments[2], '分享的羽球體能課表', 1],
    [fragments[1], 'Navigation A', 1],
  ];
  for (const [fragment, title, dayCount] of warmLinks) {
    await page.evaluate(value => { location.hash = value; }, fragment);
    await page.waitForFunction((value, heading) => location.hash === value && document.querySelector('.shared-plan-hero h1')?.textContent === heading && !!history.state?.__fitnessBackGuard, {}, fragment, title);
    assert.equal(await page.$$eval('[data-testid^="shared-plan-day-"]', items => items.filter(item => item.tagName === 'DETAILS').length), dayCount);
    assert.equal(await page.$('[data-testid="assignment-apply"]'), null, 'new incoming link discards old confirmation');
    if (title === 'Navigation B warmup') {
      assert.equal(await page.$$eval('.shared-plan-day-content .shared-plan-phase article', items => items.length), 0);
      assert.ok((await page.$eval('.shared-plan-day-content', item => item.textContent)).includes('全身動態暖身'));
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('fitness_date_period_v1')), null, 'warm share does not apply');
  }
  await click('[data-testid="shared-plan-import"]'); await click('[data-testid="assignment-preview"]');
  await page.waitForSelector('[data-testid="assignment-apply"]');
  await back(); assert.ok(await page.$('[data-testid="assignment-preview"]'), 'Back from confirmation returns to dates');
  await back(); assert.ok(await page.$('.shared-plan-page'), 'Back from dates returns to share');
  assert.equal(await page.evaluate(() => localStorage.getItem('fitness_date_period_v1')), null, 'Back never confirms import');

  await page.goto(site, { waitUntil: 'networkidle2' });
  await clickText('課表'); await click('[data-testid="open-manual-planner"]');
  await click('[data-testid^="manual-date-"]:not([disabled])'); await click('[data-testid="manual-start"]');
  await click('[data-testid="manual-add-warmup"]');
  await click('[data-testid="batch-option-bf_A13"]'); await click('[data-testid="batch-picker-add"]');
  await click('[data-exercise-id="bf_A13"] button');
  await page.waitForSelector('dialog[open]');
  await back(); assert.equal(await page.$('dialog[open]'), null, 'Back closes exercise modal first');
  await click('[data-testid="manual-add-strength"]');
  await back(); assert.equal(await page.$('[data-testid="batch-exercise-picker"]'), null, 'Back closes picker');
  assert.ok(await page.$('[data-testid="session-plan-editor"]'), 'draft day remains open');
  const draft = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('fitness_manual'))?.[1]);
  await back(); await page.waitForSelector('[data-testid="planner-actions"]');
  assert.equal(await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('fitness_manual'))?.[1]), draft, 'Back retains manual draft');
  await back(); await page.waitForFunction(() => document.querySelector('.app-nav button[aria-current="page"]')?.textContent.trim() === '今天');
  assert.equal(await page.evaluate(() => localStorage.getItem('fitness_date_period_v1')), null, 'Back never applies draft');
  // Explicitly apply a test draft, then verify daily detail -> week -> root.
  await clickText('課表'); await click('[data-testid="open-manual-planner"]');
  await click('[data-testid="manual-review"]'); await click('[data-testid="assignment-preview"]');
  await click('[data-testid="assignment-apply"]');
  const appliedDate = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fitness_date_period_v1')).sessionsByDate)[0]);
  await page.waitForFunction(date => !!document.querySelector(`[data-testid="period-day-${date}"]`), {}, appliedDate);
  await page.evaluate(date => document.querySelector(`[data-testid="period-day-${date}"]`).click(), appliedDate);
  await page.waitForSelector('[data-testid="period-day-detail"]');
  const applied = await page.evaluate(() => localStorage.getItem('fitness_date_period_v1'));
  await click('[data-testid="period-day-detail"] .exercise-row button');
  await page.waitForSelector('dialog[open]'); await back();
  assert.ok(await page.$('[data-testid="period-day-detail"]'), 'modal Back retains daily view');
  await back(); assert.equal(await page.$('[data-testid="period-day-detail"]'), null, 'day Back returns to weekly overview');
  await back(); await page.waitForFunction(() => document.querySelector('.app-nav button[aria-current="page"]')?.textContent.trim() === '今天');
  assert.equal(await page.evaluate(() => localStorage.getItem('fitness_date_period_v1')), applied, 'Back never completes or modifies applied plan');
  await page.screenshot({ path: '/tmp/android-web-navigation-proof.png' });
  assert.deepEqual(errors, []);
  console.log('Navigation browser smoke passed: cold/warm #plan/#program/#workout, share exit, import cancellation, modal/picker/draft/week/root Back.');
} catch (error) {
  console.error('Navigation failure URL:', page?.url());
  if (page && !page.isClosed()) { console.error((await page.evaluate(() => document.body.innerText)).slice(-2500)); await page.screenshot({ path: '/tmp/android-web-navigation-failure.png' }); }
  throw error;
} finally { await browser?.close(); server.kill('SIGTERM'); await signOut(auth); }
