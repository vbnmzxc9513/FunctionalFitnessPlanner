import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { catalogExercises } from '../src/domain/exerciseCatalog.js';
import { generatePeriodPlan } from '../src/domain/periodPlanning.js';

const today = '2026-10-19';
const range = { from: today, to: '2026-10-23' };
const site = 'http://127.0.0.1:5179/FunctionalFitnessPlanner/';
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', '5179'], { env: process.env, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; n < 100; n++) { try { if ((await fetch(site)).ok) break; } catch { /* Starting. */ } await new Promise(resolve => setTimeout(resolve, 200)); }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, lang, width] of [['desktop', 'en', 1280], ['mobile', 'zh', 390]]) for (const intensity of ['hard', 'mixed']) {
    const context = await browser.createBrowserContext(); const page = await context.newPage(); const errors = []; let external = 0;
    const profile = { time: '35', focus: 'balanced', context: { healthStatus: 'unrestricted', equipment: ['dumbbell'], badmintonDays: [2, 3, 5], badmintonMinutes: 120, badmintonIntensity: intensity, competitionDate: '2026-11-16', recoveryNotes: '有點累', weeklyExerciseIds: ['bf_B01', 'bf_B11', 'bf_B10'] } };
    const plan = generatePeriodPlan(catalogExercises(lang), profile, range, { today }, lang);
    const draft = { ...plan, version: 1, profile, periodId: 'recovery-regression', sessionsByDate: Object.fromEntries(plan.sessions.map(day => [day.date, { ...day, revision: 1 }])), progressByWeek: {}, logs: [], readiness: [] };
    await page.setViewport({ width, height: 900 }); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(({ draft, today, lang }) => {
      localStorage.setItem('fitness_date_period_v1', JSON.stringify(draft)); localStorage.setItem('app_lang', lang);
      const NativeDate = Date; const now = new NativeDate(`${today}T12:00:00`).getTime();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    }, { draft, today, lang });
    page.on('pageerror', error => errors.push(error.message)); await page.setRequestInterception(true);
    page.on('request', request => { const url = new URL(request.url()); if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue(); else { external++; request.abort(); } });
    await page.goto(site, { waitUntil: 'networkidle2' });
    const nav = await page.evaluateHandle(label => [...document.querySelectorAll('nav button')].find(item => item.innerText.trim() === label), lang === 'en' ? 'Plan' : '課表'); await nav.asElement().click(); await nav.dispose();
    await page.waitForSelector('[data-testid="period-plan-preview"]');
    const conditions = await page.waitForSelector('[data-testid="period-plan-conditions"] > summary');
    await conditions.evaluate(item => item.scrollIntoView({ block: 'center', behavior: 'instant' })); await conditions.click(); await conditions.dispose();
    assert.ok(await page.$eval('[data-testid="period-equipment-summary"]', item => /Dumbbell|啞鈴/.test(item.innerText)));
    assert.equal(!!await page.$('[data-testid="period-recovery-explanation"]'), intensity === 'hard');
    assert.equal(await page.$$eval('[data-choice-status="equipment"]', rows => rows.length), 0);
    if (intensity === 'hard') assert.ok(await page.$$eval('[data-choice-status="no_strength"]', rows => rows.length > 0));
    await page.$eval('[data-testid="period-mobility-overview"] summary', item => item.click());
    assert.equal(await page.$$eval('[data-testid="period-mobility-overview"] dd', rows => rows.length), 8);
    assert.ok(await page.$$eval('[data-testid="period-mobility-overview"] dd', rows => rows.every(row => row.innerText.includes('10/'))));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')));
    assert.deepEqual(saved.logs, []); assert.deepEqual(saved.progressByWeek, {});
    assert.deepEqual(errors, []); assert.equal(external, 0);
    await page.screenshot({ path: `/tmp/fitness-recovery-${layout}-${intensity}.png`, fullPage: true });
    console.log(`${layout}/${intensity}: equipment, explicit recovery reason, regional rotation and unchanged actuals passed`);
    await context.close();
  }
} finally { if (browser) await browser.close(); server.kill('SIGTERM'); }
