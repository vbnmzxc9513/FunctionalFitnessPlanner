import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import puppeteer from 'puppeteer';

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import Dialog from '/src/components/PlanShareDialog.jsx';
import SharedWorkout from '/src/components/SharedWorkout.jsx';
import {createPlanPayload} from '/src/domain/sharedPlans.js';
import {createSharePayload,shareDay} from '/src/domain/sharing.js';
import {DEFAULT_SCHEDULE_I18N} from '/src/locale.js';
import '/src/index.css';
const root=createRoot(document.querySelector('#root'));
window.sourceDays=structuredClone(DEFAULT_SCHEDULE_I18N.zh.slice(0,3));
window.renderPlan=(extra={})=>root.render(React.createElement(Dialog,{days:window.sourceDays,name:'Public plan',onClose:()=>{},onSignIn:()=>window.signInClicked=true,...extra}));
window.renderShared=(legacy=false,authLoading=false)=>root.render(React.createElement(SharedWorkout,{key:'shared-'+legacy+'-'+authLoading,payload:legacy?{day:shareDay(createSharePayload(DEFAULT_SCHEDULE_I18N.zh[0]))}:{payload:createPlanPayload([{...DEFAULT_SCHEDULE_I18N.zh[0],offset:0},{...DEFAULT_SCHEDULE_I18N.zh[2],offset:2}],{name:'Imported plan'})},today:'2026-10-19',localPeriod:null,onLocalPeriod:value=>window.savedPeriod=value,authLoading,onExit:()=>window.exits=(window.exits||0)+1}));
window.renderOldShared=()=>root.render(React.createElement(SharedWorkout,{key:'old-incomplete',payload:{day:shareDay(createSharePayload({routine:['bf_B01']}))},today:'2026-10-19',localPeriod:null,onLocalPeriod:()=>{},onExit:()=>{}}));
window.renderPlan();
</script></body></html>`;
const cacheDir = resolve(`node_modules/.vite-plan-share-${process.pid}`);
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir, base: '/', plugins: [react(), tailwindcss(), {
  name: 'plan-share-test-page', configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url !== '/__share-test.html') return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/__share-test.html', html));
  }); },
}], server: { host: '127.0.0.1', port: 0, strictPort: false } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  const click = async text => { const el = await page.evaluateHandle(text => [...document.querySelectorAll('button')].find(el => el.innerText === text), text); assert.ok(el.asElement(), text); await el.click(); };
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__share-test.html`);
  await page.waitForSelector('[role="dialog"]');
  for (const width of [320, 390, 1440]) {
    await page.setViewport({ width, height: 844 });
    const layout = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
      targets: [...document.querySelectorAll('button,input')].filter(el => !el.disabled).map(el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }) }));
    assert.ok(layout.scroll <= width); assert.ok(layout.targets.every(([w, h]) => w >= 44 && h >= 44));
  }
  await click('建立分享連結'); await page.waitForSelector('input[readonly]');
  const url = await page.$eval('input[readonly]', el => el.value);
  assert.match(url, /#program=[\w-]+$/);
  await page.evaluate(() => { window.sourceDays[0].routine = []; window.renderPlan(); });
  assert.equal(await page.$eval('input[readonly]', el => el.value), url, 'source edits cannot alter the captured share');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } }));
  await click('複製連結'); await page.waitForFunction(() => document.querySelector('[role="status"]').innerText.includes('手動複製'));
  assert.equal(await page.$eval('input[readonly]', el => el.value), url);
  await page.evaluate(() => { navigator.share = async data => { window.nativeShared = data; }; window.renderPlan(); });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.innerText === '分享連結'));
  await click('分享連結'); await page.waitForFunction(() => window.nativeShared?.url);
  assert.equal(await page.evaluate(() => window.nativeShared.url), url);
  await page.evaluate(() => window.renderPlan({ key: 'long', days: Array(28).fill(window.sourceDays[2]) }));
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.innerText === '建立分享連結'));
  await click('建立分享連結'); await page.waitForFunction(() => document.querySelector('[role="alert"]')?.innerText.includes('長度'));
  assert.equal(await page.$('input[readonly]'), null, 'oversized data cannot produce a fake link');
  await click('登入建立短連結'); assert.equal(await page.evaluate(() => window.signInClicked), true);
  await page.evaluate(() => window.renderPlan({ key: 'english', lang: 'en', days: [{ routine: ['custom-private'] }] }));
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.innerText.includes('Custom'));
  assert.equal(await page.$eval('button.bg-sky-700', el => el.disabled), true);
  await page.evaluate(() => window.renderShared(true, true));
  await page.waitForSelector('main[aria-label="分享的羽球體能課表"]');
  assert.ok(await page.$('section[data-phase="strength"]'), 'legacy phase selectors remain available');
  assert.equal(await page.$$eval('button', els => els.find(el => el.innerText === '匯入我的課表').disabled), true, 'auth loading gates local import');
  await page.evaluate(() => window.renderShared());
  await page.waitForFunction(() => [...document.querySelectorAll('h1')].some(el => el.innerText === 'Imported plan'));
  assert.equal(await page.$$eval('[data-testid="workout-plan-summary"]', els => els.length), 2);
  await click('匯入我的課表'); await page.waitForSelector('[data-testid="apply-workout-plan"]');
  assert.equal(await page.evaluate(() => window.exits || 0), 0, 'import opens date mapping instead of exiting');
  await click('逐天指定日期');
  await page.$eval('input[aria-label="第 2 天套用日期"]', el => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2026-10-27'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelector('input[aria-label="第 2 天套用日期"]').value === '2026-10-27');
  await click('保留原間隔');
  await page.waitForFunction(() => document.querySelector('[data-testid="apply-workout-plan"]').innerText.includes('2026-10-21'));
  assert.equal(await page.$eval('[data-testid="apply-workout-plan"]', el => el.innerText.includes('2026-10-27')), false, 'switching back to original intervals restores the original two-day gap');

  await click('檢查日期並預覽'); await page.waitForSelector('[data-testid="assignment-apply"]');
  await page.click('[data-testid="assignment-apply"]');
  await page.waitForFunction(() => [...document.querySelectorAll('h1')].some(el => el.innerText === '課表已匯入'));
  assert.ok(await page.evaluate(() => !!window.savedPeriod), 'completion follows a real device save');
  assert.equal(await page.evaluate(() => window.exits || 0), 0, 'completion waits for explicit exit');
  await click('查看我的課表'); assert.equal(await page.evaluate(() => window.exits), 1);
  await page.evaluate(() => window.renderOldShared());
  await page.waitForFunction(() => [...document.querySelectorAll('h1')].some(el => el.innerText === '分享的羽球體能課表'));
  await click('匯入我的課表'); await page.waitForSelector('[data-testid="assignment-preview"]');
  await page.click('[data-testid="assignment-preview"]');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(el => el.innerText === '先編輯這份副本'));
  await click('先編輯這份副本'); await page.waitForSelector('[data-testid="manual-planner"]');
  assert.ok((await page.$eval('[data-testid="manual-planner"]', el => el.innerText)).includes('分腿蹲'), 'an incomplete legacy copy keeps its motion in the repair editor');
  assert.deepEqual(errors, []);
  console.log('Public sharing: 320/390/1440px, snapshot isolation, embedded URL, clipboard/native share, length/sign-in fallback, English unsupported state, v1 phases/repair, auth-loading gate and v2 confirmed device import passed.');
} finally { await browser?.close(); await server.close(); await rm(cacheDir, { recursive: true, force: true }); }
