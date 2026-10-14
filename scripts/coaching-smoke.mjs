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
    const click = text => page.evaluate(label => {
      const button = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === label && !item.disabled);
      if (!button) throw new Error(`Missing enabled button: ${label}`); button.click();
    }, text);
    const selectDay = label => page.evaluate(text => {
      const button = [...document.querySelectorAll('main button')].find(item => item.innerText.startsWith(text));
      if (!button) throw new Error(`Missing day: ${text}`); button.click();
    }, label);
    const draft = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1')).publicDraft);
    await page.goto(siteUrl, { waitUntil: 'networkidle2' });
    await page.evaluate(() => document.querySelector('form details summary').click());
    await page.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find(item => item.textContent.startsWith('肩部狀態與活動限制'));
      const select = label.querySelector('select'); select.value = 'unrestricted'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click('產生免費課表'); await waitText('這是你的免費課表預覽'); await selectDay('週一');
    await page.waitForSelector('section[data-phase="strength"] [data-testid^="exercise-log-"]');
    const id = await page.$eval('section[data-phase="strength"] [data-testid^="exercise-log-"]', item => item.dataset.testid.slice('exercise-log-'.length));
    const logSelector = `[data-testid="exercise-log-${id}"]`;
    await page.$eval(`${logSelector} summary`, item => item.click());
    assert.ok(await page.$$eval(`${logSelector} input[required][type="number"]`, items => items.every(item => item.value === '')), `${layout}: actual performance starts blank`);
    await page.$$eval(`${logSelector} input[required][type="number"]`, items => {
      for (const input of items) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '6'); input.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await page.select(`${logSelector} select`, 'dumbbell');
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
    await click('儲存訓練紀錄');
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1'))?.publicDraft?.logs?.length === 1);
    const original = await draft();
    assert.equal(original.logs[0].date, today, `${layout}: Monday supplement uses actual Wednesday date`);
    assert.equal(original.logs[0].loadKg, 5); assert.equal(original.logs[0].loadBasis, 'per_dumbbell');
    assert.equal(original.logs[0].nextDay, 'pending');
    assert.notEqual(original.completed[`day1_${id}`], true, `${layout}: logging does not complete an exercise`);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__link = text; } } }));
    await click('複製連結'); await waitText('課表連結已複製。');
    const shared = await page.evaluate(() => new TextDecoder().decode(Uint8Array.from(atob(window.__link.split('#workout=')[1].replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0))));
    for (const privateField of ['PRIVATE_VARIANT_TEST', 'loadKg', 'rir', 'symptoms', 'logs', 'readiness']) assert.ok(!shared.includes(privateField), `${layout}: share excludes ${privateField}`);
    await page.reload({ waitUntil: 'networkidle2' }); await waitText('這是你的免費課表預覽'); await selectDay('週三');
    const before = await draft(); const day = before.plan.schedule.find(item => item.day === 3);
    const doneId = day.prescriptions.find(item => item.phase === 'strength').id;
    const doneName = await page.$eval(`[data-testid="exercise-log-${doneId}"]`, item => item.parentElement.querySelector('button[aria-pressed]').getAttribute('aria-label'));
    await page.click(`button[aria-label=${JSON.stringify(doneName)}][aria-pressed]`);
    await page.$eval('[data-testid="daily-readiness"] summary', item => item.click());
    await page.evaluate(() => {
      const select = [...document.querySelectorAll('[data-testid="daily-readiness"] label')].find(item => item.textContent.startsWith('訓練中症狀')).querySelector('select');
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
    await page.reload({ waitUntil: 'networkidle2' }); await waitText('這是你的免費課表預覽');
    assert.deepEqual((await draft()).plan.schedule.find(item => item.day === 3), adjustedDay, `${layout}: completed strength without unfinished warmup survives reload`);
    assert.equal((await draft()).logs.length, 1); assert.equal((await draft()).readiness.length, 1);
    await click('成效'); await waitText('實際訓練與翌日追蹤');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(item => item.innerText.trim() === '翌日沒有惡化')), false, `${layout}: no same-day follow-up`);
    await page.evaluate(() => { sessionStorage.setItem('__coachingTestNow', String(Date.now() + 86400000)); window.dispatchEvent(new Event('focus')); });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.innerText.trim() === '翌日沒有惡化'));
    await click('翌日沒有惡化');
    await page.waitForFunction(() => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1')).publicDraft.logs[0].nextDay === 'good');
    await click('每天'); await click('以訪客身分儲存課表'); await waitText('綁定 Google 並保留紀錄');
    await page.waitForFunction(() => !JSON.parse(sessionStorage.getItem('fitness_public_preview_v1') || '{}').pendingDraft);
    await click('成效'); await page.waitForSelector('[data-testid="training-history"] details summary');
    await page.$eval('[data-testid="training-history"] details summary', item => item.click()); await waitText('PRIVATE_VARIANT_TEST');
    await page.reload({ waitUntil: 'networkidle2' }); await click('成效'); await page.waitForSelector('[data-testid="training-history"] details summary');
    await page.$eval('[data-testid="training-history"] details summary', item => item.click()); await waitText('PRIVATE_VARIANT_TEST');
    await click('每天'); await selectDay('週一'); await page.waitForSelector(logSelector);
    await page.$eval(`${logSelector} summary`, item => item.click());
    assert.equal(await page.$eval(`${logSelector} input[max="10"]`, item => item.value), '3', `${layout}: cloud actual values populate after async load`);
    await page.$eval(`${logSelector} input[max="10"]`, input => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '4'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('🌐 English'); await waitText('Actual training date');
    assert.equal(await page.$eval(`${logSelector} input[max="10"]`, item => item.value), '4', `${layout}: unsaved form survives language switch`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${layout}: coaching UI fits viewport`);
    assert.deepEqual(errors, [], `${layout}: no runtime errors`);
    console.log(`${layout}: actual logs/date, private sharing, readiness preview/apply, completed-dose reload, next-day feedback, atomic guest adoption, async load and language persistence passed`);
    await context.close();
  }
} finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
