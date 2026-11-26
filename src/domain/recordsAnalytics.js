import { dateForWeekDay, getWeekString, isCalendarDate, localDate } from './dates.js';
import { resolveExerciseId } from './training.js';
import { exerciseBodyParts } from './exerciseTags.js';
import { MUSCLE_MAP_GROUPS } from './periodAnalytics.js';

const DAY_MS = 86400000;

export const RECORDS_RANGES = ['4w', '12w', 'all'];

const RADAR_AXES = [
  { key: 'lower', zh: '下肢支撐', en: 'Lower', types: ['lower'] },
  { key: 'core', zh: '核心穩定', en: 'Core', types: ['core'] },
  { key: 'upper', zh: '上肢推拉', en: 'Upper', types: ['upper_push', 'upper_pull'] },
  { key: 'mobility', zh: '活動度', en: 'Mobility', types: ['mobility'] },
  { key: 'power', zh: '爆發體能', en: 'Power', types: ['power', 'full'] },
];

function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function diffDays(laterDate, earlierDate) {
  return Math.round((Date.parse(`${laterDate}T12:00:00Z`) - Date.parse(`${earlierDate}T12:00:00Z`)) / DAY_MS);
}

function shortDate(date) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
}

function collectCompletedEvents(allProgress = {}, exercises = {}) {
  const events = [];
  for (const [week, data] of Object.entries(allProgress || {})) {
    if (!dateForWeekDay(week)) continue;
    const completed = data?.completed || {};
    const completedAt = data?.completedAt || {};
    const storedTypes = data?.exerciseTypes || {};
    for (const [key, done] of Object.entries(completed)) {
      if (done !== true) continue;
      const match = /^day([1-7])_(.+)$/.exec(key);
      if (!match) continue;
      const dayNum = Number(match[1]);
      const rawId = match[2];
      const id = resolveExerciseId(rawId, exercises) || rawId;
      const date = isCalendarDate(completedAt[key]) ? completedAt[key] : dateForWeekDay(week, dayNum);
      if (!isCalendarDate(date)) continue;
      const exercise = exercises[id] || exercises[rawId] || null;
      const type = storedTypes[key] || exercise?.type || 'full';
      events.push({
        date,
        week: getWeekString(new Date(`${date}T12:00:00`)),
        id,
        name: exercise?.name || rawId,
        type,
        category: exercise?.category || '',
        exercise,
      });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

function computeStreaks(sortedUniqueDates, today) {
  if (!sortedUniqueDates.length) return { currentStreak: 0, longestStreak: 0 };

  let longestStreak = 1;
  let run = 1;
  for (let i = 1; i < sortedUniqueDates.length; i++) {
    if (diffDays(sortedUniqueDates[i], sortedUniqueDates[i - 1]) === 1) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 1;
    }
  }

  const dateSet = new Set(sortedUniqueDates);
  let cursor = dateSet.has(today) ? today : shiftDate(today, -1);
  let currentStreak = 0;
  while (dateSet.has(cursor)) {
    currentStreak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return { currentStreak, longestStreak };
}

function intensityLevel(count, maxCount) {
  if (count <= 0) return 0;
  if (maxCount <= 2) return count >= 2 ? 3 : 1;
  const ratio = count / maxCount;
  if (ratio >= 0.7 || count >= 6) return 3;
  if (ratio >= 0.35 || count >= 3) return 2;
  return 1;
}

function buildBalanceTip(radar, totalCompleted, range, lang) {
  const en = lang === 'en';
  if (totalCompleted === 0) {
    return en
      ? 'Complete exercises in Today to unlock your 5-axis badminton balance radar and muscle map.'
      : '在「今天」完成訓練動作後，這裡就會自動繪製你的五維能力雷達與肌群熱圖。';
  }
  const activeAxes = radar.filter(item => item.count > 0);
  if (totalCompleted < 5 || activeAxes.length <= 1) {
    return en
      ? 'Keep logging sessions across the week so balance trends become clearer.'
      : '持續累積幾天訓練紀錄後，系統會更精準呈現你的五維平衡趨勢。';
  }
  const sorted = [...radar].sort((a, b) => a.count - b.count);
  const lowest = sorted[0];
  const highest = sorted[sorted.length - 1];
  const rangeName = range === '4w'
    ? (en ? 'last 4 weeks' : '近 4 週')
    : range === '12w'
      ? (en ? 'last 12 weeks' : '近 12 週')
      : (en ? 'all recorded history' : '所有紀錄');

  if (highest.count > 0 && lowest.count / highest.count <= 0.35) {
    return en
      ? `In the ${rangeName}, "${lowest.label}" had the fewest completed items (${lowest.count}). Consider adding 1–2 sessions next week.`
      : `${rangeName}「${lowest.label}」完成次數相對較少（${lowest.count} 次），下週排課可適度補強 1–2 次。`;
  }
  return en
    ? `Great balance across all 5 badminton dimensions in the ${rangeName}. Keep up the rhythm!`
    : `${rangeName}五維訓練分布相當均衡，維持現在的節奏就很棒！`;
}

/**
 * Pure analytics builder for the Records "Training trends & statistics" dashboard:
 * - Time-window KPIs (current streak, longest streak, active days, completed count, period delta)
 * - 5-axis badminton capability radar
 * - Actual trained front/back muscle heatmap with recency ("X days ago") & top exercises
 * - Weekly volume (actions) + active days combo series
 */
export function buildRecordsAnalytics({
  allProgress = {},
  exercises = {},
  today = localDate(),
  range = '4w',
  lang = 'zh',
} = {}) {
  const safeToday = isCalendarDate(today) ? today : localDate();
  const safeRange = RECORDS_RANGES.includes(range) ? range : '4w';
  const en = lang === 'en';

  const allEvents = collectCompletedEvents(allProgress, exercises).filter(ev => ev.date <= safeToday);
  const allUniqueDates = [...new Set(allEvents.map(ev => ev.date))].sort();
  const { currentStreak, longestStreak } = computeStreaks(allUniqueDates, safeToday);

  const windowDays = safeRange === '4w' ? 28 : safeRange === '12w' ? 84 : null;
  const since = windowDays ? shiftDate(safeToday, -(windowDays - 1)) : null;
  const rangedEvents = since ? allEvents.filter(ev => ev.date >= since) : allEvents;

  let previousDeltaPct = null;
  if (windowDays && since) {
    const prevEnd = shiftDate(since, -1);
    const prevStart = shiftDate(since, -windowDays);
    const prevCount = allEvents.filter(ev => ev.date >= prevStart && ev.date <= prevEnd).length;
    if (prevCount > 0) {
      previousDeltaPct = Math.round(((rangedEvents.length - prevCount) / prevCount) * 100);
    }
  }

  const activeDates = new Set(rangedEvents.map(ev => ev.date));

  // 1. 5-Axis Badminton Capability Radar
  const rawCounts = Object.fromEntries(RADAR_AXES.map(axis => [axis.key, 0]));
  for (const ev of rangedEvents) {
    const axis = RADAR_AXES.find(item => item.types.includes(ev.type));
    if (axis) rawCounts[axis.key] += 1;
  }
  const maxAxis = Math.max(1, ...Object.values(rawCounts));
  const totalRadar = Math.max(1, rangedEvents.length);
  const radar = RADAR_AXES.map(axis => {
    const count = rawCounts[axis.key];
    return {
      key: axis.key,
      label: en ? axis.en : axis.zh,
      count,
      sharePct: rangedEvents.length ? Math.round((count / totalRadar) * 100) : 0,
      score: count === 0 ? 0 : Math.max(16, Math.round((count / maxAxis) * 95)),
    };
  });
  const balanceTip = buildBalanceTip(radar, rangedEvents.length, safeRange, lang);

  // 2. Actual Trained Muscle Map (working strength / power / conditioning / custom training movements)
  const muscleCounts = Object.fromEntries(MUSCLE_MAP_GROUPS.map(g => [g.key, 0]));
  const muscleDays = Object.fromEntries(MUSCLE_MAP_GROUPS.map(g => [g.key, new Set()]));
  const muscleLastDate = Object.fromEntries(MUSCLE_MAP_GROUPS.map(g => [g.key, null]));
  const muscleMoveFreq = Object.fromEntries(MUSCLE_MAP_GROUPS.map(g => [g.key, {}]));

  const workingEvents = rangedEvents.filter(ev => !['warmup', 'cooldown', 'recovery'].includes(ev.category) && ev.type !== 'mobility');
  const muscleSourceEvents = workingEvents.length > 0 ? workingEvents : rangedEvents;

  for (const ev of muscleSourceEvents) {
    const parts = exerciseBodyParts(ev.id, ev.exercise || {});
    for (const group of MUSCLE_MAP_GROUPS) {
      if (parts.some(part => group.parts.includes(part))) {
        muscleCounts[group.key] += 1;
        muscleDays[group.key].add(ev.date);
        if (!muscleLastDate[group.key] || ev.date > muscleLastDate[group.key]) {
          muscleLastDate[group.key] = ev.date;
        }
        if (ev.name) {
          muscleMoveFreq[group.key][ev.name] = (muscleMoveFreq[group.key][ev.name] || 0) + 1;
        }
      }
    }
  }

  const maxMuscleCount = Math.max(0, ...Object.values(muscleCounts));
  const muscleCoverage = MUSCLE_MAP_GROUPS.map(group => {
    const count = muscleCounts[group.key];
    const lastDate = muscleLastDate[group.key];
    const daysSince = lastDate ? Math.max(0, diffDays(safeToday, lastDate)) : null;
    const topExercises = Object.entries(muscleMoveFreq[group.key])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4)
      .map(([name]) => name);
    return {
      key: group.key,
      label: en ? group.en : group.zh,
      count,
      days: muscleDays[group.key].size,
      lastDate,
      daysSince,
      intensity: intensityLevel(count, maxMuscleCount),
      exercises: topExercises,
    };
  });

  // 3. Weekly Volume & Active Days Combo Series
  const weekBucketsCount = safeRange === '4w' ? 6 : 8;
  const currentIsoWeek = getWeekString(new Date(`${safeToday}T12:00:00`));
  const currentWeekMonday = dateForWeekDay(currentIsoWeek, 1) || safeToday;

  const eventsByWeek = {};
  for (const ev of allEvents) {
    eventsByWeek[ev.week] ??= { actions: 0, dates: new Set() };
    eventsByWeek[ev.week].actions += 1;
    eventsByWeek[ev.week].dates.add(ev.date);
  }

  const weeklySeries = [];
  for (let i = weekBucketsCount - 1; i >= 0; i--) {
    const mon = shiftDate(currentWeekMonday, -i * 7);
    const sun = shiftDate(mon, 6);
    const weekCode = getWeekString(new Date(`${mon}T12:00:00`));
    const bucket = eventsByWeek[weekCode];
    const isCurrent = weekCode === currentIsoWeek;
    weeklySeries.push({
      week: weekCode,
      label: isCurrent ? (en ? 'Now' : '本週') : weekCode.slice(5),
      rangeLabel: `${shortDate(mon)}–${shortDate(sun)}`,
      days: bucket ? bucket.dates.size : 0,
      actions: bucket ? bucket.actions : 0,
      isCurrent,
    });
  }

  return {
    range: safeRange,
    totals: {
      currentStreak,
      longestStreak,
      activeDays: activeDates.size,
      completedCount: rangedEvents.length,
      allTimeActiveDays: allUniqueDates.length,
      allTimeCompleted: allEvents.length,
      previousDeltaPct,
      trainedMuscleGroups: muscleCoverage.filter(item => item.count > 0).length,
    },
    radar,
    balanceTip,
    muscleCoverage,
    weeklySeries,
  };
}
