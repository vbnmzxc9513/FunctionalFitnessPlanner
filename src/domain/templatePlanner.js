import { competitionDaysAway, normalizePlanningContext, planningExercises, validateGeneratedPlan } from './planning.js';
import { dateForWeekDay, getWeekString, isCalendarDate, localDate } from './dates.js';
import { estimateSessionMinutes } from './sessions.js';
import { catalogExercises } from './exerciseCatalog.js';

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

function addTraining(day, available, lang, focus, kind, sets, familiar) {
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
    const upper = ['C01', 'C11', 'C03'].find(code => Object.values(available).some(exercise => exercise.catalogCode === code));
    if (upper) add(day, available, upper, 'strength', { sets: 1, value: '6', restSeconds: 90 });
    add(day, available, 'D01', 'accessory', { sets: 1, value: '4', restSeconds: 45 });
  }
  add(day, available, 'D09', 'cooldown', { sets: 1, value: '4' });
  if (familiar) {
    day.routine = day.routine.filter(id => familiar.has(id));
    day.prescriptions = day.prescriptions.filter(dose => familiar.has(dose.id));
  }
  const first = day.prescriptions.find(dose => dose.phase === 'strength');
  if (first) first.preparation = { sets: 1, value: '4', unit: 'reps', restSeconds: 30, perSide: first.perSide,
    instruction: available[first.id].equipmentOptions.some(option => !option.length)
      ? text(lang, '使用同一動作的徒手版本，保留餘力，不做到疲勞。', 'Use the bodyweight version of the same movement, with ample reserve and no fatigue.')
      : text(lang, '使用此動作已選器材的最輕可控阻力，保留餘力，不做到疲勞。', 'Use the lightest controllable resistance with this movement’s selected equipment, with ample reserve and no fatigue.') };
  day.warmupNote = text(lang, '先提高體溫與準備髖／踝活動，再做短步序或主項準備組；準備組不做到疲勞。', 'Raise body temperature and prepare hip/ankle motion, then perform short step practice or main-lift preparation without fatigue.');
  day.cooldownNote = text(lang, '安排短呼吸收尾，可依感受省略；不以拉伸取代睡眠與合理球量。', 'A short breathing finish is optional; stretching does not replace sleep and reasonable court load.');
}

function fitDay(day, available, minutes, lang) {
  // Remove lower-priority work instead of hiding time or shortening required rests.
  const removal = ['accessory', 'strength', 'warmup', 'skill', 'cooldown'];
  while (estimateSessionMinutes(day, available) > minutes && day.routine.length) {
    let index = -1;
    for (const phase of removal) {
      const matches = day.prescriptions.map((dose, i) => dose.phase === phase ? i : -1).filter(i => i >= 0);
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
    const first = day.prescriptions.find(dose => dose.phase === 'strength');
    if (first && !first.preparation) first.preparation = removed.preparation;
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
  const tired = options.lastWeekFeedback === -1 || (!!profile.recoveryNotes.trim() && !CLEAN_NOTES.test(profile.recoveryNotes.trim()));
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
      addTraining(day, available, lang, focus, 'strength', tired || taper || onCourt(number - 1) ? 1 : 2, taper ? familiar : null);
      day.coachAdvice = text(lang, '正式組保留約 2–3 次姿勢良好的餘力；若睡眠、精神或隔天反應變差，少做一組或改恢復。', 'Keep about 2–3 good-form repetitions in reserve. Reduce a set or switch to recovery if sleep, readiness or next-day symptoms worsen.');
    } else if (!skillUsed && !tired && !highLoad && !consecutive && (!taper || familiar.size)) {
      addTraining(day, available, lang, focus, 'skill', 1, taper ? familiar : null); skillUsed = true;
      day.coachAdvice = text(lang, '每次步序重置、依動作提示充分休息；獨自預設方向是協調練習，不稱作未知訊號反應。', 'Reset between trials and take the prescribed pauses. Predetermined solo directions train coordination, not reaction to an unknown cue.');
    } else makeRecovery(day, available, lang, reason);
    day = fitDay(day, available, minutes, lang);
    if (day.routine.length) day.coachAdvice += text(lang, ` 預估 ${estimateSessionMinutes(day, available)} 分鐘，含左右側、休息及準備組。`, ` About ${estimateSessionMinutes(day, available)} minutes including both sides, rest and preparation.`);
    return day;
  });
  const actualStrength = schedule.filter(day => day.prescriptions.some(dose => dose.phase === 'strength')).length;
  const assumption = !court.size ? text(lang, '未提供球日，先用一般週安排；補上球日後請重新排課。', 'Court days are missing; this is a general weekly example. Regenerate after adding court days.') : text(lang, `已把每週球日 ${profile.badmintonDays.join('、')}（含週末）納入；球日午休以恢復為主。`, `Court weekdays ${profile.badmintonDays.join(', ')} including weekends are counted; court-day lunch sessions emphasize recovery.`);
  const clinical = mode === 'rest' ? text(lang, '健康資訊包含模板無法安全解讀的限制，本週不開立體能動作；先確認允許的活動。', 'The health notes contain restrictions this template cannot safely interpret. No conditioning exercises are prescribed; confirm permitted activities first.') : mode === 'shoulder' ? text(lang, '肩部／治療限制未確認，暫不排正式肌力、揮拍、跳躍或肩部負重；走路也以治療端允許為前提。', 'Unclear shoulder/treatment restrictions mean no formal strength, swings, jumps or shoulder loading. Even walking requires clinician permission.') : text(lang, '這是固定規則起步課表，不能判斷傷勢或取代教練觀察。', 'This is a rules-based starting plan; it cannot assess injuries or replace coaching observation.');
  const competition = profile.competitionDate ? text(lang, '以本課表每一天到比賽的實際日期安排：前 10 天減量、前 2 天休息、賽後先恢復；沒有先前動作紀錄時，賽前只排恢復，不新增訓練。', 'Competition timing is calculated for each planned date: reduce extra work in the final 10 days, rest in the final 2, and recover afterward. Without prior movement history, taper days use recovery rather than new training.') : text(lang, '尚未提供比賽日期，不假設賽前週期。', 'No competition date was provided; no taper period is assumed.');
  const conclusion = text(lang, `本週免金鑰模板：${focus === 'balanced' ? '整體肌力、協調與穩定' : { strength: '肌力', stability: '穩定', coordination: '協調' }[focus]}。安排 ${actualStrength} 堂主要肌力，不要求每天練滿 ${minutes} 分鐘。`, `No-key weekly template: ${focus} focus with ${actualStrength} main strength sessions. Filling all ${minutes} minutes every day is not required.`)
    + `\n\n${assumption}\n\n${competition}\n\n${clinical}\n\n` + text(lang, '每天先檢查睡眠、精神和症狀；疲勞先減量。完成品質穩定、保有餘力且翌日無惡化兩次後，才考慮增加最小阻力；本模板不會因「太簡單」自動加重。每週回報難度與疲勞再排課；每 4–8 週回顧同版本動作表現。', 'Check sleep, readiness and symptoms daily; reduce work when fatigued. Only consider the smallest resistance increase after two quality sessions with reserve and no next-day worsening. “Too easy” does not automatically increase load. Report difficulty and fatigue weekly; review consistent movement measures every 4–8 weeks.');
  return validateGeneratedPlan({ conclusion, schedule }, eligible, minutes);
}
