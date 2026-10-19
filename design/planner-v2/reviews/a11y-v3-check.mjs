import puppeteer from 'puppeteer';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const dir = resolve('design/planner-v2/reviews');
const url = pathToFileURL(resolve('design/planner-v2/prototype.html')).href;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const result = { date: '2026-10-19', layouts: [], scenarios: {} };
const sourceHash = async () => createHash('sha256').update(await readFile(resolve('design/planner-v2/prototype.html'))).digest('hex');
result.sourceHashBefore = await sourceHash();
const open = async (name, width = 390) => {
  await page.setViewport({ width, height: width === 1440 ? 900 : 844, deviceScaleFactor: 1 });
  await page.goto(`${url}?page=${name}`);
  await page.evaluate(() => document.fonts.ready);
};
const settle = async () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const click = async (text, index = 0) => {
  const el = await page.evaluateHandle(({ text, index }) => [...document.querySelectorAll('button')].filter(el => el.getClientRects().length && el.innerText.replace(/\s+/g, '') === text.replace(/\s+/g, ''))[index], { text, index });
  if (!el.asElement()) throw new Error(`Missing ${text}`);
  await el.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await el.click();
  await settle();
};
const fill = async (selector, value) => page.$eval(selector, (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
const text = () => page.$eval('main', el => el.innerText);
const bottom = () => page.$eval('.bottom,.nav', el => ({ text: el.innerText, disabled: el.querySelector('button').disabled }));
const current = () => page.$eval('body', el => el.dataset.page);
try {
  await open('01-week');
  const pages = await page.evaluate(() => window.prototypePages);
  const keyboardPages = ['01-week', '03-dates-manual', '04-manual', '05-pick-strength', '08-auto-goals', '13-import-dates', '14-import-conflict', '15-import-review', '15b-import-replace', '17-import-adjust'];
  const checkedPages = process.argv.includes('--focused') ? ['03-dates-manual','08-auto-goals','14-import-conflict','15-import-review','15b-import-replace','17-import-adjust'] : pages;
  for (const width of [320, 390, 1440]) for (const name of checkedPages) {
    await open(name, width);
    const m = await page.evaluate(() => {
      const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      const targets = [...document.querySelectorAll('button,input,select,a[href]')].filter(visible);
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, targetCount: targets.length,
        smallTargets: targets.filter(el => !el.disabled).map(el => { const r = el.getBoundingClientRect(); return { name: el.getAttribute('aria-label') || el.innerText || el.type, width: r.width, height: r.height }; }).filter(r => r.width < 43.99 || r.height < 43.99),
        brokenHandlers: [...document.querySelectorAll('[onclick]')].flatMap(el => { try { new Function(el.getAttribute('onclick')); return []; } catch { return [el.innerText]; } }) };
    });
    m.focusObscured = [];
    if (keyboardPages.includes(name)) for (let i = 0; i < m.targetCount * 3 + 8; i++) {
      await page.keyboard.press('Tab'); await settle();
      const f = await page.evaluate(() => {
        const el = document.activeElement;
        if (el === document.body) return { end: true };
        if (!el || el.closest('.top,.bottom,.nav,.side')) return null;
        const r = el.getBoundingClientRect();
        const footer = [...document.querySelectorAll('.bottom,.nav')].find(el => el.getClientRects().length)?.getBoundingClientRect();
        const h = document.querySelector('.top').getBoundingClientRect();
        if (r.bottom > (footer?.top || innerHeight) + 1 || r.top < h.bottom - 1) return { name: el.getAttribute('aria-label') || el.innerText || el.type, top: r.top, bottom: r.bottom, footerTop: footer?.top, headerBottom: h.bottom };
        return null;
      });
      if (f?.end) break;
      if (f && !m.focusObscured.some(x => x.name === f.name)) m.focusObscured.push(f);
    }
    result.layouts.push({ page: name, ...m });
  }

  await open('14-import-conflict');
  result.scenarios.defaultConflict = await page.evaluate(() => ({ replaceFor: state.replaceFor, pressed: [...document.querySelectorAll('.radio')].map(el => ({ text: el.innerText, pressed: el.getAttribute('aria-pressed') })), labels: [...document.querySelectorAll('input')].map(el => ({ id: el.id, labels: [...el.labels].map(l => l.innerText) })) }));
  await fill('#conflict-1', '2026-10-29');
  await fill('#conflict-2', '2026-10-30');
  result.scenarios.protectedDateGate = { page: await current(), bottom: await bottom(), text: await text() };
  await fill('#conflict-2', '2026-10-31');
  await click('查看匯入確認');
  result.scenarios.correctReview = { page: await current(), text: await text() };
  await click('確認匯入 3 天課表');
  result.scenarios.correctDone = { page: await current(), text: await text(), storage: await page.evaluate(() => Object.keys(localStorage)) };

  await open('14-import-conflict');
  await click('改為替換「上肢肌力」\n只有按最後確認才會更動');
  await fill('#conflict-2', '2026-10-31');
  await click('查看匯入確認');
  result.scenarios.explicitReplacement = { page: await current(), bottom: await bottom(), text: await text() };

  result.scenarios.footerActions = [];
  for (const name of ['07-exercise-detail', '09-auto-body', '10-plan-preview', '11-share']) {
    await open(name);
    if (name === '09-auto-body') { await click('精神正常\n維持一般起步安排'); await click('沒有'); }
    const errorCount = errors.length;
    const before = await bottom(); await page.click('.bottom .btn'); await settle();
    result.scenarios.footerActions.push({ page: name, label: before.text, pageAfter: await current(), errors: errors.slice(errorCount), bottom: await bottom() });
  }

  await open('04-manual');
  result.scenarios.secondEdit = { before: await text() };
  await click('編輯', 2);
  result.scenarios.secondEdit.opened = await text();
  await fill('#dose-sets', '3');
  await click('儲存修改');
  result.scenarios.secondEdit.after = await text();

  await open('03-dates-manual');
  await click('開始排 3 天');
  await click('＋ 加入每日八段動態拉伸');
  await click('保留草稿後離開');
  result.scenarios.draftReload = { before: await text(), storedBefore: await page.evaluate(() => Object.keys(localStorage)) };
  await page.reload();
  result.scenarios.draftReload.after = await text();
  result.scenarios.draftReload.storedAfter = await page.evaluate(() => Object.keys(localStorage));

  await open('08-auto-goals');
  await fill('#available-minutes', '25'); await fill('#court-minutes', '60');
  await click('整體肌力');
  result.scenarios.conditionRerender = await page.$$eval('input', els => els.map(el => ({ id: el.id, value: el.value })));
  await page.focus('.goal'); await page.keyboard.press('Enter'); await settle();
  result.scenarios.focusAfterSelection = await page.evaluate(() => document.activeElement.tagName);
  const ax = await (await page.createCDPSession()).send('Accessibility.getFullAXTree');
  result.scenarios.conditionsAX = ax.nodes.filter(n => ['button', 'spinbutton', 'combobox'].includes(n.role?.value)).map(n => ({ role: n.role.value, name: n.name?.value, states: n.properties?.filter(p => ['checked', 'pressed', 'selected'].includes(p.name)) || [] }));
  await page.screenshot({ path: resolve(dir, 'a11y-v3-390-conditions.png'), fullPage: false });

  await open('11-share');
  await page.click('.catalog-row:nth-child(1)'); await settle();
  await page.click('.catalog-row:nth-child(2)'); await settle();
  await click('建立分享連結');
  await click('查看接收者會看到的畫面 ›');
  result.scenarios.subsetAdjust = { shared: await text() };
  await click('選日期，匯入我的課表');
  await fill('#import-start', '2026-11-02');
  await click('下一步：檢查日期');
  result.scenarios.subsetAdjust.review = await text();
  await click('匯入前調整這份副本');
  result.scenarios.subsetAdjust.adjust = await text();

  await open('17-import-adjust');
  result.scenarios.changeImportedExercise = { before: await text(), sourceBefore: await page.evaluate(() => JSON.stringify(sharedSource())) };
  await click('＋ 加入動作', 1);
  await page.click('[data-id="split"]'); await settle();
  await click('加入 1 個動作');
  result.scenarios.changeImportedExercise.afterAdd = await text();
  await click('儲存並回到匯入確認');
  result.scenarios.changeImportedExercise.review = await text();
  await click('匯入前調整這份副本');
  result.scenarios.changeImportedExercise.after = await text();
  result.scenarios.changeImportedExercise.sourceAfter = await page.evaluate(() => JSON.stringify(sharedSource()));
  result.scenarios.changeImportedExercise.copyAfter = await page.evaluate(() => JSON.stringify(importDays()));
  await open('15-import-review');
  result.scenarios.prototypeNotice = { review: await text() };
  await click('確認匯入 3 天課表');
  result.scenarios.prototypeNotice.done = await text();
  await open('08-auto-goals');
  await click('✓ 啞鈴');
  result.scenarios.equipmentAfterToggle = await page.$eval('.chips button', el => ({ text: el.innerText, pressed: el.getAttribute('aria-pressed') }));
  await click('整體肌力');
  result.scenarios.equipmentAfterRerender = await page.$eval('.chips button', el => ({ text: el.innerText, pressed: el.getAttribute('aria-pressed') }));

  result.errors = errors;
  const html = await readFile(resolve('design/planner-v2/prototype.html'), 'utf8');
  const js = await readFile(resolve('design/planner-v2/prototype.js'), 'utf8');
  result.embeddedSourceMatches = html.match(/<script>([\s\S]*?)<\/script>/)?.[1].trim() === js.trim();
  await writeFile(resolve(dir, 'a11y-v3-measurements.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ layouts: result.layouts.length, overflow: result.layouts.filter(x => x.scrollWidth > x.width), smallTargets: result.layouts.filter(x => x.smallTargets.length).map(x => ({ page: x.page, width: x.width, targets: x.smallTargets })), focusObscured: result.layouts.filter(x => x.focusObscured.length).map(x => ({ page: x.page, width: x.width, targets: x.focusObscured })), scenarios: result.scenarios, errors, embeddedSourceMatches: result.embeddedSourceMatches }, null, 2));
} finally {
  result.errors = errors;
  result.sourceHashAfter = await sourceHash();
  result.stableSourceDuringCheck = result.sourceHashBefore === result.sourceHashAfter;
  await writeFile(resolve(dir, 'a11y-v3-measurements.json'), JSON.stringify(result, null, 2));
  await browser.close();
}
