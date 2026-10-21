import { spawn } from 'node:child_process';
import { access, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { catalogExercises } from '../src/domain/exerciseCatalog.js';
import { generatePeriodPlan } from '../src/domain/periodPlanning.js';

// Isolated device data, produced by the real planning engine. No account writes.
const today = '2026-10-19';
const profile = { time: '40', focus: 'balanced', context: { healthStatus: 'unrestricted', equipment: ['dumbbell', 'band', 'cable', 'foam_roller'], trainingDays: [1, 2, 3, 4, 5], badmintonDays: [2, 4, 5], badmintonMinutes: 90, badmintonIntensity: 'mixed' } };
const plan = generatePeriodPlan(catalogExercises('zh'), profile, { from: today, to: '2026-10-25' }, { today }, 'zh');
const draft = { ...plan, version: 1, profile, periodId: 'visual-review', sessionsByDate: Object.fromEntries(plan.sessions.map(day => [day.date, { ...day, revision: 1 }])), progressByWeek: {}, logs: [], readiness: [] };
const output = resolve(process.env.PLANNER_VISUAL_OUTPUT || 'artifacts/planner-visual');
await mkdir(output, { recursive: true });
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', '5196'], { stdio: 'ignore', env: process.env });
const site = 'http://127.0.0.1:5196/FunctionalFitnessPlanner/';
let browser, diagnosticPage;
try {
  for (let n = 0; n < 100; n++) { try { if ((await fetch(site)).ok) break; } catch { /* Starting */ } await new Promise(resolve => setTimeout(resolve, 150)); }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.createBrowserContext(), page = await context.newPage(); diagnosticPage = page;
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const setup = async (target, seed = false) => {
    if (target !== page) target.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await target.setRequestInterception(true);
    target.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else request.abort(); });
    await target.evaluateOnNewDocument(({ today, draft, profile, seed }) => {
      localStorage.setItem('app_lang', 'zh');
      if (seed && !sessionStorage.getItem('visual-seeded')) { localStorage.setItem('fitness_date_period_v1', JSON.stringify(draft)); localStorage.setItem('planning_preferences_signed-out', JSON.stringify(profile)); sessionStorage.setItem('visual-seeded', 'yes'); }
      const NativeDate = Date, timestamp = new NativeDate(`${today}T12:00:00`).getTime();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [timestamp])); } static now() { return timestamp; } };
    }, { today, draft, profile, seed });
  };
  await setup(page, true);
  const click = async (selector, target = page) => { const item = await target.waitForSelector(selector, { visible: true }); await item.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await item.click(); await item.dispose(); };
  const textClick = async (label, target = page) => { await target.waitForFunction(label => [...document.querySelectorAll('button')].some(el => el.innerText.trim() === label && el.getClientRects().length && !el.disabled), {}, label); const el = (await target.evaluateHandle(label => [...document.querySelectorAll('button')].find(el => el.innerText.trim() === label && el.getClientRects().length && !el.disabled), label)).asElement(); await el.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await el.click(); await el.dispose(); };
  const shot = async (name, target = page) => { await target.evaluate(() => scrollTo(0, 0)); await new Promise(resolve => setTimeout(resolve, 100)); await target.screenshot({ path: `${output}/${name}.png` }); await target.screenshot({ path: `${output}/${name}-full.png`, fullPage: true }); };
  await page.goto(site, { waitUntil: 'networkidle2' }); await textClick('課表'); await page.waitForSelector('[data-testid="period-day-2026-10-19"]'); await shot('01-home');
  await click('[data-testid="period-day-2026-10-19"]'); await shot('02-day'); await textClick('返回課表');
  await click('[data-testid="open-manual-planner"]'); await shot('03-calendar');
  for (const date of ['2026-10-19', '2026-10-21', '2026-10-23']) await click(`[data-testid="manual-date-${date}"]`);
  await click('[data-testid="manual-start"]'); await textClick('加入我的每日八段拉伸');
  await click('[data-testid="manual-add-strength"]'); await textClick('腿'); await shot('05-picker');
  await click('[data-testid="batch-option-bf_B01"]'); await click('[data-testid="batch-option-bf_B05"]'); await click('[data-testid="batch-picker-add"]');
  await shot('04-manual');
  await textClick('儲存為課表'); await page.waitForSelector('dialog[open]'); await page.type('dialog[open] input', '全身肌力 A'); await shot('06-name'); await click('[data-testid="save-workout-confirm"]');
  await page.waitForFunction(() => !document.querySelector('dialog[open]')); await textClick('返回課表'); await click('[data-testid="open-saved-workouts"]'); await page.waitForSelector('[data-testid="saved-workout-open"]'); await page.waitForFunction(() => !document.querySelector('.app-shell > [role="status"]')); await shot('07-library');
  await click('[data-testid="saved-workout-open"]'); await shot('08-library-detail'); await click('[data-testid="saved-workout-share"]'); await page.waitForSelector('[data-testid="plan-share-create"]'); await shot('09-share'); await click('[data-testid="plan-share-create"]'); await page.waitForSelector('[role="dialog"] input[readonly]'); const link = await page.$eval('[role="dialog"] input[readonly]', el => el.value);
  const recipient = await context.newPage(); await recipient.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await setup(recipient, false);
  // A second browser context keeps the recipient's dates and records independent.
  await recipient.close();
  const incomingContext = await browser.createBrowserContext(), incoming = await incomingContext.newPage(); await incoming.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await setup(incoming, false); await incoming.goto(link, { waitUntil: 'networkidle2' }); await incoming.waitForSelector('[data-testid="shared-plan-import"]'); await shot('10-recipient', incoming);
  await click('[data-testid="shared-plan-import"]', incoming); await shot('11-dates', incoming); await click('[data-testid="assignment-preview"]', incoming); await incoming.waitForSelector('[data-testid="assignment-apply"]'); await shot('12-review', incoming);
  const autoContext = await browser.createBrowserContext(), auto = await autoContext.newPage(); await auto.setViewport({ width:390, height:844, deviceScaleFactor:2 }); await setup(auto,true); await auto.goto(site,{waitUntil:'networkidle2'}); await textClick('課表',auto); await click('[data-testid="open-auto-planner"]',auto); await auto.waitForSelector('[data-testid="planning-range"]'); await shot('13-auto-dates',auto);
  await click('[data-testid="planning-range-continue"]',auto); await auto.waitForSelector('[data-testid="planner-form"]'); await shot('14-auto-goals',auto); await click('[data-testid="setup-next"]',auto); await shot('15-auto-body',auto); await click('[data-testid="setup-next"]',auto); await shot('16-auto-choices',auto); await click('[data-testid="plan-preview-create"]',auto); await auto.waitForSelector('[data-testid="period-plan-apply"]'); await shot('17-auto-preview',auto);
  await writeFile(`${output}/checks.json`, JSON.stringify({ source: 'real app, isolated device fixtures generated by real engine', viewport: { width: 390, height: 844, deviceScaleFactor: 2 }, runtimeErrors: errors, screens: 17 }, null, 2));
  if (errors.length) throw new Error(errors.join('\n'));
  const references = resolve(process.env.PLANNER_REFERENCE_DIR || 'design/planner-v2');
  const hasReferences = await access(`${references}/png/01-week-first-fold.png`).then(() => true, () => false);
  const pairs = [['01-home', 'png/01-week-first-fold.png'], ['04-manual', 'png/04-manual.png'], ['05-picker', 'add-exercises/png/03-training-open.png'], ['07-library', 'saved-plans/png/03-my-library.png'], ['08-library-detail', 'saved-plans/png/04-template-detail.png'], ['11-dates', 'png/13-import-dates-first-fold.png']];
  for (const [name, reference] of hasReferences ? pairs : []) {
    await copyFile(`${references}/${reference}`, `${output}/reference-${name}.png`);
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e8edf3;font:14px sans-serif;color:#172b43}h1{font-size:18px;margin:14px 20px}.columns{display:flex;gap:16px;padding:0 16px 16px}.columns section{width:390px;flex:none}h2{font-size:14px;margin:8px 0}.frame{width:390px;height:844px;overflow:hidden;background:#f5f8fc;border:1px solid #cbd9e6}img{width:390px;height:auto;display:block}p{font-size:12px;margin:0 20px 12px}</style><h1>核准原稿與實際 App：${name}</h1><p>同為 390 CSS px。正式版移除原型提示，時間與內容取實際資料。</p><div class="columns"><section><h2>核准原稿</h2><div class="frame"><img src="reference-${name}.png"></div></section><section><h2>實際 App</h2><div class="frame"><img src="${name}.png"></div></section></div>`;
    await writeFile(`${output}/compare-${name}.html`, html); const comparison = await browser.newPage(); await comparison.setViewport({ width: 828, height: 950, deviceScaleFactor: 1 }); await comparison.goto(`file://${output}/compare-${name}.html`); await comparison.screenshot({ path: `${output}/compare-${name}.png`, fullPage: true }); await comparison.close();
  }
  console.log(`17 real-app states and ${hasReferences ? pairs.length : 0} side-by-side comparisons saved to ${output}`);
} catch (error) {
  if (diagnosticPage && !diagnosticPage.isClosed()) { await diagnosticPage.screenshot({ path: `${output}/capture-failure.png`, fullPage: true }); await writeFile(`${output}/capture-failure.txt`, await diagnosticPage.evaluate(() => document.body.innerText)); }
  throw error;
} finally { await browser?.close(); server.kill(); }
