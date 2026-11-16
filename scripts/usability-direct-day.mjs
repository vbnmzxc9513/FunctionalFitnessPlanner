// Real signed-out App tasks; all mutations confined to an isolated browser device draft.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer';
import {catalogExercises} from '../src/domain/exerciseCatalog.js';
import {createManualSession,manualDraftStorageKey} from '../src/domain/manualPlanner.js';
import {previewQuickWorkout,applyQuickWorkout} from '../src/domain/quickWorkoutDraft.js';
import {getQuickWorkout} from '../src/domain/quickWorkouts.js';
import {applyLocalPeriod} from '../src/domain/periodDraft.js';
const out='docs/usability-2026-11-16/screens';await mkdir(out,{recursive:true});
const exercises=catalogExercises('zh'),dates=['2026-11-16','2026-11-18'];
const sessions=dates.map(date=>applyQuickWorkout(previewQuickWorkout(createManualSession(date),getQuickWorkout('daily-warmup'),{exercises,eligibleExercises:exercises,dailyTime:40})).session);
const profile={time:'40',focus:'balanced',context:{healthStatus:'unrestricted',equipment:['dumbbell','band','foam_roller'],trainingDays:[1,3,5],badmintonDays:[]}};
const period=applyLocalPeriod(null,{range:{from:dates[0],to:dates[1]},sessions,dates,selectedDates:dates,profile,weeklySummaries:[],expectedState:{fingerprint:'null'},conclusion:'Test'},dates[0]);
const port=5256,site=`http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
const server=spawn(process.execPath,['scripts/smoke-server.mjs',String(port)],{stdio:'ignore',env:{...process.env,SMOKE_DISABLE_HMR:'1'}});
let browser,page,step='startup';const results=[];
try{
 for(let i=0;i<100;i++){try{if((await fetch(site)).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await puppeteer.launch({executablePath:process.env.PUPPETEER_EXECUTABLE_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 for(const width of [390,320,1440]){
 const ctx=await browser.createBrowserContext();page=await ctx.newPage();await page.setViewport({width,height:width===1440?1000:844});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setRequestInterception(true);page.on('request',r=>['127.0.0.1','localhost'].includes(new URL(r.url()).hostname)?r.continue():r.abort());
 await page.evaluateOnNewDocument(()=>{const NativeDate=Date,now=new NativeDate('2026-11-16T12:00:00Z').getTime();window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}});
 await page.goto(site,{waitUntil:'networkidle2'});
 await page.evaluate(({period,profile,key,sessions})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify({version:1,scope:'signed-out',sessions}));localStorage.setItem('app_lang','zh');localStorage.setItem('fitness_date_period_v1',JSON.stringify(period));localStorage.setItem('planning_preferences_signed-out',JSON.stringify(profile));},{period,profile,key:manualDraftStorageKey(),sessions});
 await page.reload({waitUntil:'networkidle2'});
 const click=async selector=>(await page.waitForSelector(selector,{visible:true})).click();
 const textClick=async text=>{await page.waitForFunction(t=>[...document.querySelectorAll('button')].some(b=>b.innerText.trim()===t),{},text);const b=(await page.evaluateHandle(t=>[...document.querySelectorAll('button')].find(b=>b.innerText.trim()===t),text)).asElement();await b.click()};
 const snap=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fitness_date_period_v1')));
 const capture=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${width}/${step}: overflow`);await page.screenshot({path:`${out}/${name}-${width}.png`})};
 const originalMultiDraft=await page.evaluate(key=>localStorage.getItem(key),manualDraftStorageKey());
 step='today';await page.waitForSelector('[data-testid="day-add-exercise"]',{visible:true});await capture('today');
 assert.ok(await page.$('[data-testid="exercise-tags-bf_A10"]'));
 step='one-click add';await click('[data-testid="day-add-exercise"]');await page.waitForSelector('[data-testid="combo-body-part"]',{visible:true});
 assert.equal(await page.$$eval('[data-testid^="manual-date-"]',e=>e.length),0,'No date wizard');
 assert.equal(await page.$eval('[data-testid="combo-search"]',e=>e.value),'');
 await page.select('[data-testid="combo-body-part"]','chest');await page.waitForSelector('[data-testid="single-add-bf_C11"]');
 assert.ok(await page.$('[data-testid="exercise-tags-bf_C11"]'));await capture('chest-picker');
 await click('[data-testid="single-add-bf_C11"]');await click('[data-testid="combo-panel-done"]');
 assert.equal(await page.$$eval('.manual-date-tab',e=>e.length),0,'Single-day edit never asks for a date');
 await capture('edit-day');await click('[data-testid="manual-review"]');await page.waitForSelector('[data-testid="assignment-apply"]',{visible:true});
 assert.equal(await page.$$eval('.assignment-change-dates',e=>e.length),0,'No range mapping while editing one day');
 await capture('confirm-day');await click('[data-testid="assignment-apply"]');await page.waitForSelector('[data-testid="day-add-exercise"]',{visible:true});
 const saved=await snap();assert.equal(saved.sessionsByDate[dates[0]].routine.length,9);assert.deepEqual(saved.sessionsByDate[dates[1]],period.sessionsByDate[dates[1]],'Neighbor date is unchanged');
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),manualDraftStorageKey()),originalMultiDraft,'Single-day editing never overwrites or clears a separate multi-day draft');
 step='calendar and library';await textClick('課表');await page.waitForSelector('[data-testid="period-day-2026-11-16"]',{visible:true});await page.waitForFunction(()=>!document.querySelector('.pointer-events-none[role=status]'));await capture('plan');
 step='empty calendar day';await click('[data-testid="period-day-2026-11-17"]');await page.waitForSelector('[data-testid="combo-body-part"]',{visible:true});
 assert.equal(await page.$$eval('.manual-date-tab',e=>e.length),0,'An empty chosen calendar day also opens the picker directly');
 assert.match(await page.$eval('[data-testid="quick-workout-picker"]',e=>e.innerText),/11\/17/);
 await click('[data-testid="combo-panel-done"]');await textClick('返回當天');assert.deepEqual(await snap(),saved,'Leaving an empty day never changes stored plans');
 await textClick('動作庫');await page.waitForSelector('[data-testid="library-body-part"]');await page.select('[data-testid="library-body-part"]','chest');assert.ok(await page.$('[data-testid="library-exercise-bf_C11"]'));await capture('library-chest');
 await textClick('紀錄');await page.waitForSelector('[data-testid="training-history"]',{visible:true});await capture('records');
 step='protected day';await page.evaluate(saved=>{const session=saved.sessionsByDate['2026-11-16'];saved.progressByWeek[session.week]={completed:{day1_bf_A10:true}};localStorage.setItem('fitness_date_period_v1',JSON.stringify(saved));},saved);await page.reload({waitUntil:'networkidle2'});
 const protectedBefore=await snap();await click('[data-testid="day-add-exercise"]');await page.waitForSelector('[data-testid="combo-body-part"]',{visible:true});await page.select('[data-testid="combo-body-part"]','chest');await click('[data-testid="single-add-bf_C03"]');await click('[data-testid="combo-panel-done"]');await click('[data-testid="manual-review"]');await page.waitForSelector('.assignment-error');
 assert.equal(await page.$$eval('[data-testid="assignment-apply"]',e=>e.length),0);assert.deepEqual(await snap(),protectedBefore,'Existing actual completion and plan never overwritten');assert.equal(await page.$$eval('.assignment-date-list',e=>e.length),0,'Protected day error does not send user to a date wizard');
 assert.deepEqual(errors,[]);results.push({width,oneClickAdd:true,chestFilter:true,tagged:true,sameDateSaved:true,emptyDateDirect:true,otherDatePreserved:true,protectedPreserved:true,pageErrors:errors});await ctx.close();
 }
 await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}catch(e){console.error('STEP',step);if(page&&!page.isClosed()){await page.screenshot({path:`${out}/failure.png`});console.error((await page.$eval('body',e=>e.innerText)).slice(-4000))}throw e}finally{await browser?.close();server.kill()}
