import assert from 'node:assert/strict';
import puppeteer from '../../../node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const root=resolve('design/planner-v2'),out=root+'/add-exercises';await mkdir(out+'/png',{recursive:true});
const b=await puppeteer.launch({headless:true,args:['--no-sandbox']});
const facts=[],errors=[];
try{
 const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));await p.setViewport({width:390,height:844,deviceScaleFactor:2});
 const open=async()=>{await p.goto(pathToFileURL(root+'/prototype.html').href+'?page=03-dates-manual');await p.evaluate(()=>document.fonts.ready);};
 const click=async label=>{const h=await p.evaluateHandle(label=>[...document.querySelectorAll('button')].find(x=>!x.disabled&&x.getClientRects().length&&(x.getAttribute('aria-label')===label||x.innerText.trim()===label)),label);assert.ok(h.asElement(),'button '+label);await h.evaluate(x=>x.scrollIntoView({block:'center',behavior:'instant'}));await h.click();await h.dispose();};
 const shot=async(id,fold=false)=>{await p.evaluate(()=>{clearTimeout(window.toastTimer);document.getElementById('toast').style.display='none';return document.fonts.ready});if(!fold)await p.evaluate(()=>document.body.classList.add('capture-full'));await p.screenshot({path:out+'/png/'+id+'.png',fullPage:!fold});await p.evaluate(()=>document.body.classList.remove('capture-full'));};
 await open();await click('開始排 3 天');await click('加入動作到暖身');assert.match(await p.$eval('#app',x=>x.innerText),/加入暖身動作/);assert.equal(await p.$eval('.bottom .btn',x=>x.disabled),true);await shot('01-warmup-open',true);
 await click('整套選取');await click('已選 8 個 · 查看');assert.equal(await p.$$eval('.exercise',x=>x.length),8);await shot('02-warmup-eight');await click('加入 8 個動作');
 await click('加入動作到訓練');await shot('03-training-open',true);await click('選取：分腿蹲');await click('選取：側弓步');
 await click('背');assert.equal(await p.evaluate(()=>state.selected.size),2);await click('腿');assert.equal(await p.$eval('[data-id="split"]',x=>x.getAttribute('aria-pressed')),'true');
 await p.type('#search','前鋸肌');assert.match(await p.$eval('#catalog-title',x=>x.innerText),/搜尋/);assert.equal(await p.$$eval('#catalog [data-id]',x=>x.length),2);assert.ok(await p.$eval('#picker-browse',x=>x.hidden));
 await click('選取：彈力繩前鋸肌前伸');assert.equal(await p.$eval('#search',x=>x.value),'前鋸肌');assert.equal(await p.evaluate(()=>state.selected.size),3);await shot('04-search-across-categories',true);
 await click('收藏：彈力繩前鋸肌前伸');await click('清除搜尋');await click('★ 收藏');assert.equal(await p.$$eval('#catalog [data-id]',x=>x.length),1);await click('已選 3 個 · 查看');await shot('05-selected-three');
 await click('移除待選：彈力繩前鋸肌前伸');assert.equal(await p.evaluate(()=>state.selected.size),2);await click('繼續選動作');await click('選取：彈力繩前鋸肌前伸');await click('已選 3 個 · 查看');await click('加入 3 個動作');
 assert.equal(await p.evaluate(()=>editorDay().main.length),3);assert.equal(await p.evaluate(()=>editorDay().warm.length),8);await shot('06-added-to-day');
 await click('復原');assert.equal(await p.evaluate(()=>editorDay().main.length),0);assert.equal(await p.evaluate(()=>editorDay().warm.length),8);
 await click('加入動作到訓練');await click('選取：分腿蹲');await click('選取：側弓步');await p.type('#search','前鋸肌');await click('選取：彈力繩前鋸肌前伸');await click('加入 3 個動作');
 await click('複製這天');await click('複製到 10/21 週三');await click('複製到 10/23 週五');await shot('07-copy-to-other-dates');await click('複製到 2 天');
 const copied=await p.evaluate(()=>manualDays().map(d=>({date:d.date,warm:d.warm.length,main:d.main.map(x=>x[0])})));assert.deepEqual(copied.map(d=>d.warm),[8,8,8]);assert.deepEqual(copied.map(d=>d.main.length),[3,3,3]);
 await p.evaluate(()=>{state.day=1;render()});await shot('08-reused-next-day');await p.evaluate(()=>editorDay().main[0][1]='3組 × 8下');assert.equal(await p.evaluate(()=>manualDays()[0].main[0][1]),'1組 × 6下');
 await click('複製這天');assert.equal(await p.$$eval('.radio:not([disabled])',x=>x.length),0);assert.equal(await p.$eval('.bottom .btn',x=>x.disabled),true);
 await click('回到排課');await click('加入動作到訓練');await p.type('#search','找不到的動作999');assert.match(await p.$eval('#catalog',x=>x.innerText),/找不到/);assert.equal(await p.$eval('#catalog-count',x=>x.innerText),'0 個');await shot('09-empty-search',true);
 await click('清除搜尋');await p.type('#search','腿拉伸');assert.ok((await p.$$eval('#catalog [data-id]',x=>x.length))>=3);assert.equal(await p.$eval('#catalog-count',x=>parseInt(x.innerText)),await p.$$eval('#catalog [data-id]',x=>x.length));
 facts.push('warmup context and eight-part batch selection','selections persist across body filters and global search','search aliases, actual result count and empty state','favorites, cart review, remove and add','exact day/phase insertion and undo','copy only into empty phases, independent copies, existing content protected');
 for(const width of [320,390,1440]){await p.setViewport({width,height:844,deviceScaleFactor:1});for(const route of ['05-pick-strength','06-pick-stretch','18-selected-exercises','19-copy-day']){await p.evaluate(route=>go(route),route);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+route+' '+width);const small=await p.$$eval('button:not([disabled]),input',els=>els.filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height&&(r.width<43.5||r.height<43.5)}).map(el=>el.textContent));assert.deepEqual(small,[],'target size '+route);}}
 assert.deepEqual(errors,[]);await writeFile(out+'/checks.json',JSON.stringify({flows:facts,viewports:[320,390,1440],errors,copied},null,2));console.log('Six focused interaction journeys, 12 viewport/target checks, nine PNG states passed.');
}finally{await b.close();}
