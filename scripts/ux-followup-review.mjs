// Independent task review: isolated local drafts, blocked external requests.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { catalogExercises } from '../src/domain/exerciseCatalog.js';
import { createManualSession, manualDraftStorageKey } from '../src/domain/manualPlanner.js';
import { getQuickWorkouts } from '../src/domain/quickWorkouts.js';
import { previewQuickWorkout } from '../src/domain/quickWorkoutDraft.js';

const output = 'docs/planner-redesign/2026-11-combo-first/implementation-review/ux-followup';
await mkdir(output, { recursive: true });
const port = Number(process.env.UX_FOLLOWUP_PORT || 5214), site = `http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', String(port)], {
  stdio: 'ignore', env: { ...process.env, SMOKE_DISABLE_HMR: '1' },
});
const dates = ['2026-11-16', '2026-11-18', '2026-11-20'];
const results = [];
let browser, page, step;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(site)).ok) break; } catch { /* Server starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
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
      const NativeDate = Date, now = new NativeDate('2026-11-13T12:00:00Z').getTime();
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
    await click('[data-testid="manual-add-content"]'); await capture('quick-combos');
    assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'INPUT', 'No forced mobile keyboard');
    await click('dialog [data-testid="combo-detail-daily-warmup"]');
    assert.equal((await snapshot())[0].routine.length, 0, 'Detail expansion must not mutate the draft');
    await click('dialog [data-testid="combo-detail-daily-warmup"]');
    await click('dialog [data-testid="combo-add-daily-warmup"]');
    await click('dialog [data-testid="combo-add-foot-arch-control"]');
    assert.equal((await snapshot())[0].routine.length, 11, 'Two combos compose a day without padding');
    await click('[data-testid="combo-panel-done"]');
    assert.equal(await page.$$eval('[data-testid="manual-day-overview"], [data-testid^="manual-add-warmup"], [data-testid="manual-common-workouts"]', els => els.length), 0, 'Retired phase/source entries absent');
    assert.equal(await page.$$eval('[data-phase="warmup"] [data-exercise-id]', els => els.length), 8);
    const metrics = await page.evaluate(() => ({ frequentNames: [...document.querySelectorAll('.combo-first-common strong')].map(e => e.innerText), exerciseCount: document.querySelectorAll('.manual-exercise-row').length }));
    await capture('day-content');
    step = `${width}/${lang}: single exercise search`;
    await click('[data-testid="manual-add-content"]'); await clickText(lang === 'zh' ? '單一動作' : 'Single exercises');
    await page.type('[data-testid="combo-search"]', lang === 'zh' ? '前鋸肌' : 'serratus');
    await click('[data-testid="single-add-bf_C12"]');
    assert.ok((await snapshot())[0].routine.includes('bf_C12'), 'Single movement really enters draft');
    assert.equal(await page.$eval('[data-testid="combo-search"]', e => e.value), lang === 'zh' ? '前鋸肌' : 'serratus', 'Search remains after adding');
    await click('[data-testid="combo-panel-done"]');
    step = `${width}/${lang}: arbitrary three-movement save and immediate reuse`;
    await click('.manual-more > summary'); await click('[data-testid="manual-save-day"]');
    const chosen = ['bf_A10', 'bf_A15', 'bf_B13'];
    for (const dose of (await snapshot())[0].prescriptions) if (!chosen.includes(dose.id)) await click(`[data-testid="save-workout-exercise-${dose.id}"]`);
    const savedName = `${lang === 'zh' ? '我的三個動作' : 'My three moves'} ${width}`;
    await page.type('[data-testid="save-workout-name"]', savedName); await capture('save-selection');
    await click('[data-testid="save-workout-confirm"]'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await page.waitForFunction(name => document.querySelector('.combo-first-common')?.textContent.includes(name), {}, savedName);
    assert.equal(await page.evaluate(() => localStorage.getItem('fitness_date_period_v1')), null, 'Favorite save does not apply dates');
    await click(`[data-testid="manual-tab-${dates[2]}"]`);
    const favoriteAdd = (await page.evaluateHandle(name => [...document.querySelectorAll('.combo-first-common .combo-first-card')].find(e => e.textContent.includes(name))?.querySelector('.combo-first-plus'), savedName)).asElement();
    await favoriteAdd.click();
    assert.equal((await snapshot())[2].routine.length, 3, 'Saved arbitrary subset is immediately usable on another day');
    assert.deepEqual((await snapshot())[2].prescriptions.map(dose => ({ ...dose, preparation: undefined })), (await snapshot())[0].prescriptions.filter(dose => chosen.includes(dose.id)).map(dose => ({ ...dose, preparation: undefined })), 'Cross-phase subset preserves planned doses and order');
    await page.reload({ waitUntil: 'networkidle2' }); await clickText(lang === 'zh' ? '課表' : 'Plan'); await click('[data-testid="open-manual-planner"]');
    await page.waitForFunction(name => document.querySelector('.combo-first-common')?.textContent.includes(name), {}, savedName);
    assert.equal((await snapshot())[2].routine.length, 3, 'All date drafts survive reload');
    await click('[data-testid="manual-review"]'); await page.waitForSelector('[data-testid="assignment-apply"]'); await capture('review');
    await click('[data-testid="assignment-apply"]');
    await page.waitForFunction(date => JSON.parse(localStorage.getItem('fitness_date_period_v1') || '{}').sessionsByDate?.[date], {}, dates[0]);
    const applied = await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')).sessionsByDate);
    assert.equal(applied[dates[0]].routine.length, 12); assert.equal(applied[dates[1]].routine.length, 8); assert.equal(applied[dates[2]].routine.length, 3);
    assert.deepEqual(errors, []);
    results.push({ width, lang, metrics, tasksPassed: true, runtimeErrors: errors });
    console.log(`${width}/${lang}: visible combos, continuous add, single search, arbitrary subset save, immediate reuse, reload, dates and apply passed`);
    await context.close(); page = null;
  }
  await writeFile(`${output}/review-results.json`, JSON.stringify({ fixture: { today: '2026-11-13', dates }, results, humanUsabilityTesting: 'PENDING' }, null, 2) + '\n');
} catch (error) {
  console.error(`Failed: ${step}`);
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
    await writeFile(`${output}/failure.txt`, await page.evaluate(() => document.body.innerText));
  }
  throw error;
} finally { await browser?.close(); server.kill(); }
