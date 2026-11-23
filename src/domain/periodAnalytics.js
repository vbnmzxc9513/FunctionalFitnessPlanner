import { dateForWeekDay, getWeekString, isCalendarDate, localDate } from './dates.js';
import { estimateSessionMinutes } from './sessions.js';
import { createMobilityContext, MOBILITY_AREAS, MOBILITY_LABELS, mobilityAreas, scheduledMobility } from './mobility.js';
import { classifyBalanceExercise } from './weeklyBalance.js';
import { enumeratePeriodDates } from './periodPlanning.js';
import { normalizePlanningContext } from './planning.js';
import { matchesTrainingTarget } from './trainingTargets.js';

const DAY_MS = 86400000;

const PATTERN_META = [
  { key: 'squat_lunge', zh: '下肢蹲／分腿煞車', en: 'Squat & lunge', targets: ['legs', 'quadriceps', 'glutes', 'adductors'] },
  { key: 'hinge', zh: '髖鉸鏈／臀腿後', en: 'Hinge & posterior', targets: ['posterior', 'glutes', 'hamstrings'] },
  { key: 'push', zh: '上肢推力', en: 'Upper push', targets: ['upper', 'chest', 'serratus'] },
  { key: 'pull', zh: '上肢拉力／肩胛', en: 'Upper pull & scapula', targets: ['upper', 'back', 'scapular', 'rotator_cuff'] },
  { key: 'core', zh: '核心穩定／抗旋', en: 'Core stability', targets: ['core'] },
  { key: 'footwork_reaction', zh: '步法／爆發協調', en: 'Footwork & power', targets: ['calves'] },
  { key: 'mobility', zh: '動態活動度', en: 'Dynamic mobility', targets: [] },
];

const TYPE_LABELS = {
  zh: {
    mobility: '活動度',
    lower: '下肢肌力',
    core: '核心穩定',
    upper_pull: '上肢拉',
    upper_push: '上肢推',
    full: '全身複合',
    power: '爆發力',
  },
  en: {
    mobility: 'Mobility',
    lower: 'Lower body',
    core: 'Core',
    upper_pull: 'Upper pull',
    upper_push: 'Upper push',
    full: 'Full body',
    power: 'Power',
  },
};

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function isoWeekday(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
}

function shortDate(date) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
}

function sessionKind(session) {
  if (!session) return 'unplanned';
  const type = session.sessionType || (session.routine?.length ? 'training' : 'rest');
  if (type === 'rest' || !session.routine?.length) return 'rest';
  if (type === 'recovery') return 'recovery';
  if (session.prescriptions?.some(dose => dose.phase === 'strength')) return 'strength';
  if (session.prescriptions?.some(dose => ['skill', 'accessory'].includes(dose.phase))) return 'control';
  return 'training';
}

/**
 * Summarize factual training activity over the lookback window.
 * Produces only deterministic counts derived from recorded logs, completions,
 * readiness entries and metrics—never estimates unrecorded work or medical status.
 */
export function summarizeRecentPerformance({
  today = localDate(),
  logs = [],
  progressByWeek = {},
  readiness = [],
  sessions = [],
  metrics = [],
  exercises = {},
  context = {},
  lookbackDays = 28,
} = {}) {
  const safeToday = isCalendarDate(today) ? today : localDate();
  const windowDays = Math.max(7, Math.min(90, Number(lookbackDays) || 28));
  const since = shiftDate(safeToday, -(windowDays - 1));
  const recent7 = shiftDate(safeToday, -6);

  const activeDates = new Set();
  const loggedDates = new Set();
  const typeCounts = {};
  let completedCount = 0;
  let loggedSetsCount = 0;
  let loggedExercisesCount = 0;
  let positiveNextDayCount = 0;
  let worseNextDayCount = 0;
  let pendingNextDayCount = 0;

  for (const log of Array.isArray(logs) ? logs : []) {
    if (!isCalendarDate(log?.date) || log.date < since || log.date > safeToday) continue;
    activeDates.add(log.date);
    loggedDates.add(log.date);
    loggedExercisesCount += 1;
    loggedSetsCount += Array.isArray(log.sets) ? log.sets.length : 0;
    if (log.nextDay === 'good') positiveNextDayCount += 1;
    else if (log.nextDay === 'worse') worseNextDayCount += 1;
    else if (log.nextDay === 'pending' && log.date < safeToday) pendingNextDayCount += 1;
    const type = exercises[log.exerciseId]?.type;
    if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
  }

  const weeks = Object.keys(progressByWeek || {})
    .filter(week => /^\d{4}-W\d{2}$/.test(week))
    .sort((a, b) => b.localeCompare(a));

  let latestFeedback = null;
  let latestFeedbackWeek = null;
  for (const week of weeks) {
    const record = progressByWeek[week];
    if (!record) continue;
    if (latestFeedback === null && record.feedbackProvided && [-1, 0, 1].includes(record.feedbackValue)) {
      latestFeedback = record.feedbackValue;
      latestFeedbackWeek = week;
    }
    const completed = record.completed || {};
    const completedAt = record.completedAt || {};
    const types = record.exerciseTypes || {};
    for (const [key, done] of Object.entries(completed)) {
      if (done !== true) continue;
      const match = /^day([1-7])_(.+)$/.exec(key);
      if (!match) continue;
      const dayNum = Number(match[1]);
      const exerciseId = match[2];
      const date = isCalendarDate(completedAt[key]) ? completedAt[key] : dateForWeekDay(week, dayNum);
      if (!isCalendarDate(date) || date < since || date > safeToday) continue;
      activeDates.add(date);
      completedCount += 1;
      const type = types[key] || exercises[exerciseId]?.type;
      if (type) typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
  }

  const recentReadiness = (Array.isArray(readiness) ? readiness : [])
    .filter(item => isCalendarDate(item?.date) && item.date >= recent7 && item.date <= safeToday)
    .sort((a, b) => b.date.localeCompare(a.date));

  const sleepEntries = recentReadiness.map(item => item.sleepHours).filter(value => typeof value === 'number');
  const avgSleepHours = sleepEntries.length
    ? Math.round((sleepEntries.reduce((sum, value) => sum + value, 0) / sleepEntries.length) * 10) / 10
    : null;
  const highFatigueDays = recentReadiness.filter(item => typeof item.fatigue === 'number' && item.fatigue >= 3).length;
  const highSorenessDays = recentReadiness.filter(item => typeof item.soreness === 'number' && item.soreness >= 3).length;
  const symptomAlerts = recentReadiness.filter(item => ['worse', 'red_flags'].includes(item.symptoms)).length;
  const reportedCourtDays = recentReadiness.filter(
    item => (typeof item.yesterdayCourtMinutes === 'number' && item.yesterdayCourtMinutes > 0)
      || ['light', 'hard'].includes(item.todayCourtIntensity),
  ).length;

  const recentMetrics = (Array.isArray(metrics) ? metrics : [])
    .filter(item => isCalendarDate(item?.date) && item.date <= safeToday)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latestMetric = recentMetrics.at(-1) || null;
  const previousMetric = recentMetrics.length >= 2 ? recentMetrics.at(-2) : null;
  const weightDeltaKg = typeof latestMetric?.weight === 'number' && typeof previousMetric?.weight === 'number'
    ? Math.round((latestMetric.weight - previousMetric.weight) * 10) / 10
    : null;

  const profile = normalizePlanningContext(context);
  const mobilityContext = createMobilityContext({
    date: safeToday,
    today: safeToday,
    sessions,
    logs,
    progressByWeek,
    readiness,
    context: profile,
    exercises,
  });

  const topTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([type, count]) => ({ type, count }));

  const hasHistory = activeDates.size > 0 || completedCount > 0 || loggedExercisesCount > 0;

  return {
    lookbackDays: windowDays,
    since,
    today: safeToday,
    hasHistory,
    trainingDays: activeDates.size,
    loggedDays: loggedDates.size,
    completedCount,
    loggedExercisesCount,
    loggedSetsCount,
    positiveNextDayCount,
    worseNextDayCount,
    pendingNextDayCount,
    latestFeedback,
    latestFeedbackWeek,
    topTypes,
    readiness: {
      entries: recentReadiness.length,
      avgSleepHours,
      highFatigueDays,
      highSorenessDays,
      symptomAlerts,
      reportedCourtDays,
    },
    metrics: latestMetric ? {
      latestDate: latestMetric.date,
      weightKg: latestMetric.weight ?? null,
      weightDeltaKg,
    } : null,
    mobilityGaps: mobilityContext.ranked.map(item => ({
      area: item.area,
      gapDays: item.gapDays,
      dates: item.dates,
    })),
  };
}

/**
 * Compute deterministic chart & overview data for any 1–28 day period preview or overview.
 * Shared between Free Template plans and AI Coach plans.
 */
export function buildPeriodAnalytics({
  sessions = [],
  exercises = {},
  context = {},
  range,
  protectedDates = [],
  recentSummary = null,
  lang = 'zh',
} = {}) {
  const en = lang === 'en';
  const profile = normalizePlanningContext(context);
  const protectedSet = new Set(protectedDates);
  const courtSet = new Set(profile.badmintonDays);
  const targetSet = new Set(profile.targetRegions);
  const sessionByDate = Object.fromEntries(
    (Array.isArray(sessions) ? sessions : [])
      .filter(session => isCalendarDate(session?.date))
      .map(session => [session.date, session]),
  );

  let dates = [];
  try {
    dates = range ? enumeratePeriodDates(range) : Object.keys(sessionByDate).sort();
  } catch {
    dates = Object.keys(sessionByDate).sort();
  }

  const weekdayFormat = new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { weekday: 'short', timeZone: 'UTC' });

  const dailySeries = dates.map(date => {
    const session = sessionByDate[date] || null;
    const day = isoWeekday(date);
    const kind = sessionKind(session);
    const minutes = session ? estimateSessionMinutes(session, exercises) : 0;
    const prescriptions = session?.prescriptions || [];
    const warmupCount = prescriptions.filter(dose => dose.phase === 'warmup').length;
    const mainCount = prescriptions.filter(dose => ['skill', 'strength', 'accessory'].includes(dose.phase)).length;
    const cooldownCount = prescriptions.filter(dose => ['recovery', 'cooldown'].includes(dose.phase)).length;
    return {
      date,
      day,
      week: getWeekString(new Date(`${date}T12:00:00`)),
      label: shortDate(date),
      weekday: weekdayFormat.format(new Date(`${date}T12:00:00Z`)),
      kind,
      sessionType: session?.sessionType || (session?.routine?.length ? 'training' : 'rest'),
      minutes,
      isCourtDay: courtSet.has(day) || !!session?.badminton || !!session?.courtDay,
      protected: protectedSet.has(date),
      warmupCount,
      mainCount,
      cooldownCount,
    };
  });

  const patternDaySets = Object.fromEntries(PATTERN_META.map(item => [item.key, new Set()]));
  const patternSlots = Object.fromEntries(PATTERN_META.map(item => [item.key, 0]));

  for (const date of dates) {
    const session = sessionByDate[date];
    if (!session?.routine?.length) continue;
    for (const id of session.routine) {
      const exercise = exercises[id];
      const classification = classifyBalanceExercise(id, exercise);
      for (const pattern of classification.patterns) {
        if (patternDaySets[pattern]) {
          patternDaySets[pattern].add(date);
          patternSlots[pattern] += 1;
        }
      }
      const areas = mobilityAreas(id, exercises);
      if (areas.length || exercise?.type === 'mobility' || exercise?.category === 'warmup' || exercise?.category === 'recovery') {
        patternDaySets.mobility.add(date);
        patternSlots.mobility += 1;
      }
      // Also credit custom exercises with declared bodyParts so custom strength movements show accurately
      if (classification.unclassified && exercise && !exercise.catalogCode) {
        const parts = Array.isArray(exercise.bodyParts) ? exercise.bodyParts : [];
        if (parts.some(part => ['quadriceps', 'adductors', 'legs'].includes(part))) {
          patternDaySets.squat_lunge.add(date);
          patternSlots.squat_lunge += 1;
        }
        if (parts.some(part => ['glutes', 'hamstrings', 'hip'].includes(part))) {
          patternDaySets.hinge.add(date);
          patternSlots.hinge += 1;
        }
        if (parts.some(part => ['chest', 'serratus'].includes(part)) || exercise.type === 'upper_push') {
          patternDaySets.push.add(date);
          patternSlots.push += 1;
        }
        if (parts.some(part => ['back', 'shoulder', 'forearm'].includes(part)) || exercise.type === 'upper_pull') {
          patternDaySets.pull.add(date);
          patternSlots.pull += 1;
        }
        if (parts.includes('core') || exercise.type === 'core') {
          patternDaySets.core.add(date);
          patternSlots.core += 1;
        }
        if (exercise.type === 'power') {
          patternDaySets.footwork_reaction.add(date);
          patternSlots.footwork_reaction += 1;
        }
      }
    }
  }

  const patternDistribution = PATTERN_META.map(item => ({
    key: item.key,
    label: en ? item.en : item.zh,
    days: patternDaySets[item.key].size,
    slots: patternSlots[item.key],
    targeted: item.targets.some(target => targetSet.has(target)),
  }));

  const targetCoverage = profile.targetRegions.map(region => {
    const matchedDates = dates.filter(date => {
      const session = sessionByDate[date];
      return session?.prescriptions?.some(
        dose => ['strength', 'accessory', 'skill'].includes(dose.phase) && matchesTrainingTarget(region, dose.id, exercises[dose.id]),
      );
    });
    return { region, days: matchedDates.length, dates: matchedDates };
  });

  const mobilityRows = scheduledMobility(
    dates.map(date => sessionByDate[date]).filter(Boolean),
    exercises,
  );
  const gapByArea = Object.fromEntries((recentSummary?.mobilityGaps || []).map(item => [item.area, item.gapDays]));
  const mobilityLabels = MOBILITY_LABELS[en ? 'en' : 'zh'];
  const mobilityCoverage = MOBILITY_AREAS.map(area => {
    const row = mobilityRows.find(item => item.area === area) || { area, dates: [] };
    return {
      area,
      label: mobilityLabels[area] || area,
      count: row.dates.length,
      dates: row.dates,
      recentGapDays: gapByArea[area] ?? null,
    };
  });

  const plannedDays = dailySeries.filter(day => day.kind !== 'unplanned').length;
  const strengthDays = dailySeries.filter(day => day.kind === 'strength').length;
  const controlDays = dailySeries.filter(day => day.kind === 'control').length;
  const trainingDays = dailySeries.filter(day => ['strength', 'control', 'training'].includes(day.kind)).length;
  const recoveryDays = dailySeries.filter(day => day.kind === 'recovery').length;
  const restDays = dailySeries.filter(day => day.kind === 'rest').length;
  const activeDays = dailySeries.filter(day => day.minutes > 0);
  const totalMinutes = dailySeries.reduce((sum, day) => sum + day.minutes, 0);

  return {
    dailySeries,
    patternDistribution,
    targetCoverage,
    mobilityCoverage,
    totals: {
      totalDays: dates.length,
      plannedDays,
      trainingDays,
      strengthDays,
      controlDays,
      recoveryDays,
      restDays,
      protectedDays: dailySeries.filter(day => day.protected).length,
      courtDays: dailySeries.filter(day => day.isCourtDay).length,
      totalMinutes,
      avgActiveMinutes: activeDays.length ? Math.round(totalMinutes / activeDays.length) : 0,
      coveredMobilityRegions: mobilityCoverage.filter(item => item.count > 0).length,
    },
    recent: recentSummary,
    typeLabels: TYPE_LABELS[en ? 'en' : 'zh'],
  };
}
