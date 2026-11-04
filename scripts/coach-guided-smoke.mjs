import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer';

const out = process.env.COACH_CAPTURE_DIR || '/tmp/fitness-coach-guided';
await mkdir(out, { recursive: true });
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', '5194'], { env: process.env, stdio: 'ignore' });
const site = 'http://127.0.0.1:5194/FunctionalFitnessPlanner/';
let browser;
const reports = [];
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(site)).ok) break; } catch { /* Starting. */ } await new Promise(resolve => setTimeout(resolve, 150)); }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [width, lang] of [[390, 'zh'], [320, 'zh'], [390, 'en'], [1280, 'en']]) {
    const browserContext = await browser.createBrowserContext(); const page = await browserContext.newPage(); const errors = [];
    await page.setViewport({ width, height: 844 }); await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(lang => {
      localStorage.setItem('app_lang', lang);
      const NativeDate = Date, now = new NativeDate('2026-11-09T12:00:00').getTime();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    }, lang);
    page.on('pageerror', e => errors.push(e.message)); await page.setRequestInterception(true);
    page.on('request', request => ['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname) || /^(data|blob):/.test(request.url()) ? request.continue() : request.abort());
    const click = async selector => { const el = await page.waitForSelector(selector, { visible: true }); await el.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' })); await el.click(); await el.dispose(); };
    const shot = async name => { await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); }); await page.screenshot({ path: `${out}/${width}-${lang}-${name}.png`, fullPage: true }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}: no horizontal overflow`); };
    const generate = async () => { await click('[data-testid="plan-preview-create"]'); await page.waitForSelector('[data-testid="coach-plan-brief"]', { visible: true }); assert.equal(await page.evaluate(() => localStorage.getItem('fitness_date_period_v1')), null, 'preview and adjustments do not apply dates'); };
    await page.goto(site, { waitUntil: 'networkidle2' }); await click('[data-testid="planning-range-continue"]');
    await click('[data-testid="coach-time-40"]');
    await click('[data-testid="quiz-schedule"] > summary');
    for (const day of [2, 4, 5]) await click(`[data-testid="quiz-schedule"] fieldset:first-of-type label:nth-of-type(${day})`);
    await click('[data-testid="quiz-equipment"] > summary'); await click('[data-testid="quiz-equipment"] label:first-child');
    await click('[data-testid="quiz-schedule"] > summary');
    await click('[data-testid="coach-targets"] > summary'); await click('[data-testid="target-details"] > summary'); await click('[data-target-region="serratus"]'); await click('[data-testid="coach-targets"] > summary');
    await shot('rhythm'); await click('[data-testid="setup-next"]'); await page.select('[data-testid="recovery-state"]', 'normal'); await shot('condition');
    await click('[data-testid="setup-next"]');
    assert.equal(await page.$eval('[data-testid="coach-exercise-options"]', el => el.open), false, 'choosing movements is optional');
    assert.ok(await page.$eval('[data-testid="review-planning-conditions"]', el => el.innerText.includes('40')));
    assert.equal(await page.$$eval('.coach-questionnaire .setup-actions button', buttons => buttons.some(button => [...button.childNodes].some(node => { if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return false; const range = document.createRange(); range.selectNodeContents(node); return range.getClientRects().length > 1; }))), false, 'action labels stay on one line');
    await shot('direction'); await generate();
    const strength40 = Number(await page.$eval('[data-testid="coach-count-strength"]', el => el.innerText)); assert.ok(strength40 > 0);
    await shot('preview');
    await click('[data-testid="coach-adjust-rhythm"]'); await page.waitForSelector('[data-testid="coach-time-20"]', { visible: true });
    assert.equal(await page.$eval('[data-testid="quiz-equipment"] label:first-child input', el => el.checked), true, 'equipment retained while adjusting');
    assert.equal(await page.$eval('[data-target-region="serratus"]', el => el.checked), true, 'target retained while adjusting');
    await click('[data-testid="coach-time-20"]'); await click('[data-testid="setup-next"]'); await click('[data-testid="setup-next"]'); await generate();
    const lengths = await page.$$eval('.period-agenda-minutes', els => els.map(el => Number(el.innerText.match(/\d+/)?.[0] || 0)));
    assert.ok(lengths.every(minutes => minutes <= 20));
    await click('[data-testid="coach-adjust-body"]'); await page.select('[data-testid="recovery-state"]', 'recover');
    assert.ok(await page.$eval('[data-testid="planner-form"] fieldset:not([hidden]) [data-testid="coach-guidance"]', el => el.innerText.length > 0));
    await click('[data-testid="setup-next"]'); await generate();
    assert.equal(await page.$eval('[data-testid="coach-count-strength"]', el => el.innerText), '0', 'recovery changes actual plan');
    await click('[data-testid="period-plan-apply"]'); await page.waitForFunction(() => !!localStorage.getItem('fitness_date_period_v1'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fitness_date_period_v1')));
    assert.equal(saved.profile.time, '20'); assert.equal(saved.profile.context.recoveryState, 'recover');
    assert.deepEqual(saved.profile.context.equipment, ['dumbbell']); assert.deepEqual(saved.profile.context.targetRegions, ['serratus']);
    assert.ok(Object.values(saved.sessionsByDate).every(day => !day.prescriptions.some(dose => dose.phase === 'strength')));
    assert.deepEqual(saved.logs, []); assert.deepEqual(saved.progressByWeek, {});
    assert.deepEqual(errors, []); reports.push({ width, lang, strength40, adjustedMinutes: lengths, result: 'passed' });
    await browserContext.close();
  }
  await writeFile(`${out}/report.json`, JSON.stringify(reports, null, 2)); console.log(JSON.stringify(reports));
} finally { await browser?.close(); server.kill(); }
