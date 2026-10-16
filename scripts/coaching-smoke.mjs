import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { getWeekString, dateForWeekDay } from '../src/domain/dates.js';

const week = getWeekString(new Date(), -1);
const today = dateForWeekDay(week, 3);
const timestamp = new Date(`${today}T12:00:00`).getTime();
const siteUrl = 'http://127.0.0.1:5175/FunctionalFitnessPlanner/';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5175', '--strictPort'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; let serverExit = null; let browser;
server.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
server.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
server.on('exit', code => { serverExit = code; });
try {
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline) {
    if (serverExit !== null) throw new Error(`Vite exited: ${serverExit}\n${output}`);
    try { if ((await fetch(siteUrl, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* listener starting */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(ready, `Vite startup timed out\n${output}`);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const context = await browser.createBrowserContext(); const page = await context.newPage(); const errors = [];
    await page.setViewport({ width, height });
    await page.evaluateOnNewDocument(now => {
      localStorage.setItem('app_lang', localStorage.getItem('app_lang') || 'zh');
      if (!sessionStorage.getItem('__coachingTestNow')) sessionStorage.setItem('__coachingTestNow', String(now));
      const NativeDate = Date;
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [Number(sessionStorage.getItem('__coachingTestNow'))])); }
        static now() { return Number(sessionStorage.getItem('__coachingTestNow')); }
      };
    }, timestamp);
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['blob:', 'data:'].includes(url.protocol)) request.continue();
      else request.abort();
    });
    const waitText = text => page.waitForFunction(label => document.body.innerText.includes(label), {}, text);
    const click = async text => {
      await page.waitForFunction(label => [...document.querySelectorAll('button')].some(item => item.innerText.trim() === label && !item.disabled && item.getClientRects().length && !item.closest('[hidden]')), {}, text);
      const handle = await page.evaluateHandle(label => [...document.querySelectorAll('button')].find(item => item.innerText.trim() === label && !item.disabled && item.getClientRects().length && !item.closest('[hidden]')), text);
      const element = handle.asElement(); if (!element) throw new Error(`Missing visible enabled button: ${text}`);
      await element.evaluate(item => item.scrollIntoView({ block: 'center' }));
      await element.asLocator().click(); await handle.dispose();
    };
    const openSummary = async text => {
      await page.waitForFunction(label => [...document.querySelectorAll('summary')].some(item => item.innerText.trim().includes(label) && item.getClientRects().length && !item.closest('[hidden]')), {}, text);
      const handle = await page.evaluateHandle(label => [...document.querySelectorAll('summary')].find(item => item.innerText.trim().includes(label) && item.getClientRects().length && !item.closest('[hidden]')), text);
      const element = handle.asElement(); if (!element) throw new Error(`Missing visible summary: ${text}`);
      if (!(await element.evaluate(item => item.parentElement.open))) { await element.evaluate(item => item.scrollIntoView({ block: 'center' })); await element.asLocator().click(); } await handle.dispose();
    };
    const selectDay = async label => {
      const names = { '週一': 1, '週二': 2, '週三': 3, '週四': 4, '週五': 5, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 };
      await page.waitForFunction(text => [...document.querySelectorAll('main button')].some(item => item.innerText.startsWith(text) && item.getClientRects().length && !item.closest('[hidden]')), {}, label);
      const handle = await page.evaluateHandle(text => [...document.querySelectorAll('main button')].find(item => item.innerText.startsWith(text) && item.getClientRects().length && !item.closest('[hidden]')), label);
      const element = handle.asElement(); if (!element) throw new Error(`Missing visible day: ${label}`);
      await element.evaluate(item => item.scrollIntoView({ block: 'center' })); await element.asLocator().click(); await handle.dispose();
      await page.waitForFunction(date => {
        const root = document.querySelector('#weekly-session-detail');
        return root && !root.hidden && root.getClientRects().length && root.innerText.includes(date);
      }, {}, dateForWeekDay(week, names[label]));
    };
    const draft = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1')).publicDraft);
    await page.goto(siteUrl, { waitUntil: 'networkidle2' });
    assert.equal(await page.$$eval('nav button', buttons => buttons.length), 3);
    assert.equal(await page.$('button[aria-label][aria-pressed]'), null, `${layout}: no editable example before creating a personal plan`);
    await click('下一步');
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find(item => item.textContent.startsWith('肩部狀態與活動限制'));
      const select = label.querySelector('select'); select.value = 'unrestricted'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('下一步'); await click('預覽本週課表'); await page.waitForSelector('[data-testid="weekly-plan-preview"]', { visible: true });
    await click('確認套用本週'); await click('今天'); await page.waitForSelector('[data-testid="session-start"]', { visible: true });
    await click('開始今天訓練'); await page.screenshot({ path: `/tmp/fitness-ux-${layout}-today.png`, fullPage: false }); await page.waitForSelector('[data-testid="current-exercise"]', { visible: true });
    const initialCompletion = (await draft()).completed;
    await click('查看下一個動作');
    assert.deepEqual((await draft()).completed, initialCompletion, `${layout}: next does not complete warm-up`);
    const flow = '[data-testid="current-exercise"] [data-testid="exercise-guide-bf_A12"]';
    await page.waitForSelector(flow, { visible: true });
    assert.equal(await page.$eval(flow, item => item.open), true, `${layout}: eight-part flow starts expanded`);
    assert.equal(await page.$$eval(`${flow} li`, items => items.length), 8, `${layout}: every part is visible without another page`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${layout}: flow does not overflow horizontally`);
    await page.screenshot({ path: `/tmp/fitness-ux-${layout}-daily-warmup.png`, fullPage: true });
    await page.$eval(`${flow} summary`, item => item.click());
    assert.equal(await page.$eval(flow, item => item.open), false, `${layout}: flow details can still be collapsed`);
    await click('查看下一個動作'); await click('查看下一個動作');
    await page.waitForFunction(() => {
      const prep = [...document.querySelectorAll('[data-preparation-for]')].find(item => item.getClientRects().length && !item.closest('[hidden]'));
      const current = document.querySelector('[data-testid="current-exercise"]');
      if (!prep || !current) return false;
      const rectangle = prep.getBoundingClientRect();
      return rectangle.top >= 0 && rectangle.bottom < innerHeight - 72 && !!(prep.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    assert.deepEqual((await draft()).completed, initialCompletion, `${layout}: navigating to preparation does not complete skipped work`);

    await click('課表'); await selectDay('週一');
    await page.waitForSelector('section[data-phase="strength"] [data-testid^="exercise-log-"]', { visible: true });
    const id = await page.$eval('section[data-phase="strength"] [data-testid^="exercise-log-"]', item => item.dataset.testid.slice('exercise-log-'.length));
    const logSelector = `[data-testid="exercise-log-${id}"]`;
    await page.$eval(`${logSelector} summary`, item => item.click());
    assert.ok(await page.$$eval(`${logSelector} input[required][type="number"]`, items => items.every(item => item.value === '')), `${layout}: actual performance starts blank`);
    await page.$$eval(`${logSelector} input[required][type="number"]`, items => {
      for (const input of items) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '6'); input.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await openSummary('阻力、餘力與動作品質');
    await page.evaluate(selector => { const select = [...document.querySelector(selector).querySelectorAll('label')].find(item => item.textContent.startsWith('阻力方式')).querySelector('select'); select.value = 'dumbbell'; select.dispatchEvent(new Event('change', { bubbles: true })); }, logSelector);
    await page.evaluate(selector => {
      const root = document.querySelector(selector);
      const set = (input, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
      set(root.querySelector('input[max="500"][step="0.1"]'), '5');
      set(root.querySelector('input[max="10"]'), '3');
      set(root.querySelector('input[maxlength="120"]'), 'PRIVATE_VARIANT_TEST');
      for (const [label, value] of [['動作品質', 'good'], ['訓練中症狀', 'none']]) {
        const select = [...root.querySelectorAll('label')].find(item => item.textContent.startsWith(label)).querySelector('select');
        select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, logSelector);
    await click('儲存紀錄');
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1'))?.publicDraft?.logs?.length === 1);
    const original = await draft();
    assert.equal(original.logs[0].date, today, `${layout}: Monday supplement uses actual Wednesday date`);
    assert.equal(original.logs[0].loadKg, 5); assert.equal(original.logs[0].loadBasis, 'per_dumbbell');
    assert.equal(original.logs[0].nextDay, 'pending');
    assert.notEqual(original.completed[`day1_${id}`], true, `${layout}: logging does not complete an exercise`);
    await click('儲存並標記完成');
    await page.waitForFunction(key => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1')).publicDraft.completed[key] === true, {}, `day1_${id}`);
    assert.equal((await draft()).logs.length, 1, `${layout}: explicit combined save preserves one factual log and completion together`);
    await click('課表'); await click('調整本週目標');
    await click('下一步'); await click('下一步'); await click('預覽本週課表'); await page.waitForSelector('[data-testid="weekly-plan-preview"]', { visible: true });
    await click('確認套用本週'); await click('今天'); await page.waitForSelector('[data-testid="session-hero"]', { visible: true });
    assert.equal((await draft()).completed[`day1_${id}`], true, `${layout}: public regeneration preserves matching completion facts`);
    assert.equal((await draft()).logs.length, 1, `${layout}: public regeneration preserves private logs`);
    await click('課表'); await selectDay('週一');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__link = text; } } }));
    await openSummary('分享與本週回饋'); await click('複製連結'); await waitText('課表連結已複製。');
    const shared = await page.evaluate(() => new TextDecoder().decode(Uint8Array.from(atob(window.__link.split('#workout=')[1].replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0))));
    for (const privateField of ['PRIVATE_VARIANT_TEST', 'loadKg', 'rir', 'symptoms', 'logs', 'readiness']) assert.ok(!shared.includes(privateField), `${layout}: share excludes ${privateField}`);
    await page.reload({ waitUntil: 'networkidle2' }); await waitText('本分頁暫存'); await click('課表'); await selectDay('週三');
    const before = await draft(); const day = before.plan.schedule.find(item => item.day === 3);
    const doneId = day.prescriptions.find(item => item.phase === 'strength').id;
    const doneName = await page.$eval(`[data-testid="exercise-log-${doneId}"]`, item => item.parentElement.querySelector('button[aria-pressed]').getAttribute('aria-label'));
    await page.click(`button[aria-label=${JSON.stringify(doneName)}][aria-pressed]`);
    await page.$eval('[data-testid="daily-readiness"] summary', item => item.click());
    await page.evaluate(() => {
      const select = [...document.querySelectorAll('[data-testid="daily-readiness"] label')].find(item => item.textContent.startsWith('今天的身體症狀')).querySelector('select');
      select.value = 'worse'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('預覽今天調整'); await page.waitForSelector('[data-testid="readiness-preview"]');
    assert.deepEqual((await draft()).plan, before.plan, `${layout}: preview does not mutate the plan`);
    await click('套用到今天'); await waitText('已依今日狀態調整尚未完成的訓練。');
    const adjusted = await draft(); const adjustedDay = adjusted.plan.schedule.find(item => item.day === 3);
    assert.deepEqual(adjustedDay.routine, [doneId], `${layout}: rest removes unfinished work only`);
    assert.deepEqual(adjustedDay.prescriptions[0], day.prescriptions.find(item => item.id === doneId), `${layout}: completed dose stays exact`);
    await page.click(`button[aria-label=${JSON.stringify(doneName)}][aria-pressed]`);
    await waitText('原課表與私人紀錄已保留。');
    assert.equal((await draft()).completed[`day3_${doneId}`], true, `${layout}: unsafe completion reversal preserves the usable draft`);
    await page.reload({ waitUntil: 'networkidle2' }); await waitText('本分頁暫存');
    assert.deepEqual((await draft()).plan.schedule.find(item => item.day === 3), adjustedDay, `${layout}: completed strength without unfinished warmup survives reload`);
    assert.equal((await draft()).logs.length, 1); assert.equal((await draft()).readiness.length, 1);
    await click('紀錄'); await waitText('訓練紀錄');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(item => item.innerText.trim() === '翌日沒有惡化')), false, `${layout}: no same-day follow-up`);
    await page.evaluate(() => { sessionStorage.setItem('__coachingTestNow', String(Date.now() + 86400000)); window.dispatchEvent(new Event('focus')); });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.innerText.trim() === '翌日沒有惡化'));
    await click('翌日沒有惡化');
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1')).publicDraft.logs[0].nextDay === 'good');
    await click('今天'); await openSummary('本分頁暫存'); await click('免註冊，儲存至匿名帳號');
    await page.waitForFunction(() => !JSON.parse(sessionStorage.getItem('fitness_public_preview_v1') || '{}').pendingDraft && !JSON.parse(sessionStorage.getItem('fitness_public_preview_v1') || '{}').publicDraft);
    await click('紀錄'); await page.waitForSelector('[data-testid="latest-training-logs"]', { visible: true }); await waitText('PRIVATE_VARIANT_TEST');
    await page.reload({ waitUntil: 'networkidle2' }); await click('紀錄'); await page.waitForSelector('[data-testid="latest-training-logs"]', { visible: true }); await waitText('PRIVATE_VARIANT_TEST');
    await click('課表'); await selectDay('週一'); await page.waitForSelector(logSelector);
    await page.$eval(`${logSelector} summary`, item => item.click());
    await openSummary('阻力、餘力與動作品質');
    assert.equal(await page.$eval(`${logSelector} input[max="10"]`, item => item.value), '3', `${layout}: cloud actual values populate after async load`);
    await page.$eval(`${logSelector} input[max="10"]`, input => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '4'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('設定'); await click('🌐 English'); await click('Plan'); await selectDay('Mon'); await waitText('Actual training date');
    assert.equal(await page.$eval(`${logSelector} input[max="10"]`, item => item.value), '4', `${layout}: unsaved form survives language switch`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${layout}: coaching UI fits viewport`);
    await page.screenshot({ path: `/tmp/fitness-ux-${layout}-record.png`, fullPage: false });
    assert.deepEqual(errors, [], `${layout}: no runtime errors`);
    console.log(`${layout}: actual logs/date, private sharing, readiness preview/apply, completed-dose reload, next-day feedback, atomic guest adoption, async load and language persistence passed`);
    await context.close();
  }
} finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
