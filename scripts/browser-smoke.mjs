import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Vite startup timed out')), 20000);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Vite exited: ${code}`)); });
    server.stderr.on('data', chunk => process.stderr.write(chunk));
    server.stdout.on('data', chunk => { if (chunk.toString().includes('Local:')) { clearTimeout(timer); resolve(); } });
  });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height });
    await page.evaluateOnNewDocument(() => localStorage.setItem('app_lang', 'zh'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(`[${layout}] ${message.text()}`); });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue();
      else request.abort(); // Integration tests must never contact production services.
    });
    const click = text => page.evaluate(label => {
      const button = [...document.querySelectorAll('button')].find(item => item.innerText.trim() === label && !item.disabled);
      if (!button) throw new Error(`Missing enabled button: ${label}`);
      button.click();
    }, text);
    const waitText = text => page.waitForFunction(label => document.body.innerText.includes(label), {}, text);
    await page.goto('http://127.0.0.1:5174/FunctionalFitnessPlanner/', { waitUntil: 'networkidle2' });
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
    assert.equal(await page.$(`button[aria-label=${JSON.stringify(name)}][aria-pressed]`), null);
    await page.reload({ waitUntil: 'networkidle2' });
    await waitText('↩ 復原上一次的課表');
    await click('↩ 復原上一次的課表');
    await page.waitForSelector(`button[aria-label=${JSON.stringify(name)}][aria-pressed="true"]`);
    await click('太簡單\n需增量');
    await waitText('神經適應期 (高)');
    await page.waitForFunction(() => !document.querySelector('button[aria-label][aria-pressed]').disabled);
    await click('太簡單\n需增量');
    await page.waitForFunction(() => !document.querySelector('button[aria-label][aria-pressed]').disabled);
    await click('剛好\n維持架構');
    await waitText('功能性建構期 (中)');
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
    console.log(`${layout}: guest login, completion, add/remove/save/restore, feedback, metrics, week rollover, logout, English passed`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
