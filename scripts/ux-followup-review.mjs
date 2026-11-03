// Independent task review: isolated local drafts, blocked external requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { catalogExercises } from '../src/domain/exerciseCatalog.js';
import { createManualSession, manualDraftStorageKey } from '../src/domain/manualPlanner.js';
import { getQuickWorkouts } from '../src/domain/quickWorkouts.js';
import { previewQuickWorkout } from '../src/domain/quickWorkoutDraft.js';

const output = 'docs/planner-redesign/ux-followup';
await mkdir(output, { recursive: true });
const port = 5211, site = `http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', String(port)], {
  stdio: 'ignore', env: { ...process.env, SMOKE_DISABLE_HMR: '1' },
});
const dates = ['2026-11-04', '2026-11-06', '2026-11-08'];
const results = [];
let browser, page, step;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(site)).ok) break; } catch { /* Server starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [width, lang] of [[320, 'zh'], [390, 'zh'], [1440, 'zh'], [390, 'en']]) {
    step = `${width}/${lang}: open`;
    const context = await browser.createBrowserContext();
    page = await context.newPage();
    await page.setViewport({ width, height: width === 1440 ? 1000 : 844 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (['localhost', '127.0.0.1'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue();
      else request.abort();
    });
    await page.evaluateOnNewDocument(() => {
      const NativeDate = Date, now = new NativeDate('2026-11-03T12:00:00Z').getTime();
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [now])); }
        static now() { return now; }
      };
    });
    const click = async selector => {
      const element = await page.waitForSelector(selector, { visible: true });
      await element.click();
    };
    const clickText = async text => {
      await page.waitForFunction(text => [...document.querySelectorAll('button')].some(e => e.innerText.trim() === text && e.getClientRects().length), {}, text);
      const element = (await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(e => e.innerText.trim() === text && e.getClientRects().length), text)).asElement();
      await element.click();
    };
    const snapshot = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).sessions, manualDraftStorageKey());
    const capture = async name => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${step}: no horizontal overflow`);
      await page.screenshot({ path: `${output}/${name}-${width}-${lang}.png` });
    };
    const exercises = catalogExercises(lang), warmup = getQuickWorkouts(lang).find(w => w.id === 'daily-warmup');
    const sessions = dates.map((date, i) => i !== 1 ? createManualSession(date, lang) : previewQuickWorkout(createManualSession(date, lang), warmup, { exercises, eligibleExercises: exercises, dailyTime: 40, lang }).next);
    await page.goto(site, { waitUntil: 'networkidle2' });
    await page.evaluate(({ sessions, lang, key }) => {
      localStorage.clear(); localStorage.setItem('app_lang', lang);
      localStorage.setItem(key, JSON.stringify({ version: 1, scope: 'signed-out', sessions }));
      localStorage.setItem('planning_preferences_signed-out', JSON.stringify({ time: '40', focus: 'balanced', context: { healthStatus: 'unrestricted', equipment: [], trainingDays: [1, 3, 5], badmintonDays: [] } }));
    }, { sessions, lang, key: manualDraftStorageKey() });
    await page.reload({ waitUntil: 'networkidle2' });
    await clickText(lang === 'zh' ? '課表' : 'Plan');
    await click('[data-testid="open-manual-planner"]');
    await click('[data-testid="manual-common-workouts"]');
    await capture('quick-combos');
    await click('[data-testid="quick-view-daily-warmup"]');
    assert.equal((await snapshot())[0].routine.length, 0, 'Preview must not mutate the draft');
    await click('[data-testid="quick-workout-add"]');
    await page.waitForSelector('[data-testid="manual-day-overview"]');
    assert.equal(await page.$$eval('[data-phase="warmup"] [data-exercise-id]', els => els.length), 8);
    await click('[data-testid="manual-add-workout"]');
    await click('[data-testid="quick-view-foot-arch-control"]');
    await click('[data-testid="quick-workout-add"]');
    step = `${width}/${lang}: day overview`;
    await page.waitForSelector('[data-testid="manual-continue-training"]');
    await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    const metrics = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
      const duration = document.querySelector('.manual-time-settings .manual-day-time').getBoundingClientRect();
      const settings = document.querySelector('.manual-time-settings summary').getBoundingClientRect();
      return {
        overview: rect('[data-testid="manual-day-overview"]'), save: rect('[data-testid="manual-save-day"]'),
        footerTop: document.querySelector('.manual-fixed-actions').getBoundingClientRect().top,
        phases: [...document.querySelectorAll('.manual-day-overview button')].map(e => e.innerText),
        timeLabelsOverlap: Math.min(duration.right, settings.right) > Math.max(duration.left, settings.left) && Math.min(duration.bottom, settings.bottom) > Math.max(duration.top, settings.top),
      };
    });
    assert.ok(metrics.overview.bottom < metrics.footerTop, 'All three phases must be visible in first viewport');
    assert.equal(metrics.timeLabelsOverlap, false, 'Duration and equipment labels must not overlap, including English');
    assert.ok(metrics.save.bottom < metrics.footerTop && metrics.save.height >= 44, 'Save-day visible and touchable');
    assert.equal((await snapshot())[0].routine.length, 11, 'Quick combinations add selected content without padding to 40 minutes');
    await capture('day-overview');
    await click('[data-testid="manual-jump-strength"]');
    await page.waitForFunction(() => document.activeElement === document.querySelector('[data-phase="strength"] h3') && document.activeElement.getBoundingClientRect().top >= 0 && document.activeElement.getBoundingClientRect().bottom < innerHeight - 85);
    await click('[data-testid="manual-continue-training"]');
    step = `${width}/${lang}: picker and search`;
    await page.waitForSelector('[data-testid="batch-exercise-picker"]');
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'INPUT', 'Opening picker must not automatically focus keyboard input');
    assert.equal(await page.$$eval('.manual-picker-row-mark', els => els.some(e => e.textContent.includes('＋'))), false);
    await capture('exercise-picker');
    metrics.firstResultTop = await page.$eval('.manual-picker-row', e => e.getBoundingClientRect().top);
    if (width === 390 && lang === 'zh') assert.ok(metrics.firstResultTop <= 410, 'Mobile filters leave room for exercise results above 410px');
    await page.type('[data-testid="batch-picker-search"]', lang === 'zh' ? '前鋸肌' : 'serratus');
    await click('[data-testid="batch-option-bf_C12"]');
    await click('[data-testid="batch-picker-add"]');
    await page.waitForSelector('[data-testid="manual-save-day"]');
    assert.ok((await snapshot())[0].routine.includes('bf_C12'), 'Chosen exercise really enters draft');
    step = `${width}/${lang}: scoped save and reuse`;
    await click('[data-testid="manual-save-day"]');
    await page.waitForSelector('dialog[open]');
    await click('dialog[open] input[value="warmup"]');
    const savedName = `${lang === 'zh' ? '球前暖身' : 'Court warm-up'} ${width}`;
    await page.type('dialog[open] input:not([type])', savedName);
    await capture('save-day');
    await click('[data-testid="save-workout-confirm"]');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    assert.equal(await page.evaluate(() => localStorage.getItem('fitness_date_period_v1')), null, 'Saving a favorite must not apply a schedule');
    await click('[data-testid="manual-add-workout"]');
    await clickText(lang === 'zh' ? '我的收藏' : 'My favorites');
    await page.waitForSelector('.quick-workout-card');
    assert.ok(await page.$eval('.quick-workout-cards', (e, name) => e.textContent.includes(name), savedName));
    await click('.quick-workout-card button[data-testid]');
    assert.equal(await page.$$eval('.quick-preview-list li', els => els.length), 8, 'Warm-up-only saved scope retains eight independent doses');
    assert.equal(await page.$eval('[data-testid="quick-workout-add"]', e => e.disabled), true, 'Already-present doses not duplicated');
    await click('.quick-workout-picker > .manual-back');
    await click('.quick-workout-picker > .manual-back');
    await click(`[data-testid="manual-tab-${dates[1]}"]`);
    assert.equal(await page.$$eval('[data-testid="manual-continue-training"]', els => els.length), 0, 'Previous day success action cleared');
    await click(`[data-testid="manual-tab-${dates[2]}"]`);
    await click('[data-testid="manual-common-workouts"]');
    await clickText(lang === 'zh' ? '我的收藏' : 'My favorites');
    await click('.quick-workout-card button[data-testid]');
    await click('[data-testid="quick-workout-add"]');
    await page.waitForSelector('[data-testid="manual-day-overview"]');
    assert.deepEqual((await snapshot())[2].prescriptions, (await snapshot())[0].prescriptions.filter(d => d.phase === 'warmup'), 'Reused scoped favorite preserves eight exact prescriptions');
    await click('[data-testid="manual-review"]');
    await page.waitForSelector('[data-testid="assignment-apply"]');
    await page.waitForFunction(() => !document.querySelector('[role="status"].pointer-events-none'));
    await capture('review');
    await click('[data-testid="assignment-apply"]');
    await page.waitForFunction(date => JSON.parse(localStorage.getItem('fitness_date_period_v1') || '{}').sessionsByDate?.[date], {}, dates[0]);
    const applied = await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')).sessionsByDate);
    assert.equal(applied[dates[0]].routine.length, 12);
    assert.equal(applied[dates[1]].routine.length, 8);
    assert.equal(applied[dates[2]].routine.length, 8);
    assert.deepEqual(errors, []);
    results.push({ width, lang, metrics, tasksPassed: true, runtimeErrors: errors });
    console.log(`${width}/${lang}: overview, jump, choose, scoped save, reuse, dates and apply passed`);
    await context.close(); page = null;
  }
  await writeFile(`${output}/review-results.json`, JSON.stringify({ fixture: { today: '2026-11-03', dates }, results, humanUsabilityTesting: 'PENDING' }, null, 2) + '\n');
} catch (error) {
  console.error(`Failed: ${step}`);
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
    await writeFile(`${output}/failure.txt`, await page.evaluate(() => document.body.innerText));
  }
  throw error;
} finally { await browser?.close(); server.kill(); }
