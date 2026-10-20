import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { decodePlanPayload } from '../src/domain/sharedPlans.js';
import { manualDraftStorageKey, shiftManualDate } from '../src/domain/manualPlanner.js';

// Real signed-out application journey. Requests to production services are blocked;
// all mutations use this suite's isolated browser contexts and device storage.
const port = Number(process.env.WORKOUT_PLANNER_SMOKE_PORT || 5194);
const plannedValues = doses => doses.map(value => { const copy = structuredClone(value); if (copy.preparation) delete copy.preparation.instruction; return copy; });
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', String(port)], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
const site = `http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
let serverExit = null, serverOutput = '', browser, diagnosticPage, step = 'startup';
server.once('exit', code => { serverExit = code ?? 1; });
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-5000); });
try {
  const deadline = Date.now() + 25000;
  let ready = false;
  while (Date.now() < deadline) {
    if (serverExit !== null) throw new Error(`Vite exited (${serverExit}): ${serverOutput}`);
    try { if ((await fetch(site, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.ok(ready, `Vite startup: ${serverOutput}`);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, width, height] of [['narrow', 320, 844], ['mobile', 390, 844], ['desktop', 1440, 1000]]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage(); diagnosticPage = page;
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(`[${layout}] ${error.message}`); });
    page.on('console', message => { if (message.type() === 'error') console.error(`[${layout}] ${message.text()}`); });
    await page.setViewport({ width, height });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue();
      else request.abort();
    });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('app_lang', 'zh');
      window.__workoutSmokeVisible = element => {
        if (!element?.getClientRects().length || element.closest('[hidden]') || getComputedStyle(element).visibility === 'hidden') return false;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) return false;
        }
        return true;
      };
    });
    const visible = async (selector, label = null) => {
      await page.waitForFunction((selector, label) => [...document.querySelectorAll(selector)].some(item => window.__workoutSmokeVisible(item)
        && (label === null || item.innerText.replace(/\s+/g, ' ').trim() === label)), {}, selector, label);
      return (await page.evaluateHandle((selector, label) => [...document.querySelectorAll(selector)].find(item => window.__workoutSmokeVisible(item)
        && (label === null || item.innerText.replace(/\s+/g, ' ').trim() === label)), selector, label)).asElement();
    };
    const tap = async handle => {
      await page.waitForFunction(item => !item.disabled, {}, handle);
      await handle.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await handle.click(); await handle.dispose();
    };
    const click = async label => tap(await visible('button', label));
    const clickSelector = async selector => tap(await visible(selector));
    const fill = async (selector, value) => {
      const handle = await visible(selector);
      await handle.evaluate((item, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(item, value);
        item.dispatchEvent(new Event('input', { bubbles: true })); item.dispatchEvent(new Event('change', { bubbles: true }));
      }, value);
      await handle.dispose();
    };
    const fits = async scope => {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${layout}: no page overflow at ${scope}`);
      const short = await page.$$eval('[data-testid="manual-planner"] button', items => items.filter(window.__workoutSmokeVisible).filter(item => item.getBoundingClientRect().height < 44).map(item => item.innerText));
      assert.deepEqual(short, [], `${layout}: manual buttons are at least 44px at ${scope}`);
    };
    const period = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1') || 'null'));

    step = `${layout}: open manual and select date`;
    await page.goto(site, { waitUntil: 'networkidle2' });
    await click('課表'); await clickSelector('[data-testid="open-manual-planner"]');
    await visible('[data-testid="manual-range-from"]');
    const today = await page.$eval('[data-testid="manual-range-from"]', input => input.value);
    const firstDate = shiftManualDate(today, 2), secondDate = shiftManualDate(today, 9);
    await fits('dates');
    await clickSelector(`[data-testid="manual-date-${firstDate}"]`); await clickSelector('[data-testid="manual-start"]');
    assert.equal(await page.$$eval('[data-testid="session-plan-editor"] [data-exercise-id]', items => items.length), 0, `${layout}: a manual plan starts empty`);
    await fits('empty editor');

    step = `${layout}: equipment, full warmup and cross-filter batch`;
    const equipment = await page.evaluateHandle(() => [...document.querySelectorAll('[data-testid="manual-planner"] summary')].find(item => item.innerText.startsWith('可用器材設定')));
    await tap(equipment.asElement());
    const dumbbell = await page.evaluateHandle(() => [...document.querySelectorAll('[data-testid="manual-planner"] details label')].find(item => item.innerText === '啞鈴'));
    await tap(dumbbell.asElement());
    await clickSelector('[data-testid="manual-add-warmup"]');
    await fill('[data-testid="batch-picker-search"]', 'A13'); await clickSelector('[data-testid="batch-option-bf_A13"]'); await clickSelector('[data-testid="batch-picker-add"]');
    assert.equal(await page.$$eval('[data-testid="session-plan-editor"] [data-exercise-id]', items => items.length), 1, `${layout}: all eight warmup parts use one slot`);
    await clickSelector('[data-testid="manual-add-strength"]');
    const cart = await page.$eval('[data-testid="batch-picker-actions"]', item => { const box = item.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, height: innerHeight }; });
    assert.ok(cart.top >= 0 && cart.bottom <= cart.height, `${layout}: batch selection count and add action are visible before scrolling results`);
    await click('腿'); await clickSelector('[data-testid="batch-option-bf_B01"]');
    await click('胸'); await clickSelector('[data-testid="batch-option-bf_C11"]');
    assert.ok((await page.$eval('[data-testid="batch-exercise-picker"]', item => item.innerText)).includes('已選 2 個'), `${layout}: selection survives region change`);
    await fits('batch picker');
    await page.screenshot({ path: `/tmp/planner-manual-${layout}.png`, fullPage: false });
    await clickSelector('[data-testid="batch-picker-add"]');
    await page.waitForFunction(() => document.activeElement?.dataset.testid === 'manual-add-strength');
    assert.ok((await page.$eval('[data-testid="session-plan-editor"]', item => item.innerText)).includes('輕量準備組'), `${layout}: first lift preparation is visible`);
    await clickSelector('[data-testid="manual-add-strength"]');
    await click('腿');
    assert.equal(await page.$eval('[data-testid="batch-option-bf_B01"]', item => item.disabled), true, `${layout}: existing exercise cannot be duplicated`);
    await clickSelector('[data-testid="batch-picker-cancel"]');

    step = `${layout}: edit the exact exercise and restore draft`;
    await fill('[data-testid="manual-session-name"]', `腿部 A 課 ${layout}`);
    const edit = await page.evaluateHandle(() => document.querySelector('[data-exercise-id="bf_C11"] button[aria-label^="編輯"]'));
    await tap(edit.asElement());
    const form = '[data-exercise-id="bf_C11"] form';
    await fill(`${form} input[type="number"]`, '3');
    await fill(`${form} input:not([type])`, '8');
    await fill(`${form} input[type="number"]:not([max="5"])`, '45');
    await page.$$eval(`${form} select`, items => { items[1].value = 'accessory'; items[1].dispatchEvent(new Event('change', { bubbles: true })); });
    await click('儲存草稿修改');
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).sessions[0].prescriptions.some(dose => dose.id === 'bf_C11' && dose.phase === 'accessory' && dose.restSeconds === 45), {}, manualDraftStorageKey());
    const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).sessions[0], manualDraftStorageKey());
    assert.equal(before.prescriptions.find(dose => dose.id === 'bf_B01').sets, 2, `${layout}: neighboring lift dose unchanged`);
    assert.equal(before.prescriptions.find(dose => dose.id === 'bf_C11').sets, 3);
    assert.equal(await period(), null, `${layout}: editor has not applied anything`);
    await page.reload({ waitUntil: 'networkidle2' }); await click('課表'); await clickSelector('[data-testid="open-manual-planner"]');
    await visible('[data-testid="session-plan-editor"]');
    const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).sessions[0], manualDraftStorageKey());
    assert.deepEqual(restored, before, `${layout}: draft survives reload`);

    step = `${layout}: review and apply`;
    await clickSelector('[data-testid="manual-review"]'); await visible('[data-testid="apply-workout-plan"]');
    assert.equal(await period(), null, `${layout}: review is not application`);
    await clickSelector('[data-testid="assignment-preview"]'); await click('查看內容');
    assert.ok((await page.$eval('[data-testid="apply-workout-plan"]', item => item.innerText)).includes('準備'), `${layout}: preview includes preparation`);
    await clickSelector('[data-testid="assignment-apply"]');
    await page.waitForFunction(date => JSON.parse(localStorage.getItem('fitness_date_period_v1') || '{}').sessionsByDate?.[date], {}, firstDate);
    const applied = (await period()).sessionsByDate[firstDate];
    assert.equal(applied.theme, `腿部 A 課 ${layout}`, `${layout}: custom day title survives preview and application`);
    assert.deepEqual(applied.routine, before.routine, `${layout}: application retains every selected exercise`);
    assert.deepEqual(applied.prescriptions, before.prescriptions, `${layout}: application retains doses and exact phases`);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), manualDraftStorageKey()), null, `${layout}: successful apply clears saved manual draft`);

    step = `${layout}: save a named workout and reuse it on another day`;
    await visible('[data-testid="period-plan-preview"]'); await page.screenshot({ path: `/tmp/planner-overview-${layout}.png`, fullPage: false }); await clickSelector(`[data-testid="period-day-${firstDate}"]`); await clickSelector('[data-testid="save-period-day"]');
    await fill('dialog[open] form input', `手動排課煙霧測試 ${layout}`); await click('確認收藏');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await clickSelector('[data-testid="open-saved-workouts"]'); await visible('article');
    assert.ok((await page.$eval('article', item => item.innerText)).includes(`手動排課煙霧測試 ${layout}`));
    await click('選日期套用'); await click('逐天指定日期'); await fill('input[aria-label="第 1 天套用日期"]', secondDate);
    await clickSelector('[data-testid="assignment-preview"]'); await clickSelector('[data-testid="assignment-apply"]');
    await page.waitForFunction(date => JSON.parse(localStorage.getItem('fitness_date_period_v1')).sessionsByDate[date], {}, secondDate);
    const reused = await period();
    assert.deepEqual(reused.sessionsByDate[firstDate], applied, `${layout}: reuse preserves the original scheduled day`);
    assert.deepEqual(reused.sessionsByDate[secondDate].routine, before.routine, `${layout}: reuse includes every exercise`);
    assert.deepEqual(plannedValues(reused.sessionsByDate[secondDate].prescriptions), plannedValues(before.prescriptions), `${layout}: reuse preserves phases, rest and preparation`);

    step = `${layout}: find the original scheduled week without changing data`;
    await visible('[data-testid="local-plan-view"]');
    await page.select('[data-testid="local-plan-view"]', applied.week);
    await visible(`[data-testid="period-day-${firstDate}"]`);
    assert.equal(await page.$(`[data-testid="period-day-${secondDate}"]`), null, `${layout}: browsing a week only shows its own dates`);
    assert.deepEqual(await period(), reused, `${layout}: changing the displayed week is read-only`);
    await page.select('[data-testid="local-plan-view"]', '');
    await visible(`[data-testid="period-day-${secondDate}"]`);

    step = `${layout}: share a copy from saved workouts`;
    await clickSelector('[data-testid="open-saved-workouts"]'); await clickSelector(`article button[aria-label="分享 手動排課煙霧測試 ${layout}"]`);
    await click('建立分享連結'); await visible('[role="dialog"] input[readonly]');
    const link = await page.$eval('[role="dialog"] input[readonly]', item => item.value);
    const payload = decodePlanPayload(new URL(link).hash.slice('#program='.length));
    assert.equal(payload.days.length, 1);
    assert.equal(payload.days[0].items.length, before.routine.length, `${layout}: shared copy omits no exercises`);
    assert.equal(JSON.stringify(payload).includes(firstDate), false, `${layout}: original calendar date is not shared`);
    step = `${layout}: receiver previews and imports a real link`;
    const recipientContext = await browser.createBrowserContext();
    const recipient = await recipientContext.newPage();
    await recipient.setViewport({ width, height });
    await recipient.setRequestInterception(true);
    recipient.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else request.abort(); });
    recipient.on('pageerror', error => errors.push(error.message));
    await recipient.evaluateOnNewDocument(() => localStorage.setItem('app_lang', 'zh'));
    await recipient.goto(link, { waitUntil: 'networkidle2' });
    await recipient.waitForSelector('[data-testid="workout-plan-summary"]');
    assert.equal(await recipient.evaluate(() => localStorage.getItem('fitness_date_period_v1')), null, `${layout}: opening a share never imports automatically`);
    await recipient.screenshot({ path: `/tmp/planner-import-${layout}.png`, fullPage: false });
    const recipientClick = async label => {
      await recipient.waitForFunction(label => [...document.querySelectorAll('button')].some(item => item.innerText === label && !item.disabled), {}, label);
      const handle = (await recipient.evaluateHandle(label => [...document.querySelectorAll('button')].find(item => item.innerText === label), label)).asElement();
      await handle.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await handle.click(); await handle.dispose();
    };
    await recipientClick('匯入我的課表');
    await recipient.waitForSelector('[data-testid="assignment-preview"]');
    await recipientClick('檢查日期並預覽');
    await recipient.waitForSelector('[data-testid="assignment-apply"]');
    await recipient.click('[data-testid="assignment-apply"]');
    await recipient.waitForFunction(() => document.body.innerText.includes('課表已匯入'));
    const imported = await recipient.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')));
    assert.deepEqual(imported.sessionsByDate[today].routine, before.routine);
    assert.deepEqual(plannedValues(imported.sessionsByDate[today].prescriptions), plannedValues(before.prescriptions));
    assert.deepEqual(imported.logs, [], `${layout}: importing never invents actual training records`);
    await recipientClick('查看我的課表'); await recipient.waitForSelector('[data-testid="daily-exercise-list"]');
    assert.deepEqual(Object.keys((await period()).sessionsByDate).sort(), [firstDate, secondDate].sort(), `${layout}: recipient import cannot change sender dates`);
    await recipientContext.close();
    assert.deepEqual(errors, [], `${layout}: no browser runtime errors`);
    console.log(`${layout}: manual → dates → batch → edit → reload → preview → apply → named save → reuse → share → recipient import passed`);
    await context.close(); diagnosticPage = null;
  }
} catch (error) {
  console.error(`Workout planner smoke failed at ${step}`);
  if (diagnosticPage) {
    await writeFile('/tmp/workout-planner-smoke-failure.txt', await diagnosticPage.$eval('body', item => item.innerText)).catch(() => {});
    await diagnosticPage.screenshot({ path: '/tmp/workout-planner-smoke-failure.png', fullPage: true }).catch(() => {});
  }
  throw error;
} finally { await browser?.close(); server.kill(); }
