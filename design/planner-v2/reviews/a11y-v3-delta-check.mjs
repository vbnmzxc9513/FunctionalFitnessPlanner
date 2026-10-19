import puppeteer from 'puppeteer';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const base = 'file:///workspace/FunctionalFitnessPlanner/design/planner-v2/prototype.html';
const hash = async () => createHash('sha256').update(await readFile('design/planner-v2/prototype.html')).digest('hex');
const result = { hashBefore: await hash() };
const click = async text => {
  const el = await p.evaluateHandle(text => [...document.querySelectorAll('button')].find(el => el.getClientRects().length && el.innerText.replace(/\s+/g, '') === text.replace(/\s+/g, '')), text);
  if (!el.asElement()) throw new Error(text);
  await el.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await el.click();
};
const equipment = () => p.$eval('.chips button', el => ({ text: el.innerText, pressed: el.getAttribute('aria-pressed') }));
try {
  await p.goto(base + '?page=08-auto-goals');
  await click('✓ 啞鈴'); result.afterToggle = await equipment();
  await click('整體肌力'); result.afterGoal = await equipment();
  await click('下一步：身體感受'); await p.click('.top .back'); result.afterReturn = await equipment();
  await p.focus('.goal'); await p.keyboard.press('Enter');
  result.focusAfterSelection = await p.evaluate(() => document.activeElement.tagName);
  await p.goto(base + '?page=11-share');
  await p.click('.catalog-row:nth-child(1)'); await p.click('.catalog-row:nth-child(2)');
  await click('建立分享連結'); await click('查看接收者會看到的畫面 ›');
  result.sharedStretchOnly = await p.$eval('main', el => el.innerText);
  result.hashAfter = await hash(); result.stable = result.hashBefore === result.hashAfter;
  await writeFile('design/planner-v2/reviews/a11y-v3-delta.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally { await b.close(); }
