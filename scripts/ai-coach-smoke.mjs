import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const port = Number(process.env.AI_COACH_SMOKE_PORT || 5218);
const site = `http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', String(port)], {
  env: { ...process.env, SMOKE_DISABLE_HMR: '1' },
  stdio: 'ignore',
});

function buildMockChunkFromPrompt(prompt, isRefined) {
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
        concept: '保留恢復空間',
        coachAdvice: '睡眠與補水優先。',
        sessionType: 'rest',
        warmupNote: '休息日不需暖身。',
        cooldownNote: '休息日放鬆為主。',
        routine: [],
        prescriptions: [],
      };
    }
    if (policy.isCourtDay || index % 2 === 1) {
      return {
        date: policy.date,
        name: `動態恢復 ${policy.day}`,
        theme: isRefined ? '肩胛穩定與動態恢復（已微調）' : '關節活動與恢復',
        concept: '保持羽球關節活動範圍並維持肩胛控制。',
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
      theme: isRefined ? '輕量腿部與肩胛穩定（已依需求微調）' : '羽球下肢分腿與核心穩定',
      concept: '建立弓步急停與軀幹抗旋轉力量傳遞。',
      coachAdvice: isRefined ? '已調降下肢負荷並加強肩胛控制，保留 2–3 次餘力。' : '主項保留 2 次餘力。',
      sessionType: 'training',
      warmupNote: '先完成八段動態暖身，再做準備組。',
      cooldownNote: '完成後配合慢呼吸收尾。',
      routine: ['bf_B01', 'dead_bug'],
      prescriptions: [
        {
          id: 'bf_B01',
          sets: 2,
          value: isRefined ? '6' : '8',
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
        reviewAndPraise: isRefined
          ? '已依據你的微調意見重新調整本段課表，兼顧輕量腿部負荷與肩胛穩定！'
          : '這段時間你開始建立規律的羽球體能基準，這份主動規劃的行動力非常值得肯定！',
        reminders: [
          '每次訓練都已鎖定八段動態暖身，請優先維持流暢度。',
          isRefined ? '已依微調建議調降下肢組次並保留充足恢復空間。' : '主訓練保留約 2 次餘力。',
        ],
        planOverview: isRefined
          ? '微調後版本著重輕量下肢煞車、肩胛核心穩定與八大關節活動度平衡。'
          : '本週兼顧下肢分腿煞車、核心抗旋轉與八大關節活動度。',
        checkpoints: '期中檢核動作品質與翌日腿部清爽度。',
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

  const launchOptions = {
    headless: true,
    args: ['--no-sandbox'],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
  };
  browser = await puppeteer.launch(launchOptions);

  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 844 });
    const errors = [];
    let coachRequests = 0;
    let planRequests = 0;
    let refinedRequests = 0;
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
        const body = JSON.parse(req.postData() || '{}');
        // Distinguish Period Plan JSON call vs AI Coach chat call
        if (body?.generationConfig?.responseMimeType === 'application/json') {
          planRequests += 1;
          const prompt = body?.contents?.[0]?.parts?.[0]?.text || '';
          const isRefined = prompt.includes('學員微調需求') || prompt.includes('Draft refinement request');
          if (isRefined) refinedRequests += 1;
          const mock = buildMockChunkFromPrompt(prompt, isRefined);
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

        coachRequests += 1;
        const turns = body?.contents || [];
        const lastUserText = turns.at(-1)?.parts?.[0]?.text || '';
        const reply = turns.length === 1
          ? `### 羽球體能教練回覆\n- 收到你的提問，我們先從穩定的八段動態暖身與核心控制開始。\n- 保持動作流暢與保留 2 次餘力！`
          : `### 延伸建議\n- 針對你問的「${lastUserText.slice(0, 20)}」，建議球前以輕量動態啟動為主，重訓安排在非連續球日。`;
        req.respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({
            candidates: [{ finishReason: 'STOP', content: { parts: [{ text: reply }] } }],
          }),
        });
        return;
      }
      req.abort();
    });

    await page.goto(site, { waitUntil: 'networkidle2' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle2' });

    // 1. Open AI Coach from Today
    await page.waitForSelector('[data-testid="open-ai-coach"]', { visible: true });
    await page.click('[data-testid="open-ai-coach"]');
    await page.waitForSelector('[data-testid="ai-coach-drawer"]', { visible: true });

    // Verify zero overflow with drawer open
    const overflowDrawerOpen = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflowDrawerOpen, false, `Horizontal overflow with AI Coach drawer open at ${width}px`);

    // Inline API key save inside AI Coach drawer
    await page.waitForSelector('[data-testid="coach-inline-key-input"]', { visible: true });
    await page.type('[data-testid="coach-inline-key-input"]', 'AIzaCoachSmokeKey12345');
    await page.click('[data-testid="coach-inline-key-save"]');
    await page.waitForSelector('[data-testid="coach-byok-ready"]', { visible: true });

    // Click first quick prompt and verify rendered reply
    await page.waitForSelector('[data-testid="coach-quick-prompt-review"]', { visible: true });
    await page.click('[data-testid="coach-quick-prompt-review"]');
    await page.waitForSelector('[data-testid="coach-msg-model"]', { visible: true });
    const firstReply = await page.$eval('[data-testid="coach-msg-model"]', el => el.textContent);
    assert.match(firstReply, /羽球體能教練回覆/);

    // Send a follow-up message
    await page.type('[data-testid="coach-chat-input"]', '打球前一天可以做下肢重訓嗎？');
    await page.click('[data-testid="coach-chat-send"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="coach-msg-model"]').length === 2);
    const secondReply = await page.$$eval('[data-testid="coach-msg-model"]', els => els[1].textContent);
    assert.match(secondReply, /延伸建議/);
    assert.equal(coachRequests, 2, `Expected 2 mocked coach requests at ${width}px`);

    // Verify zero overflow with multi-turn messages
    const overflowDrawerChat = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="ai-coach-drawer"]');
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
        || (dialog ? dialog.scrollWidth > dialog.clientWidth : false);
    });
    assert.equal(overflowDrawerChat, false, `Horizontal overflow in AI Coach chat at ${width}px`);

    // Clear chat and verify quick prompts reappear
    await page.click('[data-testid="coach-chat-clear"]');
    await page.waitForSelector('[data-testid="coach-quick-prompts"]', { visible: true });

    // Close drawer
    await page.click('[data-testid="coach-drawer-close"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="ai-coach-drawer"]'));

    // 2. Navigate to Plan -> verify Plan AI Coach button -> Auto Plan -> AI Coach -> Preview -> Conversational Refinement
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('nav button')];
      const planBtn = buttons.find(btn => /課表|Plan/.test(btn.textContent));
      if (planBtn) planBtn.click();
    });
    await page.waitForSelector('[data-testid="plan-open-ai-coach"]', { visible: true });
    await page.waitForSelector('[data-testid="open-auto-planner"]', { visible: true });
    await page.click('[data-testid="open-auto-planner"]');
    await page.waitForSelector('[data-testid="period-workspace"]');

    // Continue from date range to questionnaire
    await page.click('[data-testid="period-range-next"], .period-workspace button[type="submit"], .period-workspace .button-primary');
    await page.waitForSelector('[data-testid="mode-ai"]', { visible: true });
    await page.click('[data-testid="mode-ai"]');
    // Key was already saved inside AI Coach drawer, so BYOK should already be ready!
    await page.waitForSelector('[data-testid="period-byok-ready"]', { visible: true });

    await page.click('[data-testid="setup-next"]');
    await page.click('[data-testid="setup-next"]');
    await page.waitForSelector('[data-testid="plan-preview-create"]', { visible: true });
    await page.click('[data-testid="plan-preview-create"]');

    // Wait for AI preview + refinement box
    await page.waitForSelector('[data-testid="period-coach-report"]', { visible: true });
    await page.waitForSelector('[data-testid="ai-refine-box"]', { visible: true });

    // Use ai-refine-input + ai-refine-submit to refine the preview
    await page.type('[data-testid="ai-refine-input"]', '週三腿部改輕一點、多加肩胛穩定');
    await page.click('[data-testid="ai-refine-submit"]');

    // Wait for updated coach report text reflecting refinement
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="period-coach-report"]');
      return el && /已依據你的微調意見/.test(el.textContent || '');
    });
    assert.ok(planRequests >= 2 && refinedRequests >= 1, `Expected refined AI plan request at ${width}px`);

    const overflowRefine = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflowRefine, false, `Horizontal overflow on refined AI preview at ${width}px`);
    assert.deepEqual(errors, [], `Page errors at ${width}px: ${errors.join('; ')}`);

    await page.close();
  }

  console.log('AI Coach & conversational refinement smoke passed at 320, 390, 1440px (0 overflow, 0 page errors)');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
