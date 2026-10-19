import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { catalogExercises } from '../src/domain/exerciseCatalog.js';
import { estimateSessionMinutes } from '../src/domain/sessions.js';

const server = spawn(process.execPath, ['scripts/smoke-server.mjs', '5187'], { env: process.env, stdio: 'ignore' });
const site = 'http://127.0.0.1:5187/FunctionalFitnessPlanner/';
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(site)).ok) break; } catch { /* Starting. */ } await new Promise(resolve => setTimeout(resolve, 200)); }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, lang, width] of [['desktop', 'en', 1280], ['mobile', 'zh', 390]]) {
    const context = await browser.createBrowserContext(), page = await context.newPage(), errors = [];
    const exercises = catalogExercises(lang);
    await page.setViewport({ width, height: 844, isMobile: layout === 'mobile', hasTouch: layout === 'mobile' });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(lang => {
      localStorage.setItem('app_lang', lang); const NativeDate = Date, now = new NativeDate('2026-10-19T12:00:00').getTime();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    }, lang);
    page.on('pageerror', error => errors.push(error.message)); await page.setRequestInterception(true);
    page.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else request.abort(); });
    const click = selector => page.locator(selector).map(item => { item.scrollIntoView({ block: 'center', behavior: 'instant' }); return item; }).click();
    const fill = async (selector, value) => { const el = await page.waitForSelector(selector, { visible: true }); await el.evaluate((item, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(item, value); item.dispatchEvent(new Event('input', { bubbles: true })); }, value); await el.dispose(); };
    const group = async label => { const button = await page.evaluateHandle(label => [...document.querySelectorAll('[data-testid="weekly-exercise-choices"] button')].find(item => item.innerText.trim() === label), label); await button.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await button.click(); await button.dispose(); };
    await page.goto(site, { waitUntil: 'networkidle2' }); await fill('[data-testid="planning-range"] input:first-of-type', '2026-10-19');
    await page.$$eval('[data-testid="planning-range"] input', inputs => { const el = inputs[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2026-10-23'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('[data-testid="planning-range-continue"]'); await fill('[data-testid="planner-form"] input[type="number"]', '40');
    if (!await page.$eval('[data-testid="quiz-schedule"]', item => item.open)) await click('[data-testid="quiz-schedule"] > summary');
    for (const day of [2, 3, 5]) await click(`[data-testid="quiz-schedule"] fieldset:first-of-type label:nth-of-type(${day})`);
    await fill('[data-testid="court-load-fields"] input', '90'); await page.select('[data-testid="court-load-fields"] select', 'mixed');
    await click('[data-testid="quiz-equipment"] > summary');
    for (const index of [1, 2, 3]) await click(`[data-testid="quiz-equipment"] label:nth-of-type(${index})`);
    await click('[data-testid="setup-next"]'); await page.select('[data-testid="recovery-state"]', 'normal'); await click('[data-testid="setup-next"]');
    await click('[data-testid="weekly-choice-search"] > summary');
    const ids = ['bf_B01', 'bf_B02', 'bf_B11', 'bf_B10', 'bf_B06', 'bf_A06', 'bf_H03'];
    for (const id of ids) {
      await group(id.startsWith('bf_A') ? lang === 'en' ? 'Warm-up' : '暖身' : id.startsWith('bf_H') ? lang === 'en' ? 'Cooldown' : '收操' : lang === 'en' ? 'Main training' : '主要訓練');
      await fill('[data-testid="weekly-choice-search"] input', exercises[id].name);
      await click(`[data-testid="weekly-choice-toggle-${id}"]`);
    }
    await group(lang === 'en' ? 'Warm-up' : '暖身'); await fill('[data-testid="weekly-choice-search"] input', exercises.bf_A01.name);
    assert.equal(await page.$('[data-testid="weekly-choice-bf_A01"]'), null, 'running is not a recommended warm-up');
    await click('[data-testid="plan-preview-create"]'); await page.waitForSelector('[data-testid="period-plan-preview"]');
    assert.ok(await page.$eval('[data-testid="choice-outcome-summary"]', item => item.innerText.includes('7 / 7')));
    assert.equal(await page.$$eval('[data-testid="weekly-choice-report"] [data-choice-status="planned"]', items => items.length), 7);
    await click('[data-testid="period-mobility-overview"] > summary');
    assert.ok(await page.$$eval('[data-testid="period-mobility-overview"] dd', items => items.length === 8 && items.every(item => item.innerText.includes('10/'))));
    await click('[data-testid="period-day-2026-10-19"]');
    assert.ok(await page.$eval('[data-testid="session-time-summary"]', item => /40/.test(item.innerText) && /3[5-9]|40/.test(item.innerText)));
    await click('[data-testid="period-day-2026-10-20"]');
    assert.ok(await page.$eval('[data-testid="session-time-summary"]', (item, lang) => item.innerText.includes('40') && item.innerText.includes(lang === 'en' ? 'Court day' : '羽球日'), lang));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/fitness-planner-requests-${layout}.png`, fullPage: true });
    await click('[data-testid="period-plan-apply"]'); await page.waitForFunction(() => !!localStorage.getItem('fitness_date_period_v1'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1'))), days = Object.values(saved.sessionsByDate);
    assert.ok(ids.every(id => days.some(day => day.routine.includes(id))));
    assert.equal(days.filter(day => day.sessionType === 'training').length, 2);
    assert.ok(estimateSessionMinutes(days.find(day => day.day === 1), exercises) >= 35);
    assert.ok(days.every(day => estimateSessionMinutes(day, exercises) <= 40 && !day.routine.some(id => ['bf_A01', 'bf_I01'].includes(id))));
    assert.deepEqual(saved.logs, []); assert.deepEqual(saved.progressByWeek, {});
    await page.reload({ waitUntil: 'networkidle2' });
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')).profile.context.weeklyExerciseIds), ids);
    const today = await page.evaluateHandle(lang => [...document.querySelectorAll('button')].find(item => item.innerText.trim() === (lang === 'en' ? 'Today' : '今天') && item.getClientRects().length), lang);
    await today.click(); await today.dispose(); await page.waitForSelector('[data-testid="session-hero"]');
    assert.ok(await page.$eval('[data-testid="session-hero"] [data-testid="session-time-summary"]', item => item.innerText.includes('40')));
    if (layout === 'mobile') { await page.setViewport({ width: 320, height: 844, isMobile: true, hasTouch: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
    assert.deepEqual(errors, []);
    console.log(`${layout}: 40-minute dose, honest short-court recovery, no running recommendation, seven actual choices, eight regions, saved plan and daily time passed`);
    await context.close();
  }
} finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
