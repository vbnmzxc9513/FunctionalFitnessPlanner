import { competitionDaysAway, normalizePlanningContext, planningExercises, validateGeneratedPlan } from './planning.js';
import { dateForWeekDay, getWeekString, isCalendarDate, localDate } from './dates.js';
import { doseSeconds, estimateSessionMinutes } from './sessions.js';
import { classifyBalanceExercise } from './weeklyBalance.js';
import { createWeeklyIntent, TARGET_PATTERNS } from './trainingPreferences.js';
import { catalogExercises } from './exerciseCatalog.js';
import { applyWeeklyChoices } from './weeklyChoices.js';

const FOCUSES = ['balanced', 'strength', 'stability', 'coordination'];
const CURATED = catalogExercises();
const CLEAN_NOTES = /^(?:無|沒有|沒有疼痛|沒有受傷|正常|none|no pain|no injuries|no restrictions)[。.!\s]*$/i;
const SHOULDER = /肩|shoulder|震波|shockwave|ESWT/i;
const OTHER_LIMIT = /膝|踝|腰|頸|髖|腳|腿|麻|無力|停止|休息|knee|ankle|back|neck|hip|leg|numb|weak|stop|rest/i;
const text = (lang, zh, en) => lang === 'en' ? en : zh;

function clinicalMode(profile) {
  const notes = profile.healthNotes.trim();
  const hasNotes = !!notes && !CLEAN_NOTES.test(notes);
  if (/麻|無力|功能下降|停止運動|醫囑休息|numb|weak|loss of function|no exercise/i.test(profile.recoveryNotes)) return 'rest';
  if (hasNotes && (!SHOULDER.test(notes) || OTHER_LIMIT.test(notes))) return 'rest';
  if (profile.healthStatus !== 'unrestricted' || hasNotes) return SHOULDER.test(notes) ? 'shoulder' : 'rest';
  return 'normal';
}

/** Manual additions share the template's conservative handling of unclear restrictions. */
export function manualPlanningExercises(exercises, context) {
  const profile = normalizePlanningContext(context);
  const mode = clinicalMode(profile);
  if (mode === 'rest') return {};
  const available = planningExercises(exercises, mode === 'normal' ? profile : { ...profile, healthStatus: 'restricted' });
  return mode === 'normal' ? available : Object.fromEntries(Object.entries(available).filter(([id, exercise]) => CURATED[id]?.catalogCode === 'I01' && exercise.catalogCode === 'I01'));
}

function emptyDay(day, lang) {
  return { day, name: lang === 'en' ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][day - 1] : ['星期一', '星期二', '星期三', '星期四', '星期五'][day - 1],
    theme: text(lang, '完整休息', 'Full rest'), concept: text(lang, '恢復也屬於訓練安排。', 'Recovery is part of the training plan.'),
    coachAdvice: text(lang, '不補課；若症狀或活動限制未確認，先向治療端確認。', 'Do not make up missed sessions. Confirm unclear symptoms or activity restrictions with your clinician.'),
    sessionType: 'rest', warmupNote: text(lang, '今天沒有體能課，不需要額外暖身。', 'No conditioning session today; no extra warm-up is required.'),
    cooldownNote: text(lang, '今天休息，不需要額外收操。', 'Rest today; no extra cooldown is required.'), routine: [], prescriptions: [] };
}

function add(day, available, code, phase, overrides = {}) {
  const match = Object.entries(available).find(([, exercise]) => exercise.catalogCode === code);
  if (!match || day.routine.includes(match[0])) return;
  const [id, exercise] = match;
  day.routine.push(id);
  day.prescriptions.push({ id, ...exercise.prescription, phase, ...overrides });
}

function prepareMain(day, available, lang) {
  const first = day.prescriptions.find(dose => dose.phase === 'strength');
  for (const dose of day.prescriptions) if (dose !== first) delete dose.preparation;
  if (!first) return;
  first.preparation = { sets: 1, value: first.unit === 'seconds' ? '10' : '4', unit: first.unit === 'seconds' ? 'seconds' : 'reps', restSeconds: 30, perSide: first.perSide,
    instruction: available[first.id].equipmentOptions.some(option => !option.length)
      ? text(lang, '使用同一動作的徒手版本，保留餘力，不做到疲勞。', 'Use the bodyweight version of the same movement, with ample reserve and no fatigue.')
      : text(lang, '使用此動作已選器材的最輕可控阻力，保留餘力，不做到疲勞。', 'Use the lightest controllable resistance with this movement’s selected equipment, with ample reserve and no fatigue.') };
}

function makeRecovery(day, available, lang, reason, shoulder = false) {
  day.sessionType = 'recovery';
  day.theme = text(lang, '輕活動與恢復', 'Easy activity and recovery');
  day.concept = text(lang, '保留球場與下一堂訓練的精神和動作品質。', 'Preserve readiness and movement quality for court play and the next session.');
  day.coachAdvice = reason;
  add(day, available, 'I01', 'recovery', { sets: 1, value: shoulder ? '3' : '5', unit: 'minutes', restSeconds: 0 });
  // Unclear treatment limits cannot be translated into prescribed stretching.
  if (!shoulder) add(day, available, 'A02', 'recovery', { sets: 1, value: '4' });
  day.warmupNote = text(lang, '輕活動從更慢的速度開始，不另加高負荷暖身。', 'Start the easy activity at a slower pace; no additional loaded warm-up.');
  day.cooldownNote = text(lang, '本次是輕活動，不必再加拉伸；有不適就停止。', 'This is easy activity; additional stretching is optional. Stop if uncomfortable.');
}

function addTraining(day, available, lang, focus, kind, sets, familiar, upperOrdinal = 0, preferences = {}) {
  day.sessionType = 'training';
  day.theme = kind === 'skill' ? text(lang, '短協調與步序', 'Short coordination and step sequencing') : text(lang, '全身肌力與穩定', 'Strength and stability');
  day.concept = text(lang, '先練清楚的步序與控制，再以可恢復的劑量累積力量；不追求疲勞。', 'Practice controlled movement, then build strength with recoverable doses rather than chasing fatigue.');
  add(day, available, 'A01', 'warmup');
  add(day, available, kind === 'skill' ? 'A02' : 'A03', 'warmup', { value: '4' });
  const skillCodes = focus === 'stability' ? ['E01', 'F03'] : ['F01', 'F02'];
  if (kind === 'skill' || focus !== 'strength') {
    const partner = Object.values(available).some(exercise => exercise.catalogCode === 'G01');
    const code = focus === 'coordination' && partner ? 'G01' : skillCodes[0];
    add(day, available, code, 'skill', { sets: 1, value: code === 'G01' ? '10' : '3', restSeconds: 60 });
    if (kind === 'skill') add(day, available, skillCodes[1], 'skill', { sets: 1, value: '3', restSeconds: 60 });
  }
  if (kind === 'strength') {
    const codes = focus === 'stability' ? ['B05', 'B01'] : ['B10', 'B01'];
    const main = codes.find(code => Object.values(available).some(exercise => exercise.catalogCode === code));
    if (main) add(day, available, main, 'strength', { sets, value: '6', restSeconds: 90 });
    const hinge = ['B11', 'B03', 'B04', 'B06'].find(code => Object.values(available).some(exercise => exercise.catalogCode === code));
    if (hinge) add(day, available, hinge, 'strength', { sets, value: '6', restSeconds: 90 });
    const upperAvailable = codes => codes.find(code => Object.values(available).some(exercise => exercise.catalogCode === code));
    const preferred = upperAvailable(['C01', 'C11', 'C03']);
    const opposite = preferred === 'C01' ? upperAvailable(['C11', 'C02', 'C03']) : upperAvailable(['C10', 'C01', 'C04']);
    // Use an existing upper-body slot; lack of a pulling tool does not invent a bodyweight pull.
    const upper = !familiar && upperOrdinal % 2 === 1 && opposite ? opposite : preferred;
    if (upper) add(day, available, upper, 'strength', { sets: 1, value: '6', restSeconds: 90 });
    add(day, available, 'D01', 'accessory', { sets: 1, value: '4', restSeconds: 45 });
  }
  add(day, available, 'D09', 'cooldown', { sets: 1, value: '4' });
  if (familiar) {
    day.routine = day.routine.filter(id => familiar.has(id));
    day.prescriptions = day.prescriptions.filter(dose => familiar.has(dose.id));
  }
  if (!familiar && preferences.targetRegions?.length) {
    const patterns = preferences.targetRegions.flatMap(region => TARGET_PATTERNS[region] || []);
    const priority = id => classifyBalanceExercise(id, available[id]).patterns.some(pattern => patterns.includes(pattern));
    if (preferences.targetRegions.includes('core')) for (const dose of day.prescriptions) {
      if (dose.phase === 'accessory' && priority(dose.id)) dose.phase = 'strength';
    }
    const strengthIds = day.prescriptions.filter(dose => dose.phase === 'strength').map(dose => dose.id).sort((a, b) => Number(priority(b)) - Number(priority(a)));
    let at = 0;
    day.routine = day.routine.map(id => day.prescriptions.find(dose => dose.id === id)?.phase === 'strength' ? strengthIds[at++] : id);
    day.prescriptions = day.routine.map(id => day.prescriptions.find(dose => dose.id === id));
  }
  if (!familiar && (preferences.targetRegions?.length || preferences.stiffnessRegions?.length)) {
    const firstMain = day.prescriptions.find(dose => dose.phase === 'strength');
    const mainPatterns = firstMain ? classifyBalanceExercise(firstMain.id, available[firstMain.id]).patterns : [];
    const relevant = mainPatterns.some(pattern => ['push', 'pull'].includes(pattern)) ? ['shoulder', 'thoracic'] : ['hip', 'ankle'];
    const region = preferences.stiffnessRegions?.find(item => relevant.includes(item)) || relevant[0];
    const code = { hip: 'A03', ankle: 'A02', thoracic: 'A06', shoulder: 'A09' }[region];
    const replacement = Object.entries(available).find(([, exercise]) => exercise.catalogCode === code);
    const slot = day.prescriptions.findIndex(dose => dose.phase === 'warmup' && available[dose.id]?.catalogCode !== 'A01');
    if (replacement && slot >= 0 && !day.routine.includes(replacement[0])) {
      const [id, exercise] = replacement;
      const oldId = day.prescriptions[slot].id;
      day.prescriptions[slot] = { id, ...exercise.prescription, sets: 1, value: '4', phase: 'warmup' };
      day.routine = day.routine.map(item => item === oldId ? id : item);
    }
    day.warmupNote = text(lang, '先提高體溫，再做列出的主項相關活動與輕量準備組；僵硬偏好只影響舒適活動，不代表治療或可以忍痛。', 'Raise body temperature, then use the listed movement-specific mobility and light preparation sets. Stiffness preferences guide comfortable activity, not treatment or permission to train through pain.');
  }
  prepareMain(day, available, lang);
  if (!day.warmupNote || !preferences.targetRegions?.length && !preferences.stiffnessRegions?.length || familiar) day.warmupNote = text(lang, '先提高體溫與準備髖／踝活動，再做短步序或主項準備組；準備組不做到疲勞。', 'Raise body temperature and prepare hip/ankle motion, then perform short step practice or main-lift preparation without fatigue.');
  day.cooldownNote = text(lang, '安排短呼吸收尾，可依感受省略；不以拉伸取代睡眠與合理球量。', 'A short breathing finish is optional; stretching does not replace sleep and reasonable court load.');
}

// Vary only a pre-existing low-load slot. Main lifts, preparation, heat-raising and
// recovery walking keep their purposes; a coverage chart never adds work.
function rotateMobility(day, available, minutes, lang, preferences = {}) {
  const preferred = preferences.stiffnessRegions || [];
  const rotation = [...preferred, ...['thoracic', 'hip', 'ankle'].filter(region => !preferred.includes(region))];
  const target = preferred.length ? rotation[(day.day - 1) % rotation.length] : ['thoracic', 'hip', 'ankle', 'thoracic', 'hip'][day.day - 1];
  const existingCoverage = day.routine.some(id => classifyBalanceExercise(id, available[id]).mobility.includes(target));
  if (existingCoverage) return day;
  const index = day.prescriptions.findIndex(dose => day.sessionType === 'recovery'
    ? dose.phase === 'recovery' && available[dose.id]?.catalogCode === 'A02'
    : dose.phase === 'cooldown' && available[dose.id]?.catalogCode === 'D09');
  if (index < 0) return day;
  const original = day.prescriptions[index];
  const originalSeconds = doseSeconds(original, available[original.id]);
  const originalMinutes = estimateSessionMinutes(day, available);
  const candidates = { shoulder: ['A09', 'H07'], thoracic: ['A11', 'A06', 'H12', 'A10'], hip: preferred.includes('hip') ? ['H03', 'A05', 'A03'] : ['A05', 'A03', 'H03'], ankle: preferred.includes('ankle') ? ['H01', 'A02', 'H02'] : ['A02', 'H01', 'H02'] }[target];
  for (const code of candidates) {
    const entry = Object.entries(available).find(([, exercise]) => exercise.catalogCode === code);
    if (!entry || day.routine.includes(entry[0])) continue;
    const [id, exercise] = entry;
    const displayName = lang === 'en' ? exercise.nameEn || exercise.name : exercise.name;
    const values = exercise.prescription.unit === 'seconds' ? ['20', '15'] : ['4', '3', '2'];
    for (const value of values) {
      const dose = { id, ...exercise.prescription, sets: 1, value, phase: original.phase };
      if (!preferred.length && doseSeconds(dose, exercise) > originalSeconds) continue;
      const next = { ...day, routine: day.routine.map(item => item === original.id ? id : item), prescriptions: day.prescriptions.map((item, at) => at === index ? dose : item) };
      if (estimateSessionMinutes(next, available) > (preferred.length ? minutes : Math.min(minutes, originalMinutes))) continue;
      if (original.phase === 'cooldown') next.cooldownNote = text(lang,
        `本次收尾安排「${displayName}」，保持輕鬆、可依感受省略；不需另補拉伸或追求最大幅度。`,
        `Finish with ${displayName} at an easy range; it may be omitted. No additional stretching or maximum range is required.`);
      else next.cooldownNote = text(lang,
        `本次低負荷活動已包含「${displayName}」，不另加收操；不適就停止，不為補齊區域加量。`,
        `This easy session includes ${displayName}; no extra cooldown is added. Stop if uncomfortable; do not add work to fill regional gaps.`);
      return next;
    }
  }
  return day;
}

function fitDay(day, available, minutes, lang, targets = [], selected = []) {
  const patterns = targets.flatMap(region => TARGET_PATTERNS[region] || []);
  const priority = dose => Number(available[dose.id]?.catalogCode === 'A01') * 4 + Number(selected.includes(dose.id)) * 2 + Number(classifyBalanceExercise(dose.id, available[dose.id]).patterns.some(pattern => patterns.includes(pattern)));
  // Remove lower-priority work instead of hiding time or shortening required rests.
  const removal = ['accessory', 'strength', 'warmup', 'skill', 'cooldown'];
  while (estimateSessionMinutes(day, available) > minutes && day.routine.length) {
    let index = -1;
    for (const phase of removal) {
      const matches = day.prescriptions.map((dose, i) => dose.phase === phase ? i : -1).filter(i => i >= 0);
      matches.sort((a, b) => Number(priority(day.prescriptions[b])) - Number(priority(day.prescriptions[a])));
      if (matches.length > 1 || ['accessory', 'cooldown'].includes(phase)) { index = matches.at(-1); if (index >= 0) break; }
    }
    if (index < 0) {
      const multi = day.prescriptions.find(dose => dose.sets > 1);
      if (multi) { multi.sets = 1; continue; }
      index = day.prescriptions.findIndex(dose => ['strength', 'skill'].includes(dose.phase));
    }
    if (index < 0) index = day.prescriptions.length - 1;
    const [removed] = day.prescriptions.splice(index, 1);
    day.routine = day.routine.filter(id => id !== removed.id);
    prepareMain(day, available, lang);
  }
  if (!day.routine.length || (day.sessionType === 'training' && !day.prescriptions.some(dose => dose.phase === 'warmup'))) return emptyDay(day.day, lang);
  if (!day.prescriptions.some(dose => ['skill', 'strength', 'accessory'].includes(dose.phase))) {
    day.sessionType = 'recovery'; day.theme = text(lang, '短恢復活動', 'Short recovery activity');
  }
  if (!day.prescriptions.some(dose => dose.phase === 'strength')) {
    day.warmupNote = text(lang, '從輕鬆速度開始，依序完成列出的活動；今天沒有肌力準備組。', 'Begin at an easy pace and follow the listed activities; there are no lift-preparation sets today.');
  }
  if (!day.prescriptions.some(dose => dose.phase === 'cooldown')) day.cooldownNote = text(lang, '本次沒有額外收操動作，可省略；不要在時間之外補做。', 'No extra cooldown is scheduled; it can be omitted. Do not add hidden work beyond the time limit.');
  return day;
}

/** Deterministic, conservative starting template; not a treatment or AI diagnosis. */
export function generateTemplatePlan(exercises, context, dailyTime, lang = 'zh', options = {}) {
  const minutes = Number(dailyTime);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 240) throw new Error('INVALID_PLANNING_TIME');
  const profile = normalizePlanningContext(context);
  const mode = clinicalMode(profile);
  const safeProfile = mode === 'normal' ? profile : { ...profile, healthStatus: 'restricted' };
  const eligible = planningExercises(exercises, safeProfile);
  const available = Object.fromEntries(Object.entries(eligible).filter(([id, exercise]) => CURATED[id]?.catalogCode === exercise.catalogCode && exercise.prescription && Array.isArray(exercise.equipmentOptions)));
  const focus = FOCUSES.includes(options.focus || options.goalFocus) ? options.focus || options.goalFocus : 'balanced';
  const today = isCalendarDate(options.currentDate) ? options.currentDate : localDate();
  const week = dateForWeekDay(options.currentWeek, 1) ? options.currentWeek : getWeekString(new Date(`${today}T12:00:00`));
  const court = new Set(profile.badmintonDays);
  const onCourt = day => court.has(((day - 1 + 7) % 7) + 1);
  const tired = options.lastWeekFeedback === -1 || profile.sorenessRegions.length > 0 || (!!profile.recoveryNotes.trim() && !CLEAN_NOTES.test(profile.recoveryNotes.trim()));
  const highLoad = profile.badmintonIntensity === 'hard' || Number(profile.badmintonMinutes) >= 120;
  const consecutive = profile.badmintonDays.some(day => onCourt(day + 1));
  const strengthLimit = tired || (court.size >= 3 && (highLoad || consecutive)) ? 1 : 2;
  const familiar = new Set((options.previousPlan?.schedule || []).flatMap(day => day.routine || []));
  const proximity = day => competitionDaysAway(profile.competitionDate, dateForWeekDay(week, day));
  const candidates = [1, 2, 3, 4, 5].filter(day => !onCourt(day) && mode === 'normal' && (proximity(day) === null || proximity(day) > 2 || proximity(day) < -5))
    .sort((a, b) => ((onCourt(a - 1) ? 2 : 0) + (onCourt(a + 1) ? 1 : 0)) - ((onCourt(b - 1) ? 2 : 0) + (onCourt(b + 1) ? 1 : 0)) || a - b);
  const strengthDays = [];
  for (const day of candidates) {
    if (strengthDays.length >= strengthLimit) break;
    if (strengthDays.some(previous => Math.abs(day - previous) < 2)) continue;
    if (highLoad && onCourt(day + 1)) continue;
    const away = proximity(day);
    if (away !== null && away <= 10 && away >= 3 && (!familiar.size || strengthDays.length)) continue;
    strengthDays.push(day);
  }
  let skillUsed = false;
  let upperOrdinal = 0;
  const usedChoices = new Set();
  const schedule = [1, 2, 3, 4, 5].map(number => {
    let day = emptyDay(number, lang);
    const away = proximity(number);
    const taper = away !== null && away >= 3 && away <= 10;
    const immediate = away !== null && away >= 0 && away <= 2;
    const post = away !== null && away < 0 && away >= -5;
    const reason = text(lang, '輕活動採可完整說話的速度；若疲勞或不適，改完整休息，不補強度。', 'Use a conversational pace. If tired or uncomfortable, choose full rest instead of making up intensity.');
    if (mode === 'rest' || immediate || (post && away >= -2)) return day;
    if (mode === 'shoulder') {
      makeRecovery(day, available, lang, text(lang, '治療限制尚未確認；僅在治療端允許走路時採這份輕活動，否則休息。無痛不代表已放行。', 'Treatment limits are unclear. Use this easy activity only if walking is permitted by your clinician; otherwise rest. Lack of pain is not clearance.'), true);
    } else if (post || onCourt(number) || (taper && !familiar.size)) makeRecovery(day, available, lang, reason);
    else if (strengthDays.includes(number)) {
      addTraining(day, available, lang, focus, 'strength', tired || taper || onCourt(number - 1) ? 1 : 2, taper ? familiar : null, upperOrdinal++, !tired && !taper ? profile : {});
      day.coachAdvice = text(lang, '正式組保留約 2–3 次姿勢良好的餘力；若睡眠、精神或隔天反應變差，少做一組或改恢復。', 'Keep about 2–3 good-form repetitions in reserve. Reduce a set or switch to recovery if sleep, readiness or next-day symptoms worsen.');
    } else if (!skillUsed && !tired && !highLoad && !consecutive && (!taper || familiar.size)) {
      addTraining(day, available, lang, focus, 'skill', 1, taper ? familiar : null, 0, !taper ? profile : {}); skillUsed = true;
      day.coachAdvice = text(lang, '每次步序重置、依動作提示充分休息；獨自預設方向是協調練習，不稱作未知訊號反應。', 'Reset between trials and take the prescribed pauses. Predetermined solo directions train coordination, not reaction to an unknown cue.');
    } else makeRecovery(day, available, lang, reason);
    if (mode === 'normal' && !taper && !post && !tired) {
      day = applyWeeklyChoices(day, available, profile.weeklyExerciseIds, usedChoices, lang);
      prepareMain(day, available, lang);
    }
    day = fitDay(day, available, minutes, lang, !taper && !tired ? profile.targetRegions : [], mode === 'normal' && !taper && !post && !tired ? profile.weeklyExerciseIds : []);
    if (mode === 'normal' && !taper && !post && !tired) day = rotateMobility(day, available, minutes, lang, profile);
    for (const id of day.routine) usedChoices.add(id);
    if (day.routine.length) day.coachAdvice += text(lang, ` 預估 ${estimateSessionMinutes(day, available)} 分鐘，含左右側、休息及準備組。`, ` About ${estimateSessionMinutes(day, available)} minutes including both sides, rest and preparation.`);
    return day;
  });
  const actualStrength = schedule.filter(day => day.prescriptions.some(dose => dose.phase === 'strength')).length;
  const assumption = !court.size ? text(lang, '未提供球日，先用一般週安排；補上球日後請重新排課。', 'Court days are missing; this is a general weekly example. Regenerate after adding court days.') : text(lang, `已把每週球日 ${profile.badmintonDays.join('、')}（含週末）納入；球日午休以恢復為主。`, `Court weekdays ${profile.badmintonDays.join(', ')} including weekends are counted; court-day lunch sessions emphasize recovery.`);
  const clinical = mode === 'rest' ? text(lang, '健康資訊包含模板無法安全解讀的限制，本週不開立體能動作；先確認允許的活動。', 'The health notes contain restrictions this template cannot safely interpret. No conditioning exercises are prescribed; confirm permitted activities first.') : mode === 'shoulder' ? text(lang, '肩部／治療限制未確認，暫不排正式肌力、揮拍、跳躍或肩部負重；走路也以治療端允許為前提。', 'Unclear shoulder/treatment restrictions mean no formal strength, swings, jumps or shoulder loading. Even walking requires clinician permission.') : text(lang, '這是固定規則起步課表，不能判斷傷勢或取代教練觀察。', 'This is a rules-based starting plan; it cannot assess injuries or replace coaching observation.');
  const competition = profile.competitionDate ? text(lang, '以本課表每一天到比賽的實際日期安排：前 10 天減量、前 2 天休息、賽後先恢復；沒有先前動作紀錄時，賽前只排恢復，不新增訓練。', 'Competition timing is calculated for each planned date: reduce extra work in the final 10 days, rest in the final 2, and recover afterward. Without prior movement history, taper days use recovery rather than new training.') : text(lang, '尚未提供比賽日期，不假設賽前週期。', 'No competition date was provided; no taper period is assumed.');
  const conclusion = text(lang, `本週免金鑰模板：${focus === 'balanced' ? '整體肌力、協調與穩定' : { strength: '肌力', stability: '穩定', coordination: '協調' }[focus]}。安排 ${actualStrength} 堂主要肌力，不要求每天練滿 ${minutes} 分鐘。`, `No-key weekly template: ${focus} focus with ${actualStrength} main strength sessions. Filling all ${minutes} minutes every day is not required.`)
    + `\n\n${assumption}\n\n${competition}\n\n${clinical}\n\n` + text(lang, '每天先檢查睡眠、精神和症狀；疲勞先減量。完成品質穩定、保有餘力且翌日無惡化兩次後，才考慮增加最小阻力；本模板不會因「太簡單」自動加重。每週回報難度與疲勞再排課；每 4–8 週回顧同版本動作表現。', 'Check sleep, readiness and symptoms daily; reduce work when fatigued. Only consider the smallest resistance increase after two quality sessions with reserve and no next-day worsening. “Too easy” does not automatically increase load. Report difficulty and fatigue weekly; review consistent movement measures every 4–8 weeks.');
  const weeklyView = text(lang, '\n\n一般無限制、非賽前／恢復優先週，保留主肌力的目的性重複，在既有低負荷槽輪替胸椎、髖與踝活動；不加動作或延長時間。器材、球日、恢復與治療限制優先，未涵蓋的區域不代表必須補課，也不以呼吸或肌力代替胸椎拉伸。', '\n\nIn unrestricted weeks outside taper or recovery priority, main lifts repeat for a purpose and existing easy slots rotate thoracic, hip and ankle mobility without extra exercises or time. Equipment, court load, recovery and treatment restrictions take priority. Uncovered regions do not require catch-up work; breathing and strength are not thoracic stretching.');
  return validateGeneratedPlan({ conclusion: conclusion + weeklyView, schedule, weeklyIntent: createWeeklyIntent(profile, focus, minutes) }, eligible, minutes);
}
