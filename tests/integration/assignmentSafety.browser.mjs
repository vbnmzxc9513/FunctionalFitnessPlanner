import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import puppeteer from 'puppeteer';

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import App from'/src/App.jsx';
import ApplyWorkoutPlan from'/src/components/ApplyWorkoutPlan.jsx';
import{catalogExercises}from'/src/domain/exerciseCatalog.js';import{DEFAULT_PLANNING_CONTEXT}from'/src/domain/planning.js';
import{getQuickWorkout}from'/src/domain/quickWorkouts.js';import{createManualSession,addManualExercises}from'/src/domain/manualPlanner.js';
import{previewQuickWorkout,applyQuickWorkout}from'/src/domain/quickWorkoutDraft.js';import'/src/index.css';
const root=createRoot(document.querySelector('#root')),exercises=catalogExercises();
const options={exercises,eligibleExercises:exercises,dailyTime:240};
const warmup=applyQuickWorkout(previewQuickWorkout(createManualSession('2026-11-16'),getQuickWorkout('daily-warmup'),options)).session;
const band=addManualExercises(warmup,['bf_B03'],{...options,phase:'strength'});
window.renderApp=()=>root.render(React.createElement(App));
window.renderAssignment=(profile,key,kind='band')=>{window.assignmentProfile=profile;window.assignmentApplied=null;window.editRequested=null;
const day=kind==='rest'?{...createManualSession('2026-11-16'),explicitRest:true}:kind==='invalid-empty'?{...createManualSession('2026-11-16'),sessionType:'training'}:band;
root.render(React.createElement(ApplyWorkoutPlan,{key,days:[day],initialDates:['2026-11-16'],name:'Contract plan',today:'2026-11-16',exercises,profile,localPeriod:null,onLocalPeriod:value=>window.assignmentApplied=value,onApplied:()=>{},onCancel:()=>{},onEdit:days=>window.editRequested=days}))};
window.defaultContext=DEFAULT_PLANNING_CONTEXT;window.renderApp();
</script></body></html>`;
const cacheDir = resolve(`node_modules/.vite-assignment-safety-${process.pid}`);
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir, base: '/', plugins: [react(), tailwindcss(), {
  name: 'assignment-safety-page', configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (req.url !== '/__assignment-safety.html') return next();
    res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml(req.url, html));
  }); },
}], server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage(), errors = [];page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluateOnNewDocument(() => {
    const NativeDate=Date,now=new NativeDate('2026-11-16T12:00:00Z').getTime();window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
    localStorage.setItem('app_lang','zh');
    localStorage.setItem('planning_preferences_signed-out',JSON.stringify({time:'40',context:{healthStatus:'unrestricted',equipment:['band'],trainingDays:[1,3,5]}}));
  });
  await page.setRequestInterception(true);page.on('request', request => ['localhost','127.0.0.1'].includes(new URL(request.url()).hostname) ? request.continue() : request.abort());
  const click = async selector => { const handle=await page.waitForSelector(selector,{visible:true});await handle.click();await handle.dispose(); };
  const fill = async (selector,value) => { await page.$eval(selector,(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value); };
  const textClick = async text => {const handle=(await page.evaluateHandle(text=>[...document.querySelectorAll('button')].find(button=>button.innerText.trim()===text&&button.getClientRects().length),text)).asElement();assert.ok(handle,text);await handle.click();await handle.dispose();};
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__assignment-safety.html`);
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.innerText.trim()==='課表'));
  await textClick('課表');await click('[data-testid="period-day-2026-11-16"]');
  await click('[data-testid="combo-add-daily-warmup"]');await click('[data-testid="combo-add-hip-internal-rotation"]');
  await click('[data-exercise-id="bf_A15"] button');
  await fill('dialog[open] input[type="number"]','2');
  await fill('dialog[open] input[inputmode="decimal"]','6');
  await click('dialog[open] form button[type="submit"]');
  await click('[data-testid="manual-review"]');await page.waitForSelector('[data-testid="assignment-apply"]');
  await click('.assignment-top button');await page.waitForSelector('[data-testid="manual-add-content"]');
  assert.equal(await page.$$eval('.manual-exercise-row',rows=>rows.length),10,'date-entry initialSessions survives review/back with all new exercises');
  assert.match(await page.$eval('[data-exercise-id="bf_A15"]',row=>row.innerText),/2組 × 6/,'new dose survives returning from review');
  await click('[data-testid="manual-review"]');await page.waitForSelector('[data-testid="assignment-apply"]');
  await textClick('調整日期');await fill('input[type="date"]','2026-11-17');await click('.assignment-top button');
  await page.waitForSelector('[data-testid="manual-tab-2026-11-17"]');
  assert.match(await page.$eval('[data-exercise-id="bf_A15"]',row=>row.innerText),/2組 × 6/,'changed assignment date returns the latest dose to the correct date');

  const render = async (time,equipment,key,kind='band',extra={}) => { await page.evaluate(({time,equipment,key,kind,extra})=>window.renderAssignment({time,context:{...window.defaultContext,equipment,...extra}},key,kind),{time,equipment,key,kind,extra}); await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))); };
  const blocked = async pattern => {await page.waitForFunction(pattern=>new RegExp(pattern).test(document.querySelector('.assignment-error')?.innerText||''),{},pattern.source);await page.waitForSelector('.assignment-error button');assert.match(await page.$eval('.assignment-error',node=>node.innerText),pattern);assert.equal(await page.$('[data-testid="assignment-apply"]'),null);assert.equal(await page.evaluate(()=>window.assignmentApplied),null);};
  await render('5',['band'],'time');await blocked(/時間上限/);
  await click('.assignment-error button');assert.ok(await page.evaluate(()=>window.editRequested?.[0].routine.includes('bf_B03')),'profile conflict offers the intact copy for repair');
  await render('40',[],'equipment');await blocked(/不符合目前器材/);
  await render('40',['band'],'health','band',{healthStatus:'restricted'});await blocked(/不符合目前器材/);
  await render('40',['band'],'late-time');await page.waitForSelector('[data-testid="assignment-apply"]');
  await page.evaluate(()=>{window.assignmentProfile.time='5';});await click('[data-testid="assignment-apply"]');await blocked(/時間上限/);
  await render('40',['band'],'late-equipment');await page.waitForSelector('[data-testid="assignment-apply"]');
  await page.evaluate(()=>{window.assignmentProfile.context.equipment=[];});await click('[data-testid="assignment-apply"]');await blocked(/不符合目前器材/);
  await render('40',[],'invalid-empty','invalid-empty');await blocked(/尚未安排動作/);
  await render('5',[],'rest','rest');await page.waitForSelector('[data-testid="assignment-apply"]');await click('[data-testid="assignment-apply"]');
  await page.waitForFunction(()=>window.assignmentApplied?.sessionsByDate['2026-11-16']?.sessionType==='rest');
  assert.deepEqual(errors,[]);
  console.log('Assignment safety passed: real App date-entry review/back preserves ten movements and changed dose/date; profile time/equipment/health blocks inspect and final apply; repair retains content; explicit source rest saves and invalid empty training stays blocked.');
} finally {await browser?.close();await server.close();await rm(cacheDir,{recursive:true,force:true});}
