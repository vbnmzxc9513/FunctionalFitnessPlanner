// Independent review of the real React application, not prototype.html.
// All writes are confined to isolated signed-out browser storage.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { createManualSession, manualDraftStorageKey } from '../src/domain/manualPlanner.js';
const out='docs/planner-redesign/2026-11-combo-first/implementation-review';
await mkdir(out,{recursive:true});
const port=Number(process.env.COMBO_REVIEW_PORT||5231),site=`http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
const server=spawn(process.execPath,['scripts/smoke-server.mjs',String(port)],{stdio:'ignore',env:{...process.env,SMOKE_DISABLE_HMR:'1'}});
let browser,page,step='startup';const results=[];
try{
 for(let i=0;i<100;i++){try{if((await fetch(site)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await puppeteer.launch({headless:true,executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 for(const [width,lang] of [[390,'zh'],[320,'zh'],[1440,'zh'],[390,'en']]){
  step=`${width}/${lang}: open`;
  const context=await browser.createBrowserContext();page=await context.newPage();
  await page.setViewport({width,height:width===1440?1000:844});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol))r.continue();else r.abort()});
  await page.evaluateOnNewDocument(()=>{const NativeDate=Date,now=new NativeDate('2026-11-13T12:00:00Z').getTime();window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}});
  const click=async selector=>{const el=await page.waitForSelector(selector,{visible:true});await el.click()};
  const textClick=async text=>{await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(b=>b.innerText.trim()===text&&b.getClientRects().length),{},text);const handle=(await page.evaluateHandle(text=>[...document.querySelectorAll('button')].find(b=>b.innerText.trim()===text&&b.getClientRects().length),text)).asElement();await handle.click()};
  const snapshot=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions,manualDraftStorageKey());
  const capture=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${step}: horizontal overflow`);await page.screenshot({path:`${out}/${name}-${width}-${lang}.png`})};
  await page.goto(site,{waitUntil:'networkidle2'});
  await page.evaluate(({key,lang,sessions})=>{localStorage.clear();localStorage.setItem('app_lang',lang);localStorage.setItem(key,JSON.stringify({version:1,scope:'signed-out',sessions}));localStorage.setItem('planning_preferences_signed-out',JSON.stringify({time:'40',focus:'balanced',context:{healthStatus:'unrestricted',equipment:['dumbbell','band','foam_roller'],trainingDays:[1,3,5],badmintonDays:[]}}));},{key:manualDraftStorageKey(),lang,sessions:['2026-11-16','2026-11-18'].map(d=>createManualSession(d,lang))});
  await page.reload({waitUntil:'networkidle2'});await textClick(lang==='zh'?'課表':'Plan');await click('[data-testid="open-manual-planner"]');await page.waitForSelector('[data-testid="manual-add-content"]');
  assert.equal(await page.$$eval('[data-testid="manual-day-overview"], [data-testid="manual-common-workouts"]',els=>els.length),0,'Retired phase/source entrances removed');
  await capture('01-empty-day');
  await click('[data-testid="manual-add-content"]');await page.waitForSelector('[data-testid="quick-workout-picker"]');assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'INPUT','No forced mobile keyboard');
  await capture('02-add-combos');
  await page.type('[data-testid="combo-search"]','no-such-combo-9876');await click('[data-testid="combo-clear-filters"]');
  assert.equal(await page.$eval('[data-testid="combo-search"]',e=>e.value),'');
  step=`${width}/${lang}: continuous add`;
  await click('[data-testid="quick-workout-picker"] [data-testid="combo-add-daily-warmup"]');
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).sessions[0].routine.length===8,{},manualDraftStorageKey());
  const initialDose=(await snapshot())[0].prescriptions.find(d=>d.id==='bf_A15');
  await click('[data-testid="quick-workout-picker"] [data-testid="combo-add-hip-internal-rotation"]');
  await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).sessions[0].routine.length===10,{},manualDraftStorageKey());
  assert.ok(await page.$('[data-testid="quick-workout-picker"]'),'Picker stays open after both additions');
  assert.deepEqual((await snapshot())[0].prescriptions.find(d=>d.id==='bf_A15'),initialDose,'Duplicate retains dose and phase');
  assert.equal((await snapshot())[1].routine.length,0,'Other date unchanged');
  await click('.combo-first-panel-footer [role=status] button');
  assert.equal((await snapshot())[0].routine.length,8,'Undo only latest combo');
  await click('[data-testid="quick-workout-picker"] [data-testid="combo-add-hip-internal-rotation"]');
  await capture('03-added-feedback');await click('[data-testid="combo-panel-done"]');
  await new Promise(resolve=>setTimeout(resolve,3200));
  if(width===390&&lang==='zh'){
   const visibleRows=await page.$$eval('[data-exercise-id]',els=>els.filter(e=>{const r=e.getBoundingClientRect(),footer=document.querySelector('.manual-fixed-actions').getBoundingClientRect();return r.top>=0&&r.bottom<=footer.top}).length);
   assert.ok(visibleRows>=3,`Actual first viewport must show 3 complete movements, got ${visibleRows}`);
  }
  await capture('04-populated-day');
  await click('.manual-more > summary');await click('[data-testid="manual-save-day"]');
  await page.waitForSelector('[data-testid="save-workout-name"]',{visible:true});await page.type('[data-testid="save-workout-name"]',lang==='zh'?'我的髖控制':'My hip control');
  await textClick(lang==='zh'?'清除':'Clear');
  for(const id of ['bf_A10','bf_B16','bf_B17'])await click(`[data-testid="save-workout-exercise-${id}"]`);
  await click('[data-testid="save-workout-confirm"]');
  await page.waitForFunction(()=>!document.querySelector('[data-testid="save-workout-confirm"]'));
  const favorite=await page.evaluate(()=>JSON.parse(localStorage.getItem('fitness-planner:saved-workouts:v1')).items[0]);
  assert.equal(favorite.pinned,true,'Saved favorite is pinned in real storage');
  await page.waitForFunction(name=>document.querySelector('.combo-first-common')?.textContent.includes(name),{},favorite.name);
  await capture('04b-saved-combo');
  step=`${width}/${lang}: date isolation`;
  await click('[data-testid="manual-tab-2026-11-18"]');await click('[data-testid="manual-add-content"]');
  await click('[data-testid="quick-workout-picker"] [data-testid="combo-add-daily-warmup"]');await click('[data-testid="combo-panel-done"]');
  await click('[data-testid="manual-tab-2026-11-16"]');assert.equal((await snapshot())[0].routine.length,10);assert.equal((await snapshot())[1].routine.length,8);
  step=`${width}/${lang}: single exercise phase`;
  await click('[data-testid="manual-add-content"]');await textClick(lang==='zh'?'單一動作':'Single exercises');
  await page.type('[data-testid="combo-search"]',lang==='zh'?'靠牆天使':'Wall angel');
  await click('[data-testid="single-add-bf_A09"]');await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).sessions[0].routine.includes('bf_A09'),{},manualDraftStorageKey());
  assert.equal((await snapshot())[0].prescriptions.find(d=>d.id==='bf_A09').phase,'warmup');await click('[data-testid="combo-panel-done"]');
  await click('[data-testid="manual-review"]');await page.waitForSelector('[data-testid="assignment-apply"]',{visible:true});await capture('05-review');
  assert.equal(await page.evaluate(()=>localStorage.getItem('fitness_date_period_v1')),null,'Preview does not apply');
  await click('[data-testid="assignment-apply"]');await page.waitForFunction(()=>localStorage.getItem('fitness_date_period_v1'));
  const period=await page.evaluate(()=>JSON.parse(localStorage.getItem('fitness_date_period_v1')));
  assert.ok(JSON.stringify(period).includes('2026-11-16')&&JSON.stringify(period).includes('2026-11-18'));
  await capture('06-applied');assert.deepEqual(errors,[],`${step}: page errors`);
  results.push({width,lang,passed:['retired entrances removed','continuous combo addition','undo most recent combo','subset favorite pinned and immediately visible','eight independent warmups','duplicate dose and phase retained','date isolation','single movement phase','preview does not persist','real signed-out apply'],pageErrors:errors});
  await context.close();
 }
 await writeFile(`${out}/browser-review.json`,JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['status','--short'],{encoding:'utf8'}),scope:'Real React, isolated device storage; not human usability or account-write validation',results},null,2));console.log(JSON.stringify(results));
}catch(error){if(page&&!page.isClosed()){await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});console.error((await page.$eval('body',e=>e.innerText).catch(()=>'' )).slice(-5000))}console.error('Failed step:',step);throw error}finally{await browser?.close();server.kill()}
