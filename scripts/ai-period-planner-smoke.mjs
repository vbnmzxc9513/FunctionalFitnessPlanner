import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const port = Number(process.env.AI_PERIOD_SMOKE_PORT || 5216);
const site = `http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', String(port)], {
  env: { ...process.env, SMOKE_DISABLE_HMR: '1' },
  stdio: 'ignore',
});

function buildMockChunkFromPrompt(prompt) {
  const match = prompt.match(/editableDates 輸出 days 陣列（每天恰一筆，日期必須完全一致，不可包含受保護日期）：\n(\[.*\])/);
  if (!match) throw new Error('Could not parse editableDates from AI period prompt');
  const editableDates = JSON.parse(match[1]);
  const includeReport = prompt.includes('個人化教練總結報告');

  const days = editableDates.map((policy, index) => {
    if (policy.warmupMode === 'none' || policy.suggestedSessionType === 'rest') {
      return {
        date: policy.date,
        name: `休息日 ${policy.day}`,
        theme: '主動休息',
        concept: '保留身體恢復空間',
        coachAdvice: '睡眠與補水優先。',
        sessionType: 'rest',
        warmupNote: '休息日不需暖身。',
        cooldownNote: '休息日以睡眠恢復為主。',
        routine: [],
        prescriptions: [],
      };
    }
    if (policy.isCourtDay || index % 2 === 1) {
      return {
        date: policy.date,
        name: `動態恢復 ${policy.day}`,
        theme: '關節活動與恢復',
        concept: '保持羽球關節活動範圍並舒緩疲勞。',
        coachAdvice: '以輕鬆流暢的節奏完成八段暖身。',
        sessionType: 'recovery',
        warmupNote: '標準八段動態暖身作為恢復核心。',
        cooldownNote: '不需額外收操。',
        routine: [],
        prescriptions: [],
      };
    }
    return {
      date: policy.date,
      name: `羽球肌力 ${policy.day}`,
      theme: '羽球下肢分腿與核心穩定',
      concept: '建立弓步急停與軀幹抗旋轉力量傳遞。',
      coachAdvice: '主項保留 2 次餘力，隔天觀察感受。',
      sessionType: 'training',
      warmupNote: '先完成八段動態暖身，再做下肢準備組。',
      cooldownNote: '完成後配合慢呼吸收尾。',
      routine: ['bf_B01', 'dead_bug'],
      prescriptions: [
        {
          id: 'bf_B01',
          sets: 2,
          value: '8',
          unit: 'reps',
          restSeconds: 60,
          perSide: true,
          phase: 'strength',
          preparation: {
            sets: 1,
            value: '5',
            unit: 'reps',
            restSeconds: 30,
            perSide: true,
            instruction: '徒手小幅度分腿下蹲啟動平衡。',
          },
        },
        {
          id: 'dead_bug',
          sets: 2,
          value: '8',
          unit: 'reps',
          restSeconds: 45,
          perSide: true,
          phase: 'accessory',
        },
      ],
    };
  });

  return {
    days,
    ...(includeReport ? {
      report: {
        reviewAndPraise: '這段時間你開始建立規律的羽球體能基準，這份主動規劃的行動力非常值得肯定！',
        reminders: [
          '每次訓練都已鎖定八段動態暖身，請優先維持流暢度與呼吸節奏。',
          '主訓練保留約 2 次餘力，若有明顯疲勞可隨時切換恢復安排。',
        ],
        planOverview: '本週兼顧下肢分腿煞車、核心抗旋轉與八大關節活動度，建立穩健的羽球移動與發力基礎。',
        checkpoints: '期中檢核動作品質與翌日腿部清爽度，穩定達標後再於下一段微調負荷。',
      },
    } : {}),
  };
}

let browser;
try {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await fetch(site)).ok) break; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 844 });
    const errors = [];
    let aiRequests = 0;
    page.on('pageerror', err => errors.push(err.message));

    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      if (url.startsWith(`http://127.0.0.1:${port}/`)) {
        req.continue();
        return;
      }
      if (url.startsWith('https://generativelanguage.googleapis.com/')) {
        if (req.method() === 'OPTIONS') {
          req.respond({
            status: 204,
            headers: {
              'access-control-allow-origin': '*',
              'access-control-allow-methods': 'GET, POST, OPTIONS',
              'access-control-allow-headers': 'content-type, x-goog-api-key',
            },
          });
          return;
        }
        if (!url.includes(':generateContent')) {
          req.respond({
            status: 200,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({
              models: [
                { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
                { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
              ],
            }),
          });
          return;
        }
        aiRequests += 1;
        const body = JSON.parse(req.postData() || '{}');
        const prompt = body?.contents?.[0]?.parts?.[0]?.text || '';
        const mock = buildMockChunkFromPrompt(prompt);
        req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(mock) }] } }],
          }),
        });
        return;
      }
      req.abort();
    });

    await page.goto(site, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });

    // Navigate to Plan -> Auto Plan
    const clickNavPlan = async () => {
      await page.evaluate(() => {
        const buttons = [...document.querySelectorAll('nav button')];
        const planBtn = buttons.find(btn => /課表|Plan/.test(btn.textContent));
        if (planBtn) planBtn.click();
      });
    };
    await clickNavPlan();
    await page.waitForSelector('[data-testid="open-auto-planner"]', { visible: true });
    await page.click('[data-testid="open-auto-planner"]');
    await page.waitForSelector('[data-testid="period-workspace"]');

    // Continue from date range to questionnaire
    await page.click('[data-testid="period-range-next"], .period-workspace button[type="submit"], .period-workspace .button-primary');
    await page.waitForSelector('[data-testid="mode-ai"]', { visible: true });

    // Switch to AI Coach mode and verify inline API key box
    await page.click('[data-testid="mode-ai"]');
    await page.waitForSelector('[data-testid="period-inline-key-input"]', { visible: true });
    await page.type('[data-testid="period-inline-key-input"]', 'AIzaTestMockKey123456');
    await page.click('[data-testid="period-inline-key-save"]');
    await page.waitForSelector('[data-testid="period-byok-ready"]', { visible: true });

    // Step through 3-step questionnaire and generate AI plan
    await page.click('[data-testid="setup-next"]');
    await page.click('[data-testid="setup-next"]');
    await page.waitForSelector('[data-testid="plan-preview-create"]', { visible: true });
    await page.click('[data-testid="plan-preview-create"]');

    // Wait for AI preview with Coach Report + Analytics Charts
    await page.waitForSelector('[data-testid="period-coach-report"]', { visible: true });
    await page.waitForSelector('[data-testid="period-analytics-charts"]', { visible: true });
    assert.ok(aiRequests >= 1, `Expected mocked Gemini request at ${width}px`);

    const reportText = await page.$eval('[data-testid="period-coach-report"]', el => el.textContent);
    assert.match(reportText, /前期表現回顧與鼓勵/);
    assert.match(reportText, /本期重點提醒/);
    assert.match(reportText, /本段訓練藍圖/);
    assert.match(reportText, /執行檢核與調整建議/);

    // Verify zero horizontal overflow on AI preview with report & charts
    const overflowPreview = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflowPreview, false, `Horizontal overflow on AI preview at ${width}px`);

    // Apply plan and confirm persisted coach report + overview charts survive reload
    await page.click('[data-testid="period-plan-apply"]');
    await page.waitForSelector('[data-testid="overview-analytics-disclosure"]', { visible: true });
    await page.waitForSelector('[data-testid="period-coach-report"]', { visible: true });

    await page.reload({ waitUntil: 'networkidle2' });
    await clickNavPlan();
    await page.waitForSelector('[data-testid="period-coach-report"]', { visible: true });

    // Also verify Free Template preview renders analytics charts
    await page.click('[data-testid="open-auto-planner"]');
    await page.waitForSelector('[data-testid="period-workspace"]');
    await page.click('.period-workspace .button-primary');
    await page.waitForSelector('[data-testid="mode-template"]', { visible: true });
    await page.click('[data-testid="mode-template"]');
    await page.click('[data-testid="setup-next"]');
    await page.click('[data-testid="setup-next"]');
    await page.click('[data-testid="plan-preview-create"]');
    await page.waitForSelector('[data-testid="period-analytics-charts"]', { visible: true });

    const overflowTemplate = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflowTemplate, false, `Horizontal overflow on Free Template preview at ${width}px`);
    assert.deepEqual(errors, [], `Page errors at ${width}px: ${errors.join('; ')}`);

    await page.close();
  }
  console.log('AI period planner smoke passed at 320, 390, 1440px (BYOK AI + 8-item warm-up + Coach Report + Free/AI Analytics Charts)');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
