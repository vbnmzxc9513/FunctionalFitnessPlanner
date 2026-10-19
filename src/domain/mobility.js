import { catalogExercises } from './exerciseCatalog.js';
import { dateForWeekDay, isCalendarDate } from './dates.js';
import { classifyBalanceExercise } from './weeklyBalance.js';
import { resolveExerciseId } from './training.js';
import { validateTrainingLog, validateReadiness, evaluateReadiness } from './coaching.js';
import { SESSION_PHASES } from './phases.js';
import { estimateSessionMinutes } from './sessions.js';

const CATALOG = catalogExercises();
export const MOBILITY_AREAS = ['thoracic', 'shoulder', 'hip_front', 'hip_rotation', 'adductors', 'quads', 'hamstrings', 'ankle'];
export const MOBILITY_LABELS = {
  zh: { thoracic: '胸椎', shoulder: '肩胸', hip_front: '髖前側', hip_rotation: '髖旋轉', adductors: '內收肌', quads: '大腿前側', hamstrings: '腿後側', ankle: '踝小腿' },
  en: { thoracic: 'Thoracic spine', shoulder: 'Shoulder / chest', hip_front: 'Hip flexors', hip_rotation: 'Hip rotation', adductors: 'Adductors', quads: 'Quadriceps', hamstrings: 'Hamstrings', ankle: 'Ankles / calves' },
};
const CODES = {
  thoracic: ['A06', 'A10', 'A11', 'A12', 'A13', 'H12'], shoulder: ['A09', 'A12', 'A13', 'H07'],
  hip_front: ['A04', 'A12', 'A13', 'H03'], hip_rotation: ['A12', 'A13', 'A15', 'H04'],
  adductors: ['A05', 'A13', 'H06'], quads: ['A12', 'A13', 'A14'],
  hamstrings: ['A03', 'A12', 'A13', 'H05'], ankle: ['A02', 'A12', 'A13', 'H01', 'H02'],
};
const DYNAMIC = { thoracic: ['A06', 'A11', 'A10'], shoulder: ['A09'], hip_front: ['A04'], hip_rotation: ['A15'],
  adductors: ['A05'], quads: ['A14'], hamstrings: ['A03'], ankle: ['A02'] };
const PATTERNS = { squat_lunge: ['hip_front', 'quads', 'adductors', 'ankle'], hinge: ['hamstrings', 'hip_rotation'],
  push: ['shoulder', 'thoracic'], pull: ['shoulder', 'thoracic'], footwork_reaction: ['ankle', 'adductors', 'hip_rotation'] };
const STIFFNESS = { hip: ['hip_front', 'hip_rotation', 'adductors'], ankle: ['ankle'], thoracic: ['thoracic'], shoulder: ['shoulder'] };
const SORE_AREAS = { legs: ['quads'], posterior: ['hip_rotation', 'hamstrings'], calf: ['ankle'], upper: ['shoulder', 'thoracic'], core: ['thoracic'] };
const daysApart = (later, earlier) => (Date.parse(`${later}T12:00:00Z`) - Date.parse(`${earlier}T12:00:00Z`)) / 86400000;
const shift = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const values = input => Array.isArray(input) ? input : Object.values(input || {});

export function mobilityAreas(id, exercises = CATALOG) {
  if (id === 'thoracic') return ['thoracic'];
  const code = exercises[id]?.catalogCode;
  return code && CATALOG[id]?.catalogCode === code ? MOBILITY_AREAS.filter(area => CODES[area].includes(code)) : [];
}

export function datedPlanningSessions(plans = {}, native = {}) {
  const sessions = Object.entries(plans).flatMap(([week, plan]) => (plan?.schedule || []).map(day => ({ ...day, date: dateForWeekDay(week, day.day) })));
  return Object.values(Object.fromEntries([...sessions, ...values(native)].filter(session => isCalendarDate(session?.date)).map(session => [session.date, session])));
}

// Actual dates come from validated records, never inferred from a saved plan.
export function mobilityEvidence({ sessions = [], logs = [], progressByWeek = {}, exercises = CATALOG, today, date }) {
  const actual = new Map(); let recentSymptoms = false;
  for (const record of values(logs)) {
    let log;
    try { log = validateTrainingLog(record, { today }); } catch { continue; }
    if (daysApart(date, log.date) >= 0 && daysApart(date, log.date) <= 2 && (log.symptoms === 'worse' || log.nextDay === 'worse')) recentSymptoms = true;
    if (!log.sets.some(set => set.value > 0 || set.otherSide > 0)) continue;
    const id = resolveExerciseId(log.exerciseId, exercises);
    actual.set(`${log.date}_${id}`, { date: log.date, id, source: 'logged', coverage: true });
  }
  for (const [week, progress] of Object.entries(progressByWeek || {})) for (const [key, done] of Object.entries(progress.completed || {})) {
    const match = /^day([1-7])_(.+)$/.exec(key); const performed = progress.completedAt?.[key];
    if (done !== true || !match || !dateForWeekDay(week, Number(match[1])) || !isCalendarDate(performed) || performed > today) continue;
    const id = resolveExerciseId(match[2], exercises), identity = `${performed}_${id}`;
    if (!actual.has(identity)) actual.set(identity, { date: performed, id, source: 'completed', coverage: true });
  }
  const rows = [...actual.values()];
  const actualDates = new Set(rows.map(row => row.date));
  for (const session of values(sessions)) {
    if (!isCalendarDate(session?.date) || actualDates.has(session.date)) continue;
    for (const value of new Set(session.routine || [])) rows.push({ date: session.date, id: resolveExerciseId(value, exercises), source: 'planned', coverage: session.date >= today });
  }
  return { rows: rows.filter(row => daysApart(date, row.date) > 0 && daysApart(date, row.date) <= 7), recentSymptoms };
}

export function createMobilityContext({ date, today, sessions = [], logs = [], progressByWeek = {}, readiness = [], context = {}, exercises = CATALOG, day }) {
  if (![date, today].every(isCalendarDate)) return { ranked: [], recentSymptoms: false };
  const evidence = mobilityEvidence({ date, today, sessions, logs, progressByWeek, exercises });
  const courtReports = new Map();
  let recoveryPriority = false; let recoveryOnly = false;
  for (const value of values(readiness).sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    let record; try { record = validateReadiness(value, { today }); } catch { continue; }
    if (record.date === today) {
      const decision = evaluateReadiness(record, { today, healthStatus: context.healthStatus, healthNotes: context.healthNotes });
      if (decision.action === 'rest') evidence.recentSymptoms = true;
      if (['reduce', 'recover'].includes(decision.action)) recoveryPriority = true;
      if (decision.action === 'recover') recoveryOnly = true;
    }
    if (record.yesterdayCourtMinutes !== null) courtReports.set(shift(record.date, -1), record.yesterdayCourtMinutes > 0);
    if (record.todayCourtIntensity !== 'unknown' && !courtReports.has(record.date)) courtReports.set(record.date, record.todayCourtIntensity !== 'none');
  }
  const courts = [0, 1, 2].map(offset => {
    const when = shift(date, -offset), weekday = new Date(`${when}T12:00:00Z`).getUTCDay() || 7;
    return { date: when, present: courtReports.get(when) ?? (context.badmintonDays || []).includes(weekday), source: courtReports.has(when) ? 'reported_court' : 'planned_court' };
  }).filter(item => item.present);
  const current = (day?.prescriptions || []).filter(dose => ['skill', 'strength', 'accessory'].includes(dose.phase)).flatMap(dose => classifyBalanceExercise(dose.id, exercises[dose.id]).patterns.flatMap(pattern => PATTERNS[pattern] || []));
  const preferences = (context.stiffnessRegions || []).flatMap(region => STIFFNESS[region] || []);
  const ranked = MOBILITY_AREAS.map(area => {
    const dates = [...new Set(evidence.rows.filter(row => row.coverage && mobilityAreas(row.id, exercises).includes(area)).map(row => row.date))].sort();
    const recent = evidence.rows.filter(row => daysApart(date, row.date) <= 2 && classifyBalanceExercise(row.id, exercises[row.id]).patterns.some(pattern => PATTERNS[pattern]?.includes(area)));
    const reasons = [];
    if (dates.length < 2) reasons.push('maintenance');
    if (recent.some(row => row.source !== 'planned')) reasons.push('recorded_training');
    else if (recent.length) reasons.push('planned_training');
    const court = ['ankle', 'adductors', 'thoracic', 'shoulder'].includes(area) ? courts : [];
    if (court.length) reasons.push(court.some(item => item.source === 'reported_court') ? 'reported_court' : 'planned_court');
    if (current.includes(area)) reasons.push('today_training');
    if (preferences.includes(area)) reasons.push('stiffness');
    const gapDays = dates.length ? daysApart(date, dates.at(-1)) : null;
    const score = Math.max(0, 2 - dates.length) * 20 + Math.min(gapDays ?? 7, 7) * 2
      + (recent.length ? 8 : 0) + (court.length ? 8 : 0) + (current.includes(area) ? 10 : 0) + (preferences.includes(area) ? 6 : 0);
    return { area, dates, gapDays, reasons, score };
  }).sort((a, b) => b.score - a.score || MOBILITY_AREAS.indexOf(a.area) - MOBILITY_AREAS.indexOf(b.area));
  return { ranked, recentSymptoms: evidence.recentSymptoms, recoveryPriority, recoveryOnly,
    excludedAreas: [...new Set((context.sorenessRegions || []).flatMap(region => SORE_AREAS[region] || []))] };
}

// Reuse an easy slot. Short recovery may use two gentle dynamic drills;
// training retains its full opening flow and uses the old optional finish slot.
export function adaptMobilityDay(day, available, minutes, intent, selected = [], { gentle = false } = {}) {
  if (!day.routine.length || intent.recentSymptoms) return day;
  let next = { ...day, routine: [...day.routine], prescriptions: day.prescriptions.map(dose => ({ ...dose })) };
  const recovery = day.sessionType === 'recovery';
  const slot = next.prescriptions.findIndex(dose => !selected.includes(dose.id) && (recovery ? available[dose.id]?.catalogCode === 'A02' : dose.phase === 'cooldown' && available[dose.id]?.catalogCode === 'D09'));
  if (slot < 0 && !(recovery && next.routine.some(id => available[id]?.sequenceMinutes))) return day;
  const removed = slot >= 0 ? next.prescriptions[slot].id : null;
  if (removed) { next.prescriptions.splice(slot, 1); next.routine = next.routine.filter(id => id !== removed); }
  let added = 0;
  for (const { area } of intent.ranked) {
    if (intent.excludedAreas?.includes(area)) continue;
    if (next.routine.some(id => mobilityAreas(id, available).includes(area))) continue;
    const id = DYNAMIC[area].map(code => Object.keys(available).find(id => available[id].catalogCode === code && !next.routine.includes(id))).find(Boolean);
    if (!id) continue;
    const candidate = { ...next, routine: [...next.routine, id], prescriptions: [...next.prescriptions, { id, ...available[id].prescription, sets: 1, value: gentle ? '2' : '4', phase: recovery ? 'recovery' : 'warmup' }] };
    if (recovery && estimateSessionMinutes(candidate, available) > minutes) continue;
    next = candidate; added++;
    if (added >= (recovery ? 2 : 1) || next.routine.length >= (recovery ? 3 : 8)) break;
  }
  if (!added) return mobilityAreas(removed, available).some(area => intent.excludedAreas?.includes(area)) ? next : day;
  next.prescriptions.sort((a, b) => SESSION_PHASES.indexOf(a.phase) - SESSION_PHASES.indexOf(b.phase));
  next.routine = next.prescriptions.map(dose => dose.id);
  return next;
}

export function scheduledMobility(sessions = [], exercises = CATALOG) {
  return MOBILITY_AREAS.map(area => ({ area, dates: [...new Set(sessions.filter(session => (session.routine || []).some(id => mobilityAreas(id, exercises).includes(area))).map(session => session.date).filter(isCalendarDate))].sort() }));
}

export function mobilityDayNote(day, exercises, intent, lang = 'zh') {
  const language = lang === 'en' ? 'en' : 'zh';
  const ids = day.prescriptions.filter(dose => ['warmup', 'recovery'].includes(dose.phase)).map(dose => dose.id);
  const areas = intent.ranked.filter(item => ids.some(id => mobilityAreas(id, exercises).includes(item.area))).slice(0, 2);
  if (!areas.length) return '';
  const reasons = language === 'en'
    ? { recorded_training: 'recent recorded training', planned_training: 'recent scheduled training; completion unknown', reported_court: 'reported court activity', planned_court: 'scheduled court activity', maintenance: 'fewer known mobility days in the last 7 days', today_training: 'today’s main movements', stiffness: 'your stiffness preference' }
    : { recorded_training: '近兩天有訓練紀錄', planned_training: '近兩天原有訓練安排，尚未確認完成', reported_court: '近期回報的球場活動', planned_court: '近期球日安排', maintenance: '近七天可確認的活動安排較少', today_training: '今天主項需要', stiffness: '自述僵硬偏好' };
  const focus = areas.map(item => {
    const key = ['recorded_training', 'planned_training', 'reported_court', 'planned_court', 'maintenance', 'today_training', 'stiffness'].find(key => item.reasons.includes(key));
    return `${MOBILITY_LABELS[language][item.area]}（${reasons[key] || reasons.maintenance}）`;
  }).join(language === 'en' ? '; ' : '、');
  return language === 'en' ? ` Mobility focus: ${focus}. Use the listed gentle dynamic movements; no extra sets or forceful holds. Scheduled coverage is not proof of completion or measured range.`
    : ` 活動度重點：${focus}。依列出的動態活動慢速進出，不另加組數或強拉；已安排不等於已完成或實測活動度。`;
}
