// Design evidence only. Start node scripts/smoke-server.mjs 5211 first.
// Uses isolated local/prototype data; does not access a signed-in account.
import puppeteer from 'puppeteer';
import {createManualSession,manualDraftStorageKey} from '../src/domain/manualPlanner.js';
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage(); await page.setViewport({width:390,height:844});
await page.setRequestInterception(true);page.on('request',r=>/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(r.url())?r.continue():r.abort());
const click=async s=>(await page.waitForSelector(s,{visible:true})).click();
await page.goto('http://127.0.0.1:5211/FunctionalFitnessPlanner/',{waitUntil:'networkidle2'});
await page.evaluate(({key,session})=>{localStorage.clear();localStorage.setItem('app_lang','zh');localStorage.setItem(key,JSON.stringify({version:1,scope:'signed-out',sessions:[session]}));localStorage.setItem('planning_preferences_signed-out',JSON.stringify({time:'40',focus:'balanced',context:{healthStatus:'unrestricted',equipment:[],trainingDays:[1,3,5],badmintonDays:[]}}));},{key:manualDraftStorageKey(),session:createManualSession('2026-11-16','zh')});
await page.reload({waitUntil:'networkidle2'});
await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.innerText.trim()==='課表').click());
await click('[data-testid="open-manual-planner"]');
const out='docs/planner-redesign/2026-11-combo-first/';
await page.waitForSelector('[data-testid="manual-common-workouts"]',{visible:true});await page.screenshot({path:out+'before-empty.png'});
await click('[data-testid="manual-common-workouts"]');
await page.screenshot({path:out+'before-picker.png'});
await click('[data-testid="quick-view-daily-warmup"]');
await page.screenshot({path:out+'before-preview.png'});
console.log('Preview document height',await page.evaluate(()=>document.documentElement.scrollHeight));
await click('[data-testid="quick-workout-add"]');
await page.waitForSelector('[data-testid="manual-day-overview"]');
await page.evaluate(()=>scrollTo(0,0));
await page.screenshot({path:out+'before-day.png'});
console.log('Day text',await page.$eval('[data-testid="manual-day-overview"]',e=>e.innerText));
console.log('Day document height',await page.evaluate(()=>document.documentElement.scrollHeight));
await browser.close();
