import { isCalendarDate, localDate } from './dates.js';
import { normalizePlanningContext, planningExercises } from './planning.js';
import { utf8Bytes } from './promptCandidates.js';
import { estimateSessionMinutes, sessionSections } from './sessions.js';
import { DAILY_WARMUP_IDS } from './quickWorkouts.js';

export const MAX_COACH_CONTEXT_BYTES = 24000;
export const MAX_CHAT_TURNS = 10;
export const MAX_USER_MESSAGE_CHARS = 1200;
export const MAX_MODEL_MESSAGE_CHARS = 4000;
export const MAX_REFINEMENT_MESSAGE_CHARS = 1800;
export const MAX_PLANNER_HANDOFF_CHARS = 600;
export const MAX_COACH_SWAPS = 2;

const LOCKED_WARMUP_SET = new Set(DAILY_WARMUP_IDS);
const DIGEST_GROUPS = ['lower', 'upper_push', 'upper_pull', 'core', 'power', 'full', 'mobility'];
const SWAP_TAG_RE = /\[\[\s*SWAP\s*:\s*([^\s\->|\]]+)\s*->\s*([^\s|\]]+)(?:\s*\|\s*([^\]]*))?\s*\]\]/gi;
const ANY_SWAP_TAG_RE = /\[\[\s*SWAP\s*:[^\]]*\]\]/gi;

function clipText(value, maxChars) {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function stripPii(value) {
  return String(value ?? '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, match => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(match.trim())) return match;
      return match.replace(/\D/g, '').length >= 8 ? '' : match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function trimToUtf8Bytes(text, maxBytes) {
  if (utf8Bytes(text) <= maxBytes) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (utf8Bytes(text.slice(0, mid)) <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return text.slice(0, low);
}

function summarizeSessionExercises(session, exercises = {}, { compact = false } = {}) {
  if (!session || !Array.isArray(session.routine) || !session.routine.length) return [];
  const sections = sessionSections(session, exercises, 1);
  return sections.flatMap(section =>
    section.items.map(entry => {
      const exercise = exercises[entry.id];
      const name = clipText(exercise?.name || entry.id, compact ? 36 : 60);
      if (compact) {
        return { id: entry.id, name, phase: section.phase };
      }
      const cue = clipText(exercise?.tip || exercise?.cue || '', 70);
      const easier = clipText(exercise?.easier || '', 50);
      const harder = clipText(exercise?.harder || '', 50);
      return {
        id: entry.id,
        name,
        phase: section.phase,
        sets: entry.dose.sets,
        value: String(entry.dose.value),
        unit: entry.dose.unit,
        perSide: Boolean(entry.dose.perSide),
        restSeconds: entry.dose.restSeconds ?? 0,
        ...(cue ? { cue } : {}),
        ...(easier ? { easier } : {}),
        ...(harder ? { harder } : {}),
      };
    }),
  );
}

function buildActiveSessionSnapshot(activeSession, exercises = {}, { compact = false } = {}) {
  if (!activeSession || typeof activeSession !== 'object') return null;
  const routine = Array.isArray(activeSession.routine) ? activeSession.routine : [];
  const sessionType = activeSession.sessionType || (routine.length ? 'training' : 'rest');
  return {
    date: isCalendarDate(activeSession.date) ? activeSession.date : null,
    day: Number.isInteger(activeSession.day) ? activeSession.day : null,
    theme: clipText(activeSession.theme || '', compact ? 50 : 90),
    sessionType,
    estimatedMinutes: estimateSessionMinutes(activeSession, exercises, 1),
    exerciseCount: routine.length,
    exercises: summarizeSessionExercises(activeSession, exercises, { compact }),
  };
}

function buildWeekScheduleSnapshot(schedule = [], exercises = {}, { compact = false } = {}) {
  if (!Array.isArray(schedule) || !schedule.length) return [];
  return schedule.slice(0, 7).map(day => {
    const routine = Array.isArray(day?.routine) ? day.routine : [];
    const sessionType = day?.sessionType || (routine.length ? 'training' : 'rest');
    const mainMoves = routine
      .filter(id => !LOCKED_WARMUP_SET.has(id))
      .slice(0, compact ? 3 : 6)
      .map(id => clipText(exercises[id]?.name || id, 32));
    return {
      date: isCalendarDate(day?.date) ? day.date : null,
      day: Number.isInteger(day?.day) ? day.day : null,
      theme: clipText(day?.theme || '', compact ? 40 : 65),
      sessionType,
      minutes: day ? estimateSessionMinutes(day, exercises, 1) : 0,
      exerciseCount: routine.length,
      ...(compact ? {} : { mainMoves }),
    };
  });
}

function sanitizeReadiness(readiness) {
  if (!readiness || typeof readiness !== 'object') return null;
  return {
    date: isCalendarDate(readiness.date) ? readiness.date : null,
    sleepHours: typeof readiness.sleepHours === 'number' ? readiness.sleepHours : null,
    fatigue: typeof readiness.fatigue === 'number' ? readiness.fatigue : null,
    soreness: typeof readiness.soreness === 'number' ? readiness.soreness : null,
    symptoms: typeof readiness.symptoms === 'string' ? readiness.symptoms : null,
    yesterdayCourtMinutes: typeof readiness.yesterdayCourtMinutes === 'number' ? readiness.yesterdayCourtMinutes : null,
    todayCourtIntensity: typeof readiness.todayCourtIntensity === 'string' ? readiness.todayCourtIntensity : null,
  };
}

function sanitizeMetrics(metrics = [], limit = 3) {
  if (!Array.isArray(metrics) || !metrics.length) return [];
  return metrics
    .filter(item => item && isCalendarDate(item.date))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-limit)
    .map(item => ({
      date: item.date,
      weightKg: typeof item.weight === 'number' ? item.weight : null,
      bodyFatPct: typeof item.bodyFat === 'number' ? item.bodyFat : null,
    }));
}

/**
 * Sanitize up to `limit` recent factual exercise logs (newest first),
 * omitting empty/null fields, stripping PII, and never fabricating missing values.
 */
export function sanitizeRecentLogs(exerciseLogs = [], exercises = {}, limit = 12) {
  if (!Array.isArray(exerciseLogs) || !exerciseLogs.length || !Number.isFinite(limit) || limit <= 0) return [];
  return exerciseLogs
    .filter(log => log && typeof log === 'object' && isCalendarDate(log.date) && typeof (log.exerciseId || log.id) === 'string' && String(log.exerciseId || log.id).trim())
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || String(a.exerciseId || a.id).localeCompare(String(b.exerciseId || b.id)))
    .slice(0, limit)
    .map(log => {
      const id = String(log.exerciseId || log.id).trim();
      const name = clipText(stripPii(exercises?.[id]?.name || id), 36);
      const entry = { date: log.date, id, name };

      if (Array.isArray(log.sets) && log.sets.length > 0) {
        entry.setsDone = log.sets.length;
        const setParts = log.sets
          .map(set => {
            if (typeof set === 'number' && Number.isFinite(set)) return String(set);
            if (!set || typeof set !== 'object' || typeof set.value !== 'number' || !Number.isFinite(set.value)) return '';
            if (log.perSide && typeof set.otherSide === 'number' && Number.isFinite(set.otherSide)) {
              return `${set.value}/${set.otherSide}`;
            }
            return String(set.value);
          })
          .filter(Boolean);
        if (setParts.length) {
          const unitSuffix = typeof log.unit === 'string' && log.unit && log.unit !== 'reps' ? ` ${log.unit}` : '';
          entry.actualReps = clipText(`${setParts.join(',')}${unitSuffix}`, 40);
        }
      }

      const cleanLabel = clipText(stripPii(log.resistanceLabel || ''), 28);
      const variant = typeof log.variant === 'string' ? log.variant.trim() : '';
      let resistance = '';
      if (typeof log.loadKg === 'number' && Number.isFinite(log.loadKg) && log.loadKg > 0) {
        const basisSuffix = log.loadBasis === 'per_dumbbell' ? '/hand' : log.loadBasis === 'stack' ? ' stack' : '';
        const prefix = variant && variant !== 'other' ? `${variant} ` : '';
        resistance = `${prefix}${log.loadKg}kg${basisSuffix}${cleanLabel ? ` (${cleanLabel})` : ''}`;
      } else if (variant === 'bodyweight') {
        resistance = cleanLabel ? `bodyweight (${cleanLabel})` : 'bodyweight';
      } else if (cleanLabel) {
        resistance = variant && variant !== 'other' ? `${variant}: ${cleanLabel}` : cleanLabel;
      } else if (variant) {
        resistance = variant;
      }
      resistance = clipText(resistance, 48);
      if (resistance) entry.resistance = resistance;

      if (typeof log.quality === 'string' && log.quality && log.quality !== 'unknown') {
        entry.quality = log.quality;
      }
      if (typeof log.rir === 'number' && Number.isFinite(log.rir)) {
        entry.reserve = `RIR ${log.rir}`;
      }
      if (typeof log.nextDay === 'string' && (log.nextDay === 'good' || log.nextDay === 'worse')) {
        entry.nextDay = log.nextDay;
      }

      return entry;
    });
}

/**
 * Build a compact grouped digest of user-eligible built-in exercises so the
 * coach can recommend valid swap IDs within the context byte budget.
 */
export function buildEligibleCatalogDigest(exercises = {}, profile = {}, { compact = false } = {}) {
  if (!exercises || typeof exercises !== 'object') return {};
  const eligible = planningExercises(exercises, normalizePlanningContext(profile?.context || profile));
  const perGroup = compact ? 5 : 10;
  const buckets = Object.fromEntries(DIGEST_GROUPS.map(group => [group, []]));

  const entries = Object.entries(eligible)
    .filter(([id, exercise]) => exercise && !exercise.custom && !id.startsWith('custom_') && !LOCKED_WARMUP_SET.has(id))
    .sort(([idA, exA], [idB, exB]) => Number(Boolean(exB.priority)) - Number(Boolean(exA.priority)) || idA.localeCompare(idB));

  for (const [id, exercise] of entries) {
    const group = DIGEST_GROUPS.includes(exercise.type) ? exercise.type : 'full';
    if (buckets[group].length >= perGroup) continue;
    buckets[group].push(`${id}:${clipText(exercise.name || id, compact ? 16 : 22)}`);
  }

  return Object.fromEntries(Object.entries(buckets).filter(([, list]) => list.length > 0));
}

function sanitizeRecentSummary(recentSummary, { compact = false } = {}) {
  if (!recentSummary || typeof recentSummary !== 'object') return null;
  return {
    lookbackDays: recentSummary.lookbackDays ?? 28,
    hasHistory: Boolean(recentSummary.hasHistory),
    trainingDays: Number(recentSummary.trainingDays || 0),
    loggedDays: Number(recentSummary.loggedDays || 0),
    completedCount: Number(recentSummary.completedCount || 0),
    loggedExercisesCount: Number(recentSummary.loggedExercisesCount || 0),
    loggedSetsCount: Number(recentSummary.loggedSetsCount || 0),
    positiveNextDayCount: Number(recentSummary.positiveNextDayCount || 0),
    worseNextDayCount: Number(recentSummary.worseNextDayCount || 0),
    latestFeedback: recentSummary.latestFeedback ?? null,
    latestFeedbackWeek: recentSummary.latestFeedbackWeek ?? null,
    topTypes: Array.isArray(recentSummary.topTypes) ? recentSummary.topTypes.slice(0, 3) : [],
    readiness: recentSummary.readiness || null,
    metrics: recentSummary.metrics || null,
    mobilityGaps: Array.isArray(recentSummary.mobilityGaps)
      ? recentSummary.mobilityGaps.slice(0, compact ? 4 : 8).map(item => ({
        area: item.area,
        gapDays: item.gapDays,
      }))
      : [],
  };
}

function sanitizeProfile(profile = {}, { compact = false } = {}) {
  const context = normalizePlanningContext(profile?.context || profile);
  return {
    focus: ['balanced', 'strength', 'stability', 'coordination'].includes(profile?.focus) ? profile.focus : 'balanced',
    dailyTimeMinutes: Number(profile?.time) || 30,
    goal: clipText(stripPii(profile?.goal || ''), compact ? 140 : 320),
    trainingDays: context.trainingDays,
    badmintonDays: context.badmintonDays,
    badmintonMinutes: context.badmintonMinutes,
    badmintonIntensity: context.badmintonIntensity,
    equipment: context.equipment,
    experience: context.experience,
    competitionDate: context.competitionDate || null,
    targetRegions: context.targetRegions,
    stiffnessRegions: context.stiffnessRegions,
    sorenessRegions: context.sorenessRegions,
    recoveryState: context.recoveryState,
    healthStatus: context.healthStatus,
    healthNotes: clipText(stripPii(context.healthNotes || ''), compact ? 100 : 240),
    recoveryNotes: clipText(stripPii(context.recoveryNotes || ''), compact ? 100 : 240),
  };
}

function buildCoachPersona(lang, safeToday) {
  if (lang === 'en') {
    return [
      `You are a warm, encouraging, evidence-informed badminton functional strength & conditioning coach (today is ${safeToday}).`,
      'Coaching principles:',
      '1. Tone: Warm, practical, supportive, and specific to badminton movement mechanics (split-step, lunge braking, hip hinge drive, overhead rotational chain, scapular stability, core anti-rotation, and 8-region dynamic mobility).',
      '2. Strict factual grounding: ONLY cite numbers, dates, exercises, and trends that explicitly appear in the de-identified JSON snapshot below. NEVER fabricate completed workouts, sets, streaks, or improvements when absent (if hasHistory is false or data is null, acknowledge it gently and focus on actionable guidance). When referencing past weights, reps, or soreness, cite ONLY values present in recentLogs or recentSummary.',
      '3. Medical safety boundary: NEVER provide medical diagnoses, prescribe clinical rehabilitation, or give medical clearance. If the user reports acute/worsening pain, numbness, tingling, radiating pain, joint locking/instability, or muscle weakness, advise stopping the aggravating movement, conservative rest, and evaluation by a physician or physical therapist.',
      '4. Actionable swaps: When recommending an exercise swap for today’s workout, pick ONLY from eligibleCatalog IDs (never invent IDs and never replace the 8 locked warm-up IDs). If suggesting a concrete 1-to-1 swap for a non-warmup exercise currently in activeSession, optionally append a tag on its own line at the end: [[SWAP:oldId->newId|short reason]] (max 2 swaps per reply) so the app can show a 1-click apply button.',
      '5. Format: Respond in clear English using concise Markdown (short headings or bullet points, scannable on mobile).',
      '',
      'De-identified athlete context snapshot (JSON):',
    ].join('\n');
  }

  return [
    `你是一位溫暖、有鼓勵性且具科學依據的羽球功能性體能教練（今天日期：${safeToday}）。`,
    '教練溝通守則：',
    '1. 語氣與專業：語氣溫暖、務實且能給學員信心，善於把訓練動作連結到羽球專項動力鏈（啟動步、弓步急停煞車、髖鉸鏈發力、過頭揮拍旋轉鏈、肩胛與旋轉肌穩定、核心抗旋轉與八大關節動態活動度）。',
    '2. 嚴格事實根據：只能引用下方去識別化 JSON 快照中真實存在的日期、動作、組數與數據，絕對不可編造未紀錄的完成天數、次數或進步幅度；若 hasHistory 為 false 或資料為空，請溫和說明目前紀錄較少並直接給出實用建議。提及過去重量、次數、保留次數或痠痛反應時，只能引用 recentLogs 或 recentSummary 中實際存在的數值。',
    '3. 醫療安全界線：絕不做醫療診斷、不開立臨床復健處方、不給予醫療復出許可。若學員提到急性或惡化疼痛、麻木、刺痛、放射痛、關節卡住不穩或明顯無力，請務必建議停止誘發動作、保守休息並儘速由醫師或物理治療師評估。',
    '4. 可執行動作替換：若建議替換今日課表的動作，只能從 eligibleCatalog 裡挑選合適 ID（絕不自創 ID，且不可替換鎖定的 8 項動態暖身）。若對 activeSession 中非暖身動作提出具體一對一替換，可在回覆最後另起一行附上 [[SWAP:oldId->newId|簡短原因]]（每次回覆最多 2 個），讓系統顯示一鍵套用按鈕。',
    '5. 回答格式：使用繁體中文與簡潔 Markdown（短標題與條列重點，方便手機閱讀）。',
    '',
    '學員去識別化訓練快照（JSON）：',
  ].join('\n');
}

/**
 * Build a budgeted UTF-8 system instruction + de-identified JSON snapshot
 * for the AI Badminton Coach chat (strictly <= MAX_COACH_CONTEXT_BYTES).
 */
export function buildCoachChatSystemContext({
  today,
  lang = 'zh',
  activeSession = null,
  schedule = [],
  exercises = {},
  profile = {},
  recentSummary = null,
  readiness = null,
  metrics = [],
  exerciseLogs = [],
} = {}) {
  const safeToday = isCalendarDate(today) ? today : localDate();
  const safeLang = lang === 'en' ? 'en' : 'zh';
  const header = buildCoachPersona(safeLang, safeToday);

  const assemble = snapshot => `${header}\n${JSON.stringify(snapshot)}`;

  const fullSnapshot = {
    today: safeToday,
    profile: sanitizeProfile(profile, { compact: false }),
    activeSession: buildActiveSessionSnapshot(activeSession, exercises, { compact: false }),
    weekSchedule: buildWeekScheduleSnapshot(schedule, exercises, { compact: false }),
    recentSummary: sanitizeRecentSummary(recentSummary, { compact: false }),
    recentLogs: sanitizeRecentLogs(exerciseLogs, exercises, 12),
    todayReadiness: sanitizeReadiness(readiness),
    recentMetrics: sanitizeMetrics(metrics, 3),
    eligibleCatalog: buildEligibleCatalogDigest(exercises, profile, { compact: false }),
  };

  let output = assemble(fullSnapshot);
  if (utf8Bytes(output) <= MAX_COACH_CONTEXT_BYTES) return output;

  const compactSnapshot = {
    today: safeToday,
    profile: sanitizeProfile(profile, { compact: true }),
    activeSession: buildActiveSessionSnapshot(activeSession, exercises, { compact: true }),
    weekSchedule: buildWeekScheduleSnapshot(schedule, exercises, { compact: true }),
    recentSummary: sanitizeRecentSummary(recentSummary, { compact: true }),
    recentLogs: sanitizeRecentLogs(exerciseLogs, exercises, 5),
    todayReadiness: sanitizeReadiness(readiness),
    recentMetrics: sanitizeMetrics(metrics, 1),
    eligibleCatalog: buildEligibleCatalogDigest(exercises, profile, { compact: true }),
  };

  output = assemble(compactSnapshot);
  if (utf8Bytes(output) <= MAX_COACH_CONTEXT_BYTES) return output;

  const minimalSnapshot = {
    today: safeToday,
    profile: {
      focus: compactSnapshot.profile.focus,
      dailyTimeMinutes: compactSnapshot.profile.dailyTimeMinutes,
      badmintonDays: compactSnapshot.profile.badmintonDays,
      equipment: compactSnapshot.profile.equipment,
      competitionDate: compactSnapshot.profile.competitionDate,
    },
    activeSession: compactSnapshot.activeSession
      ? {
        date: compactSnapshot.activeSession.date,
        theme: compactSnapshot.activeSession.theme,
        sessionType: compactSnapshot.activeSession.sessionType,
        estimatedMinutes: compactSnapshot.activeSession.estimatedMinutes,
        exerciseCount: compactSnapshot.activeSession.exerciseCount,
      }
      : null,
    recentSummary: compactSnapshot.recentSummary
      ? {
        hasHistory: compactSnapshot.recentSummary.hasHistory,
        trainingDays: compactSnapshot.recentSummary.trainingDays,
        completedCount: compactSnapshot.recentSummary.completedCount,
        loggedSetsCount: compactSnapshot.recentSummary.loggedSetsCount,
      }
      : null,
    todayReadiness: compactSnapshot.todayReadiness,
  };

  output = assemble(minimalSnapshot);
  if (utf8Bytes(output) <= MAX_COACH_CONTEXT_BYTES) return output;

  return trimToUtf8Bytes(output, MAX_COACH_CONTEXT_BYTES);
}

/**
 * Return 4 concise, badminton-specific 1-tap starter prompts tailored to the athlete's context.
 */
export function buildCoachQuickPrompts({
  activeSession = null,
  recentSummary = null,
  readiness = null,
  lang = 'zh',
} = {}) {
  const en = lang === 'en';
  const hasHistory = Boolean(recentSummary?.hasHistory);
  const hasWorkoutToday = Boolean(
    activeSession
    && Array.isArray(activeSession.routine)
    && activeSession.routine.length > 0
    && activeSession.sessionType !== 'rest',
  );
  const themeLabel = clipText(activeSession?.theme || '', 24);
  const hasFatigueOrCourt = Boolean(
    (typeof readiness?.fatigue === 'number' && readiness.fatigue >= 3)
    || (typeof readiness?.soreness === 'number' && readiness.soreness >= 3)
    || ['worse', 'red_flags'].includes(readiness?.symptoms)
    || (typeof readiness?.yesterdayCourtMinutes === 'number' && readiness.yesterdayCourtMinutes > 0)
    || ['light', 'hard'].includes(readiness?.todayCourtIntensity),
  );
  const topGap = Array.isArray(recentSummary?.mobilityGaps) && recentSummary.mobilityGaps.length
    ? recentSummary.mobilityGaps[0]
    : null;

  if (en) {
    return [
      {
        id: 'review',
        label: hasHistory ? '28-day progress review' : 'Start my baseline',
        prompt: hasHistory
          ? 'Review my last 28 days of recorded training, highlight what I did well, and suggest 1–2 practical priorities next.'
          : 'I am just getting started with this planner. How should I build a steady first-month badminton strength and mobility baseline?',
      },
      {
        id: 'today',
        label: hasWorkoutToday ? 'Today’s badminton mechanics' : 'Rest-day recovery tips',
        prompt: hasWorkoutToday
          ? `How do today’s exercises${themeLabel ? ` (${themeLabel})` : ''} transfer to badminton footwork, lunges, or overhead power, and what are the top form cues?`
          : 'Today is a rest or open day. What light mobility or recovery habits best help my badminton court performance?',
      },
      {
        id: 'readiness',
        label: hasFatigueOrCourt ? 'Adjust for fatigue / court' : 'Court & gym balance',
        prompt: hasFatigueOrCourt
          ? 'Based on my latest readiness and court load, how should I adjust today’s intensity or volume to stay fresh and safe?'
          : 'How should I balance badminton court days with off-court strength sessions so my legs and shoulder stay fresh?',
      },
      {
        id: 'balance',
        label: 'Strength & 8-region mobility',
        prompt: topGap
          ? 'Check my weekly badminton strength balance and 8-region dynamic mobility coverage. Which areas need more attention?'
          : 'How do I tell if my weekly strength patterns (lunge, hinge, push/pull, core) and 8-region mobility are well balanced for badminton?',
      },
    ];
  }

  return [
    {
      id: 'review',
      label: hasHistory ? '回顧近 28 天表現' : '建立第一階段基準',
      prompt: hasHistory
        ? '請根據我近 28 天的真實訓練紀錄給我一份溫暖回顧與肯定，並指出接下來最值得優先加強的 1–2 個重點。'
        : '我剛開始使用這套羽球體能規劃，請問第一個階段該怎麼建立穩定的肌力與動態活動度基準？',
    },
    {
      id: 'today',
      label: hasWorkoutToday ? '今天課表的羽球發力' : '休息日恢復建議',
      prompt: hasWorkoutToday
        ? `請解析今天課表${themeLabel ? `（${themeLabel}）` : ''}的動作對羽球步法、弓步急停或揮拍發力有什麼幫助，以及最關鍵的發力提示？`
        : '今天沒有排定肌力訓練，請問在休息日或空檔日可以做哪些輕量活動度與恢復習慣來幫助下次上場打球？',
    },
    {
      id: 'readiness',
      label: hasFatigueOrCourt ? '依疲勞與球局調整強度' : '球日與重訓怎麼搭配',
      prompt: hasFatigueOrCourt
        ? '根據我最近的疲勞／痠痛或打球負荷，今天該怎麼微調訓練強度或組數，才能兼顧安全與隔天腳步清爽？'
        : '請問羽球打球日跟場外肌力訓練應該怎麼錯開與搭配，才能兼顧力量進步又不影響場上移動速度？',
    },
    {
      id: 'balance',
      label: '本週肌力與八區活動度',
      prompt: topGap
        ? '請幫我檢視本週課表的羽球肌力平衡與八大關節活動度涵蓋狀況，哪些部位目前最需要補齊？'
        : '請問該怎麼檢視我每週的下肢分腿、髖鉸鏈、上肢推拉、核心與八大關節活動度是否足夠均衡？',
    },
  ];
}

/**
 * Clean, bound, and normalize multi-turn chat history for Gemini `contents`.
 * - Keeps only valid `'user'` / `'model'` entries with non-empty text
 * - Trims user text <= MAX_USER_MESSAGE_CHARS and model text <= MAX_MODEL_MESSAGE_CHARS
 * - Merges consecutive identical roles cleanly
 * - Keeps at most `maxTurns * 2` entries and guarantees the first entry is `'user'`
 */
export function normalizeCoachHistory(messages = [], { maxTurns = MAX_CHAT_TURNS } = {}) {
  if (!Array.isArray(messages) || !messages.length) return [];
  const safeMaxTurns = Math.max(1, Number.isInteger(maxTurns) ? maxTurns : MAX_CHAT_TURNS);
  const maxEntries = safeMaxTurns * 2;

  const merged = [];
  for (const item of messages) {
    if (!item || (item.role !== 'user' && item.role !== 'model')) continue;
    if (typeof item.text !== 'string') continue;
    const limit = item.role === 'user' ? MAX_USER_MESSAGE_CHARS : MAX_MODEL_MESSAGE_CHARS;
    const text = item.text.trim().slice(0, limit);
    if (!text) continue;

    const last = merged.at(-1);
    if (last && last.role === item.role) {
      last.text = `${last.text}\n\n${text}`.slice(0, limit);
    } else {
      merged.push({ role: item.role, text });
    }
  }

  let sliced = merged.length > maxEntries ? merged.slice(-maxEntries) : merged;
  while (sliced.length && sliced[0].role !== 'user') {
    sliced = sliced.slice(1);
  }
  return sliced;
}

/**
 * Build a concise, <= 1800-char refinement message combining the athlete's
 * conversational tweak request, optional original questionnaire note,
 * and a compact summary of the current AI draft.
 */
export function buildRefinementMessage(currentSessions = [], feedback = '', lang = 'zh', originalMessage = '') {
  const cleanFeedback = String(feedback ?? '').replace(/\s+/g, ' ').trim();
  if (!cleanFeedback) return '';

  const en = lang === 'en';
  const feedbackLimit = 600;
  const boundedFeedback = clipText(cleanFeedback, feedbackLimit);
  const boundedOriginal = clipText(originalMessage || '', 300);
  const originalLine = boundedOriginal
    ? (en ? `\nOriginal athlete note: ${boundedOriginal}` : `\n原本補充需求：${boundedOriginal}`)
    : '';
  const header = en
    ? `Draft refinement request: ${boundedFeedback}${originalLine}\nKeep all other valid days, locked 8-item warm-up, protected dates, and safety rules intact. Current draft summary:`
    : `學員微調需求：${boundedFeedback}${originalLine}\n請在不破壞鎖定八段暖身、受保護日期與安全／時間上限的前提下微調下列草稿。目前草稿摘要：`;

  if (!Array.isArray(currentSessions) || !currentSessions.length) {
    return header.slice(0, MAX_REFINEMENT_MESSAGE_CHARS);
  }

  const lines = [];
  let length = header.length;

  for (const session of currentSessions) {
    if (!session || typeof session !== 'object') continue;
    const date = isCalendarDate(session.date) ? session.date : (session.day ? `D${session.day}` : '?');
    const type = session.sessionType || (session.routine?.length ? 'training' : 'rest');
    const theme = clipText(session.theme || '', 28);
    const mainIds = (Array.isArray(session.routine) ? session.routine : [])
      .filter(id => !LOCKED_WARMUP_SET.has(id))
      .slice(0, 5);
    const movesPart = mainIds.length ? ` [${mainIds.join(',')}]` : '';
    const line = `${date}(${type}): ${theme}${movesPart}`;
    if (length + 1 + line.length > MAX_REFINEMENT_MESSAGE_CHARS) break;
    lines.push(line);
    length += 1 + line.length;
  }

  const result = lines.length ? `${header}\n${lines.join('\n')}` : header;
  return result.slice(0, MAX_REFINEMENT_MESSAGE_CHARS);
}

/**
 * Strip complete or trailing partial `[[SWAP:...]]` markers from live streaming text
 * so raw action tags never flash in the UI while tokens are arriving.
 */
export function stripStreamingSwapTags(text = '') {
  const source = String(text ?? '');
  if (!source) return '';
  const withoutComplete = source
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const hadTag = /\[\[\s*SWAP\s*:/i.test(line);
      if (!hadTag) {
        acc.push(line);
        return acc;
      }
      const cleaned = line
        .replace(ANY_SWAP_TAG_RE, '')
        .replace(/\[\[\s*SWAP\s*:[^\]]*$/i, '')
        .trimEnd();
      if (cleaned.trim()) acc.push(cleaned);
      return acc;
    }, [])
    .join('\n');
  return withoutComplete.trim();
}

/**
 * Extract validated 1-to-1 exercise swap actions from an AI Coach reply
 * and strip ALL `[[SWAP:...]]` markers cleanly from `cleanText`.
 */
export function parseCoachActionSuggestions(text = '', { activeSession = null, eligibleExercises = {}, exercises = null } = {}) {
  const source = String(text ?? '');
  if (!source) return { cleanText: '', swaps: [] };

  const routine = Array.isArray(activeSession?.routine) ? activeSession.routine : [];
  const routineSet = new Set(routine);
  const eligible = eligibleExercises && typeof eligibleExercises === 'object' ? eligibleExercises : {};
  const catalog = exercises && typeof exercises === 'object' ? exercises : eligible;

  const swaps = [];
  const usedOldIds = new Set();
  const usedNewIds = new Set();

  for (const match of source.matchAll(SWAP_TAG_RE)) {
    if (swaps.length >= MAX_COACH_SWAPS) break;
    const oldId = String(match[1] || '').trim();
    const newId = String(match[2] || '').trim();
    const reason = clipText(match[3] || '', 120);

    if (!oldId || !newId || oldId === newId) continue;
    if (!routineSet.has(oldId) || LOCKED_WARMUP_SET.has(oldId)) continue;
    if (routineSet.has(newId)) continue;
    if (!Object.hasOwn(eligible, newId)) continue;

    const target = eligible[newId];
    if (!target || typeof target !== 'object' || target.active === false || target.deleted) continue;
    if (usedOldIds.has(oldId) || usedNewIds.has(newId)) continue;

    usedOldIds.add(oldId);
    usedNewIds.add(newId);
    swaps.push({
      oldId,
      oldName: clipText(catalog[oldId]?.name || eligible[oldId]?.name || oldId, 48),
      newId,
      newName: clipText(target.name || catalog[newId]?.name || newId, 48),
      reason,
    });
  }

  const cleanLines = [];
  for (const line of source.split(/\r?\n/)) {
    const hasSwapTag = /\[\[\s*SWAP\s*:[^\]]*\]\]/i.test(line);
    if (!hasSwapTag) {
      cleanLines.push(line);
      continue;
    }
    const stripped = line.replace(ANY_SWAP_TAG_RE, '').trimEnd();
    if (stripped.trim()) cleanLines.push(stripped);
  }

  const cleanText = cleanLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { cleanText, swaps };
}

function stripMarkdownForNote(text = '') {
  return String(text ?? '')
    .replace(ANY_SWAP_TAG_RE, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a concise <= 600-char note from the latest 1–2 user questions
 * and coach recommendations so the athlete can carry chat context into AI Period Planner.
 */
export function buildCoachToPlannerNote(messages = [], lang = 'zh') {
  const normalized = normalizeCoachHistory(messages);
  if (!normalized.length) return '';

  const en = lang === 'en';
  const userMsgs = normalized
    .filter(item => item.role === 'user')
    .slice(-2)
    .map(item => clipText(stripPii(stripMarkdownForNote(item.text)), 110))
    .filter(Boolean);
  const modelMsgs = normalized
    .filter(item => item.role === 'model')
    .slice(-2)
    .map(item => clipText(stripPii(stripMarkdownForNote(item.text)), 175))
    .filter(Boolean);

  if (!userMsgs.length && !modelMsgs.length) return '';

  const parts = [en ? 'From AI Coach discussion:' : '延續 AI 教練討論：'];
  if (userMsgs.length) {
    const userSummary = clipText(userMsgs.join(en ? ' / ' : '；'), 200);
    parts.push(en ? `Goals/Questions: ${userSummary}` : `需求與提問：${userSummary}`);
  }
  if (modelMsgs.length) {
    const coachSummary = clipText(modelMsgs.join(en ? ' / ' : '；'), 340);
    parts.push(en ? `Coach recommendations: ${coachSummary}` : `教練建議重點：${coachSummary}`);
  }

  const joined = parts.join('\n');
  if (joined.length <= MAX_PLANNER_HANDOFF_CHARS) return joined;
  return `${joined.slice(0, MAX_PLANNER_HANDOFF_CHARS - 1).trimEnd()}…`;
}

