import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const server = spawn(process.execPath, ['scripts/smoke-server.mjs', '5186'], { env: process.env, stdio: 'ignore' });
const site = 'http://127.0.0.1:5186/FunctionalFitnessPlanner/';
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(site)).ok) break; } catch { /* Starting. */ } await new Promise(resolve => setTimeout(resolve, 200)); }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, lang, width] of [['desktop', 'en', 1280], ['mobile', 'zh', 390]]) {
    const context = await browser.createBrowserContext(), page = await context.newPage(); const errors = []; let external = 0;
    await page.setViewport({ width, height: 844, isMobile: layout === 'mobile', hasTouch: layout === 'mobile' });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(lang => {
      localStorage.setItem('app_lang', lang); const NativeDate = Date, now = new NativeDate('2026-10-19T12:00:00').getTime();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    }, lang);
    page.on('pageerror', error => errors.push(error.message)); await page.setRequestInterception(true);
    page.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else { external++; request.abort(); } });
    const click = async selector => { const el = await page.waitForSelector(selector, { visible: true }); await el.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await el.click(); await el.dispose(); };
    const fill = async (selector, value) => { const el = await page.waitForSelector(selector, { visible: true }); await el.evaluate((item, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(item, value); item.dispatchEvent(new Event('input', { bubbles: true })); }, value); await el.dispose(); };
    const targets = ['serratus', 'rotator_cuff', 'glutes', 'calves'];
    await page.goto(site, { waitUntil: 'networkidle2' }); await fill('[data-testid="planning-range"] input:first-of-type', '2026-10-19');
    await page.$$eval('[data-testid="planning-range"] input', inputs => { const el = inputs[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2026-10-23'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('[data-testid="planning-range-continue"]');
    assert.equal(await page.$eval('[data-testid="target-details"]', item => item.open), false, 'specific muscles initially stay collapsed');
    await click('[data-testid="target-details"] > summary');
    for (const region of targets) await click(`[data-regions="targetRegions"] label:has(input[data-target-region="${region}"])`);
    assert.equal(await page.$eval('input[data-target-region="scapular"]', item => item.disabled), true, 'fifth target disabled');
    await click('[data-regions="targetRegions"] label:has(input[data-target-region="serratus"])');
    assert.equal(await page.$eval('input[data-target-region="scapular"]', item => item.disabled), false);
    await click('[data-regions="targetRegions"] label:has(input[data-target-region="serratus"])');
    await fill('[data-testid="planner-form"] input[type="number"]', '35');
    if (!await page.$eval('[data-testid="quiz-schedule"]', item => item.open)) await click('[data-testid="quiz-schedule"] > summary');
    for (const day of [2, 3, 5]) await click(`[data-testid="quiz-schedule"] fieldset:first-of-type label:nth-of-type(${day})`);
    await fill('[data-testid="court-load-fields"] input', '90'); await page.select('[data-testid="court-load-fields"] select', 'mixed');
    await click('[data-testid="quiz-equipment"] > summary');
    for (const index of [1, 2, 3]) await click(`[data-testid="quiz-equipment"] label:nth-of-type(${index})`);
    await click('[data-testid="setup-next"]'); await page.select('[data-testid="recovery-state"]', 'normal'); await click('[data-testid="setup-next"]');
    assert.ok(await page.$eval('[data-testid="review-planning-conditions"]', (item, lang) => item.innerText.includes(lang === 'en' ? 'Serratus anterior' : '前鋸肌'), lang));
    await page.reload({ waitUntil: 'networkidle2' }); await click('[data-testid="planning-range-continue"]');
    for (const region of targets) assert.equal(await page.$eval(`input[data-target-region="${region}"]`, item => item.checked), true, 'four targets survive questionnaire reload');
    await click('[data-testid="setup-next"]'); await click('[data-testid="setup-next"]'); await click('[data-testid="plan-preview-create"]');
    await page.waitForSelector('[data-testid="training-target-overview"]');
    await click('[data-testid="training-target-overview"] > summary');
    assert.equal(await page.$$eval('[data-testid="training-target-overview"] [data-target]', items => items.length), 4);
    assert.ok(await page.$eval('[data-target="serratus"]', item => item.innerText.includes('10/19')));
    assert.ok(await page.$eval('[data-target="calves"]', (item, lang) => item.innerText.includes(lang === 'en' ? 'No dedicated work' : '未排專項'), lang));
    await click('[data-testid="period-day-2026-10-19"]'); assert.ok(await page.$('[data-testid="exercise-open-bf_C07"]'));
    assert.ok(await page.$('[data-testid="exercise-open-bf_A13"]'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/fitness-targets-${layout}.png`, fullPage: true });
    if (layout === 'mobile') { await page.setViewport({ width: 320, height: 844, isMobile: true, hasTouch: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false); }
    await click('[data-testid="period-plan-apply"]'); await page.waitForFunction(() => !!localStorage.getItem('fitness_date_period_v1'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')));
    assert.deepEqual(saved.profile.context.targetRegions, targets);
    assert.ok(Object.values(saved.sessionsByDate).some(day => day.prescriptions.some(dose => dose.id === 'bf_C07' && dose.phase === 'accessory')));
    assert.deepEqual(saved.logs, []); assert.deepEqual(saved.progressByWeek, {});
    await page.reload({ waitUntil: 'networkidle2' });
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')).profile.context.targetRegions), targets);
    assert.deepEqual(errors, []); assert.equal(external, 0);
    console.log(`${layout}: grouped four-target selection, cap/uncheck, draft reload, real serratus work, honest preview, saved priorities and 320px passed`);
    await context.close();
  }
} finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
