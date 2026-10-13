import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { TRANSLATIONS } from '../src/locale.js';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
const siteUrl = 'http://127.0.0.1:5174/FunctionalFitnessPlanner/';
let serverExit = null;
let serverOutput = '';
server.once('exit', code => { serverExit = code ?? 1; });
server.stdout.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-4000); });
server.stderr.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-4000); });
let browser;
try {
  // Terminal formatting and stdout chunk boundaries vary in CI. Check the real
  // endpoint instead of interpreting the development server's banner.
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline) {
    if (serverExit !== null) throw new Error(`Vite exited: ${serverExit}\n${serverOutput}`);
    try {
      const response = await fetch(siteUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* The listener may not have started yet. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error(`Vite startup timed out\n${serverOutput}`);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height });
    await page.evaluateOnNewDocument(() => localStorage.setItem('app_lang', 'zh'));
    const errors = [];
    let planningPayload;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(`[${layout}] ${message.text()}`); });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname === 'generativelanguage.googleapis.com') {
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
        if (request.method() === 'OPTIONS') request.respond({ status: 204, headers });
        else if (url.pathname.endsWith(':generateContent')) {
          planningPayload = JSON.parse(request.postData());
          const plan = { conclusion: 'Mock recovery plan', schedule: [1, 2, 3, 4, 5].map(day => ({ day, name: 'Day', theme: 'Recovery', concept: 'Keep control', coachAdvice: 'Check next-day response', routine: day === 1 ? ['bf_B01'] : [], prescriptions: day === 1 ? [{ id: 'bf_B01', sets: 1, value: '6', unit: 'reps', restSeconds: 90, perSide: true }] : [] })) };
          request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }) });
        } else request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }) });
      } else if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue();
      else request.abort(); // Integration tests must never contact production services.
    });
    const click = text => page.evaluate(label => {
      const button = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === label && !item.disabled);
      if (!button) throw new Error(`Missing enabled button: ${label}`);
      button.click();
    }, text);
    const waitText = text => page.waitForFunction(label => document.body.innerText.includes(label), {}, text);
    const selectMonday = () => page.evaluate(label => {
      const button = [...document.querySelectorAll('main button')].find(item => item.innerText.startsWith(label));
      if (!button) throw new Error('Monday tab missing');
      button.click();
    }, TRANSLATIONS.zh.dayShort[0]);
    await page.goto(siteUrl, { waitUntil: 'networkidle2' });
    await waitText('本日課表');
    await click('訪客');
    await waitText('綁定 Google 並保留紀錄');
    try {
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.innerText.trim() === '編輯課表' && !item.disabled), { timeout: 15000 });
    } catch (error) {
      console.error(await page.evaluate(() => document.body.innerText));
      throw error;
    }
    const name = await page.$eval('button[aria-label][aria-pressed]', button => button.getAttribute('aria-label'));
    await page.click(`button[aria-label=${JSON.stringify(name)}][aria-pressed]`);
    await page.waitForSelector(`button[aria-label=${JSON.stringify(name)}][aria-pressed="true"]`);
    await page.waitForFunction(() => !document.querySelector('button[aria-label][aria-pressed]').disabled);
    await click('編輯課表');
    await page.click(`button[aria-label=${JSON.stringify(`移除動作 ${name}`)}]`);
    assert.equal(await page.$$eval('select', items => items.length), 1, `${layout} has an add control`);
    const removedId = await page.$eval('select', (select, exerciseName) => [...select.options].find(option => option.textContent === exerciseName)?.value, name);
    assert.ok(removedId, `${layout} removed exercise can be added again`);
    await page.select('select', removedId);
    await click('新增');
    await page.waitForSelector(`button[aria-label=${JSON.stringify(`移除動作 ${name}`)}]`);
    await page.click(`button[aria-label=${JSON.stringify(`移除動作 ${name}`)}]`);
    await click('儲存修改');
    await waitText('課表已儲存');
    // The transaction acknowledgement and realtime query update are separate events.
    await page.waitForSelector(`button[aria-label=${JSON.stringify(name)}][aria-pressed]`, { hidden: true });
    assert.equal(await page.$(`button[aria-label=${JSON.stringify(name)}][aria-pressed]`), null);
    await page.reload({ waitUntil: 'networkidle2' });
    await waitText('↩ 復原上一次的課表');
    await click('↩ 復原上一次的課表');
    await page.waitForSelector(`button[aria-label=${JSON.stringify(name)}][aria-pressed="true"]`);
    await page.waitForFunction(() => !document.querySelector('button[aria-label][aria-pressed]').disabled);
    await click('太簡單\n需增量');
    await waitText('神經適應期 (高)');
    await page.waitForFunction(() => !document.querySelector('button[aria-label][aria-pressed]').disabled);
    await click('太簡單\n需增量');
    await page.waitForFunction(() => !document.querySelector('button[aria-label][aria-pressed]').disabled);
    await click('剛好\n維持架構');
    await waitText('功能性建構期 (中)');
    await click('動作庫'); await waitText('羽球訓練動作庫');
    await page.select('select[aria-label="依訓練分類篩選"]', 'core');
    await page.type('input[aria-label="搜尋動作或編號"]', '90/90');
    assert.equal(await page.$$eval('button[role="switch"]', items => items.length), 1);
    await waitText('次呼吸');
    await click('設定'); await page.waitForSelector('input[type="password"]');
    await page.type('input[type="password"]', 'mock-test-only');
    await click(TRANSLATIONS.zh.settingsSaveBtn);
    await click('教練'); await waitText('羽球體能教練');
    await click(TRANSLATIONS.zh.aiTweakBtn);
    await page.select('select', 'mixed'); // First select is court intensity.
    await page.evaluate(() => {
      const labels = [...document.querySelectorAll('label')];
      for (const [text, value] of [['肩部狀態與活動限制', 'restricted']]) {
        const select = labels.find(label => label.textContent.startsWith(text)).querySelector('select');
        select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const days = [...document.querySelectorAll('fieldset label')].filter(label => label.textContent.startsWith('星期'));
      for (const day of [2, 5, 6]) days[day - 1].querySelector('input').click();
    });
    await click(TRANSLATIONS.zh.aiRegenerateBtn); await waitText('Mock recovery plan');
    assert.ok(planningPayload.contents[0].parts[0].text.includes('肩部／健康限制'));
    const candidateSection = planningPayload.contents[0].parts[0].text.split('【可用候選動作；ID 必須完全相同】')[1].split('【輸出要求】')[0].trim();
    assert.ok(!JSON.parse(candidateSection).some(item => item.shoulderLoaded));
    await click('每天'); await selectMonday(); await page.waitForSelector('button[aria-label="分腿蹲"][aria-pressed]');
    // Generated per-day dose survives a reload rather than reverting to global level.
    await page.reload({ waitUntil: 'networkidle2' });
    await click('每天'); await selectMonday();
    await waitText('每側');
    assert.ok(await page.evaluate(() => document.body.innerText.includes('1 組 × 6 下')));
    await click('數據');
    await page.waitForSelector('input[name="weight"]');
    await page.type('input[name="weight"]', '70');
    await page.type('input[name="bodyFat"]', '18');
    await click('儲存紀錄'); await waitText('身體數據已成功儲存');
    await page.$eval('input[name="weight"]', input => input.select());
    await page.type('input[name="weight"]', '72');
    await page.$eval('input[name="bodyFat"]', input => input.select());
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.innerText.trim() === '儲存紀錄' && !item.disabled));
    await click('儲存紀錄');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(item => item.innerText.trim() === '儲存紀錄' && !item.disabled));
    const date = await page.$eval('input[name="date"]', input => input.value);
    await page.reload({ waitUntil: 'networkidle2' });
    await click('數據'); await page.waitForSelector('input[name="date"]');
    await page.$eval('input[name="date"]', input => {
      input.value = '2026-01-01'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Use the native setter so React receives a real controlled input change.
    await page.$eval('input[name="date"]', (input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    }, date);
    await page.waitForFunction(() => document.querySelector('input[name="bodyFat"]').value === '18');
    assert.equal(await page.$eval('input[name="weight"]', input => input.value), '72');
    await click('每天');
    const oldWeek = await page.evaluate(() => document.body.innerText.match(/\d{4}-W\d{2}/)[0]);
    await page.evaluate(() => {
      const NativeDate = Date; const timestamp = Date.now() + 7 * 86400000;
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [timestamp])); } static now() { return timestamp; } };
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForFunction(week => !document.body.innerText.includes(week), {}, oldWeek);
    await page.waitForFunction(() => document.querySelector('button[aria-label][aria-pressed]')?.getAttribute('aria-pressed') === 'false');
    await click('登出');
    await waitText('登入');
    assert.equal(await page.$('button[aria-pressed="true"]'), null, `${layout} logout clears progress`);
    await click('🌐 English'); await waitText("Today's Workout");
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    assert.deepEqual(errors, [], `${layout} has no runtime errors`);
    console.log(`${layout}: guest login, completion, editing/restore, catalog search, planning inputs, mock AI doses, feedback, metrics, rollover, logout, English passed`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
