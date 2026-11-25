import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';
import { catalogExercises } from '../src/domain/exerciseCatalog.js';
import { dailyWarmupPrescriptions } from '../src/domain/quickWorkouts.js';
import { applyLocalPeriod } from '../src/domain/periodDraft.js';
import { getWeekString, localDate } from '../src/domain/dates.js';

const port = Number(process.env.QUICK_SINGLE_DAY_PORT || 5217);
const site = `http://127.0.0.1:${port}/FunctionalFitnessPlanner/`;
const server = spawn(process.execPath, ['scripts/smoke-server.mjs', String(port)], {
  env: { ...process.env, SMOKE_DISABLE_HMR: '1' },
  stdio: 'ignore',
});

const today = localDate();
const week = getWeekString(new Date(`${today}T12:00:00`));
const dayNum = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
const exercises = catalogExercises('zh');
const warmups = dailyWarmupPrescriptions('warmup');

const todaySession = {
  date: today,
  week,
  day: dayNum,
  name: '今日測試',
  theme: '今日羽球體能',
  concept: '測試',
  coachAdvice: '測試',
  warmupNote: '八段暖身',
  cooldownNote: '收尾',
  sessionType: 'training',
  routine: [...warmups.map(d => d.id), 'bf_B01', 'dead_bug'],
  prescriptions: [
    ...warmups,
    {
      id: 'bf_B01',
      sets: 2,
      value: '8',
      unit: 'reps',
      restSeconds: 60,
      perSide: true,
      phase: 'strength',
      preparation: { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: true, instruction: '輕量準備' },
    },
    { id: 'dead_bug', sets: 2, value: '8', unit: 'reps', restSeconds: 45, perSide: true, phase: 'accessory' },
  ],
};

const seededPeriod = applyLocalPeriod(
  null,
  {
    range: { from: today, to: today },
    sessions: [todaySession],
    selectedDates: [today],
    profile: { context: { healthStatus: 'unrestricted', equipment: [], trainingDays: [1, 2, 3, 4, 5, 6, 7], badmintonDays: [] }, focus: 'balanced', time: '40', goal: '' },
    conclusion: 'Seeded test day',
    weeklySummaries: [],
    expectedState: { fingerprint: 'null' },
  },
  today,
);
// Mark the first warm-up as ALREADY COMPLETED so today is a "protected" in-progress day!
seededPeriod.progressByWeek = {
  [week]: {
    completed: { [`day${dayNum}_${warmups[0].id}`]: true },
    completedAt: { [`day${dayNum}_${warmups[0].id}`]: today },
  },
};

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
    page.on('pageerror', err => errors.push(err.message));

    await page.setRequestInterception(true);
    page.on('request', req => {
      if (req.url().startsWith(`http://127.0.0.1:${port}/`)) req.continue();
      else req.abort();
    });

    await page.goto(site, { waitUntil: 'networkidle2' });
    await page.evaluate(payload => {
      localStorage.clear();
      localStorage.setItem('fitness_date_period_v1', JSON.stringify(payload));
    }, seededPeriod);
    await page.reload({ waitUntil: 'networkidle2' });

    // 1. Today has 10 exercises (8 warmups + bf_B01 + dead_bug), with warmups[0] already completed
    // Unified button: only day-add-exercise exists (no redundant day-quick-edit button!)
    await page.waitForSelector('[data-testid="day-add-exercise"]', { visible: true });
    assert.equal(await page.$('[data-testid="day-quick-edit"]'), null, 'Duplicate day-quick-edit button must not exist');
    await page.waitForSelector('[data-testid="exercise-row-dead_bug"]', { visible: true });

    // 2. Click unified "± 增減動作" -> opens instant-save picker right over Today
    await page.click('[data-testid="day-add-exercise"]');
    await page.waitForSelector('[data-testid="quick-workout-picker"]', { visible: true });

    // Switch to "已排 (N)" tab: recorded warmup is locked, unrecorded dead_bug has 1-click remove!
    await page.click('[data-testid="quick-tab-current"]');
    await page.waitForSelector(`[data-testid="quick-locked-${warmups[0].id}"]`, { visible: true });
    await page.waitForSelector('[data-testid="quick-remove-dead_bug"]', { visible: true });

    // 1-click minus immediately removes dead_bug even though today already has a completed record!
    await page.click('[data-testid="quick-remove-dead_bug"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="quick-remove-dead_bug"]'));
    await page.waitForSelector('[data-testid="quick-edit-undo"]', { visible: true });

    // 1-click undo inside picker brings dead_bug right back
    await page.click('[data-testid="quick-edit-undo"]');
    await page.waitForSelector('[data-testid="quick-remove-dead_bug"]', { visible: true });

    // 3. Switch to "單一動作" tab -> search for glute bridge (bf_B06, bodyweight) and tap + (saves immediately in 1 click!)
    await page.click('[data-testid="quick-tab-exercises"]');
    await page.waitForSelector('[data-testid="combo-search"]', { visible: true });
    await page.type('[data-testid="combo-search"]', '臀橋');
    await page.waitForSelector('[data-testid="single-add-bf_B06"]', { visible: true });
    await page.click('[data-testid="single-add-bf_B06"]');
    // After 1 click, it turns into a 1-click minus button inside the picker!
    await page.waitForSelector('[data-testid="single-remove-bf_B06"]', { visible: true });

    // Close picker -> bf_B06 is already on Today without any extra confirmation screen!
    await page.click('[data-testid="combo-panel-done"]');
    await page.waitForSelector('[data-testid="exercise-row-bf_B06"]', { visible: true });

    // 4. Also verify full single-day editor ("調整組次") + Review + Save succeeds without DATE_PROTECTED error!
    await page.click('[data-testid="day-edit"]');
    await page.waitForSelector('[data-testid="manual-quick-remove-bf_B06"]', { visible: true });
    await page.click('[data-testid="manual-quick-remove-bf_B06"]');
    await page.click('[data-testid="manual-review"]');
    await page.waitForSelector('[data-testid="assignment-apply"]', { visible: true });
    await page.click('[data-testid="assignment-apply"]');
    await page.waitForSelector('[data-testid="day-add-exercise"]', { visible: true });
    assert.equal(await page.$('[data-testid="exercise-row-bf_B06"]'), null);
    // Completed exercise is still preserved!
    assert.ok(await page.$(`[data-testid="exercise-row-${warmups[0].id}"]`));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `Horizontal overflow at ${width}px`);
    assert.deepEqual(errors, [], `Page errors at ${width}px: ${errors.join('; ')}`);

    await page.close();
  }
  console.log('Quick +/- single-day edit & protected-day bugfix smoke passed at 320, 390, 1440px!');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
