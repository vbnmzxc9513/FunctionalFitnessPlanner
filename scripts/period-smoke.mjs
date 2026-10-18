import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { localDate, getWeekString, dateForWeekDay } from '../src/domain/dates.js';

const actualToday = localDate();
// Keep local actuals in the real past so reloading at the emulator's real
// date tests retention without importing impossible future training facts.
const today = dateForWeekDay(getWeekString(new Date(), -1), 3);
const shift = days => { const value = new Date(`${today}T12:00:00`); value.setDate(value.getDate() + days); return localDate(value); };
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', '5177'], { env: process.env, stdio: 'ignore' });
const site = 'http://127.0.0.1:5177/FunctionalFitnessPlanner/';
let browser; let diagnosticPage;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(site)).ok) break; } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const context = await browser.createBrowserContext(); const page = await context.newPage(); diagnosticPage = page; const errors = []; let external = 0;
    await page.setViewport({ width, height });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(today => {
      localStorage.setItem('app_lang', localStorage.getItem('app_lang') || 'zh');
      if (!sessionStorage.getItem('__periodNow')) sessionStorage.setItem('__periodNow', String(new Date(`${today}T12:00:00`).getTime()));
      const NativeDate = Date;
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [Number(sessionStorage.getItem('__periodNow'))])); } static now() { return Number(sessionStorage.getItem('__periodNow')); } };
    }, today);
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else { external++; request.abort(); } });
    const visible = selector => page.waitForSelector(selector, { visible: true });
    const clickSelector = async selector => { const element = await visible(selector); await element.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await element.click(); await element.dispose(); };
    const click = async text => {
      await page.waitForFunction(label => [...document.querySelectorAll('button')].some(item => item.innerText.trim() === label && item.getClientRects().length && !item.closest('[hidden]') && !item.matches(':disabled')), {}, text);
      const handle = await page.evaluateHandle(label => [...document.querySelectorAll('button')].find(item => item.innerText.trim() === label && item.getClientRects().length && !item.closest('[hidden]') && !item.matches(':disabled')), text);
      await handle.asElement().evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await handle.asElement().click(); await handle.dispose();
    };
    const fill = async (selector, value) => { const input = await visible(selector); await input.evaluate((item, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(item, value); item.dispatchEvent(new Event('input', { bubbles: true })); item.dispatchEvent(new Event('change', { bubbles: true })); }, value); await input.dispose(); };
    const draft = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1') || 'null'));
    const preview = async () => { await clickSelector('[data-testid="plan-preview-create"]'); await visible('[data-testid="period-plan-preview"]'); };
    await page.goto(site, { waitUntil: 'networkidle2' }); await visible('[data-testid="first-plan"] [data-testid="planning-range"]');
    assert.equal(await page.$('[data-testid="planner-form"]'), null, `${layout}: dates precede questionnaire`);
    await fill('[data-testid="planning-range"] input:first-of-type', shift(-1));
    assert.equal(await page.$eval('[data-testid="planning-range-continue"]', item => item.disabled), true, `${layout}: past start blocked`);
    await fill('[data-testid="planning-range"] input', today);
    await page.$$eval('[data-testid="planning-range"] input', (inputs, value) => { const item = inputs[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(item, value); item.dispatchEvent(new Event('input', { bubbles: true })); }, shift(28));
    assert.equal(await page.$eval('[data-testid="planning-range-continue"]', item => item.disabled), true, `${layout}: 29 dates blocked`);
    await page.$$eval('[data-testid="planning-range"] input', (inputs, value) => { const item = inputs[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(item, value); item.dispatchEvent(new Event('input', { bubbles: true })); }, shift(7));
    await clickSelector('[data-testid="planning-range-continue"]');
    await page.select('[data-testid="planner-form"] select', 'strength');
    await clickSelector('[data-testid="training-days"] label:nth-of-type(6)');
    await clickSelector('[data-testid="weekly-preferences"] label');
    await click('下一步'); await clickSelector('[data-regions="stiffnessRegions"] label'); await click('下一步'); await preview();
    assert.equal(await draft(), null, `${layout}: preview has no applied draft`);
    assert.ok(await page.$eval('[data-testid="period-minutes-scope"]', item => item.innerText.includes('球局與比賽時間另計')), `${layout}: preview explains the conditioning-only time estimate`);
    assert.equal(await page.$$eval('[data-testid^="period-day-"]:not([data-testid="period-day-detail"])', items => items.length), 8);
    assert.equal(await page.$$eval('[data-week]', items => items.length), 2);
    await clickSelector(`[data-testid="period-day-${shift(3)}"]`); await visible('[data-testid="period-day-detail"]');
    assert.equal(await page.$$eval('[data-testid="period-plan-preview"] [data-testid^="exercise-log-"]', items => items.length), 0, `${layout}: preview offers no private logging`);
    await click('返回修改條件'); await click('上一步'); await click('上一步');
    assert.equal(await page.$eval('[data-testid="planner-form"] select', item => item.value), 'strength');
    await click('下一步'); await click('下一步'); await preview(); await clickSelector('[data-testid="period-plan-apply"]');
    await page.waitForFunction(() => !!localStorage.getItem('fitness_date_period_v1'));
    const applied = await draft(); assert.equal(Object.keys(applied.sessionsByDate).length, 8); assert.deepEqual(applied.profile.context.trainingDays, [1, 2, 3, 4, 5, 6]);
    assert.equal(external, 0, `${layout}: free planning never calls external AI`);
    await page.reload({ waitUntil: 'networkidle2' }); await click('課表'); await visible('[data-testid="period-plan-preview"]');
    assert.deepEqual((await draft()).sessionsByDate, applied.sessionsByDate, `${layout}: exact dates survive reload`);
    await click('今天'); await visible('[data-testid="session-start"]'); await click('開始今天訓練'); await visible('[data-testid="current-exercise"]');
    const completion = await page.waitForSelector('[data-testid="current-exercise"] button[aria-label][aria-pressed]', { visible: true }); const name = await completion.evaluate(item => item.getAttribute('aria-label')); await completion.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await completion.asLocator().click(); await completion.dispose();
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('fitness_date_period_v1')).progressByWeek).some(progress => Object.values(progress.completed).includes(true)));
    for (let index = 0; index < 10 && !await page.$eval('[data-testid="current-exercise"]', item => !!item.querySelector('[data-testid^="exercise-log-"]')).catch(() => false); index++) await click('查看下一個動作');
    await visible('[data-testid="current-exercise"] [data-testid^="exercise-log-"]');
    await page.$$eval('[data-testid="current-exercise"] input[required][type="number"]', inputs => { for (const input of inputs) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '4'); input.dispatchEvent(new Event('input', { bubbles: true })); } });
    await click('儲存紀錄');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')).logs.length === 1);
    const facts = await draft(); const original = facts.sessionsByDate[today];
    assert.equal(facts.logs[0].date, today, `${layout}: actual training uses the current date`);

    await click('課表'); await click('規劃另一段日期'); await clickSelector('[data-testid="planning-range-continue"]'); await click('下一步'); await click('下一步'); await preview();
    assert.ok(await page.$eval(`[data-testid="period-day-${today}"]`, item => item.innerText.includes('已有紀錄')), `${layout}: completion protects the date`);
    await clickSelector('[data-testid="period-plan-apply"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="period-plan-apply"]'));
    assert.deepEqual((await draft()).sessionsByDate[today], original, `${layout}: applying never overwrites completed date`);
    assert.deepEqual((await draft()).progressByWeek, facts.progressByWeek);
    assert.deepEqual((await draft()).logs, facts.logs, `${layout}: replan preserves actual values`);
    await page.evaluate(date => { sessionStorage.setItem('__periodNow', String(new Date(`${date}T12:00:00`).getTime())); window.dispatchEvent(new Event('focus')); }, shift(5));
    await click('課表'); await visible('[data-testid="period-plan-preview"]');
    assert.ok((await draft()).sessionsByDate[shift(7)], `${layout}: next week retains already planned dates`);
    await click('設定'); await click('🌐 English'); await click('Plan'); await visible('[data-testid="period-plan-preview"]');
    assert.equal(await page.$eval('[data-testid="period-plan-preview"] h2', item => item.innerText), 'Saved plan by date', `${layout}: saved overview controls are localized`);
    await click('Plan another date range');
    await fill('[data-testid="planning-range"] input', shift(5));
    await clickSelector('[data-testid="planning-range-continue"]'); await click('Next'); await click('Next'); await preview();
    const beforeStale = await draft();
    await page.evaluate(date => { sessionStorage.setItem('__periodNow', String(new Date(`${date}T12:00:00`).getTime())); window.dispatchEvent(new Event('focus')); }, shift(6));
    await page.waitForFunction(() => document.querySelector('[data-testid="period-plan-apply"]')?.disabled);
    assert.deepEqual(await draft(), beforeStale, `${layout}: date rollover invalidates the unapplied preview without changing facts`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (process.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
      await page.evaluate(date => { sessionStorage.setItem('__periodNow', String(new Date(`${date}T12:00:00`).getTime())); window.dispatchEvent(new Event('focus')); }, actualToday);
      await click('Settings'); await click('Create an anonymous account');
      await page.waitForFunction(() => document.body.innerText.includes('Preview date plan for this account'));
      assert.deepEqual(await draft(), beforeStale, `${layout}: sign-in retains device records without assigning them to an account`);
      assert.equal(await page.$('[data-testid="period-plan-apply"]'), null, `${layout}: an unsigned preview cannot cross account scope`);
      await click('Preview date plan for this account');
      await fill('[data-testid="planning-range"] input', actualToday);
      await click('7 days'); await clickSelector('[data-testid="planning-range-continue"]');
      for (const day of [6, 7]) {
        const selected = await page.$eval(`[data-testid="training-days"] label:nth-of-type(${day}) input`, item => item.checked);
        if (!selected) await clickSelector(`[data-testid="training-days"] label:nth-of-type(${day})`);
      }
      await click('Next');
      await page.select('[data-testid="planner-form"] fieldset:not([hidden]) select', 'unrestricted');
      await click('Next'); await preview();
      await clickSelector('[data-testid="period-plan-apply"]'); await page.waitForFunction(() => !document.querySelector('[data-testid="period-plan-apply"]'));
      await page.reload({ waitUntil: 'networkidle2' }); await click('Plan'); await visible('[data-testid="period-plan-preview"]');
      assert.deepEqual(await draft(), beforeStale, `${layout}: applying an account plan never overwrites device actuals`);
      await click('Records');
      assert.equal(await page.$$eval('[data-testid="latest-training-logs"] article', items => items.length), 0, `${layout}: account history does not silently import local actuals`);
      await click('Today'); await click('Start today’s session'); await visible('[data-testid="current-exercise"]');
      const cloudCompletion = await visible('[data-testid="current-exercise"] button[aria-label][aria-pressed]');
      const cloudCompletedName = await cloudCompletion.evaluate(item => item.getAttribute('aria-label'));
      await page.waitForFunction(item => !item.matches(':disabled'), {}, cloudCompletion);
      await cloudCompletion.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await cloudCompletion.asLocator().click(); await cloudCompletion.dispose();
      await page.waitForFunction(name => [...document.querySelectorAll('button[aria-label][aria-pressed]')].some(item => item.getAttribute('aria-label') === name && item.getAttribute('aria-pressed') === 'true'), {}, cloudCompletedName);
      for (let index = 0; index < 10 && !await page.$eval('[data-testid="current-exercise"]', item => !!item.querySelector('[data-testid^="exercise-log-"]')).catch(() => false); index++) await click('View next exercise');
      await visible('[data-testid="current-exercise"] [data-testid^="exercise-log-"]');
      const actualInputs = await page.$$('[data-testid="current-exercise"] input[required][type="number"]');
      assert.ok(actualInputs.length > 0, `${layout}: native actual performance inputs are visible`);
      for (const input of actualInputs) { await page.waitForFunction(item => !item.matches(':disabled'), {}, input); await input.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await input.asLocator().click({ clickCount: 3 }); await page.keyboard.press('Backspace'); await input.type('3'); assert.equal(await input.evaluate(item => item.value), '3', `${layout}: native actual input holds the entered value`); await input.dispose(); }
      const saveNativeLog = await page.waitForSelector('[data-testid="current-exercise"] button[type="submit"][value="save"]', { visible: true });
      await page.waitForFunction(item => !item.matches(':disabled'), {}, saveNativeLog);
      await saveNativeLog.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await saveNativeLog.asLocator().click(); await saveNativeLog.dispose();
      await page.waitForFunction(() => document.querySelector('[data-testid="current-exercise"]')?.innerText.includes('Saved'));
      await click('Records'); await visible('[data-testid="latest-training-logs"]');
      await page.reload({ waitUntil: 'networkidle2' }); await click('Records'); await visible('[data-testid="latest-training-logs"]');
      assert.ok(await page.$eval('[data-testid="latest-training-logs"]', (item, date) => item.innerText.includes(date), actualToday), `${layout}: signed-in native actual log survives reload`);
      await click('Today');
      await page.waitForFunction(name => [...document.querySelectorAll('button[aria-label][aria-pressed]')].some(item => item.getAttribute('aria-label') === name && item.getAttribute('aria-pressed') === 'true'), {}, cloudCompletedName);
      assert.deepEqual(await draft(), beforeStale, `${layout}: cloud execution preserves the device record scope`);

    }
    assert.deepEqual(errors, []); assert.ok(name);
    console.log(`${layout}: date-first validation, custom partial cross-week/weekend preview/back/apply, actual logs/execution, reload, protected facts, stale rollover, English and account isolation passed`);
    await context.close();
  }
} catch (error) { if (diagnosticPage && !diagnosticPage.isClosed()) { await diagnosticPage.screenshot({ path: '/tmp/period-smoke.mjs.png', fullPage: true }); await writeFile('/tmp/period-smoke.mjs.txt', await diagnosticPage.evaluate(() => document.body.innerText)); await writeFile('/tmp/period-smoke.debug.json', JSON.stringify(await diagnosticPage.evaluate(() => {
      const node = document.querySelector('[data-testid="current-exercise"] [data-testid^="exercise-log-"]');
      let fiber = node?.[Object.keys(node || {}).find(key => key.startsWith('__reactFiber'))];
      while (fiber && fiber.type?.name !== 'ExerciseLog') fiber = fiber.return;
      const props = fiber?.memoizedProps; const states = []; let hook = fiber?.memoizedState;
      for (let count = 0; hook && count < 12; count++, hook = hook.next) states.push(hook.memoizedState);
      return { inputs: [...(node?.querySelectorAll('input') || [])].map(input => ({ value: input.value, required: input.required, type: input.type })), props: props ? { date: props.date, week: props.week, day: props.day, id: props.id, dose: props.dose, contextToday: props.context?.today } : null, states };
    }), null, 2)); } throw error; } finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
