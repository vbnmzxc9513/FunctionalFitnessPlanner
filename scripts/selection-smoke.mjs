import { closeExerciseDetails } from './exercise-details-helpers.mjs';
import { closePlanningFlow } from './planner-flow-helpers.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { catalogExercises } from '../src/domain/exerciseCatalog.js';
import { getWeekString, dateForWeekDay } from '../src/domain/dates.js';
import { TRANSLATIONS } from '../src/locale.js';

const catalog = catalogExercises();
const byCode = code => Object.keys(catalog).find(id => catalog[id].catalogCode === code);
const week = getWeekString(new Date(), -1);
const today = dateForWeekDay(week, 3);
const timestamp = new Date(`${dateForWeekDay(week, 3)}T12:00:00`).getTime();
const site = 'http://127.0.0.1:5176/FunctionalFitnessPlanner/';
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', '5176'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; let exit = null; let browser; let diagnosticPage;
server.stdout.on('data', chunk => { output = (output + chunk).slice(-2000); });
server.stderr.on('data', chunk => { output = (output + chunk).slice(-2000); });
server.on('exit', code => { exit = code; });
try {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (exit !== null) throw Error(`Vite exited ${exit}: ${output}`);
    try { if ((await fetch(site, { signal: AbortSignal.timeout(1000) })).ok) break; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const context = await browser.createBrowserContext(); const page = await context.newPage(); diagnosticPage = page; const errors = [];
    await page.setViewport({ width, height });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(now => {
      localStorage.setItem('app_lang', 'zh');
      if (!sessionStorage.getItem('__selectionNow')) sessionStorage.setItem('__selectionNow', String(now));
      const NativeDate = Date;
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [Number(sessionStorage.getItem('__selectionNow'))])); } static now() { return Number(sessionStorage.getItem('__selectionNow')); } };
    }, timestamp);
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else request.abort(); });
    const visible = selector => page.waitForSelector(selector, { visible: true });
    const physicalClick = async handle => { await page.waitForFunction(element => element.isConnected && !element.matches(':disabled'), {}, handle); await handle.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' })); await handle.click(); await handle.dispose(); };
    const clickSelector = async selector => physicalClick(await visible(selector));
    const click = async text => {
      if (['課表', '今天', '紀錄', '設定', 'Plan', 'Today', 'Records', 'Settings'].includes(text)) { await closeExerciseDetails(page); await closePlanningFlow(page); }
      await page.waitForFunction(label => [...document.querySelectorAll('button')].some(element => element.innerText.trim() === label && element.getClientRects().length && !element.closest('[hidden]') && !element.matches(':disabled')), {}, text);
      const handle = await page.evaluateHandle(label => [...document.querySelectorAll('button')].find(element => element.innerText.trim() === label && element.getClientRects().length && !element.closest('[hidden]') && !element.matches(':disabled')), text);
      await physicalClick(handle.asElement());
    };
    const fill = async (selector, value) => { const input = await visible(selector); await input.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' })); await input.click({ clickCount: 3 }); await page.keyboard.press('Backspace'); await input.type(value); await input.dispose(); };
    const open = async selector => { const details = await visible(selector); if (!await details.evaluate(element => element.open)) await physicalClick(await details.$('summary')); await details.dispose(); };
    const label = async (text, root = '') => {
      const handle = await page.evaluateHandle(({ text, root }) => [...document.querySelectorAll(`${root} label`)].find(element => element.textContent.trim() === text && element.getClientRects().length && !element.closest('[hidden]')), { text, root });
      assert.ok(handle.asElement(), `${layout}: visible label ${text}`); await physicalClick(handle.asElement());
    };
    const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1') || 'null'));
    const choices = () => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('fitness_period_questionnaire_signed-out') || '{}').drafts || {}).at(-1)?.context?.weeklyExerciseIds || []);
    const waitChoice = async (id, chosen) => page.waitForFunction(({ id, chosen }) => (Object.values(JSON.parse(localStorage.getItem('fitness_period_questionnaire_signed-out') || '{}').drafts || {}).at(-1)?.context?.weeklyExerciseIds || []).includes(id) === chosen, {}, { id, chosen });
    const choose = async (code, purpose = '主要訓練') => {
      const id = byCode(code); await click(purpose); await open('[data-testid="weekly-choice-search"]');
      await fill('[aria-label="輸入動作名稱"]', catalog[id].name); await clickSelector(`[data-testid="weekly-choice-toggle-${id}"]`); await waitChoice(id, true); return id;
    };
    const preview = async () => {
      await clickSelector('[data-testid="plan-preview-create"]'); await visible('[data-testid="period-plan-preview"]');
      assert.equal(await page.$eval('[data-testid="weekly-choice-report"]', item => item.open), false, `${layout}: selected-movement detail starts collapsed`);
      await open('[data-testid="weekly-choice-report"]');
    };
    await page.goto(site, { waitUntil: 'networkidle2' }); await visible('[data-testid="first-plan"]');
    await click('課表'); await click('動作庫'); await visible('.exercise-library'); await clickSelector('.exercise-library .button-primary'); await clickSelector('[data-testid="planning-range-continue"]');
    await visible('[data-testid="planner-form"] fieldset:not([hidden]) [data-regions="targetRegions"]');
    await page.select('[data-testid="planner-form"] select', 'stability');
    await label('臀部／腿後側', '[data-regions="targetRegions"]'); await label('核心控制', '[data-regions="targetRegions"]');
    await open('[data-testid="quiz-schedule"]'); await fill('[data-testid="planner-form"] fieldset:not([hidden]) > div input[type="number"]', '35');
    await open('[data-testid="quiz-equipment"]');
    for (const key of ['equipment_dumbbell', 'equipment_band']) await label(TRANSLATIONS.zh[key], '[data-testid="quiz-equipment"]');
    for (const day of [2, 5]) await clickSelector(`[data-testid="quiz-schedule"] label:has(input[aria-label=${JSON.stringify(TRANSLATIONS.zh.allDayNames[day - 1])}])`);
    await click('下一步'); await label('胸椎／上背', '[data-regions="stiffnessRegions"]'); await click('下一步');
    const selected = [await choose('B03'), await choose('D01'), await choose('A06', '暖身'), await choose('H03', '收操')];
    assert.equal(await draft(), null, `${layout}: choosing movements does not create a plan`);
    await page.reload({ waitUntil: 'networkidle2' }); await visible('[data-testid="first-plan"]');
    assert.deepEqual(await choices(), selected, `${layout}: questionnaire choices survive reload in the same week`);
    await clickSelector('[data-testid="planning-range-continue"]'); await click('下一步'); await click('下一步'); await preview();
    assert.equal(await draft(), null, `${layout}: preview remains unapplied`);
    assert.equal(await page.$$eval('[data-testid="period-plan-preview"] [data-testid^="exercise-log-"]', elements => elements.length), 0, `${layout}: preview has no factual logging controls`);
    assert.equal(await page.$$eval('[data-testid="weekly-choice-report"] li', items => items.length), 4);
    await clickSelector(`[data-testid="period-day-${today}"]`); await visible('[data-testid="period-day-detail"]');
    await click('返回課表'); await click('返回修改條件'); await clickSelector(`[data-testid="weekly-exercise-choices"] section button[aria-label$=${JSON.stringify(catalog[selected[2]].name)}]`); await waitChoice(selected[2], false);
    await preview(); await clickSelector('[data-testid="period-plan-apply"]');
    await page.waitForFunction(() => !!localStorage.getItem('fitness_date_period_v1'));
    const applied = await draft(); assert.deepEqual(applied.profile.context.weeklyExerciseIds, selected.filter((_, index) => index !== 2));
    await click('今天'); await click('開始今天訓練');
    const warmup = byCode('A13'); await clickSelector(`dialog[open] button[aria-label=${JSON.stringify(catalog[warmup].name)}][aria-pressed]`);
    await page.waitForFunction(({ id, week }) => JSON.parse(localStorage.getItem('fitness_date_period_v1')).progressByWeek[week].completed[`day3_${id}`] === true, {}, { id: warmup, week });
    const beforeLibrary = await draft();
    await click('課表'); await click('動作庫'); await visible('.exercise-library');
    await fill(`[aria-label=${JSON.stringify(TRANSLATIONS.zh.searchExercises)}]`, catalog[selected[1]].name);
    const favoriteBefore = await page.$eval(`[data-testid="favorite-${selected[1]}"]`, button => button.textContent);
    await clickSelector(`[data-testid="library-weekly-${selected[1]}"]`); await page.waitForFunction(id => document.querySelector(`[data-testid="library-weekly-${id}"]`)?.getAttribute('aria-pressed') === 'false', {}, selected[1]);
    assert.equal(await page.$eval(`[data-testid="favorite-${selected[1]}"]`, button => button.textContent), favoriteBefore, `${layout}: weekly choices do not change favorites`);
    assert.deepEqual(await draft(), beforeLibrary, `${layout}: library choices leave the applied plan and completion facts intact`);
    await clickSelector('.exercise-library .button-primary'); await clickSelector('[data-testid="planning-range-continue"]'); await click('下一步'); await click('下一步'); await visible('[data-testid="weekly-exercise-choices"]');
    for (const code of ['B01', 'B11', 'B05', 'D02', 'D04', 'C01']) await choose(code);
    assert.equal((await choices()).length, 8);
    await click('主要訓練'); await open('[data-testid="weekly-choice-search"]');
    await fill('[aria-label="輸入動作名稱"]', 'missing-movement-xyz');
    await page.waitForFunction(text => document.body.innerText.includes(text), {}, TRANSLATIONS.zh.noMatchingExercises);
    await fill('[aria-label="輸入動作名稱"]', catalog[byCode('C11')].name);
    assert.equal(await page.$eval(`[data-testid="weekly-choice-toggle-${byCode('C11')}"]`, button => button.matches(':disabled')), true, `${layout}: a ninth selection is blocked`);
    await click('上一步'); await label('大腿前側', '[data-regions="sorenessRegions"]');
    const health = await page.evaluateHandle(() => [...document.querySelectorAll('label')].find(element => element.textContent.startsWith('肩部狀態與活動限制') && element.getClientRects().length).querySelector('select'));
    await health.asElement().select('unknown'); await health.dispose();
    await click('下一步'); await preview();
    assert.equal(await page.$$eval('[data-testid="period-plan-preview"] [data-testid^="period-day-"]', items => items.filter(item => item.innerText.includes('休息')).length), 6, `${layout}: health uncertainty overrides selected movements`);
    assert.ok(await page.$$eval('[data-testid="weekly-choice-report"] li', (items, today) => items.every(item => item.dataset.choiceStatus !== 'planned' || item.innerText.includes(today)), today), `${layout}: restricted preview only preserves previously protected movements`);
    assert.deepEqual(await draft(), beforeLibrary, `${layout}: an unapplied restricted preview cannot alter training facts`);
    await click('今天'); assert.deepEqual(await draft(), beforeLibrary);
    await click('設定'); await click('🌐 English'); await click('Plan'); await click('Plan another date range'); await clickSelector('[data-testid="planning-range-continue"]'); await click('Next'); await click('Next');
    await visible('[data-testid="weekly-exercise-choices"]');
    assert.equal(await page.$eval('[data-testid="planner-form"]', form => /[\u4e00-\u9fff]/.test(form.innerText)), false, `${layout}: visible questionnaire content is localized in English`);
    const expiredRange = await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_period_questionnaire_signed-out')).range);
    const factsBeforeRollover = await draft();
    await page.evaluate(() => { sessionStorage.setItem('__selectionNow', String(Date.now() + 7 * 86400000)); window.dispatchEvent(new Event('focus')); });
    // A new week remounts the date-scoped workspace at the weekly overview.
    // Reopen through its visible entry and verify the exact former range is now blocked.
    await visible('[data-testid="planner-actions"]');
    assert.equal(await page.$('[data-testid="period-plan-apply"]'), null, `${layout}: rollover removes the expired unapplied preview`);
    await click('Plan another date range'); await visible('[data-testid="planning-range"]');
    for (const [index, value] of [expiredRange.from, expiredRange.to].entries()) {
      await page.$$eval('[data-testid="planning-range"] input', (inputs, { index, value }) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inputs[index], value);
        inputs[index].dispatchEvent(new Event('input', { bubbles: true })); inputs[index].dispatchEvent(new Event('change', { bubbles: true }));
      }, { index, value });
    }
    assert.deepEqual(await page.$$eval('[data-testid="planning-range"] input', inputs => inputs.map(input => input.value)), [expiredRange.from, expiredRange.to], `${layout}: rollover validation uses the exact previous range`);
    assert.equal(await page.$eval('[data-testid="planning-range-continue"]', button => button.disabled), true, `${layout}: rollover blocks a now-past range`);
    assert.deepEqual(await draft(), factsBeforeRollover, `${layout}: rollover and reopening an expired range preserve applied training facts`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${layout}: questionnaire fits viewport`);
    assert.deepEqual(errors, []);
    console.log(`${layout}: weekly selection, draft reload, preview/back/apply, library/favorite separation, eight-choice limit, clinical priority, English and week rollover passed`);
    await context.close();
  }
} catch (error) { if (diagnosticPage && !diagnosticPage.isClosed()) { await diagnosticPage.screenshot({ path: '/tmp/selection-smoke.mjs.png', fullPage: true }); await writeFile('/tmp/selection-smoke.mjs.txt', await diagnosticPage.evaluate(() => document.body.innerText)); } throw error; } finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
