import puppeteer from '../../node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root=resolve('design/planner-v2');
await mkdir(`${root}/png`,{recursive:true});
const browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
const results=[];
try{
 const page=await browser.newPage();await page.setViewport({width:390,height:900,deviceScaleFactor:2});
 await page.goto(pathToFileURL(`${root}/prototype.html`).href);const pages=await page.evaluate(()=>window.prototypePages);
 for(const name of pages){await page.goto(pathToFileURL(`${root}/prototype.html`).href+`?page=${name}`,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,cta:document.querySelector('.bottom .btn')?.innerText||null}));
 await page.evaluate(()=>document.body.classList.add('capture-full'));await page.screenshot({path:`${root}/png/${name}.png`,fullPage:true});results.push({name,...metrics});}
 for(const name of ['01-week','04-manual','13-import-dates']){await page.setViewport({width:1440,height:1050,deviceScaleFactor:1});await page.goto(pathToFileURL(`${root}/prototype.html`).href+`?page=${name}`);await page.screenshot({path:`${root}/png/${name}-desktop.png`,fullPage:true});}
 for(const name of ['01-week','13-import-dates']){await page.setViewport({width:390,height:844,deviceScaleFactor:2});await page.goto(pathToFileURL(`${root}/prototype.html`).href+`?page=${name}`);await page.screenshot({path:`${root}/png/${name}-first-fold.png`,fullPage:false});}
 await writeFile(`${root}/render-checks.json`,JSON.stringify(results,null,2));
 console.log(`Rendered ${pages.length} mobile screens and 3 desktop screens. Overflow: ${results.filter(x=>x.scrollWidth>x.width).map(x=>x.name).join(',')||'none'}`);
}finally{await browser.close();}
