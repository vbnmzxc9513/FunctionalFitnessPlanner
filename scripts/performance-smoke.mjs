import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { generateTemplatePlan } from '../src/domain/templatePlanner.js';
import { generatePeriodPlan } from '../src/domain/periodPlanning.js';
import { catalogExercises } from '../src/domain/exerciseCatalog.js';

const today = '2026-11-09', week = '2026-W46';
const profile = { time: '40', focus: 'balanced', context: { healthStatus: 'unrestricted', equipment: ['dumbbell', 'cable'], trainingDays: [1, 3, 5] } };
const exercises = catalogExercises();
const weekly = { week, profile, completed: {}, plan: { ...generateTemplatePlan(exercises, profile.context, 40, 'zh', { currentDate: today, currentWeek: week }), source: 'template', language: 'zh' } };
const plan = generatePeriodPlan(exercises, profile, { from: today, to: '2026-11-15' }, { today });
const native = { ...plan, version: 1, profile, periodId: 'performance-fixture', sessionsByDate: Object.fromEntries(plan.sessions.map(day => [day.date, { ...day, revision: 1 }])), progressByWeek: {}, logs: [], readiness: [] };
const site = process.env.PERFORMANCE_SITE || 'http://127.0.0.1:5196/FunctionalFitnessPlanner/';
const server = process.env.PERFORMANCE_SITE ? null : spawn(process.execPath, ['scripts/smoke-server.mjs', '5196'], { env: process.env, stdio: 'ignore' });
let browser;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  if (server) for (let i = 0; i < 80; i++) { try { if ((await fetch(site)).ok) break; } catch { /* Starting. */ } await delay(150); }
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 15000, args: ['--no-sandbox'] });
  for (const mode of ['legacy-weekly', 'native-dates']) {
    const context = await browser.createBrowserContext(), page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 390, height: 844 });
    const cdp = await page.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluateOnNewDocument(({ today, weekly, native, mode }) => {
      localStorage.setItem('app_lang', 'zh');
      if (mode === 'legacy-weekly') sessionStorage.setItem('fitness_public_preview_v1', JSON.stringify({ publicDraft: weekly }));
      else localStorage.setItem('fitness_date_period_v1', JSON.stringify(native));
      const NativeDate = Date, now = new NativeDate(`${today}T12:00:00`).getTime();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
      window.__perfCommits = 0; window.__perfWrites = 0;
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject(renderer) { this.renderers.set(1, renderer); return 1; }, onCommitFiberRoot() { window.__perfCommits++; }, onCommitFiberUnmount() {} };
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (...args) { window.__perfWrites++; return set.apply(this, args); };
    }, { today, weekly, native, mode });
    await page.setRequestInterception(true);
    page.on('request', request => new URL(request.url()).origin === new URL(site).origin || /^(data|blob):/.test(request.url()) ? request.continue() : request.abort());
    const clickText = async text => {
      await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button => button.innerText.trim() === text), {}, text);
      await page.evaluate(text => [...document.querySelectorAll('button')].find(button => button.innerText.trim() === text).click(), text);
    };
    await page.goto(site, { waitUntil: 'domcontentloaded' });
    await clickText('課表'); await page.waitForSelector('[aria-label="查看下一週"]');
    await page.click('[aria-label="查看下一週"]');
    await page.waitForSelector('[data-testid="period-plan-preview"]');
    // This path previously entered an unbounded overview -> parent -> reload loop.
    await delay(1000);
    const before = await page.evaluate(() => ({ commits: window.__perfCommits, writes: window.__perfWrites }));
    await delay(1500);
    const after = await page.evaluate(() => ({ commits: window.__perfCommits, writes: window.__perfWrites }));
    assert.equal(after.commits - before.commits, 0, `${mode}: idle overview must settle`);
    assert.equal(after.writes - before.writes, 0, `${mode}: idle overview must not rewrite the questionnaire`);
    const started = await page.evaluate(() => performance.now());
    await clickText('動作庫'); await page.waitForSelector('.exercise-library input');
    const navigationMs = await page.evaluate(start => performance.now() - start, started);
    const input = await page.$('.exercise-library input'); await input.type('單臂下拉');
    await page.waitForSelector('[data-testid="library-exercise-bf_C14"]');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ mode, cpuSlowdown: 4, idleCommits: after.commits - before.commits, idleWrites: after.writes - before.writes, libraryNavigationMs: Math.round(navigationMs), searchable: true }));
    await context.close();
  }
} finally { await browser?.close(); server?.kill(); }
