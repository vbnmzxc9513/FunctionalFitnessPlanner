// Design evidence only. Start node scripts/smoke-server.mjs 5211 first.
// Uses isolated local/prototype data; does not access a signed-in account.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import {writeFile} from 'node:fs/promises';
const root='docs/planner-redesign/2026-11-combo-first';
const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
try{for(const width of [320,390,1440]){
const context=await browser.createBrowserContext(),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width,height:width===1440?1000:844});
await page.goto(`http://127.0.0.1:5211/FunctionalFitnessPlanner/${root}/prototype.html`,{waitUntil:'networkidle2'});
const click=async s=>(await page.waitForSelector(s,{visible:true})).click();
const capture=async name=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(width===390||width===1440)await page.screenshot({path:`${root}/${name}-${width}.png`})};
await capture('01-day');await click('.footer [data-action="open"]');assert.notEqual(await page.evaluate(()=>document.activeElement.id),'search');await capture('02-combos');
await click('[data-combo="daily-warmup"]:is(.add)');assert.equal(await page.$eval('#picker',e=>e.open),true);await click('[data-combo="hip-internal-rotation"]:is(.add)');
assert.ok((await page.$eval('#panel-status',e=>e.textContent)).includes('1 個重複保留原設定'));
await click('#panel-status [data-action="undo"]');await click('[data-combo="hip-internal-rotation"]:is(.add)');await click('#done');
assert.equal(await page.$$eval('.exercise',els=>els.length),10);assert.equal(await page.$$eval('.phase-title',els=>els.length),2);assert.ok((await page.$eval('#day-list',e=>e.textContent)).includes('暖身 · 8 個動作'));await capture('03-populated');
await click('.menu summary');await click('[data-action="save"]');await page.type('#combo-name','我的髖活動');
await page.$$eval('.save-list input',els=>{els.forEach(e=>{e.checked=['bf_A15','bf_B16','bf_B17'].includes(e.value)})});await capture('04-save');await click('[data-action="confirm-save"]');
assert.ok((await page.$eval('#shortcuts',e=>e.textContent)).includes('我的髖活動'));
await page.reload();assert.equal(await page.$$eval('.exercise',els=>els.length),10);assert.ok((await page.$eval('#shortcuts',e=>e.textContent)).includes('我的髖活動'));
await click('.footer [data-action="open"]');await page.type('#search','找不到這個組合');assert.ok(await page.$('#results-empty'));await click('[data-action="clear-filter"]');await click('[data-tab="exercises"]');await page.type('#search','分腿蹲');await click('[data-single="bf_B01"]');await click('#done');assert.equal(await page.$$eval('.exercise',els=>els.length),11);
await click('#review');assert.ok((await page.$eval('#modal',e=>e.textContent)).includes('沒有連接帳號'));assert.deepEqual(errors,[]);
results.push({width,checks:['no horizontal overflow','search keyboard not automatically opened','continuous combo addition','duplicate retained and announced','undo last addition','8 separate warmups','no empty phase sections','save selected subset and pin','local draft survives reload','empty search and clear','single exercise addition','review clearly identifies prototype'],pageErrors:errors});
await context.close()}
await writeFile(`${root}/prototype-review.json`,JSON.stringify({type:'automated prototype walkthrough; not representative user testing',results},null,2));console.log(JSON.stringify(results));}finally{await browser.close()}
