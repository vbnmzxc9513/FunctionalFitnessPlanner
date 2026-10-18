import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';
import { legacyFixture } from './legacy-fixture.mjs';
import { dateForWeekDay, getWeekString } from '../src/domain/dates.js';

const today = dateForWeekDay(getWeekString(new Date(), -1), 3);
const fixture = legacyFixture(new Date(`${today}T12:00:00`), { focus: 'balanced' });
const session = fixture.plan.schedule.find(day => day.day === 3);
const main = session.prescriptions.find(dose => dose.phase === 'strength' && dose.preparation);
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', '5178'], { env: process.env, stdio: 'ignore' });
const site = 'http://127.0.0.1:5178/FunctionalFitnessPlanner/';
let browser; let diagnostic;
try {
  for (let attempt = 0; attempt < 100; attempt++) { try { if ((await fetch(site)).ok) break; } catch { /* Server starting. */ } await new Promise(resolve => setTimeout(resolve, 200)); }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, width, height, touch] of [['desktop', 1280, 900, false], ['mobile', 390, 844, true]]) {
    const context = await browser.createBrowserContext(); const page = await context.newPage(); diagnostic = page; const errors = []; let external = 0;
    await page.setViewport({ width, height, hasTouch: touch, isMobile: touch });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(({ today, fixture }) => {
      localStorage.setItem('app_lang', localStorage.getItem('app_lang') || 'zh');
      if (!sessionStorage.getItem('__compactSeeded')) { sessionStorage.setItem('fitness_public_preview_v1', JSON.stringify({ publicDraft: fixture })); sessionStorage.setItem('__compactSeeded', 'true'); }
      const NativeDate = Date; const now = new NativeDate(`${today}T12:00:00`).getTime();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    }, { today, fixture });
    page.on('pageerror', error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else { external++; request.abort(); } });
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const click = async selector => { const element = await page.waitForSelector(selector, { visible: true }); await element.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await element.asLocator().click(); await element.dispose(); };
    const close = async () => { await click('dialog[open] [data-detail-close]'); await page.waitForFunction(() => !document.querySelector('dialog[open]')); };
    const row = id => `[data-testid="daily-exercise-list"] [data-testid="exercise-row-${id}"]`;
    const point = async selector => { const element = await page.waitForSelector(selector, { visible: true }); await element.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); const box = await element.boundingBox(); await element.dispose(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
    const cdp = await page.createCDPSession();
    const down = async position => touch ? cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [position] }) : (await page.mouse.move(position.x, position.y), page.mouse.down());
    const up = async () => touch ? cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) : page.mouse.up();
    await page.goto(site, { waitUntil: 'networkidle2' }); await page.waitForSelector('[data-testid="daily-exercise-list"]');
    assert.equal(await page.$$eval('[data-testid="daily-exercise-list"] [data-testid^="exercise-row-"]', items => items.filter(item => item.getClientRects().length).length), session.routine.length, `${layout}: all movements are listed before starting`);
    assert.equal(await page.$('dialog[open]'), null);
    assert.equal(await page.$$eval('[data-testid="daily-exercise-list"] input, [data-testid="daily-exercise-list"] .dose-grid, [data-testid="daily-exercise-list"] [data-testid^="exercise-guide-"]', items => items.length), 0, `${layout}: overview has no detailed guides or forms`);
    const before = await page.evaluate(() => sessionStorage.getItem('fitness_public_preview_v1'));
    const target = `${row('bf_A13')} h4`;
    let position = await point(target); await down(position); await delay(80); await up(); await delay(550);
    assert.equal(await page.$('dialog[open]'), null, `${layout}: short tapping a name does not open or complete it`);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('fitness_public_preview_v1')), before);
    position = await point(target); await down(position);
    if (touch) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: position.x, y: position.y - 85 }] }); else await page.mouse.move(position.x, position.y - 30);
    await up(); await delay(600);
    assert.equal(await page.$('dialog[open]'), null, `${layout}: scrolling/moving cancels a hold`);
    position = await point(target); await down(position); await delay(650); await up();
    await page.waitForSelector('dialog[open]', { visible: true });
    assert.equal(await page.$eval('dialog[open] [data-testid="exercise-guide-bf_A13"]', item => item.open), true);
    assert.equal(await page.$$eval('dialog[open] [data-testid="exercise-guide-bf_A13"] li', items => items.length), 8, `${layout}: held warm-up shows all eight parts`);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('fitness_public_preview_v1')), before, `${layout}: opening details creates no completion or log`);
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    await page.screenshot({ path: `/tmp/fitness-compact-${layout}-details.png`, fullPage: false });
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden');
    const openMain = `${row(main.id)} [data-testid="exercise-open-${main.id}"]`;
    const button = await page.waitForSelector(openMain, { visible: true }); await button.focus(); await page.keyboard.press('Enter'); await button.dispose();
    await page.waitForSelector(`dialog[open] [data-preparation-for="${main.id}"]`, { visible: true });
    assert.equal(await page.$eval('dialog[open] [data-preparation-for]', item => item.compareDocumentPosition(item.parentElement.querySelector('.dose-grid')) & Node.DOCUMENT_POSITION_FOLLOWING), 4, `${layout}: preparation precedes working sets`);
    const inputs = await page.$$('dialog[open] [data-testid="current-exercise"] input[required]');
    for (const input of inputs) { await input.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await input.asLocator().click(); await input.type('6'); await input.dispose(); }
    await close();
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), `exercise-open-${main.id}`, `${layout}: focus returns to the opener`);
    await click(`[data-testid="exercise-open-bf_A13"]`); await close(); await click(openMain);
    assert.ok(await page.$$eval('dialog[open] [data-testid="current-exercise"] input[required]', items => items.every(item => item.value === '6')), `${layout}: unsaved values survive close and another movement`);
    await click('dialog[open] button[type="submit"][value="complete"]');
    await page.waitForFunction(id => { const draft = JSON.parse(sessionStorage.getItem('fitness_public_preview_v1')).publicDraft; return draft.logs.length === 1 && draft.completed[`day3_${id}`] === true; }, {}, main.id);
    const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1')).publicDraft);
    assert.equal(saved.logs[0].date, today); assert.ok(saved.logs[0].sets.every(set => set.value === 6 && (!saved.logs[0].perSide || set.otherSide === 6)));
    assert.deepEqual(saved.plan, fixture.plan, `${layout}: browsing and logging leave prescriptions unchanged`);
    await close(); await page.reload({ waitUntil: 'networkidle2' }); await click(openMain);
    assert.ok(await page.$$eval('dialog[open] [data-testid="current-exercise"] input[required]', items => items.every(item => item.value === '6')), `${layout}: factual sets survive reload`);
    await close(); await page.setViewport({ width: 320, height, hasTouch: touch, isMobile: touch });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.app-shell')).paddingLeft === '0px');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await click(openMain); assert.equal(await page.$eval('dialog[open]', item => item.scrollWidth > item.clientWidth), false);
    await close(); assert.deepEqual(errors, []); assert.equal(external, 0);
    await page.screenshot({ path: `/tmp/fitness-compact-${layout}-list.png`, fullPage: true });
    console.log(`${layout}: compact full list, hold/cancel/scroll, keyboard/Escape/focus, eight-part warm-up, preparation, draft retention, factual save/reload and 320px passed`);
    await context.close();
  }
} catch (error) { if (diagnostic && !diagnostic.isClosed()) { await writeFile('/tmp/compact-dimensions.json', JSON.stringify(await diagnostic.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,bodyOverflow:document.body.style.overflow,elements:[...document.querySelectorAll('body *')].filter(x=>x.getClientRects().length&&x.getBoundingClientRect().right>innerWidth+1).map(x=>({tag:x.tagName,cls:x.className,width:x.getBoundingClientRect().width,right:x.getBoundingClientRect().right})).slice(0,15)})),null,2)); await diagnostic.screenshot({ path: '/tmp/compact-smoke.png', fullPage: true }); await writeFile('/tmp/compact-smoke.txt', await diagnostic.evaluate(() => document.body.innerText)); } throw error; } finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
