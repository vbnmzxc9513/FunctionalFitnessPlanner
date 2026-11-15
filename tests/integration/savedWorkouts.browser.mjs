import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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
// The hook remains real; only its repository is controlled to reproduce
// subscription / promise orderings that an ordinary device save cannot force.
const contractHtml = `<!doctype html><html><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';
import{useSavedWorkouts}from'/src/hooks/useSavedWorkouts.js?contract';
import SaveWorkoutDialog from'/src/components/SaveWorkoutDialog.jsx';
import{catalogExercises}from'/src/domain/exerciseCatalog.js';
import{getQuickWorkout}from'/src/domain/quickWorkouts.js';
import{createManualSession}from'/src/domain/manualPlanner.js';
import{previewQuickWorkout,applyQuickWorkout}from'/src/domain/quickWorkoutDraft.js';
window.contractUid=null;window.repositories={};window.calls=[];
window.makeRepository=uid=>{const repository={
assertScope(){if((uid||null)!==window.contractUid)throw Error('WORKOUT_AUTH_CHANGED')},
subscribe(next){repository.emit=next;return()=>{}},
create(input){return new Promise(resolve=>window.calls.push({input,resolve}))},
setPinned(){return new Promise(resolve=>window.calls.push({resolve}))},
markUsed(){return new Promise(resolve=>window.calls.push({resolve}))}
};window.repositories[uid||'device']=repository;return repository};
const root=createRoot(document.getElementById('root'));
const exercises=catalogExercises();const options={exercises,eligibleExercises:exercises,dailyTime:240};
let day=createManualSession('2026-11-13');for(const id of ['daily-warmup','hip-internal-rotation'])day=applyQuickWorkout(previewQuickWorkout(day,getQuickWorkout(id),options)).session;
day=applyQuickWorkout(previewQuickWorkout(day,{prescriptions:[{id:'bf_H01',phase:'cooldown',sets:1,value:'20',unit:'seconds',restSeconds:0,perSide:true}]},options)).session;
window.contractDay=day;window.contractExercises=exercises;
function Hook({uid}){window.contractStore=useSavedWorkouts(uid);return React.createElement('p',null,window.contractStore.items.map(item=>item.name).join(','))}
window.setContractUid=uid=>{window.contractUid=uid;root.render(React.createElement(Hook,{uid}))};window.setContractUid(null);
window.renderContractDialog=(identity,sourceItem=null)=>{const store={scopeKey:identity,scope:'device',loaded:true,items:[],create(input){window.dialogInput=input;return new Promise(resolve=>window.resolveDialog=resolve)},update(id,input,revision){window.dialogInput={id,...input,revision};return new Promise(resolve=>window.resolveDialog=resolve)}};
root.render(React.createElement(SaveWorkoutDialog,{store,day,exercises,sourceItem,lang:'zh',onSaved:item=>window.savedCallbacks=(window.savedCallbacks||[]).concat(identity+':'+item.id),onClose:()=>window.closedCallbacks=(window.closedCallbacks||[]).concat(identity)}))};
</script></body></html>`;
const server = await createServer({ configFile: false, root: process.cwd(), base: '/', plugins: [react(), tailwindcss(), {
  name: 'saved-workouts-test-page',
  resolveId(source) { if (source === '/__workout-repository-mock.js') return '\0saved-workout-contract-repository'; },
  load(id) { if (id === '\0saved-workout-contract-repository') return 'export const createWorkoutRepository = uid => window.makeRepository(uid);'; },
  transform(code, id) {
    if (id.endsWith('/src/hooks/useSavedWorkouts.js?contract')) return code.replace('../services/workoutRepository.js', '/__workout-repository-mock.js');
  },
  configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url === '/__workout-repository-mock.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('export const createWorkoutRepository = uid => window.makeRepository(uid);'); return; }
    const content = req.url === '/__saved-workouts-test.html' ? html : req.url === '/__saved-workouts-contract.html' ? contractHtml : null;
    if (!content) return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, content));
  }); },
}], server: { host: '127.0.0.1', port: 0, strictPort: false } });
await server.listen();
const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true, args: ['--no-sandbox'] });
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
  await page.waitForSelector('[data-testid="save-workout-confirm"]');
  for (const width of [320, 390, 1440]) {
    await page.setViewport({ width, height: 844 });
    const metrics = await page.evaluate(() => ({ width: document.documentElement.scrollWidth,
      buttons: [...document.querySelectorAll('dialog[open] button')].map(item => { const box = item.getBoundingClientRect(); return [box.width, box.height]; }) }));
    assert.ok(metrics.width <= width, `no overflow at ${width}`);
    assert.ok(metrics.buttons.every(([w, h]) => w >= 44 && h >= 44), `44px dialog controls at ${width}`);
  }
  await fill('[data-testid="save-workout-name"]', 'Shoulders'); await page.click('[data-testid="save-workout-confirm"]'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  assert.equal((await rows()).length, 1);
  assert.equal((await rows())[0].pinned, true);
  assert.equal((await rows())[0].scope, 'selection');
  await page.reload(); await page.waitForSelector('article'); assert.match(await page.$eval('article', item => item.innerText), /Shoulders/);
  await open(); await fill('[data-testid="save-workout-name"]', ' shoulders '); await page.click('[data-testid="save-workout-confirm"]');
  await page.waitForFunction(() => document.querySelector('dialog[open] [role="alert"]')?.innerText.includes('已有同名收藏'));
  assert.equal((await rows()).length, 1);
  await fill('[data-testid="save-workout-name"]', 'Second workout'); await page.click('[data-testid="save-workout-confirm"]'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  const originalId = (await rows()).find(item => item.name === 'Second workout').id;
  await openSaved('Second workout'); await click('重新命名 Second workout'); await fill('article form input', 'Renamed'); await click('儲存名稱');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="saved-workouts"] h2')].some(item => item.innerText === 'Renamed'));
  assert.equal((await rows()).find(item => item.name === 'Renamed').id, originalId);

  await open(); await fill('[data-testid="save-workout-name"]', 'Storage must fail');
  await page.evaluate(key => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(name, value) { if (name === key) throw Error('quota'); return window.originalSetItem.call(this, name, value); }; }, key);
  await page.click('[data-testid="save-workout-confirm"]'); await page.waitForFunction(() => document.querySelector('dialog[open] [role="alert"]')?.innerText.includes('瀏覽器無法儲存'));
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
  await click('Language'); await page.waitForFunction(() => document.body.innerText.includes('My favorites')); await openSaved('Shoulders');
  assert.ok((await page.$eval('[data-testid="saved-workout-detail"]', item => item.innerText)).includes('Warm-up'));
  assert.ok((await page.$eval('[data-testid="saved-workout-detail"]', item => item.innerText)).includes('Split squat'));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__saved-workouts-contract.html`);
  await page.waitForFunction(() => window.repositories?.device?.emit);
  const beginCreate = () => page.evaluate(() => { window.contractOperation = window.contractStore.create({ name: 'First', day: window.contractDay, exercises: window.contractExercises }).catch(error => { window.contractError = error.message; }); });
  await page.evaluate(() => window.repositories.device.emit([]));
  await beginCreate();
  await page.evaluate(() => { window.contractItem = { id: 'one', name: 'First', revision: 1, pinned: true, scope: 'selection' }; window.calls.at(-1).resolve(window.contractItem); });
  await page.waitForFunction(() => window.contractStore.items.length === 1);
  await page.evaluate(() => window.repositories.device.emit([]));
  assert.equal(await page.evaluate(() => window.contractStore.items.length), 1, 'a committed create stays visible before subscription acknowledgment');
  await page.evaluate(() => window.repositories.device.emit([window.contractItem]));
  await page.evaluate(() => { window.contractOperation = window.contractStore.setPinned('one', false, 1); window.contractItem2 = { ...window.contractItem, revision: 2, pinned: false }; window.calls.at(-1).resolve(window.contractItem2); });
  await page.waitForFunction(() => window.contractStore.items[0]?.revision === 2);
  await page.evaluate(() => window.repositories.device.emit([window.contractItem]));
  assert.equal(await page.evaluate(() => window.contractStore.items[0].revision), 2, 'a stale snapshot cannot downgrade a committed revision');
  await page.evaluate(() => window.repositories.device.emit([window.contractItem2]));
  await page.evaluate(() => { window.contractOperation = window.contractStore.markUsed('one', 2); window.contractItem3 = { ...window.contractItem2, revision: 3, lastUsedAt: 123 }; window.repositories.device.emit([window.contractItem3]); window.calls.at(-1).resolve(window.contractItem3); });
  await page.waitForFunction(() => window.contractStore.items[0]?.revision === 3 && !window.contractStore.busy);
  await page.evaluate(() => window.repositories.device.emit([]));
  await page.waitForFunction(() => window.contractStore.items.length === 0);
  assert.equal(await page.evaluate(() => window.contractStore.items.length), 0, 'snapshot-before-resolve then external deletion does not resurrect an acknowledged item');

  await beginCreate();
  await page.evaluate(() => { window.contractDeleted = { ...window.contractItem, id: 'deleted-before-resolution' }; window.repositories.device.emit([window.contractDeleted]); window.repositories.device.emit([]); window.calls.at(-1).resolve(window.contractDeleted); });
  await page.waitForFunction(() => window.contractError === 'WORKOUT_CHANGED');
  assert.equal(await page.evaluate(() => window.contractStore.items.length), 0, 'snapshot then external deletion before create resolution cannot resurrect the item or report success');

  await page.evaluate(() => { window.contractItem4 = { ...window.contractItem, id: 'update-deleted', revision: 1 }; window.repositories.device.emit([window.contractItem4]); window.contractOperation = window.contractStore.setPinned('update-deleted', false, 1).catch(error => { window.contractError = error.message; }); window.repositories.device.emit([]); window.calls.at(-1).resolve({ ...window.contractItem4, revision: 2, pinned: false }); });
  await page.waitForFunction(() => !window.contractStore.busy);
  assert.equal(await page.evaluate(() => window.contractStore.items.length), 0, 'an update result cannot resurrect a known item deleted while the write was awaiting resolution');

  await beginCreate();
  await page.evaluate(() => { window.oldResolve = window.calls.at(-1).resolve; window.setContractUid('next-account'); });
  await page.waitForFunction(() => window.repositories['next-account']?.emit);
  await page.evaluate(() => { window.repositories['next-account'].emit([]); window.oldResolve({ ...window.contractItem, id: 'old-account' }); });
  await page.waitForFunction(() => window.contractError === 'WORKOUT_AUTH_CHANGED');
  assert.equal(await page.evaluate(() => window.contractStore.items.length), 0, 'old account completion cannot populate the next account');

  await page.evaluate(() => window.renderContractDialog('first'));
  await page.waitForSelector('[data-testid="save-workout-name"]');
  await click('清除');
  for (const id of ['bf_A15', 'bf_B16', 'bf_H01']) await page.click(`[data-testid="save-workout-exercise-${id}"]`);
  await fill('[data-testid="save-workout-name"]', 'Three selected movements');
  await page.click('[data-testid="save-workout-confirm"]');
  assert.deepEqual(await page.evaluate(() => ({ pinned: window.dialogInput.pinned, scope: window.dialogInput.scope, ids: window.dialogInput.day.routine })), { pinned: true, scope: 'selection', ids: ['bf_A15', 'bf_B16', 'bf_H01'] });
  await page.evaluate(() => { window.oldDialogResolve = window.resolveDialog; window.renderContractDialog('second'); });
  await page.waitForFunction(() => document.querySelector('[data-testid="save-workout-name"]').value === '');
  await page.evaluate(async () => { window.oldDialogResolve({ id: 'old-modal' }); await new Promise(resolve => setTimeout(resolve, 0)); });
  assert.equal(await page.evaluate(() => (window.savedCallbacks || []).length + (window.closedCallbacks || []).length), 0, 'unmounted dialog cannot run stale success or close callbacks');
  await fill('[data-testid="save-workout-name"]', 'Second dialog'); await page.click('[data-testid="save-workout-confirm"]');
  await page.evaluate(() => window.resolveDialog({ id: 'new-modal' }));
  await page.waitForFunction(() => window.savedCallbacks?.length === 1);
  assert.deepEqual(await page.evaluate(() => ({ saved: window.savedCallbacks, closed: window.closedCallbacks })), { saved: ['second:new-modal'], closed: ['second'] });
  await page.evaluate(() => window.renderContractDialog('source-update', { id: 'existing', name: 'Existing favorite', revision: 7, scope: 'training', tags: ['Custom purpose'], contentVersion: 3 }));
  await page.waitForFunction(() => document.querySelector('[data-testid="save-workout-name"]').value === 'Existing favorite');
  await page.click('.combo-save-advanced summary');
  await page.select('.combo-save-options select', 'cooldown');
  await (await page.$$('.combo-save-advanced input[type="radio"]'))[1].click();
  await fill('[data-testid="save-workout-name"]', 'Updated favorite');
  await page.click('[data-testid="save-workout-confirm"]');
  assert.deepEqual(await page.evaluate(() => ({ id: window.dialogInput.id, revision: window.dialogInput.revision, scope: window.dialogInput.scope, tags: window.dialogInput.tags, version: window.dialogInput.contentVersion, pinned: window.dialogInput.pinned, ids: window.dialogInput.day.routine })), { id: 'existing', revision: 7, scope: 'cooldown', tags: ['Custom purpose'], version: 3, pinned: true, ids: ['bf_H01'] }, 'advanced phase scope, tags, source identity and update revision remain available');
  await page.evaluate(() => window.resolveDialog({ id: 'existing' }));
  await page.waitForFunction(() => window.savedCallbacks?.length === 2);
  assert.deepEqual(errors, []);
  console.log('Saved workouts browser checks passed: persistence/reload, duplicate retry, stable rename, quota failure, confirmed deletion, external callbacks, scope masking, bilingual content and 44px controls at 320/390/1440; hook snapshot/write/delete ordering, stale revision/account isolation, arbitrary pinned subsets, modal callback isolation and advanced source updates.');
} finally { await browser.close(); await server.close(); }
