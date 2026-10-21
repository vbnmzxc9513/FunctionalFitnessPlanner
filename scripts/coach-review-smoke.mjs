import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { catalogExercises } from '../src/domain/exerciseCatalog.js';
import { classifyBalanceExercise } from '../src/domain/weeklyBalance.js';

const site = 'http://127.0.0.1:5185/FunctionalFitnessPlanner/';
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', '5185'], { env: process.env, stdio: 'ignore' });
const exercises = catalogExercises();
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(site)).ok) break; } catch { /* Starting. */ } await new Promise(resolve => setTimeout(resolve, 200)); }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, lang, width] of [['desktop', 'en', 1280], ['mobile', 'zh', 390]]) for (const state of ['normal', 'reduce', 'recover']) {
    const context = await browser.createBrowserContext(), page = await context.newPage(); const errors = []; let external = 0;
    await page.setViewport({ width, height: 844, isMobile: layout === 'mobile', hasTouch: layout === 'mobile' });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(lang => {
      localStorage.setItem('app_lang', lang);
      const NativeDate = Date, now = new NativeDate('2026-10-19T12:00:00').getTime();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    }, lang);
    page.on('pageerror', error => errors.push(error.message)); await page.setRequestInterception(true);
    page.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else { external++; request.abort(); } });
    const click = async selector => { const el = await page.waitForSelector(selector, { visible: true }); await el.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await el.click(); await el.dispose(); };
    const fill = async (selector, value) => { const el = await page.waitForSelector(selector, { visible: true }); await el.evaluate((item, value) => { const prototype = item.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(item, value); item.dispatchEvent(new Event('input', { bubbles: true })); item.dispatchEvent(new Event('change', { bubbles: true })); }, value); await el.dispose(); };
    await page.goto(site, { waitUntil: 'networkidle2' }); await page.waitForSelector('[data-testid="planning-range"]');
    await fill('[data-testid="planning-range"] input:first-of-type', '2026-10-19');
    await page.$$eval('[data-testid="planning-range"] input', inputs => { const item = inputs[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(item, '2026-10-23'); item.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('[data-testid="planning-range-continue"]'); await fill('[data-testid="planner-form"] input[type="number"]', '35');
    if (!await page.$eval('[data-testid="quiz-schedule"]', item => item.open)) await click('[data-testid="quiz-schedule"] > summary');
    for (const day of [2, 3, 5]) await click(`[data-testid="quiz-schedule"] fieldset:first-of-type label:nth-of-type(${day})`);
    await fill('[data-testid="court-load-fields"] input', '90'); await page.select('[data-testid="court-load-fields"] select', 'mixed');
    await click('[data-testid="quiz-equipment"] > summary');
    for (const index of [1, 2, 3]) await click(`[data-testid="quiz-equipment"] label:nth-of-type(${index})`);
    await click('[data-testid="setup-next"]'); await page.select('[data-testid="recovery-state"]', state);
    // Explicit normal and compound positive notes must not be classified as fatigue.
    if (state === 'normal') await fill('[data-testid="recovery-notes"]', '睡得很好，沒有疲勞');
    await click('[data-testid="warmup-familiar"]'); await click('[data-testid="setup-next"]');
    assert.ok(await page.$eval('[data-testid="review-planning-conditions"]', item => item.innerText.includes('90')));
    await click('[data-testid="plan-preview-create"]'); await page.waitForSelector('[data-testid="period-plan-preview"]');
    await click('[data-testid="period-plan-conditions"] > summary');
    assert.ok(await page.$eval('[data-testid="planning-conditions"]', item => item.innerText.includes('90')));
    await click('[data-testid="period-day-2026-10-19"]');
    await click('[data-testid="period-day-detail"] > details > summary');
    assert.ok(await page.$eval('[data-testid="period-day-reason"]', item => item.innerText.trim().length > 0));
    assert.ok(await page.$('[data-testid="exercise-open-bf_A13"]'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await click('[data-testid="period-day-detail"] > button');
    await page.waitForSelector('[data-testid="period-plan-apply"]', { visible: true });
    if (layout === 'mobile') {
      assert.ok(await page.$eval('.preview-actions', item => item.getBoundingClientRect().height < 110), 'mobile actions remain compact');
      await page.setViewport({ width: 320, height: 844, isMobile: true, hasTouch: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true });
    }
    await click('[data-testid="period-plan-apply"]'); await page.waitForFunction(() => !!localStorage.getItem('fitness_date_period_v1'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')));
    assert.equal(saved.profile.context.recoveryState, state); assert.equal(saved.profile.context.warmupFamiliar, true);
    const days = Object.values(saved.sessionsByDate), doses = days.flatMap(day => day.prescriptions.filter(dose => dose.phase === 'strength'));
    assert.ok(days.every(day => day.routine[0] === 'bf_A13' && !day.routine.some(id => ['bf_A01', 'bf_I01'].includes(id))));
    if (state === 'recover') assert.equal(doses.length, 0);
    else {
      const patterns = new Set(doses.flatMap(dose => classifyBalanceExercise(dose.id, exercises[dose.id]).patterns));
      assert.ok(patterns.has('push') && patterns.has('pull'));
      if (state === 'normal') assert.ok(patterns.has('squat_lunge') && patterns.has('hinge'));
      else assert.ok(doses.length < 4);
    }
    const snapshot = structuredClone(saved);
    await page.reload({ waitUntil: 'networkidle2' });
    const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')));
    for (const field of ['sessionsByDate', 'profile', 'progressByWeek', 'logs', 'readiness']) assert.deepEqual(reloaded[field], snapshot[field], `reload retains ${field}`);
    assert.deepEqual(errors, []); assert.equal(external, 0);
    await page.screenshot({ path: `/tmp/fitness-coach-${layout}-${state}.png`, fullPage: true });
    console.log(`${layout}/${state}: real questionnaire, court/recovery summary, fixed stretching, complementary work, saved conditions and unchanged actuals passed`);
    await context.close();
  }
} finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
