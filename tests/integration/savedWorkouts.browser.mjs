import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import puppeteer from 'puppeteer';

const key = 'fitness-planner:saved-workouts:v1';
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{useSavedWorkouts}from'/src/hooks/useSavedWorkouts.js';
import SaveWorkoutDialog from'/src/components/SaveWorkoutDialog.jsx';import SavedWorkouts from'/src/components/SavedWorkouts.jsx';
import{DEFAULT_SCHEDULE_I18N,EXERCISES_I18N}from'/src/locale.js';import'/src/index.css';
function Harness(){const[uid,setUid]=useState(null),[day,setDay]=useState(null),[lang,setLang]=useState('zh'),[saved,setSaved]=useState(0);const store=useSavedWorkouts(uid);
return React.createElement('main',{className:'p-4 max-w-3xl mx-auto'},
React.createElement('button',{className:'button-secondary',onClick:()=>setDay(structuredClone(DEFAULT_SCHEDULE_I18N.zh[0]))},'Open save'),
React.createElement('button',{className:'button-secondary',onClick:()=>setLang(lang==='zh'?'en':'zh')},'Language'),
React.createElement('button',{className:'button-secondary',onClick:()=>setUid(uid?null:'other-account')},'Switch scope'),
React.createElement('p',{'data-testid':'scope'},store.scope),React.createElement('p',{'data-testid':'saved-count'},String(saved)),
React.createElement(SavedWorkouts,{store,exercises:EXERCISES_I18N[lang],lang,onUse:item=>window.used=item.name,onShare:item=>window.shared=item.name}),
React.createElement(SaveWorkoutDialog,{store,day,exercises:EXERCISES_I18N.zh,level:1,lang,onClose:()=>setDay(null),onSaved:()=>setSaved(n=>n+1)}));}
createRoot(document.querySelector('#root')).render(React.createElement(Harness));
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), base: '/', plugins: [react(), tailwindcss(), {
  name: 'saved-workouts-test-page', configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url !== '/__saved-workouts-test.html') return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/__saved-workouts-test.html', html));
  }); },
}], server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => ['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname) ? request.continue() : request.abort());
  const click = async (label, selector = 'button') => {
    const handle = await page.evaluateHandle((label, selector) => [...document.querySelectorAll(selector)].find(item => item.getClientRects().length
      && !item.disabled && (item.innerText.trim() === label || item.getAttribute('aria-label') === label)), label, selector);
    assert.ok(handle.asElement(), `visible enabled ${label}`);
    await handle.evaluate(item => item.scrollIntoView({ block: 'center' })); await handle.click(); await handle.dispose();
  };
  const fill = async (selector, value) => {
    await page.$eval(selector, item => { item.focus(); item.select(); }); await page.keyboard.type(value);
  };
  const openSaved = async name => { await page.waitForFunction(name => [...document.querySelectorAll('[data-testid="saved-workout-open"]')].some(item => item.innerText.includes(name)), {}, name); const item = (await page.evaluateHandle(name => [...document.querySelectorAll('[data-testid="saved-workout-open"]')].find(item => item.innerText.includes(name)), name)).asElement(); await item.click(); await item.dispose(); await page.waitForSelector('[data-testid="saved-workout-detail"]'); };
  const rows = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"items":[]}').items, key);
  const open = async () => { await click('Open save'); await page.waitForSelector('dialog[open]'); };
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__saved-workouts-test.html`);
  await page.waitForFunction(() => !document.body.innerText.includes('正在讀取收藏'));
  await open();
  for (const width of [320, 390, 1440]) {
    await page.setViewport({ width, height: 844 });
    const metrics = await page.evaluate(() => ({ width: document.documentElement.scrollWidth,
      buttons: [...document.querySelectorAll('dialog[open] button')].map(item => { const box = item.getBoundingClientRect(); return [box.width, box.height]; }) }));
    assert.ok(metrics.width <= width, `no overflow at ${width}`);
    assert.ok(metrics.buttons.every(([w, h]) => w >= 44 && h >= 44), `44px dialog controls at ${width}`);
  }
  await fill('dialog[open] input', 'Shoulders'); await click('儲存到我的課表'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.equal((await rows()).length, 1);
  await page.reload(); await page.waitForSelector('article'); assert.match(await page.$eval('article', item => item.innerText), /Shoulders/);
  await open(); await fill('dialog[open] input', ' shoulders '); await click('儲存到我的課表');
  await page.waitForFunction(() => document.querySelector('dialog[open] [role="alert"]')?.innerText.includes('已有同名收藏'));
  assert.equal((await rows()).length, 1);
  await fill('dialog[open] input', 'Second workout'); await click('儲存到我的課表'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  const originalId = (await rows()).find(item => item.name === 'Second workout').id;
  await openSaved('Second workout'); await click('重新命名 Second workout'); await fill('article form input', 'Renamed'); await click('儲存名稱');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="saved-workouts"] h2')].some(item => item.innerText === 'Renamed'));
  assert.equal((await rows()).find(item => item.name === 'Renamed').id, originalId);

  await open(); await fill('dialog[open] input', 'Storage must fail');
  await page.evaluate(key => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(name, value) { if (name === key) throw Error('quota'); return window.originalSetItem.call(this, name, value); }; }, key);
  await click('儲存到我的課表'); await page.waitForFunction(() => document.querySelector('dialog[open] [role="alert"]')?.innerText.includes('瀏覽器無法儲存'));
  assert.equal((await rows()).length, 2); assert.equal(await page.$eval('[data-testid="saved-count"]', item => item.innerText), '1', 'failed save does not call onSaved');
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; }); await page.click('dialog[open] [data-detail-close]');
  await click('刪除 Renamed'); await click('取消', 'dialog[open] footer button'); assert.equal((await rows()).length, 2, 'cancelled delete preserves collection');
  await click('刪除 Renamed'); await click('確認刪除收藏'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.deepEqual((await rows()).map(item => item.name), ['Shoulders']);
  await openSaved('Shoulders'); await click('選日期套用'); await click('分享 Shoulders');
  assert.equal(await page.evaluate(() => window.used), 'Shoulders'); assert.equal(await page.evaluate(() => window.shared), 'Shoulders');
  await click('Switch scope'); await page.waitForFunction(() => document.querySelector('[data-testid="scope"]').innerText === 'account');
  assert.equal(await page.$$eval('article', items => items.length), 0, 'old device items disappear on uid scope change');
  await click('Switch scope'); await page.waitForSelector('article');
  await click('Language'); await page.waitForFunction(() => document.body.innerText.includes('My saved workouts')); await openSaved('Shoulders');
  assert.ok((await page.$eval('[data-testid="saved-workout-detail"]', item => item.innerText)).includes('Warm-up'));
  assert.ok((await page.$eval('[data-testid="saved-workout-detail"]', item => item.innerText)).includes('Split squat'));
  assert.deepEqual(errors, []);
  console.log('Saved workouts browser checks passed: persistence/reload, duplicate retry, stable rename, quota failure, confirmed deletion, external callbacks, scope masking, bilingual content and 44px controls at 320/390/1440.');
} finally { await browser.close(); await server.close(); }
