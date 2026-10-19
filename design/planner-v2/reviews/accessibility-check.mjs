import puppeteer from 'puppeteer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const reviewDir = path.dirname(fileURLToPath(import.meta.url));
const prototype = new URL('../prototype.html', import.meta.url);
const pages = ['01-week', '04-manual', '05-pick-strength', '08-auto-goals', '13-import-dates', '14-import-conflict', '15-import-review'];
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const result = { date: '2026-10-19', method: 'DOM geometry, Chrome accessibility tree and keyboard interaction; no human performance measurements', layouts: [], scenarios: {} };
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));
const open = async (name, width = 390) => {
  await page.setViewport({ width, height: width === 1440 ? 900 : 844, deviceScaleFactor: 1 });
  await page.goto(`${prototype.href}?page=${name}`);
};
const clickText = async text => page.evaluate(text => {
  const compact = value => value.replace(/\s+/g, '');
  const button = [...document.querySelectorAll('button')].find(el => compact(el.textContent) === compact(text));
  if (!button) throw new Error(`Button not found: ${text}`);
  button.click();
}, text);

for (const width of [320, 390, 1440]) {
  for (const name of pages) {
    await open(name, width);
    const data = await page.evaluate(() => {
      const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
      const targets = [...document.querySelectorAll('button,input,select,a[href]')].filter(visible);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        overflowElements: [...document.querySelectorAll('body *')].filter(visible).map(el => ({ el, r: el.getBoundingClientRect() })).filter(({ r }) => r.right > innerWidth + 1 || r.left < -1).map(({ el, r }) => ({ tag: el.tagName, class: el.className, text: el.textContent.trim().slice(0, 70), x: r.x, right: r.right })),
        smallTargets: targets.map(el => ({ text: el.textContent.trim() || el.getAttribute('aria-label') || el.placeholder, ...rect(el) })).filter(r => r.width < 44 || r.height < 44),
        inputLabels: [...document.querySelectorAll('input,select')].filter(visible).map(el => ({ type: el.type, ariaLabel: el.getAttribute('aria-label'), labels: [...el.labels].map(l => l.textContent.trim()), placeholder: el.placeholder || '', ...rect(el) })),
        footer: [...document.querySelectorAll('.bottom,.nav')].filter(visible).map(rect)[0] || null,
        targetCount: targets.length
      };
    });
    const ax = await (await page.createCDPSession()).send('Accessibility.getFullAXTree');
    data.axControls = ax.nodes.filter(n => ['button', 'textbox', 'spinbutton', 'combobox', 'Date'].includes(n.role?.value)).map(n => ({ role: n.role.value, name: n.name?.value, states: n.properties?.filter(p => ['checked', 'pressed', 'selected'].includes(p.name)) || [] }));
    data.focusObscured = [];
    for (let i = 0; i < data.targetCount * 5 + 10; i++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { cycleComplete: true };
        if (el.closest('.bottom,.nav,.top,.side')) return null;
        const r = el.getBoundingClientRect();
        const footer = [...document.querySelectorAll('.bottom,.nav')].find(el => el.getClientRects().length)?.getBoundingClientRect() || { top: innerHeight };
        const header = document.querySelector('.top').getBoundingClientRect();
        if (r.bottom > footer.top + 1 || r.top < header.bottom - 1) return { text: el.textContent.trim() || el.getAttribute('aria-label') || el.placeholder || el.type, top: r.top, bottom: r.bottom, footerTop: footer.top, headerBottom: header.bottom };
        return null;
      });
      if (focus?.cycleComplete) { data.tabStops = i; break; }
      if (focus && !data.focusObscured.some(r => r.text === focus.text)) data.focusObscured.push(focus);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    data.bottomAtEnd = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('main button,main input,main select')].filter(el => el.getClientRects().length);
      const el = controls.at(-1); const r = el.getBoundingClientRect(); const f = [...document.querySelectorAll('.bottom,.nav')].find(el => el.getClientRects().length)?.getBoundingClientRect() || { top: innerHeight };
      return { lastControl: el.textContent.trim() || el.getAttribute('aria-label'), top: r.top, bottom: r.bottom, footerTop: f.top, clear: r.bottom <= f.top };
    });
    result.layouts.push({ page: name, width, ...data });
  }
}

await open('08-auto-goals');
await page.focus('.goal');
const before = await page.evaluate(() => ({ active: document.activeElement.textContent.trim(), outline: getComputedStyle(document.activeElement).outline }));
await page.keyboard.press('Enter');
result.scenarios.focusAfterSelection = { before, after: await page.evaluate(() => ({ activeTag: document.activeElement.tagName, activeText: document.activeElement === document.body ? 'BODY' : document.activeElement.textContent.trim() })) };
await page.evaluate(() => { [...document.querySelectorAll('input')].forEach((el, i) => { el.value = ['25', '60'][i]; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); });
await clickText('整體肌力');
result.scenarios.autoInputsAfterSelection = await page.$$eval('input', els => els.map(el => el.value));

await open('13-import-dates');
await page.evaluate(() => { [...document.querySelectorAll('input')].slice(1).forEach((el, i) => { el.value = ['2026-11-04', '2026-11-06'][i]; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); });
await clickText('下一步：檢查日期');
result.scenarios.changedDatesConflict = await page.$eval('main', el => el.innerText);
await page.evaluate(() => { const el = document.querySelector('input'); el.value = '2026-10-30'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
result.scenarios.recheckHandler = await page.$eval('.bottom button', el => el.getAttribute('onclick'));
await clickText('重新檢查日期');
result.scenarios.conflictingDateRecheckResult = await page.evaluate(() => ({ page: document.body.dataset.page, text: document.querySelector('main').innerText }));

await open('14-import-conflict');
await clickText('換一個日期\n保留原本的課表');
result.scenarios.changeDateOptionInputs = await page.$$eval('input', els => els.map(el => ({ value: el.value, label: el.getAttribute('aria-label'), labels: [...el.labels].map(l => l.textContent) })));
await clickText('重新檢查日期');
result.scenarios.noReplacementRecheckPage = await page.evaluate(() => document.body.dataset.page);
// Direct navigation is explicitly used only to inspect the static review branch after the broken footer handler.
await page.evaluate(() => go('15-import-review'));
result.scenarios.noReplacementReview = await page.$eval('main', el => el.innerText);
await clickText('確認匯入 3 天課表');
result.scenarios.noReplacementDone = await page.$eval('main', el => el.innerText);
result.scenarios.storageAfterDone = await page.evaluate(() => ({ localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage) }));

await open('15-import-review');
await clickText('匯入前更換某個動作');
result.scenarios.importChangeExerciseDestination = await page.$eval('main', el => el.innerText);

await open('05-pick-strength');
await page.click('[data-id="split"]');
await page.click('[data-id="goblet"]');
result.scenarios.emptySelectionFooter = await page.$eval('#bottom', el => el.innerText);

result.scenarios.brokenFooterActions = [];
for (const name of ['07-exercise-detail', '09-auto-body', '10-plan-preview', '11-share', '14-import-conflict']) {
  await open(name);
  const action = await page.$eval('.bottom button', el => ({ label: el.textContent, handler: el.getAttribute('onclick'), html: el.outerHTML }));
  const errorCount = pageErrors.length;
  await page.click('.bottom button');
  action.pageAfter = await page.evaluate(() => document.body.dataset.page);
  action.errors = pageErrors.slice(errorCount);
  result.scenarios.brokenFooterActions.push({ page: name, ...action });
}

await open('08-auto-goals', 320);
await page.screenshot({ path: path.join(reviewDir, 'a11y-320-auto-goals.png'), fullPage: false });
await open('14-import-conflict', 390);
await page.focus('input');
await page.screenshot({ path: path.join(reviewDir, 'a11y-390-conflict-input-focus.png'), fullPage: false });
await open('15-import-review', 390);
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
await page.screenshot({ path: path.join(reviewDir, 'a11y-390-review-keyboard-obscured.png'), fullPage: false });
result.pageErrors = pageErrors;
await fs.writeFile(path.join(reviewDir, 'accessibility-measurements.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ layouts: result.layouts.map(r => ({ page: r.page, width: r.width, scrollWidth: r.scrollWidth, smallTargets: r.smallTargets, focusObscured: r.focusObscured, bottomAtEnd: r.bottomAtEnd })), scenarios: result.scenarios }, null, 2));
await browser.close();
