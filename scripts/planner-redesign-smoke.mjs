import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { manualDraftStorageKey, shiftManualDate } from '../src/domain/manualPlanner.js';
const port = Number(process.env.REDESIGN_SMOKE_PORT || 5198), site = `http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
const output = 'artifacts/planner-redesign'; await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', String(port)], { stdio: 'ignore', env: { ...process.env, SMOKE_DISABLE_HMR: '1' } });
let browser, page, step = '';
try {
  for (let n = 0; n < 150; n++) { try { if ((await fetch(site)).ok) break; } catch { /* starting */ } await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const width of (process.env.REDESIGN_SMOKE_WIDTHS || '320,390,768,1440').split(',').map(Number)) {
    const context = await browser.createBrowserContext(); page = await context.newPage();
    const runtimeErrors = []; page.on('pageerror', error => { runtimeErrors.push(error.message); console.error(error.message); }); page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    await page.setViewport({ width, height: 900 }); await page.setRequestInterception(true);
    page.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else request.abort(); });
    await page.evaluateOnNewDocument(() => { localStorage.setItem('app_lang', 'zh'); });
    const visible = async selector => page.waitForSelector(selector, { visible: true });
    const click = async selector => { const element = await visible(selector); await element.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' })); await element.evaluate(element => element.click()); await element.dispose(); };
    const textClick = async text => {
      await page.waitForFunction(text => [...document.querySelectorAll('button')].some(item => item.innerText.trim() === text && item.getClientRects().length), {}, text);
      const element = (await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(item => item.innerText.trim() === text && item.getClientRects().length), text)).asElement(); await element.evaluate(element => element.click()); await element.dispose();
    };
    const fill = async (selector, value) => { const element = await visible(selector); await element.evaluate((item, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(item, value); item.dispatchEvent(new Event('input', { bubbles: true })); item.dispatchEvent(new Event('change', { bubbles: true })); }, value); await element.dispose(); };
    const shot = async name => { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${output}/actual-${name}-${width}-fold.png` }); await page.screenshot({ path: `${output}/actual-${name}-${width}.png`, fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: no overflow ${name}`); };
    const draft = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).sessions[0], manualDraftStorageKey());
    step = `${width} dates`;
    await page.goto(site, { waitUntil: 'networkidle2' }); await textClick('課表'); await visible('[data-testid="period-plan-preview"]'); await shot('week'); await click('[data-testid="open-manual-planner"]'); await visible('[data-testid="manual-planner"]'); await shot('dates');
    const date = shiftManualDate(new Date().toISOString().slice(0, 10), 1);
    for (let n = 0; !await page.$(`[data-testid="manual-date-${date}"]`) && n < 3; n++) await click('button[aria-label="下一個月"]');
    await click(`[data-testid="manual-date-${date}"]`); await click('[data-testid="manual-start"]'); await visible('.manual-empty-day'); await shot('empty');
    assert.equal(await page.$$eval('[data-testid="session-plan-editor"]', nodes => nodes.length), 0, 'Empty day shows choices before empty phase cards');
    step = `${width} common full preview then add`;
    await click('[data-testid="manual-common-workouts"]'); await shot('picker'); assert.equal(await page.$$eval('.quick-workout-card', nodes => nodes.length), 4);
    await click('[data-testid="quick-view-daily-warmup"]'); await shot('detail'); assert.equal((await draft()).routine.length, 0, 'Preview does not mutate draft');
    assert.equal(await page.$$eval('.quick-preview-list li', nodes => nodes.length), 8);
    await click('[data-testid="quick-workout-add"]'); await visible('[data-testid="session-plan-editor"]'); await shot('day');
    assert.equal((await draft()).routine.length, 8); assert.equal(new Set((await draft()).routine).size, 8); assert.ok(!(await draft()).routine.includes('bf_A13'));
    assert.equal(await page.$$eval('[data-phase="warmup"] [data-exercise-id]', nodes => nodes.length), 8);
    step = `${width} dedup then undo`;
    await click('[data-testid="manual-add-workout"]'); await click('[data-testid="quick-view-hip-internal-rotation"]'); await shot('conflict');
    assert.equal(await page.$$eval('.quick-conflict input[type="radio"]:checked', nodes => nodes.length), 1); // one existing hip transition defaults keep
    await click('[data-testid="quick-workout-add"]'); await visible('[data-testid="session-plan-editor"]'); assert.equal((await draft()).routine.length, 10);
    await textClick('撤銷'); assert.equal((await draft()).routine.length, 8);
    step = `${width} edit, scoped save, reload and mine`;
    await click('[data-exercise-id="bf_A16"] button'); await visible('dialog[open] form');
    await fill('dialog[open] form input[type="number"]', '2'); await textClick('儲存草稿修改');
    assert.equal((await draft()).prescriptions.find(dose => dose.id === 'bf_A16').sets, 2);
    await click('.manual-more > summary'); await textClick('存為我的課表'); await visible('dialog[open] form');
    await page.click('input[value="warmup"]'); await fill('dialog[open] input:not([type])', `暖身測試 ${width}`); await shot('save'); await click('[data-testid="save-workout-confirm"]');
    await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await page.reload({ waitUntil: 'networkidle2' }); await textClick('課表'); await click('[data-testid="open-manual-planner"]'); await visible('[data-testid="session-plan-editor"]'); assert.equal((await draft()).routine.length, 8);
    await click('[data-testid="manual-add-workout"]'); await textClick('我的課表'); await visible('.quick-workout-card'); await shot('mine');
    await textClick('查看'); await visible('.quick-preview-list'); assert.equal(await page.$eval('[data-testid="quick-workout-add"]', node => node.disabled), true, 'All duplicates preserved; do not claim 8 new additions');
    await textClick('返回課表選擇'); await textClick('返回今日草稿');
    step = `${width} review apply`;
    await click('[data-testid="manual-review"]'); await visible('[data-testid="assignment-apply"]'); await shot('review');
    assert.equal(await page.evaluate(() => localStorage.getItem('fitness_date_period_v1')), null, 'Review is not apply');
    await click('[data-testid="assignment-apply"]'); await page.waitForFunction(date => JSON.parse(localStorage.getItem('fitness_date_period_v1') || '{}').sessionsByDate?.[date], {}, date);
    const stored = await page.evaluate(date => JSON.parse(localStorage.getItem('fitness_date_period_v1')).sessionsByDate[date], date); assert.equal(stored.routine.length, 8); assert.equal(stored.prescriptions.find(dose => dose.id === 'bf_A16').sets, 2);
    assert.deepEqual(runtimeErrors, []); console.log(`${width}: quick preview → 8 independent rows → duplicate keep → undo → dose edit → scoped save → reload → my workouts → review → apply passed`);
    await context.close(); page = null;
  }
} catch (error) { console.error(`Failed at ${step}`); if (page) { await page.screenshot({ path: `${output}/failure.png`, fullPage: true }); await writeFile(`${output}/failure.txt`, await page.evaluate(() => document.body.innerText)); } throw error; }
finally { await browser?.close(); server.kill(); }
