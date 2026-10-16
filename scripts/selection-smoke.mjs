import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { catalogExercises } from '../src/domain/exerciseCatalog.js';
import { getWeekString, dateForWeekDay } from '../src/domain/dates.js';
import { TRANSLATIONS } from '../src/locale.js';
import { WEEK_PLAN_TEXT } from '../src/weekPlanLocale.js';

const catalog = catalogExercises();
const byCode = code => Object.keys(catalog).find(id => catalog[id].catalogCode === code);
const week = getWeekString(new Date(), -1);
const timestamp = new Date(`${dateForWeekDay(week, 3)}T12:00:00`).getTime();
const site = 'http://127.0.0.1:5176/FunctionalFitnessPlanner/';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5176', '--strictPort'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; let exit = null; let browser;
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
    const context = await browser.createBrowserContext(); const page = await context.newPage(); const errors = [];
    await page.setViewport({ width, height });
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
    const physicalClick = async handle => { await handle.evaluate(element => element.scrollIntoView({ block: 'center' })); await handle.asLocator().click(); await handle.dispose(); };
    const clickSelector = async selector => physicalClick(await visible(selector));
    const click = async text => {
      await page.waitForFunction(label => [...document.querySelectorAll('button')].some(element => element.innerText.trim() === label && element.getClientRects().length && !element.closest('[hidden]') && !element.matches(':disabled')), {}, text);
      const handle = await page.evaluateHandle(label => [...document.querySelectorAll('button')].find(element => element.innerText.trim() === label && element.getClientRects().length && !element.closest('[hidden]') && !element.matches(':disabled')), text);
      await physicalClick(handle.asElement());
    };
    const fill = async (selector, value) => { const input = await visible(selector); await input.evaluate(element => element.scrollIntoView({ block: 'center' })); await input.click({ clickCount: 3 }); await page.keyboard.press('Backspace'); await input.type(value); await input.dispose(); };
    const open = async selector => { const details = await visible(selector); if (!await details.evaluate(element => element.open)) await physicalClick(await details.$('summary')); await details.dispose(); };
    const label = async (text, root = '') => {
      const handle = await page.evaluateHandle(({ text, root }) => [...document.querySelectorAll(`${root} label`)].find(element => element.textContent.trim() === text && element.getClientRects().length && !element.closest('[hidden]')), { text, root });
      assert.ok(handle.asElement(), `${layout}: visible label ${text}`); await physicalClick(handle.asElement());
    };
    const draft = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1') || '{}').publicDraft || null);
    const choices = () => page.evaluate(week => JSON.parse(sessionStorage.getItem(`fitness_questionnaire_signed-out_${week}`) || '{}').context?.weeklyExerciseIds || [], week);
    const waitChoice = async (id, chosen) => page.waitForFunction(({ id, chosen, week }) => (JSON.parse(sessionStorage.getItem(`fitness_questionnaire_signed-out_${week}`) || '{}').context?.weeklyExerciseIds || []).includes(id) === chosen, {}, { id, chosen, week });
    const choose = async (code, purpose = '主要訓練') => {
      const id = byCode(code); await click(purpose); await open('[data-testid="weekly-choice-search"]');
      await fill('[aria-label="輸入動作名稱"]', catalog[id].name); await clickSelector(`[data-testid="weekly-choice-toggle-${id}"]`); await waitChoice(id, true); return id;
    };
    const preview = async () => { await click('預覽本週課表'); await visible('[data-testid="weekly-plan-preview"]'); };
    await page.goto(site, { waitUntil: 'networkidle2' }); await visible('[data-testid="first-plan"]');
    await click('課表'); await click('動作庫'); await visible('.exercise-library'); await clickSelector('.exercise-library .button-primary');
    await visible('[data-testid="planner-form"] fieldset:not([hidden]) [data-regions="targetRegions"]');
    await page.select('[data-testid="planner-form"] select', 'stability');
    await label('臀部／腿後側', '[data-regions="targetRegions"]'); await label('核心控制', '[data-regions="targetRegions"]');
    await open('[data-testid="quiz-schedule"]'); await fill('[data-testid="quiz-schedule"] input[type="number"]', '35');
    await open('[data-testid="quiz-equipment"]');
    for (const key of ['equipment_dumbbell', 'equipment_band']) await label(TRANSLATIONS.zh[key], '[data-testid="quiz-equipment"]');
    for (const day of [2, 5]) await clickSelector(`[data-testid="quiz-schedule"] label:has(input[aria-label=${JSON.stringify(TRANSLATIONS.zh.allDayNames[day - 1])}])`);
    await click('下一步'); await label('胸椎／上背', '[data-regions="stiffnessRegions"]'); await click('下一步');
    const selected = [await choose('B03'), await choose('D01'), await choose('A06', '暖身'), await choose('H03', '收操')];
    assert.equal(await draft(), null, `${layout}: choosing movements does not create a plan`);
    await page.reload({ waitUntil: 'networkidle2' }); await visible('[data-testid="first-plan"]');
    assert.deepEqual(await choices(), selected, `${layout}: questionnaire choices survive reload in the same week`);
    await click('下一步'); await click('下一步'); await preview();
    assert.equal(await draft(), null, `${layout}: preview remains unapplied`);
    assert.equal(await page.$$eval('[data-testid="weekly-plan-preview"] [data-testid^="exercise-log-"]', elements => elements.length), 0, `${layout}: preview has no factual logging controls`);
    assert.equal(await page.$$eval('[data-testid="weekly-choice-report"] li', items => items.length), 4);
    await clickSelector('[data-testid="week-day-select-1"]'); await visible('[data-testid="preview-day-detail"]');
    await click('返回修改'); await clickSelector(`button[aria-label=${JSON.stringify(`移出本週 ${catalog[selected[2]].name}`)}]`); await waitChoice(selected[2], false);
    await preview(); await click('確認套用本週');
    await page.waitForFunction(() => !!JSON.parse(sessionStorage.getItem('fitness_public_preview_v1') || '{}').publicDraft);
    const applied = await draft(); assert.deepEqual(applied.plan.weeklyIntent.weeklyExerciseIds, selected.filter((_, index) => index !== 2));
    await click('課表'); await clickSelector('[data-testid="week-day-select-1"]');
    const warmup = byCode('A01'); await clickSelector(`button[aria-label=${JSON.stringify(catalog[warmup].name)}][aria-pressed]`);
    await page.waitForFunction(id => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1')).publicDraft.completed[`day1_${id}`] === true, {}, warmup);
    const beforeLibrary = await draft();
    await click('課表'); await click('動作庫'); await visible('.exercise-library');
    await fill(`[aria-label=${JSON.stringify(TRANSLATIONS.zh.searchExercises)}]`, catalog[selected[1]].name);
    const favoriteBefore = await page.$eval(`[data-testid="favorite-${selected[1]}"]`, button => button.textContent);
    await clickSelector(`[data-testid="library-weekly-${selected[1]}"]`); await waitChoice(selected[1], false);
    assert.equal(await page.$eval(`[data-testid="favorite-${selected[1]}"]`, button => button.textContent), favoriteBefore, `${layout}: weekly choices do not change favorites`);
    assert.deepEqual(await draft(), beforeLibrary, `${layout}: library choices leave the applied plan and completion facts intact`);
    await clickSelector('.exercise-library .button-primary'); await visible('[data-testid="weekly-exercise-choices"]');
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
    assert.equal(await page.$$eval('[data-testid="weekly-plan-preview"] [data-testid^="week-role-"][data-kind="rest"]', items => items.length), 5, `${layout}: health uncertainty overrides selected movements`);
    assert.ok(await page.$$eval('[data-testid="weekly-choice-report"] li', items => items.every(item => item.dataset.choiceStatus !== 'planned')));
    assert.deepEqual(await draft(), beforeLibrary, `${layout}: an unapplied restricted preview cannot alter training facts`);
    await click('今天'); assert.deepEqual(await draft(), beforeLibrary);
    await click('設定'); await click('🌐 English'); await click('Plan'); await click(WEEK_PLAN_TEXT.en.edit); await click('Next'); await click('Next');
    await visible('[data-testid="weekly-exercise-choices"]');
    assert.equal(await page.$eval('[data-testid="planner-form"]', form => /[\u4e00-\u9fff]/.test(form.innerText)), false, `${layout}: visible questionnaire content is localized in English`);
    await page.evaluate(() => { sessionStorage.setItem('__selectionNow', String(Date.now() + 7 * 86400000)); window.dispatchEvent(new Event('focus')); });
    await page.waitForFunction(oldWeek => Object.keys(sessionStorage).some(key => {
      if (!key.startsWith('fitness_questionnaire_signed-out_') || key.endsWith(oldWeek)) return false;
      const value = JSON.parse(sessionStorage.getItem(key)); return value.context.weeklyExerciseIds.length === 0 && value.context.sorenessRegions.length === 0;
    }), {}, week);
    const next = await page.evaluate(oldWeek => { const key = Object.keys(sessionStorage).find(key => key.startsWith('fitness_questionnaire_signed-out_') && !key.endsWith(oldWeek)); return JSON.parse(sessionStorage.getItem(key)); }, week);
    assert.deepEqual(next.context.weeklyExerciseIds, []); assert.deepEqual(next.context.sorenessRegions, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${layout}: questionnaire fits viewport`);
    assert.deepEqual(errors, []);
    console.log(`${layout}: weekly selection, draft reload, preview/back/apply, library/favorite separation, eight-choice limit, clinical priority, English and week rollover passed`);
    await context.close();
  }
} finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
