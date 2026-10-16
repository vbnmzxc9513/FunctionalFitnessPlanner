import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { EXERCISES_I18N, TRANSLATIONS } from '../src/locale.js';

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
const siteUrl = 'http://127.0.0.1:5174/FunctionalFitnessPlanner/';
let serverExit = null;
let serverOutput = '';
server.once('exit', code => { serverExit = code ?? 1; });
server.stdout.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-4000); });
server.stderr.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-4000); });
let browser;
try {
  // Terminal formatting and stdout chunk boundaries vary in CI. Check the real
  // endpoint instead of interpreting the development server's banner.
  const deadline = Date.now() + 20000;
  let ready = false;
  while (Date.now() < deadline) {
    if (serverExit !== null) throw new Error(`Vite exited: ${serverExit}\n${serverOutput}`);
    try {
      const response = await fetch(siteUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { ready = true; break; }
    } catch { /* The listener may not have started yet. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error(`Vite startup timed out\n${serverOutput}`);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [layout, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width, height });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('app_lang', 'zh');
      window.__smokeVisible = element => {
        if (!element || !element.getClientRects().length || element.closest('[hidden]') || getComputedStyle(element).visibility === 'hidden') return false;
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) return false;
        }
        return true;
      };
    });
    const errors = [];
    let planningPayload;
    let geminiRequests = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(`[${layout}] ${message.text()}`); });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname === 'generativelanguage.googleapis.com') {
        geminiRequests += 1;
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
        if (request.method() === 'OPTIONS') request.respond({ status: 204, headers });
        else if (url.pathname.endsWith(':generateContent')) {
          planningPayload = JSON.parse(request.postData());
          const plan = { conclusion: 'Mock recovery plan', schedule: [1, 2, 3, 4, 5].map(day => ({ day, name: 'Day', theme: 'Recovery', concept: 'Keep control', coachAdvice: 'Check next-day response', sessionType: day === 1 ? 'training' : 'rest', warmupNote: day === 1 ? 'Walk, then prepare the split squat.' : 'Rest today.', cooldownNote: day === 1 ? 'Finish with gentle breathing.' : 'No extra cool-down needed.', routine: day === 1 ? ['bf_A01', 'bf_B01', 'bf_D09'] : [], prescriptions: day === 1 ? [
            { id: 'bf_A01', sets: 1, value: '2', unit: 'minutes', restSeconds: 0, perSide: false, phase: 'warmup' },
            { id: 'bf_B01', sets: 1, value: '6', unit: 'reps', restSeconds: 90, perSide: true, phase: 'strength', preparation: { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: true, instruction: 'Use bodyweight first.' } },
            { id: 'bf_D09', sets: 1, value: '4', unit: 'breaths', restSeconds: 0, perSide: false, phase: 'cooldown' },
          ] : [] })) };
          request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }) });
        } else request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] }] }) });
      } else if (['127.0.0.1', 'localhost'].includes(url.hostname) || ['data:', 'blob:'].includes(url.protocol)) request.continue();
      else request.abort(); // Integration tests must never contact production services.
    });
    const visibleElement = async (selector, text = null, prefix = false) => {
      await page.waitForFunction((css, label, starts) => [...document.querySelectorAll(css)].some(element => window.__smokeVisible(element)
        && (label === null || (starts ? element.innerText.trim().startsWith(label) : element.innerText.trim().replace(/\s+/g, ' ') === label.replace(/\s+/g, ' ')))), {}, selector, text, prefix);
      const handle = await page.evaluateHandle((css, label, starts) => [...document.querySelectorAll(css)].find(element => window.__smokeVisible(element)
        && (label === null || (starts ? element.innerText.trim().startsWith(label) : element.innerText.trim().replace(/\s+/g, ' ') === label.replace(/\s+/g, ' ')))), selector, text, prefix);
      return handle.asElement();
    };
    const clickElement = async handle => { await page.waitForFunction(element => !element.disabled, {}, handle); await handle.evaluate(element => element.scrollIntoView({ block: 'center' })); await handle.click(); await handle.dispose(); };
    const clickSelector = async selector => {
      const handle = await visibleElement(selector);
      await page.waitForFunction(element => !element.disabled, {}, handle);
      await clickElement(handle);
    };
    const click = async text => {
      const handle = await visibleElement('button', text);
      await page.waitForFunction(element => !element.disabled, {}, handle);
      await clickElement(handle);
    };
    const waitText = text => page.waitForFunction(label => document.body.innerText.includes(label), {}, text);
    const visibleCount = selector => page.$$eval(selector, elements => elements.filter(window.__smokeVisible).length);
    const read = async (selector, reader, ...args) => {
      const handle = await visibleElement(selector); const result = await handle.evaluate(reader, ...args); await handle.dispose(); return result;
    };
    const fill = async (selector, value) => {
      const handle = await visibleElement(selector); await handle.evaluate(element => element.scrollIntoView({ block: 'center' })); await handle.click({ clickCount: 3 });
      await page.keyboard.press('Backspace'); if (value) await handle.type(String(value)); await handle.dispose();
    };
    const select = async (selector, value) => { const handle = await visibleElement(selector); await handle.select(value); await handle.dispose(); };
    const openDetails = async text => {
      const handle = await visibleElement('summary', text, true);
      if (!await handle.evaluate(summary => summary.parentElement.open)) await clickElement(handle); else await handle.dispose();
    };
    const openDetailsSelector = async selector => {
      const handle = await visibleElement(`${selector} > summary`);
      if (!await handle.evaluate(summary => summary.parentElement.open)) await clickElement(handle); else await handle.dispose();
    };
    const weekPlan = async () => { await click('課表'); await click('本週課表'); await visibleElement('[data-testid="week-overview"]'); };
    const selectMonday = async () => { await clickElement(await visibleElement('main button', TRANSLATIONS.zh.dayShort[0], true)); };
    const monday = async () => { await weekPlan(); await selectMonday(); };
    const completion = name => `button[aria-label=${JSON.stringify(name)}][aria-pressed]`;
    const waitCompletion = (name, done) => page.waitForFunction((selector, value) => [...document.querySelectorAll(selector)].some(element => window.__smokeVisible(element) && element.getAttribute('aria-pressed') === String(value)), {}, completion(name), done);
    const addFromPicker = async (id, phase, name) => {
      await select('[data-testid="picker-phase"]', phase);
      await select('[data-testid="picker-scope"]', 'all');
      await fill('[data-testid="picker-search"]', name);
      await clickSelector(`[data-testid="picker-option-${id}"]`); await clickSelector('[data-testid="picker-add"]');
    };
    const library = async () => { await click('課表'); await click('動作庫'); await visibleElement('.exercise-library'); };
    const labeledSelect = async (label, value) => {
      const labelHandle = await visibleElement('label', label, true); const input = await labelHandle.$('select');
      assert.ok(input, `${label} has a select`); assert.ok(await input.evaluate(element => window.__smokeVisible(element)));
      await input.select(value); await input.dispose(); await labelHandle.dispose();
    };
    await page.goto(siteUrl, { waitUntil: 'networkidle2' });
    await visibleElement('[data-testid="first-plan"]');
    assert.equal(await visibleCount('section[data-phase]'), 0, `${layout} begins with onboarding, without an invented default plan`);
    await labeledSelect('本週優先改善', 'coordination');
    for (const label of ['上肢推拉／肩背', '核心控制']) {
      const item = await visibleElement('[data-testid="weekly-preferences"] label', label);
      const box = await item.$('input'); await clickElement(box); await item.dispose();
    }
    const thirdTarget = await visibleElement('[data-testid="weekly-preferences"] label', '腿部／蹲與弓步');
    assert.equal(await thirdTarget.$eval('input', input => input.disabled), true, `${layout} caps priority areas at two`); await thirdTarget.dispose();
    await click('下一步'); await click('上一步');
    assert.equal(await read('[data-testid="planner-form"] select', element => element.value), 'coordination', `${layout} setup back preserves choices`);
    await click('下一步');
    await clickElement(await visibleElement('[data-regions="stiffnessRegions"] label', '肩／胸前'));
    await click('下一步');
    await click('預覽本週課表'); await visibleElement('[data-testid="weekly-plan-preview"]');
    assert.equal(await page.evaluate(() => !!JSON.parse(sessionStorage.getItem('fitness_public_preview_v1') || '{}').publicDraft), false, `${layout} preview does not create a usable plan before confirmation`);
    await click('確認套用本週'); await waitText('本分頁暫存');
    assert.equal(planningPayload, undefined, `${layout} creates a free plan without Gemini`);
    assert.equal(geminiRequests, 0, `${layout} free onboarding makes no Gemini requests`);
    await weekPlan();
    await visibleElement('[data-testid="week-overview"]');
    assert.equal(await visibleCount('section[data-phase]'), 0, `${layout} overview does not stack daily routines`);
    assert.equal(await visibleCount('[data-testid^="week-role-"]'), 7, `${layout} shows all seven daily roles`);
    await waitText('排課時設定的方向：協調與步伐');
    assert.equal(await visibleCount('[data-testid="weekly-intent-pending"]'), 0);
    const savedIntent = await page.evaluate(() => JSON.parse(sessionStorage.getItem('fitness_public_preview_v1')).publicDraft.plan.weeklyIntent);
    assert.deepEqual(savedIntent.targetRegions, ['upper', 'core']);
    assert.deepEqual(savedIntent.stiffnessRegions, ['shoulder']);
    await click('調整本週目標');
    assert.equal(await visibleCount('[data-testid="week-overview"]'), 0, `${layout} planning inputs have their own screen`);
    await labeledSelect('本週優先改善', 'strength');
    await click('回到本週總覽');
    await visibleElement('[data-testid="weekly-intent-pending"]');
    await click('調整本週目標');
    await labeledSelect('本週優先改善', 'coordination');
    await click('回到本週總覽');
    await page.$eval('[data-testid="week-overview"]', element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `/tmp/fitness-week-${layout}.png`, fullPage: false });
    await openDetails('本週安排覆蓋');
    assert.equal(await visibleCount('[data-testid="weekly-balance"] table'), 2, `${layout} separates mobility coverage from training patterns`);
    await waitText('不是實際完成或訓練成效');
    await selectMonday();
    assert.equal(await visibleCount('[data-testid="week-overview"]'), 0, `${layout} daily detail is a focused view`);
    const previewName = await read('section[data-phase] button[aria-label][aria-pressed]', button => button.getAttribute('aria-label'));
    await clickSelector(completion(previewName)); await waitCompletion(previewName, true);
    await page.reload({ waitUntil: 'networkidle2' }); await waitText('本分頁暫存'); await monday(); await waitCompletion(previewName, true);
    await page.evaluate(() => {
      window.__workoutLink = null;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__workoutLink = text; } } });
    });
    await openDetails('分享與本週回饋'); await click('複製連結'); await waitText('課表連結已複製。');
    const publicLink = await page.evaluate(() => window.__workoutLink); assert.ok(publicLink.includes('#workout='));
    await page.goto(publicLink, { waitUntil: 'networkidle2' }); await waitText('分享的羽球體能課表');
    assert.equal(await visibleCount('button[aria-pressed]'), 0, `${layout} share is read-only`); await waitText('準備組');
    await click('建立我的課表'); await waitText('本分頁暫存'); await monday();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${layout} free preview fits viewport`);
    await openDetails('本分頁暫存 · 儲存到帳號'); await click('免註冊，儲存至匿名帳號');
    await page.waitForFunction(() => {
      const cache = JSON.parse(sessionStorage.getItem('fitness_public_preview_v1') || '{}');
      return !cache.publicDraft && !cache.pendingDraft && !document.body.innerText.includes('正在儲存預覽課表');
    });
    await monday(); await waitCompletion(previewName, true);
    await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('planning_preferences_')) localStorage.removeItem(key); });
    await page.reload({ waitUntil: 'networkidle2' }); await monday();
    assert.equal(await visibleCount('[data-testid="weekly-intent-pending"]'), 0, `${layout} restores saved intent without local preferences`);
    await weekPlan(); await waitText('排課時設定的方向：協調與步伐');
    await selectMonday();
    await click('設定'); await waitText('綁定 Google 並保留紀錄'); await monday();
    const name = await read('section[data-phase] button[aria-label][aria-pressed]', button => button.getAttribute('aria-label'));
    await waitCompletion(name, true); await click('編輯課表');
    await click('課表');
    assert.equal(await visibleCount('[data-testid="week-overview"]'), 0, `${layout} current navigation preserves the active manual edit screen`);
    assert.equal(await visibleCount('[data-testid="exercise-picker"]'), 1, `${layout} unsaved edits stay visible until saved or cancelled`);
    await clickSelector(`button[aria-label=${JSON.stringify(`移除動作 ${name}`)}]`);
    const removedId = Object.entries(EXERCISES_I18N.zh).find(([, exercise]) => exercise.name === name)?.[0];
    assert.ok(removedId, `${layout} removed exercise has a catalog identity`);
    assert.equal(await visibleCount('[data-testid="exercise-picker"]'), 1, `${layout} replaces the long select with a phase picker`);
    await select('[data-testid="picker-phase"]', 'strength');
    await fill('[data-testid="picker-search"]', EXERCISES_I18N.zh.bf_C11.name);
    assert.equal(await visibleCount('[data-testid="picker-option-bf_C11"]'), 0, `${layout} manual picker excludes dumbbell exercises without dumbbells`);
    await addFromPicker(removedId, 'warmup', name);
    await clickSelector(`button[aria-label=${JSON.stringify(`移除動作 ${name}`)}]`);
    const changedPhaseLabel = await read('select[aria-label^="訓練階段 "]', element => element.getAttribute('aria-label'));
    const changedPhaseName = changedPhaseLabel.slice('訓練階段 '.length);
    await select(`select[aria-label=${JSON.stringify(changedPhaseLabel)}]`, 'cooldown');
    await click('儲存修改'); await waitText('課表已儲存');
    await page.waitForFunction(selector => ![...document.querySelectorAll(selector)].some(window.__smokeVisible), {}, completion(name));
    await page.reload({ waitUntil: 'networkidle2' }); await monday(); await visibleElement('section[data-phase="cooldown"]');
    assert.ok(await read('section[data-phase="cooldown"]', (section, label) => section.innerText.includes(label), changedPhaseName), `${layout} preserves a manually chosen phase`);
    await click('↩ 復原上一次的課表'); await waitCompletion(name, true);
    await openDetails('分享與本週回饋'); await click('太簡單\n需增量');
    const feedbackSelected = label => page.waitForFunction(text => [...document.querySelectorAll('button')].some(element => window.__smokeVisible(element) && element.innerText.trim().replace(/\s+/g, ' ') === text && element.getAttribute('aria-pressed') === 'true'), {}, label);
    await feedbackSelected('太簡單 需增量'); await click('太簡單\n需增量'); await feedbackSelected('太簡單 需增量');
    await click('剛好\n維持架構'); await feedbackSelected('剛好 維持架構');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(element => window.__smokeVisible(element) && element.innerText.trim().replace(/\s+/g, ' ') === '太簡單 需增量')?.getAttribute('aria-pressed')), 'false');

    await library(); await click('暖身');
    await fill('input[aria-label="搜尋動作或編號"]', '90/90'); await openDetails('更多篩選');
    await select('select[aria-label="依訓練分類篩選"]', 'core');
    assert.equal(await visibleCount('article[data-testid^="library-exercise-"]'), 1, `${layout} combines purpose, category and search`);
    const breathingArticle = '[data-testid="library-exercise-bf_D09"]';
    await visibleElement(breathingArticle); assert.equal(await visibleCount('button[role="switch"]'), 0, `${layout} management starts collapsed`);
    await clickSelector('[data-testid="favorite-bf_D09"]');
    await page.waitForFunction(css => document.querySelector(css)?.innerText.includes('常用用途：暖身'), {}, breathingArticle);
    await openDetails('整理常用用途');
    const groupLabel = await visibleElement(`${breathingArticle} label`, '收操'); const checkbox = await groupLabel.$('input');
    await clickElement(checkbox); await groupLabel.dispose();
    await page.waitForFunction(css => document.querySelector(css)?.innerText.includes('暖身 · 收操'), {}, breathingArticle);
    await click('我的常用'); await click('收操'); await visibleElement(breathingArticle);
    await click('管理動作');
    const breathingName = EXERCISES_I18N.zh.bf_D09.name;
    const activeSwitch = `button[role="switch"][aria-label=${JSON.stringify(breathingName)}]`;
    assert.equal(await read(activeSwitch, element => element.getAttribute('aria-checked')), 'true', `${layout} favorites do not disable planning eligibility`);
    await clickSelector(activeSwitch); await page.waitForFunction(css => document.querySelector(css)?.getAttribute('aria-checked') === 'false', {}, activeSwitch);
    await visibleElement(breathingArticle); assert.ok(await read(breathingArticle, element => element.innerText.includes('暖身 · 收操')), `${layout} disabling preserves favorite groups`);
    await clickSelector(activeSwitch); await page.waitForFunction(css => document.querySelector(css)?.getAttribute('aria-checked') === 'true', {}, activeSwitch);
    await click('完成管理');
    await page.reload({ waitUntil: 'networkidle2' }); await library(); await click('我的常用'); await click('暖身'); await visibleElement(breathingArticle);
    await click('收操'); await visibleElement(breathingArticle);

    await click('設定'); await openDetails('進階：AI 教練自備金鑰');
    await fill('input[type="password"]', 'mock-test-only'); await click(TRANSLATIONS.zh.settingsSaveBtn);
    await weekPlan(); await click('調整本週目標');
    await openDetailsSelector('[data-testid="planner-optional"]'); await labeledSelect('球局強度', 'mixed');
    await openDetailsSelector('[data-testid="quiz-schedule"]');
    for (const day of [2, 5, 6]) {
      await clickSelector(`[data-testid="quiz-schedule"] label:has(input[aria-label=${JSON.stringify(TRANSLATIONS.zh.allDayNames[day - 1])}])`);
    }
    await click('下一步'); await labeledSelect('肩部狀態與活動限制', 'restricted'); await click('下一步');
    await openDetailsSelector('[data-testid="planner-advanced"]');
    assert.ok(await read('button', () => [...document.querySelectorAll('button')].find(button => window.__smokeVisible(button) && button.innerText === 'App AI 體驗').disabled));
    await click('AI 自備金鑰');
    await click('產生 AI 預覽'); await visibleElement('[data-testid="weekly-plan-preview"]'); await click('確認套用本週'); await waitText(TRANSLATIONS.zh.toastAISuccess);
    assert.ok(planningPayload.contents[0].parts[0].text.includes('肩部／健康限制'));
    const candidateSection = planningPayload.contents[0].parts[0].text.split('【可用候選動作；ID 必須完全相同】')[1].split('【輸出要求】')[0].trim();
    assert.ok(!JSON.parse(candidateSection).some(item => item.shoulderLoaded));
    await monday(); await waitCompletion('分腿蹲', false);
    await weekPlan(); await click('調整本週目標');
    await openDetails(TRANSLATIONS.zh.aiConclusionTitle); await waitText('Mock recovery plan');
    await page.reload({ waitUntil: 'networkidle2' }); await monday(); await waitText('每側');
    assert.ok(await read('section[data-phase="strength"] .dose-grid', element => element.getAttribute('aria-label').includes('1 組 × 6 下')));
    assert.ok(await read('section[data-phase="warmup"]', element => element.innerText.includes('主項準備組') && element.innerText.includes('1 組 × 4 下')));
    assert.equal(await visibleCount(completion('分腿蹲')), 1); await waitText('Finish with gentle breathing.');
    await click('編輯課表');
    await select('[data-testid="picker-phase"]', 'accessory');
    assert.equal(await visibleCount('[data-testid^="picker-option-"]'), 0, `${layout} unclear clinical restrictions cannot add training manually`);
    await click('取消');
    await weekPlan(); await click('調整本週目標');
    await click('下一步');
    await labeledSelect('肩部狀態與活動限制', 'unrestricted');
    await click('回到本週總覽'); await selectMonday();
    await click('編輯課表'); const breathing = EXERCISES_I18N.zh.bf_D09.name; const core = EXERCISES_I18N.zh.dead_bug.name;
    await select(`select[aria-label=${JSON.stringify(`訓練階段 ${breathing}`)}]`, 'accessory');
    await select('[data-testid="picker-phase"]', 'accessory'); await select('[data-testid="picker-scope"]', 'mine');
    assert.equal(await visibleCount('[data-testid^="picker-option-"]'), 0, `${layout} favorite picker excludes an exercise already in the day`);
    await addFromPicker('dead_bug', 'accessory', core); await clickSelector(`button[aria-label=${JSON.stringify(`往後移 ${breathing}`)}]`);
    await click('儲存修改'); await waitText('課表已儲存'); await page.reload({ waitUntil: 'networkidle2' }); await monday();
    const accessoryOrder = await page.$$eval('section[data-phase="accessory"] button[aria-pressed]', buttons => buttons.filter(window.__smokeVisible).map(button => button.getAttribute('aria-label')));
    assert.deepEqual(accessoryOrder, [core, breathing], `${layout} persists phase and within-phase order`);
    assert.ok(await read('section[data-phase="warmup"]', element => element.innerText.includes('1 組 × 4 下')));
    await click('↩ 復原上一次的課表'); await waitText('Finish with gentle breathing.'); assert.equal(await visibleCount('section[data-phase="accessory"]'), 0);

    await click('紀錄'); await click('身體紀錄'); await fill('input[name="weight"]', '70'); await fill('input[name="bodyFat"]', '18');
    await click('儲存紀錄'); await waitText('身體數據已成功儲存'); await fill('input[name="weight"]', '72'); await fill('input[name="bodyFat"]', '');
    await click('儲存紀錄');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(element => window.__smokeVisible(element) && element.innerText.trim() === '儲存紀錄' && !element.disabled));
    const date = await read('input[name="date"]', input => input.value);
    await page.reload({ waitUntil: 'networkidle2' }); await click('紀錄'); await click('身體紀錄');
    const changeDate = async value => { const input = await visibleElement('input[name="date"]'); await input.evaluate((element, next) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, next);
      element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value); await input.dispose(); };
    await changeDate('2026-01-01'); await changeDate(date);
    await page.waitForFunction(() => document.querySelector('input[name="bodyFat"]')?.value === '18');
    assert.equal(await read('input[name="weight"]', input => input.value), '72');
    await weekPlan();
    const oldWeek = (await read('[data-testid="week-overview"] .eyebrow', element => element.textContent)).split(' · ')[0];
    await page.evaluate(() => {
      const NativeDate = Date; const timestamp = Date.now() + 7 * 86400000;
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [timestamp])); } static now() { return timestamp; } };
      window.dispatchEvent(new Event('focus'));
    });
    await page.waitForFunction(week => !document.body.innerText.includes(week), {}, oldWeek);
    await visibleElement('[data-testid="first-plan"]');
    assert.equal(await visibleCount('section[data-phase] button[aria-pressed="true"]'), 0, `${layout} a new week begins without inherited completions or a default plan`);
    await click('設定'); await click('登出'); await visibleElement('[data-testid="first-plan"]'); await click('設定'); await waitText('登入');
    assert.equal(await visibleCount('section[data-phase] button[aria-pressed="true"]'), 0, `${layout} logout clears progress`);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('fitness_public_preview_v1')), null, `${layout} logout clears preview cache`);
    await click('🌐 English'); await click('Today'); await waitText('Build your first badminton fitness plan');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
    assert.deepEqual(errors, [], `${layout} has no runtime errors`);
    console.log(`${layout}: visible onboarding/free preview/reload/share/adoption, editing/picker/restore, feedback, library groups/eligibility, mocked BYOK, records/body metrics, rollover, logout, English passed`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
