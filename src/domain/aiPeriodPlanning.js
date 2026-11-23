import { getWeekString, isCalendarDate, localDate } from './dates.js';
import { competitionDaysAway, normalizePlanningContext, planningExercises } from './planning.js';
import { enumeratePeriodDates, normalizePlanningRange, preservePeriodSession, sanitizePeriodSession } from './periodPlanning.js';
import { generateTemplatePlan } from './templatePlanner.js';
import { DAILY_WARMUP_IDS, dailyWarmupPrescriptions, isDailyWarmupComplete } from './quickWorkouts.js';
import { DEFAULT_MAX_PROMPT_BYTES, selectPromptCandidates, utf8Bytes } from './promptCandidates.js';
import { exerciseTrainingTargets } from './trainingTargets.js';
import { estimateSessionMinutes, sessionSections } from './sessions.js';
import { MAX_DAY_EXERCISES } from './plannerLimits.js';
import { exercisePhase, SESSION_PHASES, SESSION_TYPES } from './phases.js';
import { validSequenceDose } from './exerciseCatalog.js';
import { prescription } from './training.js';
import { summarizeRecentPerformance } from './periodAnalytics.js';

const isoDay = date => new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
const weekFor = date => getWeekString(new Date(`${date}T12:00:00`));

const REPORT_HEADINGS = {
  zh: {
    reviewAndPraise: '前期表現回顧與鼓勵',
    reminders: '本期重點提醒',
    planOverview: '本段訓練藍圖',
    checkpoints: '執行檢核與調整建議',
  },
  en: {
    reviewAndPraise: 'Recent Progress & Encouragement',
    reminders: 'Key Reminders',
    planOverview: 'Period Training Blueprint',
    checkpoints: 'Checkpoints & Next Steps',
  },
};

export const MAX_CONCLUSION_CHARS = 3800;

/** Split 1–28 calendar dates into contiguous ISO-week chunks (max 7 days each). */
export function splitPeriodIntoChunks(dates = []) {
  const chunks = [];
  for (const date of dates) {
    if (!isCalendarDate(date)) throw new Error('INVALID_PLANNING_RANGE');
    const week = weekFor(date);
    const current = chunks.at(-1);
    if (current && current.week === week && current.dates.length < 7) {
      current.dates.push(date);
    } else {
      chunks.push({ week, dates: [date] });
    }
  }
  return chunks;
}

/** Exact minute cost of the locked 8-item dynamic warm-up inside a session. */
export function lockedWarmupMinutes(exercises, phase = 'warmup') {
  const prescriptions = dailyWarmupPrescriptions(phase);
  const session = {
    sessionType: phase === 'recovery' ? 'recovery' : 'training',
    routine: prescriptions.map(dose => dose.id),
    prescriptions,
  };
  const section = sessionSections(session, exercises, 1).find(item => item.phase === phase);
  return section ? Math.ceil(section.seconds / 60) : 10;
}

/**
 * Evaluate deterministic policy per date in a chunk using the template engine
 * strictly as a rule reference—never as fabricated completions.
 */
export function resolveChunkDayPolicies(weekDates, {
  exercises = {},
  profile = {},
  time = 30,
  lang = 'zh',
  today = localDate(),
  protectedDates = [],
  existingSessions = {},
  historySessions = [],
  logs = [],
  progressByWeek = {},
  readiness = [],
} = {}) {
  const context = normalizePlanningContext(profile?.context);
  const focus = ['balanced', 'strength', 'stability', 'coordination'].includes(profile?.focus) ? profile.focus : 'balanced';
  const protectedSet = new Set(protectedDates);
  const week = weekFor(weekDates[0]);
  const reference = generateTemplatePlan(exercises, context, Number(time), lang, {
    currentDate: today,
    currentWeek: week,
    focus,
    calendarDays: [1, 2, 3, 4, 5, 6, 7],
    inRangeDates: weekDates,
    protectedDates: [...protectedSet],
    previousSessions: historySessions,
    logs,
    progressByWeek,
    readiness,
    lastWeekFeedback: progressByWeek[getWeekString(new Date(`${weekDates[0]}T12:00:00`), -1)]?.feedbackValue,
    previousPlan: { schedule: historySessions.filter(session => session.date < weekDates[0] && session.date <= today) },
  });

  const warmupMinutes = lockedWarmupMinutes(exercises, 'warmup');
  const dailyTime = Number(time);

  return weekDates.map(date => {
    const day = isoDay(date);
    const isProtected = protectedSet.has(date) && !!existingSessions[date];
    const isTrainingDay = context.trainingDays.includes(day);
    const isCourtDay = context.badmintonDays.includes(day);
    const expected = reference.schedule.find(item => item.day === day);
    const away = competitionDaysAway(context.competitionDate, date);

    if (isProtected) {
      return {
        date,
        day,
        week,
        protected: true,
        isTrainingDay,
        isCourtDay,
        competitionDaysAway: away,
        warmupMode: 'protected',
        warmupMinutes: 0,
        remainingMinutes: 0,
        remainingSlots: 0,
        suggestedSessionType: existingSessions[date]?.sessionType || 'training',
      };
    }

    if (!isTrainingDay) {
      return {
        date,
        day,
        week,
        protected: false,
        isTrainingDay: false,
        isCourtDay,
        competitionDaysAway: away,
        warmupMode: 'none',
        warmupMinutes: 0,
        remainingMinutes: 0,
        remainingSlots: 0,
        suggestedSessionType: 'rest',
      };
    }

    const completeWarmupAllowed = !!expected && expected.sessionType !== 'rest' && isDailyWarmupComplete(expected);
    const warmupMode = expected?.sessionType === 'rest'
      ? 'rest_recommended'
      : completeWarmupAllowed
        ? 'daily_warmup'
        : 'custom';
    // Reserve 1 minute for the session transition allowance in estimateSessionMinutes.
    const remainingMinutes = warmupMode === 'daily_warmup'
      ? Math.max(0, dailyTime - warmupMinutes - 1)
      : Math.max(0, dailyTime - 1);

    const policy = {
      date,
      day,
      week,
      protected: false,
      isTrainingDay: true,
      isCourtDay,
      competitionDaysAway: away,
      warmupMode,
      warmupMinutes: warmupMode === 'daily_warmup' ? warmupMinutes : 0,
      remainingMinutes,
      remainingSlots: warmupMode === 'daily_warmup' ? MAX_DAY_EXERCISES - DAILY_WARMUP_IDS.length : MAX_DAY_EXERCISES,
      suggestedSessionType: expected?.sessionType || 'training',
    };
    Object.defineProperty(policy, '_referenceSession', { value: expected || null, enumerable: false });
    return policy;
  });
}

function compactPreviousSessions(sessions = []) {
  const doseFields = ['id', 'sets', 'value', 'unit', 'restSeconds', 'perSide', 'phase'];
  return sessions.slice(-14).map(session => ({
    date: session.date,
    day: session.day,
    sessionType: session.sessionType || (session.routine?.length ? 'training' : 'rest'),
    theme: String(session.theme || '').slice(0, 60),
    routine: Array.isArray(session.routine) ? session.routine : [],
    prescriptions: (Array.isArray(session.prescriptions) ? session.prescriptions : [])
      .map(dose => doseFields.map(field => dose[field] ?? null)),
  }));
}

/**
 * Build a budgeted UTF-8 prompt (<= 56 KB) for one weekly chunk of a 1–28 day AI plan.
 */
export function buildAIPeriodChunkPrompt({
  chunkDates,
  chunkIndex = 0,
  totalChunks = 1,
  policies = [],
  exercises = {},
  profile = {},
  time = 30,
  lang = 'zh',
  today = localDate(),
  range,
  userGoal = '',
  userMessage = '',
  recentSummary = null,
  previousSessions = [],
  includeReport = false,
  correctionHint = '',
} = {}) {
  const context = normalizePlanningContext(profile?.context);
  const focus = ['balanced', 'strength', 'stability', 'coordination'].includes(profile?.focus) ? profile.focus : 'balanced';
  const eligible = planningExercises(exercises, context);
  const dailyTime = Number(time);
  const lockedWarmupSet = new Set(DAILY_WARMUP_IDS);
  const hasCustomWarmupDays = policies.some(item => item.warmupMode === 'custom');

  const specificTargets = (id, exercise) => exerciseTrainingTargets(id, exercise)
    .filter(region => context.targetRegions.includes(region) && !['legs', 'posterior', 'upper', 'core'].includes(region));

  const candidateEntries = Object.entries(eligible)
    .filter(([, exercise]) => !exercise.legacySequence && exercise.active !== false && !exercise.deleted)
    // Always keep DAILY_WARMUP_IDS when any custom-warmup day exists; when all active days lock daily_warmup,
    // omitting the 8 locked IDs saves prompt bytes and prevents accidental duplication.
    .filter(([id]) => hasCustomWarmupDays || !lockedWarmupSet.has(id))
    .map(([id, exercise]) => [
      id,
      exercise,
      {
        id,
        name: exercise.name,
        type: exercise.type,
        category: exercise.category || 'custom',
        equipmentOptions: exercise.equipmentOptions ?? '未分類',
        ...(exercise.advanced ? { advanced: true } : {}),
        ...(exercise.priority ? { priority: true } : {}),
        ...(exercise.requiresPartner ? { requiresPartner: true } : {}),
        ...(exercise.shoulderLoaded ? { shoulderLoaded: true } : {}),
        ...(exercise.restrictionTags?.length ? { restrictionTags: exercise.restrictionTags } : {}),
        starterDose: exercise.prescription
          ? ['sets', 'value', 'unit', 'restSeconds', 'perSide'].map(key => exercise.prescription[key] ?? null)
          : null,
        ...(specificTargets(id, exercise).length ? { trainingTargets: specificTargets(id, exercise) } : {}),
        cue: String(exercise.tip || '').slice(0, 80),
      },
    ]);

  const editableDates = policies.filter(item => !item.protected);
  const summaryPayload = recentSummary || summarizeRecentPerformance({ today, context, exercises });

  const assemblePrompt = (candidatesJson, candidateNotice = '') => {
    const reportInstructions = includeReport
      ? `
【個人化教練總結報告（務必填寫 report 物件）】
語氣要求：溫暖、有鼓勵性、具體且有科學依據；像一位真正關心學員進步的羽球專項體能教練。
嚴格守則：只能引用 recentSummary 中真實存在的數字與事實，絕對不可編造完成天數、次數或進步幅度；不做醫療診斷，不誇大療效。
- reviewAndPraise（120–240字）：回顧近 28 天真實表現並給予真誠肯定（若有完成紀錄／實做組數／穩定訓練日，具體稱讚這份累積；若 hasHistory=false，溫和鼓勵學員從這份課表建立第一階段基準）。
- reminders（2–4 條簡短具體提醒陣列）：點出這段期間的球日負荷銜接、疲勞或痠痛注意、較久未練的活動度部位（參考 mobilityGaps）、或器材／健康限制取捨。
- planOverview（100–200字）：說明這整段 ${range?.from || chunkDates[0]} 至 ${range?.to || chunkDates.at(-1)} 課表的核心主軸，如何兼顧羽球下肢煞車／蹬伸、髖鉸鏈、上肢推拉、肩胛核心與八大活動度輪替。
- checkpoints（60–120字）：提醒學員在期中與期末觀察什麼具體指標（例如動作品質、餘力、翌日反應）來決定下階段調整。`
      : '';

    const correctionBlock = correctionHint
      ? `\n【前次輸出修正要求（務必修正以下問題）】\n${correctionHint}\n`
      : '';

    return `你是一位專業且溫暖的羽球功能性體能教練，正在為學員規劃日期原生課表（第 ${chunkIndex + 1} / ${totalChunks} 週，完整期間 ${range?.from || chunkDates[0]} 至 ${range?.to || chunkDates.at(-1)}）。
你的目標是全面照顧羽球運動表現：下肢蹲／分腿煞車與蹬伸、髖鉸鏈（臀腿後）、上肢推與拉、肩胛／旋轉肌／前鋸肌穩定、核心抗旋轉、低量步法／爆發協調，以及八大關節活動度（胸椎、肩胸、髖前側、髖旋轉、內收肌、股四頭、腿後側、踝小腿）輪替。

【本次需編排的日期與規則】
今天：${today}；每日額外體能時間上限：${dailyTime} 分鐘（上限，不必用滿）；目標方向：${focus}。
僅為以下 editableDates 輸出 days 陣列（每天恰一筆，日期必須完全一致，不可包含受保護日期）：
${JSON.stringify(editableDates)}

【八段動態暖身鎖定規則（非常重要）】
1. 凡是 warmupMode === "daily_warmup" 的日期：系統會自動在開頭加入標準八段動態暖身（動態嬰兒式後坐、偉大拉伸、貓牛式、徒手Y/T、前鋸肌牆推、胸椎開書、90/90髖轉換、下犬式交替踩跟，共 8 項獨立紀錄，已占用約 ${lockedWarmupMinutes(exercises)} 分鐘）。
   - 若你將該日排為 sessionType="training"：只需輸出主訓練與收操（phase 限用 skill / strength / accessory / cooldown），**切勿重複輸出這 8 個暖身 ID**，且剩餘動作總時間不可超過 remainingMinutes、數量不可超過 remainingSlots。
   - 若你將該日排為 sessionType="recovery"：系統自動以這 8 項動態拉伸作為主要恢復內容，你可將 routine/prescriptions 留空陣列，或再補 1–2 項安全 cooldown 拉伸（不可放肌力／跳躍／上肢負重）。
   - 若你將該日排為 sessionType="rest"：routine 與 prescriptions 必須皆為空陣列 []。
2. 凡是 warmupMode === "custom" 的日期（短課／受限恢復／健康限制／未確認熟悉的賽前）：系統不鎖定八段暖身。若排 training 須自行包含至少 1 項安全 warmup 動作；若排 recovery 僅用 warmup/recovery/cooldown；若受限嚴重則排 rest。
3. 凡是 warmupMode === "none"（非可訓練星期）：必須輸出 sessionType="rest"、routine=[]、prescriptions=[]。
4. 若 warmupMode === "rest_recommended"：建議安排 sessionType="rest"（routine=[]）；若安排極輕 recovery，必須提供 1–2 項安全活動度／呼吸動作（不可留空陣列），並於 coachAdvice 說明原因。

【學員資料、近 28 天真實紀錄與前期課表】
${JSON.stringify({
      goal: String(userGoal || '').slice(0, 600),
      message: String(userMessage || '').slice(0, 1800),
      focus,
      profile: {
        trainingDays: context.trainingDays,
        badmintonDays: context.badmintonDays,
        badmintonMinutes: context.badmintonMinutes,
        badmintonIntensity: context.badmintonIntensity,
        equipment: context.equipment,
        partnerAvailable: context.partnerAvailable,
        experience: context.experience,
        targetRegions: context.targetRegions,
        stiffnessRegions: context.stiffnessRegions,
        sorenessRegions: context.sorenessRegions,
        sorenessImpact: context.sorenessImpact,
        recoveryState: context.recoveryState,
        healthStatus: context.healthStatus,
        healthNotes: context.healthNotes.slice(0, 400),
        recoveryNotes: context.recoveryNotes.slice(0, 400),
        competitionDate: context.competitionDate,
        weeklyExerciseIds: context.weeklyExerciseIds,
      },
      recentSummary: summaryPayload,
      previousSessions: compactPreviousSessions(previousSessions),
    })}

【專業排課約束】
1. 球場負荷與體能合併考量：每週通常安排 1–2 次主要肌力＋短協調品質練習，其餘安排恢復或休息；避免連續兩天高強度肌力或緊鄰高強度球日重訓下肢。
2. 全面照顧羽球動力鏈：在整段期間均衡涵蓋蹲／分腿、髖鉸鏈、上肢推與拉、核心抗旋、步法協調與八區活動度；跨週保留熟悉主項方便追蹤進步。優先納入合理的 weeklyExerciseIds 與 targetRegions（但不為硬塞而超時或違規）。
3. 日內階段順序嚴格為：warmup → skill → strength → accessory → recovery → cooldown。
   - power / footwork / reaction 類動作的 phase 必須是 "skill"。
   - 每個 training 日的第一個 strength 動作**必須提供 preparation 準備組**（sets 1–2、value "4–6" 或短秒數、restSeconds 0–120、具體輕量暖身指令 instruction）。
   - 額外 E 類跳躍單日總落地（sets × 最大次數 × 雙側2）上限 24 次，且不與跳繩 I04 同日。
   - 禁止使用舊序列 bf_A12、bf_A13，且不可用 bf_A01 當暖身或恢復。
4. 所有時間皆含雙側、組間休息、準備組與動作轉換，不可超過每日上限 ${dailyTime} 分鐘；估時會對每個階段無條件進位，請預留 2–3 分鐘安全緩衝，不足時減少組數或動作數，不硬塞。
5. 劑量限制：sets 1–5 整數；value 為數字或範圍如 "8–10"（reps/seconds/breaths 上限 120，minutes 上限 ${dailyTime}）；restSeconds 0–300 整數；preparation 的 value reps/breaths 上限 8、seconds 上限 30。
6. 每天提供非空 theme（當日重點）、concept（與羽球動作的動力鏈連結）、coachAdvice（與球日銜接與當日體感提醒）、warmupNote（說明暖身與主項銜接）、cooldownNote（說明收尾安排或省略原因）。
${reportInstructions}${correctionBlock}
【可用候選動作清單（ID 必須完全一致）】
starterDose 格式為 [sets, value, unit, restSeconds, perSide]。
${candidateNotice}${JSON.stringify(candidatesJson)}

【輸出格式】
只輸出符合 JSON Schema 的純 JSON，不加程式碼圍欄。${lang === 'en' ? 'Write all human-facing text in warm, encouraging ENGLISH. Keep IDs and unit codes unchanged.' : '所有給使用者的文字請用溫暖、專業的繁體中文撰寫，ID 與 unit 代碼維持原值。'}`;
  };

  const noticeTemplate = (includedCount, totalEligible) => `已依目標部位、手選動作、前期課表與活動度需求保留 ${includedCount}/${totalEligible} 項候選動作；未列 ID 不可引用。\n`;
  const baseBytesWithoutNotice = utf8Bytes(assemblePrompt([], '')) - 2;
  const previousPlan = { schedule: previousSessions };
  const fullSelection = selectPromptCandidates(candidateEntries, {
    profile: context,
    previousPlan,
    baseBytes: baseBytesWithoutNotice,
    maxBytes: DEFAULT_MAX_PROMPT_BYTES,
  });
  if (!fullSelection.budgeted) {
    return assemblePrompt(fullSelection.candidates, '');
  }
  const maxNoticeBytes = utf8Bytes(noticeTemplate(candidateEntries.length, candidateEntries.length));
  const selection = selectPromptCandidates(candidateEntries, {
    profile: context,
    previousPlan,
    baseBytes: baseBytesWithoutNotice + maxNoticeBytes,
    maxBytes: DEFAULT_MAX_PROMPT_BYTES,
  });
  const notice = selection.budgeted ? noticeTemplate(selection.includedCount, selection.totalEligible) : '';
  return assemblePrompt(selection.candidates, notice);
}

function normalizePhaseOrder(routine, prescriptions) {
  const byId = new Map(prescriptions.map(dose => [dose.id, dose]));
  const indexed = routine.map((id, index) => ({
    id,
    index,
    phaseOrder: SESSION_PHASES.indexOf(byId.get(id)?.phase),
  }));
  indexed.sort((a, b) => a.phaseOrder - b.phaseOrder || a.index - b.index);
  const orderedRoutine = indexed.map(item => item.id);
  const orderedPrescriptions = orderedRoutine.map(id => byId.get(id));
  return { routine: orderedRoutine, prescriptions: orderedPrescriptions };
}

const VALID_DOSE_UNITS = new Set(['reps', 'seconds', 'minutes', 'breaths']);
const VALID_PREP_UNITS = new Set(['reps', 'seconds', 'breaths']);
const DISALLOWED_RECOVERY_CATEGORIES = new Set(['lower', 'upper', 'power', 'footwork', 'reaction']);
const SKILL_CATEGORIES = new Set(['power', 'footwork', 'reaction']);

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeDoseValue(rawValue, unit, maxLimit, fallback = '8') {
  const text = String(rawValue ?? '').trim();
  const match = text.match(/(\d+)(?:\s*[–-]\s*(\d+))?/);
  if (!match) {
    const fb = Number(String(fallback).split(/[–-]/)[0]) || 8;
    return String(Math.max(1, Math.min(maxLimit, Math.round(fb))));
  }
  const first = Math.max(1, Math.min(maxLimit, Number(match[1])));
  if (!match[2]) return String(first);
  const second = Math.max(1, Math.min(maxLimit, Number(match[2])));
  const lo = Math.min(first, second);
  const hi = Math.max(first, second);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

function defaultPreparation(perSide, lang) {
  return {
    sets: 1,
    value: '5',
    unit: 'reps',
    restSeconds: 30,
    perSide: !!perSide,
    instruction: lang === 'en'
      ? '1 light controlled warm-up set focusing on alignment and steady tempo.'
      : '先做 1 組輕量可控熱身組，確認關節對齊與動作節奏。',
  };
}

function normalizePreparation(rawPrep, perSideFallback, lang) {
  if (!rawPrep || typeof rawPrep !== 'object') return defaultPreparation(perSideFallback, lang);
  const unit = VALID_PREP_UNITS.has(rawPrep.unit) ? rawPrep.unit : 'reps';
  const maxVal = unit === 'seconds' ? 30 : 8;
  const sets = clampInt(rawPrep.sets, 1, 2, 1);
  const value = normalizeDoseValue(rawPrep.value, unit, maxVal, unit === 'seconds' ? '15' : '5');
  const restSeconds = clampInt(rawPrep.restSeconds, 0, 120, 30);
  const perSide = typeof rawPrep.perSide === 'boolean' ? rawPrep.perSide : !!perSideFallback;
  const instruction = typeof rawPrep.instruction === 'string' && rawPrep.instruction.trim()
    ? rawPrep.instruction.trim().slice(0, 400)
    : defaultPreparation(perSide, lang).instruction;
  return { sets, value, unit, restSeconds, perSide, instruction };
}

function isRecoveryAllowedExercise(id, exercise) {
  if (!exercise) return false;
  if (id === 'bf_A01') return false;
  if (DISALLOWED_RECOVERY_CATEGORIES.has(exercise.category)) return false;
  if (exercise.category === 'conditioning' && exercise.catalogCode !== 'I01') return false;
  return true;
}

function computeJumpContacts(prescriptions, eligible) {
  let contacts = 0;
  for (const dose of prescriptions) {
    const ex = eligible[dose.id];
    if (ex?.jumpContacts && dose.unit === 'reps') {
      const maximum = Math.max(...String(dose.value).split(/[–-]/).map(Number));
      contacts += ex.jumpContacts * dose.sets * maximum * (dose.perSide ? 2 : 1);
    }
  }
  return contacts;
}

function buildRestDay(date, policy, aiDay, lang) {
  return {
    date,
    week: policy.week,
    day: policy.day,
    name: typeof aiDay?.name === 'string' && aiDay.name.trim()
      ? aiDay.name.trim().slice(0, 120)
      : (lang === 'en' ? `Rest Day ${policy.day}` : `休息日 ${policy.day}`),
    theme: typeof aiDay?.theme === 'string' && aiDay.theme.trim()
      ? aiDay.theme.trim().slice(0, 200)
      : (lang === 'en' ? 'Active recovery & rest' : '主動休息與恢復'),
    concept: typeof aiDay?.concept === 'string' ? aiDay.concept.trim().slice(0, 1200) : '',
    coachAdvice: typeof aiDay?.coachAdvice === 'string' ? aiDay.coachAdvice.trim().slice(0, 1200) : '',
    sessionType: 'rest',
    warmupNote: typeof aiDay?.warmupNote === 'string' && aiDay.warmupNote.trim()
      ? aiDay.warmupNote.trim().slice(0, 1200)
      : (lang === 'en' ? 'Rest day — no warm-up needed.' : '今日為休息日，不需額外暖身。'),
    cooldownNote: typeof aiDay?.cooldownNote === 'string' && aiDay.cooldownNote.trim()
      ? aiDay.cooldownNote.trim().slice(0, 1200)
      : (lang === 'en' ? 'Rest day — focus on sleep and hydration.' : '今日為休息日，以睡眠與補水恢復為主。'),
    routine: [],
    prescriptions: [],
  };
}

function sanitizeReferenceFallback(date, policy, eligible, dailyTime, lang) {
  if (policy._referenceSession) {
    try {
      return sanitizePeriodSession(
        { ...policy._referenceSession, date, week: policy.week, day: policy.day },
        { exercises: eligible, dailyTime },
      );
    } catch { /* fall through to rest day */ }
  }
  return sanitizePeriodSession(buildRestDay(date, policy, null, lang), { exercises: eligible, dailyTime });
}

/**
 * Deterministically repair minor LLM output slips (formatting, missing preparation,
 * phase mislabels, ineligible/duplicate IDs, jump volume > 24, or mild duration overshoot)
 * while strictly enforcing every domain safety invariant via sanitizePeriodSession.
 */
function reconcileAIPeriodDay(aiDay, { date, policy, eligible, dailyTime, lang }) {
  if (policy.warmupMode === 'none') {
    return sanitizePeriodSession(buildRestDay(date, policy, aiDay, lang), { exercises: eligible, dailyTime });
  }
  if (!aiDay || typeof aiDay !== 'object') {
    return sanitizeReferenceFallback(date, policy, eligible, dailyTime, lang);
  }

  let sessionType = SESSION_TYPES.includes(aiDay.sessionType)
    ? aiDay.sessionType
    : (SESSION_TYPES.includes(policy.suggestedSessionType) ? policy.suggestedSessionType : 'training');

  if (sessionType === 'rest') {
    return sanitizePeriodSession(buildRestDay(date, policy, aiDay, lang), { exercises: eligible, dailyTime });
  }

  const lockedWarmupSet = new Set(DAILY_WARMUP_IDS);
  const rawRoutine = Array.isArray(aiDay.routine) ? aiDay.routine : [];
  const rawPrescriptions = Array.isArray(aiDay.prescriptions) ? aiDay.prescriptions : [];
  const rawDoseById = new Map();
  for (const dose of rawPrescriptions) {
    if (dose && typeof dose.id === 'string' && !rawDoseById.has(dose.id)) rawDoseById.set(dose.id, dose);
  }

  // Filter routine to unique eligible exercises, excluding legacy warmups and locked duplicates on daily_warmup days.
  const seen = new Set();
  const filteredIds = [];
  let hasSequence = false;
  for (const id of rawRoutine) {
    if (typeof id !== 'string' || seen.has(id) || !Object.hasOwn(eligible, id)) continue;
    if (['bf_A12', 'bf_A13'].includes(id)) continue;
    if (policy.warmupMode === 'daily_warmup' && lockedWarmupSet.has(id)) continue;
    const ex = eligible[id];
    if (sessionType === 'recovery' && !isRecoveryAllowedExercise(id, ex)) continue;
    if (ex.sequenceMinutes) {
      if (hasSequence) continue;
      hasSequence = true;
    }
    seen.add(id);
    filteredIds.push(id);
  }

  // Normalize each non-locked prescription strictly within domain bounds.
  let extraPrescriptions = filteredIds.map(id => {
    const ex = eligible[id];
    const rawDose = rawDoseById.get(id);
    const starter = ex.prescription || prescription(id, ex.type, 1, ex);

    let phase = rawDose && SESSION_PHASES.includes(rawDose.phase)
      ? rawDose.phase
      : exercisePhase({ sessionType }, id, ex);

    if (SKILL_CATEGORIES.has(ex.category)) phase = 'skill';
    if (id === 'bf_A01' && ['warmup', 'recovery'].includes(phase)) phase = 'accessory';
    if (sessionType === 'recovery') {
      if (policy.warmupMode === 'daily_warmup') {
        phase = phase === 'cooldown' ? 'cooldown' : 'recovery';
      } else if (!['warmup', 'recovery', 'cooldown'].includes(phase)) {
        phase = 'recovery';
      }
    }

    if (ex.sequenceMinutes && (!rawDose || !validSequenceDose(id, rawDose))) {
      return {
        id,
        sets: starter.sets ?? 1,
        value: String(starter.value ?? '1'),
        unit: VALID_DOSE_UNITS.has(starter.unit) ? starter.unit : 'minutes',
        restSeconds: clampInt(starter.restSeconds, 0, 300, 0),
        perSide: !!starter.perSide,
        phase,
      };
    }

    const unit = rawDose && VALID_DOSE_UNITS.has(rawDose.unit)
      ? rawDose.unit
      : (VALID_DOSE_UNITS.has(starter.unit) ? starter.unit : 'reps');
    const maxVal = unit === 'minutes' ? dailyTime : 120;
    const sets = clampInt(rawDose?.sets, 1, 5, clampInt(starter.sets, 1, 5, 2));
    const value = normalizeDoseValue(rawDose?.value ?? starter.value, unit, maxVal, String(starter.value ?? '8'));
    const restSeconds = clampInt(rawDose?.restSeconds, 0, 300, clampInt(starter.restSeconds, 0, 300, 45));
    const perSide = typeof rawDose?.perSide === 'boolean' ? rawDose.perSide : !!starter.perSide;

    const normalized = { id, sets, value, unit, restSeconds, perSide, phase };
    if (rawDose?.preparation !== undefined && ['strength', 'accessory'].includes(phase)) {
      normalized.preparation = normalizePreparation(rawDose.preparation, perSide, lang);
    }
    return normalized;
  });

  // Enforce jump volume <= 24 and no jump + jump-rope (I04) conflict.
  const hasJumpContacts = extraPrescriptions.some(dose => eligible[dose.id]?.jumpContacts && dose.unit === 'reps');
  if (hasJumpContacts) {
    extraPrescriptions = extraPrescriptions.filter(dose => eligible[dose.id]?.catalogCode !== 'I04');
  }
  let guard = 0;
  while (computeJumpContacts(extraPrescriptions, eligible) > 24 && guard < 40) {
    guard += 1;
    const jumpIndex = extraPrescriptions.findLastIndex(dose => eligible[dose.id]?.jumpContacts && dose.unit === 'reps');
    if (jumpIndex < 0) break;
    const target = extraPrescriptions[jumpIndex];
    const maxVal = Math.max(...String(target.value).split(/[–-]/).map(Number));
    if (target.sets > 1) {
      target.sets -= 1;
    } else if (maxVal > 4) {
      target.value = String(Math.max(4, Math.floor(maxVal / 2)));
    } else {
      extraPrescriptions.splice(jumpIndex, 1);
    }
  }

  // Build locked prefix on daily_warmup days, or ensure warmup on custom training days.
  const isLockedWarmup = policy.warmupMode === 'daily_warmup';
  const buildSession = (type, extras) => {
    let locked = [];
    if (isLockedWarmup && type !== 'rest') {
      locked = dailyWarmupPrescriptions(type === 'recovery' ? 'recovery' : 'warmup');
    }
    const orderedExtras = normalizePhaseOrder(extras.map(d => d.id), extras).prescriptions;
    // Keep locked 8-item dynamic warm-up pinned at indices 0..7.
    const combinedPrescriptions = isLockedWarmup
      ? [...locked, ...orderedExtras]
      : normalizePhaseOrder(orderedExtras.map(d => d.id), orderedExtras).prescriptions;

    // Ensure first strength exercise has a valid preparation set.
    if (type === 'training') {
      const firstStrength = combinedPrescriptions.find(dose => dose.phase === 'strength');
      if (firstStrength && !firstStrength.preparation) {
        firstStrength.preparation = defaultPreparation(firstStrength.perSide, lang);
      }
    }

    return {
      date,
      week: policy.week,
      day: policy.day,
      name: typeof aiDay.name === 'string' && aiDay.name.trim()
        ? aiDay.name.trim().slice(0, 120)
        : (lang === 'en' ? `Day ${policy.day}` : `第 ${policy.day} 天`),
      theme: typeof aiDay.theme === 'string' ? aiDay.theme.trim().slice(0, 200) : '',
      concept: typeof aiDay.concept === 'string' ? aiDay.concept.trim().slice(0, 1200) : '',
      coachAdvice: typeof aiDay.coachAdvice === 'string' ? aiDay.coachAdvice.trim().slice(0, 1200) : '',
      sessionType: type,
      warmupNote: typeof aiDay.warmupNote === 'string' && aiDay.warmupNote.trim()
        ? aiDay.warmupNote.trim().slice(0, 1200)
        : (lang === 'en' ? 'Begin with the 8-movement dynamic warm-up flow.' : '以標準八段動態暖身循序啟動關節與核心。'),
      cooldownNote: typeof aiDay.cooldownNote === 'string' && aiDay.cooldownNote.trim()
        ? aiDay.cooldownNote.trim().slice(0, 1200)
        : (lang === 'en' ? 'Finish with relaxed breathing and gentle mobility.' : '訓練後配合緩慢呼吸與放鬆收尾。'),
      routine: combinedPrescriptions.map(dose => dose.id),
      prescriptions: combinedPrescriptions,
    };
  };

  // On custom training days, guarantee at least 1 warmup-phase exercise.
  if (!isLockedWarmup && sessionType === 'training' && !extraPrescriptions.some(dose => dose.phase === 'warmup')) {
    const fallbackWarmupId = Object.keys(eligible).find(
      id => !extraPrescriptions.some(d => d.id === id)
        && id !== 'bf_A01'
        && ['warmup', 'recovery'].includes(eligible[id]?.category)
        && !eligible[id]?.sequenceMinutes,
    );
    if (fallbackWarmupId) {
      const ex = eligible[fallbackWarmupId];
      const starter = ex.prescription || { sets: 1, value: '6', unit: 'reps', restSeconds: 0, perSide: false };
      extraPrescriptions.unshift({
        id: fallbackWarmupId,
        sets: 1,
        value: normalizeDoseValue(starter.value, VALID_DOSE_UNITS.has(starter.unit) ? starter.unit : 'reps', 60, '6'),
        unit: VALID_DOSE_UNITS.has(starter.unit) ? starter.unit : 'reps',
        restSeconds: 0,
        perSide: !!starter.perSide,
        phase: 'warmup',
      });
    }
  }

  // Enforce MAX_DAY_EXERCISES cap before duration fitting.
  const maxExtras = isLockedWarmup ? MAX_DAY_EXERCISES - DAILY_WARMUP_IDS.length : MAX_DAY_EXERCISES;
  const trimPriority = ['cooldown', 'accessory', 'skill', 'recovery', 'strength', 'warmup'];
  const dropOneExtra = list => {
    for (const phase of trimPriority) {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (list[i].phase === phase) {
          list.splice(i, 1);
          return true;
        }
      }
    }
    if (list.length) {
      list.pop();
      return true;
    }
    return false;
  };

  while (extraPrescriptions.length > maxExtras) {
    if (!dropOneExtra(extraPrescriptions)) break;
  }

  // Progressively fit duration within dailyTime while preserving as much of AI's plan as possible.
  let candidate = buildSession(sessionType, extraPrescriptions);
  let fitGuard = 0;
  while (estimateSessionMinutes(candidate, eligible) > dailyTime && extraPrescriptions.length > 0 && fitGuard < 80) {
    fitGuard += 1;
    let adjusted = false;

    // Step 1: reduce long rest intervals on non-locked exercises.
    const restTarget = extraPrescriptions.find(dose => dose.restSeconds > 30);
    if (restTarget) {
      restTarget.restSeconds = restTarget.restSeconds > 60 ? 60 : restTarget.restSeconds > 45 ? 45 : 30;
      adjusted = true;
    }

    // Step 2: reduce preparation sets from 2 -> 1.
    if (!adjusted) {
      const prepTarget = extraPrescriptions.find(dose => dose.preparation?.sets > 1);
      if (prepTarget) {
        prepTarget.preparation = { ...prepTarget.preparation, sets: 1 };
        adjusted = true;
      }
    }

    // Step 3: reduce extra sets on lowest-priority phases first.
    if (!adjusted) {
      for (const phase of trimPriority) {
        const setTarget = [...extraPrescriptions].reverse().find(dose => dose.phase === phase && dose.sets > 1);
        if (setTarget) {
          setTarget.sets -= 1;
          adjusted = true;
          break;
        }
      }
    }

    // Step 4: drop the lowest-priority non-locked exercise.
    if (!adjusted) {
      if (!dropOneExtra(extraPrescriptions)) break;
    }

    candidate = buildSession(sessionType, extraPrescriptions);
  }

  // Handle degenerate empty-extra outcomes safely.
  if (isLockedWarmup && sessionType === 'training' && extraPrescriptions.length === 0) {
    sessionType = 'recovery';
    candidate = buildSession('recovery', []);
  }
  if (!isLockedWarmup && candidate.routine.length === 0) {
    return sanitizePeriodSession(buildRestDay(date, policy, aiDay, lang), { exercises: eligible, dailyTime });
  }

  try {
    if (isLockedWarmup && candidate.sessionType !== 'rest' && !isDailyWarmupComplete(candidate)) {
      throw new Error(`AI_DAILY_WARMUP_MISSING:${date}`);
    }
    return sanitizePeriodSession(candidate, { exercises: eligible, dailyTime });
  } catch {
    return sanitizeReferenceFallback(date, policy, eligible, dailyTime, lang);
  }
}

/**
 * Merge locked 8-item dynamic warm-up into AI chunk output and strictly validate
 * every session against domain rules, equipment/health eligibility, jump volume,
 * and duration limits. Protected dates are always restored verbatim.
 */
export function mergeAndValidateAIPeriodChunk(raw, {
  chunkDates = [],
  policies = [],
  exercises = {},
  context = {},
  dailyTime = 30,
  existingSessions = {},
  includeReport = false,
  lang = 'zh',
  reconcile = false,
} = {}) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.days)) {
    throw new Error('AI_INVALID_CHUNK_SHAPE');
  }
  const eligible = planningExercises(exercises, context);
  const lockedWarmupSet = new Set(DAILY_WARMUP_IDS);
  const policyByDate = new Map(policies.map(item => [item.date, item]));
  const rawByDate = new Map();

  for (const day of raw.days) {
    if (!day || !isCalendarDate(day.date) || rawByDate.has(day.date)) {
      if (reconcile) {
        if (day && isCalendarDate(day.date) && !rawByDate.has(day.date)) rawByDate.set(day.date, day);
        continue;
      }
      throw new Error('AI_INVALID_CHUNK_DATES');
    }
    rawByDate.set(day.date, day);
  }

  const sessions = [];
  for (const date of chunkDates) {
    const policy = policyByDate.get(date);
    if (!policy) throw new Error('AI_INVALID_CHUNK_DATES');

    if (policy.protected) {
      if (!existingSessions[date]) throw new Error('PROTECTED_SESSION_MISSING');
      sessions.push(preservePeriodSession(existingSessions[date], { exercises }));
      continue;
    }

    const aiDay = rawByDate.get(date);
    if (reconcile) {
      sessions.push(reconcileAIPeriodDay(aiDay, {
        date,
        policy,
        eligible,
        dailyTime: Number(dailyTime),
        lang,
      }));
      continue;
    }

    if (!aiDay) throw new Error(`AI_MISSING_DATE:${date}`);

    if (!SESSION_TYPES.includes(aiDay.sessionType)) {
      throw new Error(`AI_INVALID_SESSION_TYPE:${date}`);
    }
    if (policy.warmupMode === 'none' && aiDay.sessionType !== 'rest') {
      throw new Error(`AI_NON_TRAINING_DAY:${date}`);
    }

    const rawRoutine = Array.isArray(aiDay.routine) ? aiDay.routine : [];
    const rawPrescriptions = Array.isArray(aiDay.prescriptions) ? aiDay.prescriptions : [];
    if (rawRoutine.some(id => ['bf_A12', 'bf_A13'].includes(id))) {
      throw new Error(`AI_LEGACY_WARMUP:${date}`);
    }
    if (rawPrescriptions.some(dose => dose?.id === 'bf_A01' && ['warmup', 'recovery'].includes(dose.phase))) {
      throw new Error(`AI_AEROBIC_WARMUP:${date}`);
    }

    let sessionType = aiDay.sessionType;
    let routine = [...rawRoutine];
    let prescriptions = [...rawPrescriptions];

    if (policy.warmupMode === 'daily_warmup' && sessionType !== 'rest') {
      const warmupPhase = sessionType === 'recovery' ? 'recovery' : 'warmup';
      const lockedDoses = dailyWarmupPrescriptions(warmupPhase);
      const nonWarmupRoutine = routine.filter(id => !lockedWarmupSet.has(id));
      const nonWarmupPrescriptions = prescriptions
        .filter(dose => dose && !lockedWarmupSet.has(dose.id))
        .map(dose => (sessionType === 'recovery' && dose.phase === 'warmup' ? { ...dose, phase: 'recovery' } : dose));
      const orderedExtras = normalizePhaseOrder(nonWarmupRoutine, nonWarmupPrescriptions);
      routine = [...DAILY_WARMUP_IDS, ...orderedExtras.routine];
      prescriptions = [...lockedDoses, ...orderedExtras.prescriptions];
    } else if (sessionType === 'rest') {
      routine = [];
      prescriptions = [];
    } else if (policy.warmupMode === 'rest_recommended' && sessionType === 'recovery' && routine.length === 0) {
      sessionType = 'rest';
      routine = [];
      prescriptions = [];
    } else {
      const ordered = normalizePhaseOrder(routine, prescriptions);
      routine = ordered.routine;
      prescriptions = ordered.prescriptions;
    }

    const candidateSession = {
      date,
      week: policy.week,
      day: policy.day,
      name: typeof aiDay.name === 'string' && aiDay.name.trim()
        ? aiDay.name.trim().slice(0, 120)
        : (lang === 'en' ? `Day ${policy.day}` : `第 ${policy.day} 天`),
      theme: typeof aiDay.theme === 'string' ? aiDay.theme.trim().slice(0, 200) : '',
      concept: typeof aiDay.concept === 'string' ? aiDay.concept.trim().slice(0, 1200) : '',
      coachAdvice: typeof aiDay.coachAdvice === 'string' ? aiDay.coachAdvice.trim().slice(0, 1200) : '',
      sessionType,
      warmupNote: typeof aiDay.warmupNote === 'string' && aiDay.warmupNote.trim()
        ? aiDay.warmupNote.trim().slice(0, 1200)
        : (sessionType === 'rest'
          ? (lang === 'en' ? 'Rest day — no warm-up needed.' : '今日為休息日，不需額外暖身。')
          : (lang === 'en' ? 'Begin with the 8-movement dynamic warm-up flow.' : '以標準八段動態暖身循序啟動關節與核心。')),
      cooldownNote: typeof aiDay.cooldownNote === 'string' && aiDay.cooldownNote.trim()
        ? aiDay.cooldownNote.trim().slice(0, 1200)
        : (sessionType === 'rest'
          ? (lang === 'en' ? 'Rest day — focus on sleep and hydration.' : '今日為休息日，以睡眠與補水恢復為主。')
          : (lang === 'en' ? 'Finish with relaxed breathing and gentle mobility.' : '訓練後配合緩慢呼吸與放鬆收尾。')),
      routine,
      prescriptions,
    };

    // Enforce locked 8-item warm-up presence on daily_warmup active days
    if (policy.warmupMode === 'daily_warmup' && candidateSession.sessionType !== 'rest' && !isDailyWarmupComplete(candidateSession)) {
      throw new Error(`AI_DAILY_WARMUP_MISSING:${date}`);
    }

    // Validate strictly against eligible exercises (equipment, experience, partner, health)
    try {
      const sanitized = sanitizePeriodSession(candidateSession, { exercises: eligible, dailyTime: Number(dailyTime) });
      sessions.push(sanitized);
    } catch (error) {
      const estimated = estimateSessionMinutes(candidateSession, eligible);
      const detail = error.message === 'AI_SESSION_TOO_LONG'
        ? `AI_SESSION_TOO_LONG:${date}:${estimated}m>${dailyTime}m`
        : `${error.message}:${date}`;
      throw new Error(detail);
    }
  }

  const report = includeReport ? normalizeCoachReport(raw.report, lang) : null;
  return { sessions, report };
}

export function normalizeCoachReport(rawReport, lang = 'zh') {
  if (!rawReport || typeof rawReport !== 'object') return null;
  const reviewAndPraise = typeof rawReport.reviewAndPraise === 'string' ? rawReport.reviewAndPraise.trim().slice(0, 1100) : '';
  const reminders = Array.isArray(rawReport.reminders)
    ? rawReport.reminders.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim().slice(0, 220)).slice(0, 5)
    : [];
  const planOverview = typeof rawReport.planOverview === 'string' ? rawReport.planOverview.trim().slice(0, 1100) : '';
  const checkpoints = typeof rawReport.checkpoints === 'string' ? rawReport.checkpoints.trim().slice(0, 700) : '';
  if (!reviewAndPraise && !reminders.length && !planOverview && !checkpoints) return null;
  return {
    lang: lang === 'en' ? 'en' : 'zh',
    reviewAndPraise,
    reminders,
    planOverview,
    checkpoints,
  };
}

/**
 * Serialize structured coach report into clean Markdown <= 3,800 chars
 * so it stores cleanly inside existing Firestore planningPeriods.conclusion (<= 4,000).
 */
export function formatCoachReportMarkdown(report, lang = 'zh') {
  if (!report) return '';
  const headings = REPORT_HEADINGS[lang === 'en' ? 'en' : 'zh'];
  const sections = [];
  if (report.reviewAndPraise) sections.push(`### ${headings.reviewAndPraise}\n${report.reviewAndPraise}`);
  if (report.reminders?.length) {
    sections.push(`### ${headings.reminders}\n${report.reminders.map(item => `- ${item}`).join('\n')}`);
  }
  if (report.planOverview) sections.push(`### ${headings.planOverview}\n${report.planOverview}`);
  if (report.checkpoints) sections.push(`### ${headings.checkpoints}\n${report.checkpoints}`);
  const combined = sections.join('\n\n').trim();
  return combined.length <= MAX_CONCLUSION_CHARS
    ? combined
    : `${combined.slice(0, MAX_CONCLUSION_CHARS - 1).trimEnd()}…`;
}

/**
 * Parse a saved AI coach report back out of conclusion Markdown so saved period
 * overviews can render the same structured coach report cards.
 */
export function parseCoachReportMarkdown(conclusion = '') {
  if (typeof conclusion !== 'string' || !conclusion.includes('### ')) return null;
  const allHeadings = [
    ...Object.entries(REPORT_HEADINGS.zh),
    ...Object.entries(REPORT_HEADINGS.en),
  ];
  const result = { reviewAndPraise: '', reminders: [], planOverview: '', checkpoints: '' };
  const parts = conclusion.split(/^### /m).slice(1);
  let matched = 0;

  for (const part of parts) {
    const newline = part.indexOf('\n');
    if (newline < 0) continue;
    const heading = part.slice(0, newline).trim();
    const body = part.slice(newline + 1).trim();
    const entry = allHeadings.find(([, label]) => label === heading);
    if (!entry) continue;
    matched += 1;
    const [key] = entry;
    if (key === 'reminders') {
      result.reminders = body
        .split('\n')
        .map(line => line.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean);
    } else {
      result[key] = body;
    }
  }
  return matched >= 2 ? result : null;
}

/**
 * Orchestrate multi-week 1–28 day AI plan generation using an injected chunk caller
 * (works identically with BYOK Gemini client, Member Cloud Function proxy, or unit-test mocks).
 */
export async function generateAIPeriodPlan({
  exercises = {},
  profile = {},
  range,
  today = localDate(),
  existingSessions = {},
  protectedDates = [],
  previousSessions = [],
  logs = [],
  progressByWeek = {},
  readiness = [],
  metrics = [],
  userGoal = '',
  userMessage = '',
  lang = 'zh',
  callChunk,
  onProgress,
} = {}) {
  if (typeof callChunk !== 'function') throw new Error('AI_CALLER_REQUIRED');
  const cleanRange = normalizePlanningRange(range, today);
  const dates = enumeratePeriodDates(cleanRange);
  const context = normalizePlanningContext(profile?.context);
  const time = Number(profile?.time);
  if (!Number.isFinite(time) || time < 5 || time > 240) throw new Error('INVALID_PLANNING_TIME');
  const focus = ['balanced', 'strength', 'stability', 'coordination'].includes(profile?.focus) ? profile.focus : 'balanced';

  const existing = Array.isArray(existingSessions)
    ? Object.fromEntries(existingSessions.map(session => [session.date, session]))
    : existingSessions;
  const protectedSet = new Set(protectedDates);
  const preserved = dates
    .filter(date => protectedSet.has(date) && existing[date])
    .map(date => preservePeriodSession(existing[date], { exercises }));

  const unchanged = Object.values(Object.fromEntries(
    [...previousSessions, ...Object.values(existing)]
      .filter(session => isCalendarDate(session?.date) && (session.date < cleanRange.from || session.date > cleanRange.to))
      .map(session => [session.date, session]),
  ));

  const rollingHistory = [...unchanged, ...preserved];
  const recentSummary = summarizeRecentPerformance({
    today,
    logs,
    progressByWeek,
    readiness,
    sessions: rollingHistory,
    metrics,
    exercises,
    context,
  });

  const chunks = splitPeriodIntoChunks(dates);
  const lastEditableChunkIndex = chunks.reduce(
    (last, chunk, index) => (chunk.dates.some(date => !(protectedSet.has(date) && existing[date])) ? index : last),
    -1,
  );
  const sessions = [];
  const weeklySummaries = [];
  let coachReport = null;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const includeReport = index === lastEditableChunkIndex;
    onProgress?.({
      chunkIndex: index,
      totalChunks: chunks.length,
      from: chunk.dates[0],
      to: chunk.dates.at(-1),
    });

    const policies = resolveChunkDayPolicies(chunk.dates, {
      exercises,
      profile: { ...profile, context, focus },
      time,
      lang,
      today,
      protectedDates,
      existingSessions: existing,
      historySessions: rollingHistory,
      logs,
      progressByWeek,
      readiness,
    });

    const editableCount = policies.filter(item => !item.protected).length;
    let validated = null;

    if (editableCount === 0) {
      validated = {
        sessions: chunk.dates.map(date => preservePeriodSession(existing[date], { exercises })),
        report: null,
      };
    } else {
      const TRANSIENT_OUTPUT_ERRORS = new Set(['AI_INVALID_JSON', 'AI_INCOMPLETE_RESULT', 'AI_EMPTY_RESPONSE']);
      let correctionHint = '';
      let lastRaw = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const prompt = buildAIPeriodChunkPrompt({
          chunkDates: chunk.dates,
          chunkIndex: index,
          totalChunks: chunks.length,
          policies,
          exercises,
          profile: { ...profile, context, focus },
          time,
          lang,
          today,
          range: cleanRange,
          userGoal,
          userMessage,
          recentSummary,
          previousSessions: rollingHistory,
          includeReport,
          correctionHint,
        });
        let raw;
        try {
          raw = await callChunk({
            prompt,
            includeReport,
            chunkIndex: index,
            totalChunks: chunks.length,
            from: chunk.dates[0],
            to: chunk.dates.at(-1),
          });
        } catch (error) {
          if (attempt === 0 && TRANSIENT_OUTPUT_ERRORS.has(error?.message)) {
            correctionHint = 'Previous response was incomplete or invalid JSON. Keep concept/coachAdvice/report concise so the entire JSON object completes cleanly.';
            continue;
          }
          if (attempt === 1 && lastRaw && TRANSIENT_OUTPUT_ERRORS.has(error?.message)) {
            validated = mergeAndValidateAIPeriodChunk(lastRaw, {
              chunkDates: chunk.dates,
              policies,
              exercises,
              context,
              dailyTime: time,
              existingSessions: existing,
              includeReport,
              lang,
              reconcile: true,
            });
            break;
          }
          throw error;
        }
        if (raw && typeof raw === 'object' && Array.isArray(raw.days)) lastRaw = raw;
        try {
          validated = mergeAndValidateAIPeriodChunk(raw, {
            chunkDates: chunk.dates,
            policies,
            exercises,
            context,
            dailyTime: time,
            existingSessions: existing,
            includeReport,
            lang,
            reconcile: false,
          });
          break;
        } catch (error) {
          if (attempt === 1) {
            if (raw && typeof raw === 'object' && Array.isArray(raw.days)) {
              validated = mergeAndValidateAIPeriodChunk(raw, {
                chunkDates: chunk.dates,
                policies,
                exercises,
                context,
                dailyTime: time,
                existingSessions: existing,
                includeReport,
                lang,
                reconcile: true,
              });
              break;
            }
            throw error;
          }
          correctionHint = `Validation failed with "${error.message}". Ensure every date matches editableDates, leave a 2–3 minute buffer under dailyTime=${time} minutes, include preparation on the first strength exercise, use only IDs from the candidate list, avoid repeating locked 8 warm-up IDs, and keep E-class jump contacts <= 24.`;
        }
      }
    }

    sessions.push(...validated.sessions);
    rollingHistory.push(...validated.sessions.filter(session => !protectedSet.has(session.date)));
    if (validated.report) coachReport = validated.report;

    const strengthSessions = validated.sessions.filter(
      day => day.prescriptions?.some(dose => dose.phase === 'strength'),
    ).length;
    weeklySummaries.push({
      week: chunk.week,
      from: chunk.dates[0],
      to: chunk.dates.at(-1),
      focus,
      strengthSessions,
      trainingSessions: validated.sessions.filter(day => day.sessionType === 'training').length,
      recoverySessions: validated.sessions.filter(day => day.sessionType === 'recovery').length,
      restDays: validated.sessions.filter(day => day.sessionType === 'rest' || !day.routine?.length).length,
      minutes: validated.sessions.reduce((sum, day) => sum + estimateSessionMinutes(day, exercises), 0),
    });
  }

  const conclusion = coachReport
    ? formatCoachReportMarkdown(coachReport, lang)
    : weeklySummaries
      .map(summary => `${summary.week} (${summary.from} – ${summary.to}): ${summary.trainingSessions} ${lang === 'en' ? 'training' : '訓練'} · ${summary.recoverySessions} ${lang === 'en' ? 'recovery' : '恢復'}`)
      .join('\n');

  return {
    range: cleanRange,
    sessions,
    weeklySummaries,
    conclusion,
    coachReport,
    recentSummary,
    source: 'ai',
  };
}
