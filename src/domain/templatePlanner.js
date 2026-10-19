import { competitionDaysAway, normalizePlanningContext, planningExercises, validateGeneratedPlan } from './planning.js';
import { dateForWeekDay, getWeekString, isCalendarDate, localDate } from './dates.js';
import { estimateSessionMinutes } from './sessions.js';
import { classifyBalanceExercise } from './weeklyBalance.js';
import { createWeeklyIntent, TARGET_PATTERNS } from './trainingPreferences.js';
import { catalogExercises } from './exerciseCatalog.js';
import { applyWeeklyChoices } from './weeklyChoices.js';
import { exercisePhase } from './phases.js';
import { resolveExerciseId } from './training.js';

import { adaptMobilityDay, createMobilityContext, mobilityDayNote } from './mobility.js';

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
  return { day, name: lang === 'en' ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day - 1] : ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'][day - 1],
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

function addTraining(day, available, lang, focus, kind, sets, familiar, upperOrdinal = 0, preferences = {}, warmupMinutes = 0) {
  day.sessionType = 'training';
  day.theme = kind === 'skill' ? text(lang, '短協調與步序', 'Short coordination and step sequencing') : text(lang, '全身肌力與穩定', 'Strength and stability');
  day.concept = text(lang, '先練清楚的步序與控制，再以可恢復的劑量累積力量；不追求疲勞。', 'Practice controlled movement, then build strength with recoverable doses rather than chasing fatigue.');
  add(day, available, 'A01', 'warmup');
  if (warmupMinutes >= 20 && day.routine.some(id => available[id]?.catalogCode === 'A01')) {
    const code = warmupMinutes >= 30 && Object.values(available).some(exercise => exercise.catalogCode === 'A13') ? 'A13' : 'A12';
    add(day, available, code, 'warmup');
  }
  if (!day.routine.some(id => available[id]?.sequenceMinutes)) add(day, available, kind === 'skill' ? 'A02' : 'A03', 'warmup', { value: '4' });
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
  if (!familiar && !day.routine.some(id => available[id]?.sequenceMinutes) && (preferences.targetRegions?.length || preferences.stiffnessRegions?.length)) {
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

function fitDay(day, available, minutes, lang, targets = [], selected = []) {
  const patterns = targets.flatMap(region => TARGET_PATTERNS[region] || []);
  const priority = dose => Number(available[dose.id]?.catalogCode === 'A01') * 4 + Number(selected.includes(dose.id)) * 2 + Number(classifyBalanceExercise(dose.id, available[dose.id]).patterns.some(pattern => patterns.includes(pattern)));
  // Remove lower-priority work instead of hiding time or shortening required rests.
  const removal = ['accessory', 'strength', 'warmup', 'skill', 'cooldown'];
  while (estimateSessionMinutes(day, available) > minutes && day.routine.length) {
    let index = -1;
    for (const phase of removal) {
      const hasFlow = day.routine.some(id => available[id]?.sequenceMinutes);
      const matches = day.prescriptions.map((dose, i) => dose.phase === phase && !(phase === 'warmup' && hasFlow) ? i : -1).filter(i => i >= 0);
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
  const calendarDays = options.calendarDays || [1, 2, 3, 4, 5];
  const inRange = day => !options.inRangeDates || options.inRangeDates.includes(dateForWeekDay(week, day));
  const permitted = day => profile.trainingDays.includes(day) && inRange(day) && !(options.protectedDates || []).includes(dateForWeekDay(week, day));
  const previousStrengthDates = [...new Set((options.previousSessions || []).filter(session => session.prescriptions?.some(dose => dose.phase === 'strength')
    || session.routine?.some(id => exercisePhase(session, id, exercises[resolveExerciseId(id, exercises)]) === 'strength')).map(session => session.date).filter(isCalendarDate))];
  const court = new Set(profile.badmintonDays);
  const onCourt = day => court.has(((day - 1 + 7) % 7) + 1);
  const recentMobility = createMobilityContext({ date: today, today, logs: options.logs, readiness: options.readiness, exercises, context: profile });
  const tired = recentMobility.recentSymptoms || recentMobility.recoveryPriority || options.lastWeekFeedback === -1 || profile.sorenessRegions.length > 0 || (!!profile.recoveryNotes.trim() && !CLEAN_NOTES.test(profile.recoveryNotes.trim()));
  const highLoad = profile.badmintonIntensity === 'hard';
  const longCourt = Number(profile.badmintonMinutes) >= 120;
  const consecutive = profile.badmintonDays.some(day => onCourt(day + 1));
  const strengthLimit = tired || (court.size >= 3 && (highLoad || longCourt || consecutive)) ? 1 : 2;
  const familiar = new Set((options.previousPlan?.schedule || []).flatMap(day => day.routine || []));
  const proximity = day => competitionDaysAway(profile.competitionDate, dateForWeekDay(week, day));
  const candidates = calendarDays.filter(day => permitted(day) && !previousStrengthDates.some(date => Math.abs(competitionDaysAway(date, dateForWeekDay(week, day))) < 2) && !onCourt(day) && mode === 'normal' && (proximity(day) === null || proximity(day) > 2 || proximity(day) < -5))
    .sort((a, b) => ((onCourt(a - 1) ? 2 : 0) + (onCourt(a + 1) ? 1 : 0)) - ((onCourt(b - 1) ? 2 : 0) + (onCourt(b + 1) ? 1 : 0)) || a - b);
  const strengthDays = [];
  for (const day of candidates) {
    const preservedStrength = previousStrengthDates.filter(date => getWeekString(new Date(`${date}T12:00:00`)) === week).length;
    if (strengthDays.length + preservedStrength >= strengthLimit) break;
    if (strengthDays.some(previous => Math.abs(day - previous) < 2)) continue;
    if (highLoad && onCourt(day + 1)) continue;
    const away = proximity(day);
    if (away !== null && away <= 10 && away >= 3 && (!familiar.size || strengthDays.length)) continue;
    strengthDays.push(day);
  }
  let skillUsed = false;
  let upperOrdinal = 0;
  const usedChoices = new Set();
  const mobilitySessions = [...(options.mobilitySessions || options.previousSessions || [])];
  const schedule = [...calendarDays].sort((a, b) => a - b).map(number => {
    let day = emptyDay(number, lang);
    const away = proximity(number);
    const taper = away !== null && away >= 3 && away <= 10;
    const immediate = away !== null && away >= 0 && away <= 2;
    const post = away !== null && away < 0 && away >= -5;
    const cause = post ? text(lang, '本日仍在賽後恢復期。', 'This date is in post-event recovery.')
      : taper && !familiar.size ? text(lang, '本日在賽前十天內，且沒有可沿用的熟悉動作紀錄。', 'This date is within ten days of competition, with no familiar movement history to retain.')
        : onCourt(number) ? text(lang, '今天另有羽球安排，午休保留低負荷活動。', 'Court play is scheduled today; lunch conditioning stays easy.')
          : highLoad && onCourt(number + 1) ? text(lang, '明天安排高強度球局，這次未在前一天加主要肌力。', 'Hard court play is scheduled tomorrow; no main strength work is added on the preceding day.')
            : tired ? text(lang, '恢復資訊觸發減量，保留低量活動與其他允許部位的舒適活動。', 'Recovery information calls for reduced work, with gentle activity in other permitted regions.')
              : text(lang, '本週肌力名額與前後課表間隔已納入，這天安排恢復。', 'Weekly strength capacity and neighboring-session spacing are accounted for; this day uses recovery.');
    const reason = cause + text(lang, ' 輕活動採可完整說話的速度；若疲勞或不適，改完整休息，不補強度。', ' Use a conversational pace. If tired or uncomfortable, rest rather than making up intensity.');
    if (recentMobility.recentSymptoms) return { ...day, coachAdvice: text(lang, '近期訓練或狀態回報有症狀惡化；先停止額外體能與針對性拉伸，確認狀態和可用活動後再排課。', 'Recent training or readiness records report worsening symptoms. Pause extra conditioning and targeted stretching; confirm your status and permitted activity before replanning.') };
    if (!permitted(number) || mode === 'rest' || immediate || (post && away >= -2)) return day;
    if (mode === 'shoulder') {
      makeRecovery(day, available, lang, text(lang, '治療限制尚未確認；僅在治療端允許走路時採這份輕活動，否則休息。無痛不代表已放行。', 'Treatment limits are unclear. Use this easy activity only if walking is permitted by your clinician; otherwise rest. Lack of pain is not clearance.'), true);
    } else if (post || onCourt(number) || (taper && !familiar.size)) makeRecovery(day, available, lang, reason);
    else if (strengthDays.includes(number)) {
      addTraining(day, available, lang, focus, 'strength', tired || taper || longCourt || onCourt(number - 1) ? 1 : 2, taper ? familiar : null, upperOrdinal++, !tired && !taper ? profile : {}, !tired && !taper ? minutes : 0);
      day.coachAdvice = text(lang, '正式組保留約 2–3 次姿勢良好的餘力；若睡眠、精神或隔天反應變差，少做一組或改恢復。', 'Keep about 2–3 good-form repetitions in reserve. Reduce a set or switch to recovery if sleep, readiness or next-day symptoms worsen.');
    } else if (!skillUsed && !tired && !highLoad && !consecutive && (!taper || familiar.size)) {
      addTraining(day, available, lang, focus, 'skill', 1, taper ? familiar : null, 0, !taper ? profile : {}, !taper ? minutes : 0); skillUsed = true;
      day.coachAdvice = text(lang, '每次步序重置、依動作提示充分休息；獨自預設方向是協調練習，不稱作未知訊號反應。', 'Reset between trials and take the prescribed pauses. Predetermined solo directions train coordination, not reaction to an unknown cue.');
    } else makeRecovery(day, available, lang, reason);
    if (mode === 'normal' && !taper && !post && !tired) {
      day = applyWeeklyChoices(day, available, profile.weeklyExerciseIds, usedChoices, lang);
      prepareMain(day, available, lang);
    }
    day = fitDay(day, available, minutes, lang, !taper && !tired ? profile.targetRegions : [], mode === 'normal' && !taper && !post && !tired ? profile.weeklyExerciseIds : []);
    let mobilityIntent;
    if (mode === 'normal' && !taper && !post) {
      mobilityIntent = createMobilityContext({ date: dateForWeekDay(week, number), today, sessions: mobilitySessions, logs: options.logs, progressByWeek: options.progressByWeek, readiness: options.readiness, context: profile, exercises, day });
      day = adaptMobilityDay(day, available, minutes, mobilityIntent, tired ? [] : profile.weeklyExerciseIds, { gentle: tired });
      day = fitDay(day, available, minutes, lang, profile.targetRegions, profile.weeklyExerciseIds);
    }
    const flow = day.routine.map(id => available[id]).find(exercise => exercise?.sequenceMinutes);
    if (flow) day.warmupNote = text(lang,
      `先做列出的 2 分鐘快走／踏步，再完成 ${flow.sequenceMinutes} 分鐘八段動態暖身。長按暖身查看每段做法；已含左右側與換姿勢，不另外加一輪。接著做列出的步序與主項輕量準備組（有列出時）。`,
      `Begin with the listed 2-minute walk/march, then the ${flow.sequenceMinutes}-minute eight-part dynamic flow. Hold the warm-up to see each step, including both sides and transitions; do not add another round. Continue with listed step practice and light lift preparation, when present.`);
    if (mobilityIntent) day.warmupNote += mobilityDayNote(day, available, mobilityIntent, lang);
    mobilitySessions.push({ ...day, date: dateForWeekDay(week, number) });
    for (const id of day.routine) usedChoices.add(id);
    if (day.routine.length) day.coachAdvice += text(lang, ` 預估 ${estimateSessionMinutes(day, available)} 分鐘，含左右側、休息及準備組。`, ` About ${estimateSessionMinutes(day, available)} minutes including both sides, rest and preparation.`);
    return day;
  });
  const actualStrength = schedule.filter(day => day.prescriptions.some(dose => dose.phase === 'strength')).length;
  const assumption = !court.size ? text(lang, '未提供球日，先用一般週安排；補上球日後請重新排課。', 'Court days are missing; this is a general weekly example. Regenerate after adding court days.') : text(lang, `已把每週球日 ${profile.badmintonDays.join('、')}（含週末）納入；球日午休以恢復為主。`, `Court weekdays ${profile.badmintonDays.join(', ')} including weekends are counted; court-day lunch sessions emphasize recovery.`);
  const clinical = mode === 'rest' ? text(lang, '健康資訊包含模板無法安全解讀的限制，本週不開立體能動作；先確認允許的活動。', 'The health notes contain restrictions this template cannot safely interpret. No conditioning exercises are prescribed; confirm permitted activities first.') : mode === 'shoulder' ? text(lang, '肩部／治療限制未確認，暫不排正式肌力、揮拍、跳躍或肩部負重；走路也以治療端允許為前提。', 'Unclear shoulder/treatment restrictions mean no formal strength, swings, jumps or shoulder loading. Even walking requires clinician permission.') : text(lang, '這是固定規則起步課表，不能判斷傷勢或取代教練觀察。', 'This is a rules-based starting plan; it cannot assess injuries or replace coaching observation.');
  const competition = profile.competitionDate ? text(lang, '以本課表每一天到比賽的實際日期安排：前 10 天減量、前 2 天休息、賽後先恢復；沒有先前動作紀錄時，賽前只排恢復，不新增訓練。', 'Competition timing is calculated for each planned date: reduce extra work in the final 10 days, rest in the final 2, and recover afterward. Without prior movement history, taper days use recovery rather than new training.') : text(lang, '尚未提供比賽日期，不假設賽前週期。', 'No competition date was provided; no taper period is assumed.');
  const selectedAway = calendarDays.filter(inRange).map(proximity).filter(value => value !== null);
  const competitionStatus = profile.competitionDate ? text(lang,
    `比賽日 ${profile.competitionDate}；本段${selectedAway.every(value => value > 10) ? '尚未進入賽前十天減量期' : '依各日期與比賽的距離調整，詳見每日原因'}。`,
    `Competition: ${profile.competitionDate}. ${selectedAway.every(value => value > 10) ? 'These dates are outside the final ten-day taper.' : 'Each date uses its actual event proximity; see daily reasons.'}`) : '';
  const noStrength = actualStrength === 0 ? text(lang,
    `本段未排主要肌力。${mode !== 'normal' ? '健康或治療限制優先。' : recentMobility.recentSymptoms ? '近期回報症狀惡化。' : schedule.find(day => day.routine.length && !court.has(day.day))?.coachAdvice || '可用日期、球量、比賽或時間條件沒有留下肌力安排；請檢查條件與每日原因。'}`,
    `No main strength work is scheduled. ${mode !== 'normal' ? 'Health or treatment limits take priority.' : recentMobility.recentSymptoms ? 'Recent records report worsening symptoms.' : schedule.find(day => day.routine.length && !court.has(day.day))?.coachAdvice || 'Availability, court load, competition or time leaves no strength session; check preferences and daily reasons.'}`) : '';
  const conclusion = text(lang, `本週免金鑰模板：${focus === 'balanced' ? '整體肌力、協調與穩定' : { strength: '肌力', stability: '穩定', coordination: '協調' }[focus]}。安排 ${actualStrength} 堂主要肌力，不要求每天練滿 ${minutes} 分鐘。`, `No-key weekly template: ${focus} focus with ${actualStrength} main strength sessions. Filling all ${minutes} minutes every day is not required.`)
    + `\n\n${noStrength ? noStrength + '\n\n' : ''}${assumption}\n\n${competitionStatus} ${competition}\n\n${clinical}\n\n` + text(lang, '每天先檢查睡眠、精神和症狀；疲勞先減量。完成品質穩定、保有餘力且翌日無惡化兩次後，才考慮增加最小阻力；本模板不會因「太簡單」自動加重。每週回報難度與疲勞再排課；每 4–8 週回顧同版本動作表現。', 'Check sleep, readiness and symptoms daily; reduce work when fatigued. Only consider the smallest resistance increase after two quality sessions with reserve and no next-day worsening. “Too easy” does not automatically increase load. Report difficulty and fatigue weekly; review consistent movement measures every 4–8 weeks.');
  const weeklyView = text(lang, '\n\n一般無限制、非賽前／恢復優先週，保留主肌力的目的性重複，以全身動態開場及短活動槽維護八個區域，參考當日主項、近兩天訓練／球日及滾動七天的活動間隔；球日走路後採一至兩項短動態活動。時間、器材、恢復與治療限制優先；安排不等於實做或實測活動度，缺少資料不推定失衡或要求補課。', '\n\nIn unrestricted weeks outside taper or recovery priority, main lifts repeat for a purpose. The dynamic opening and short mobility slots maintain eight regions using today’s main movements, the prior two days of training/court context and rolling seven-day gaps. Court days use easy walking plus one or two short dynamic drills. Time, equipment, recovery and treatment limits take priority. Scheduled work is not actual completion or measured range; missing data does not diagnose imbalance or require catch-up work.');
  const warmupStrategy = text(lang,
    '\n\n30 分鐘以上的一般訓練日優先以 2 分鐘快走／踏步接 10 分鐘全身動態暖身起手；20–29 分鐘採 6 分鐘精簡流程，再接當天步序與主項準備組；整套為一項流程、內含八段，時間全部計入。短課、停用此流程、疲勞、球日恢復、治療限制或賽前熟悉度優先時，依每天實際列出的精簡安排，不補做整套；休息日不另暖身。',
    '\n\nOrdinary sessions of at least 30 minutes prioritize a 2-minute walk/march and the 10-minute full-body flow; 20–29 minute sessions use the 6-minute compact flow, then the listed step practice and lift preparation. The flow is one tracked item containing eight parts, with all time included. Short sessions, disabled flows, fatigue, court-day recovery, treatment limits and taper familiarity take priority: follow each day’s actual shorter list without adding the full flow. Rest days need no extra warm-up.');
  return validateGeneratedPlan({ conclusion: conclusion + weeklyView + warmupStrategy, schedule, weeklyIntent: createWeeklyIntent(profile, focus, minutes) }, eligible, minutes, { calendarDays });
}
