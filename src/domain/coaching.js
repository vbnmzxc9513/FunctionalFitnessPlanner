import { dateForWeekDay, isCalendarDate, localDate } from './dates.js';
import { exercisePhase, orderedRoutine } from './phases.js';
import { exerciseKey, prescription } from './training.js';

export const LOG_VARIANTS = ['bodyweight', 'dumbbell', 'cable', 'band', 'other'];
export const LOAD_BASES = ['none', 'per_dumbbell', 'total', 'stack', 'description'];
export const LOG_UNITS = ['reps', 'seconds', 'minutes', 'breaths'];
export const VALUE_LIMITS = { reps: 500, seconds: 3600, minutes: 120, breaths: 500 };
const PHASES = ['legacy', 'warmup', 'skill', 'strength', 'accessory', 'recovery', 'cooldown'];
const logFields = ['week', 'day', 'exerciseId', 'date', 'variant', 'loadKg', 'loadBasis', 'resistanceLabel', 'unit', 'perSide', 'sets', 'rir', 'quality', 'symptoms', 'nextDay', 'planned', 'schemaVersion'];
const readinessFields = ['date', 'sleepHours', 'fatigue', 'soreness', 'symptoms', 'yesterdayCourtMinutes', 'yesterdayCourtRpe', 'todayCourtIntensity', 'schemaVersion'];
const plannedFields = ['sets', 'value', 'unit', 'perSide', 'phase', 'restSeconds'];
const exactFields = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const numberIn = (value, min, max, integer = false) => typeof value === 'number' && Number.isFinite(value)
  && value >= min && value <= max && (!integer || Number.isInteger(value));
const nullableNumber = (value, min, max, integer = false) => value === null || numberIn(value, min, max, integer);
const validDate = (value, today) => isCalendarDate(value) && isCalendarDate(today) && value <= today;

/** Parse only factual scalar/range targets, never coerce a blank input into zero. */
export function targetRange(value, unit = 'reps') {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = /^(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?$/.exec(String(value).trim());
  if (!match || !LOG_UNITS.includes(unit)) return null;
  const min = Number(match[1]); const max = Number(match[2] ?? match[1]);
  if (!numberIn(min, 0.01, VALUE_LIMITS[unit]) || !numberIn(max, min, VALUE_LIMITS[unit])) return null;
  if (['reps', 'breaths'].includes(unit) && (!Number.isInteger(min) || !Number.isInteger(max))) return null;
  return { min, max };
}

/** Snapshot is deliberately detached from a later edit to the weekly plan. */
export function plannedSnapshot(dose) {
  const snapshot = { sets: dose?.sets, value: String(dose?.value ?? ''), unit: dose?.unit,
    perSide: dose?.perSide ?? false, phase: dose?.phase ?? 'legacy', restSeconds: dose?.restSeconds ?? 0 };
  if (!validPlanned(snapshot)) throw new Error('INVALID_TRAINING_LOG');
  const range = targetRange(snapshot.value, snapshot.unit);
  return { ...snapshot, value: range.min === range.max ? String(range.min) : `${range.min}–${range.max}` };
}

function validPlanned(planned) {
  return exactFields(planned, plannedFields) && numberIn(planned.sets, 1, 5, true)
    && targetRange(planned.value, planned.unit) !== null && typeof planned.perSide === 'boolean'
    && PHASES.includes(planned.phase) && numberIn(planned.restSeconds, 0, 300, true);
}

export function trainingLogId(record) {
  if (!dateForWeekDay(record?.week, record?.day) || record.day > 5 || !/^[A-Za-z0-9_-]{1,80}$/.test(record.exerciseId || '')) throw new Error('INVALID_TRAINING_LOG');
  return `${record.week}-D${record.day}-${record.exerciseId}`;
}
export const logId = trainingLogId;

export function validateTrainingLog(record, { today = localDate() } = {}) {
  const reject = () => { throw new Error('INVALID_TRAINING_LOG'); };
  if (!exactFields(record, logFields) || record.schemaVersion !== 1) reject();
  trainingLogId(record);
  if (!validDate(record.date, today) || !LOG_VARIANTS.includes(record.variant) || !LOAD_BASES.includes(record.loadBasis)
    || !nullableNumber(record.loadKg, 0, 500) || typeof record.resistanceLabel !== 'string' || record.resistanceLabel.length > 120
    || !LOG_UNITS.includes(record.unit) || typeof record.perSide !== 'boolean' || !validPlanned(record.planned)
    || record.unit !== record.planned.unit || record.perSide !== record.planned.perSide
    || !Array.isArray(record.sets) || !numberIn(record.sets.length, 1, 5, true)
    || !nullableNumber(record.rir, 0, 10, true) || !['good', 'unstable', 'unknown'].includes(record.quality)
    || !['none', 'worse', 'unknown'].includes(record.symptoms) || !['pending', 'good', 'worse'].includes(record.nextDay)) reject();
  if ((record.variant === 'bodyweight' && record.loadBasis !== 'none')
    || (record.loadBasis === 'none' && record.loadKg !== null && record.loadKg !== 0)
    || (record.loadBasis === 'description' && !record.resistanceLabel.trim())
    || (record.nextDay !== 'pending' && record.date >= today)) reject();
  const integer = ['reps', 'breaths'].includes(record.unit);
  if (!record.sets.every(set => exactFields(set, ['value', 'otherSide'])
    && numberIn(set.value, 0, VALUE_LIMITS[record.unit], integer)
    && (record.perSide ? numberIn(set.otherSide, 0, VALUE_LIMITS[record.unit], integer) : set.otherSide === null))) reject();
  return { ...record, resistanceLabel: record.resistanceLabel.trim(),
    sets: record.sets.map(set => ({ ...set })), planned: plannedSnapshot(record.planned) };
}

export function validateReadiness(record, { today = localDate() } = {}) {
  if (!exactFields(record, readinessFields) || record.schemaVersion !== 1 || !validDate(record.date, today)
    || !nullableNumber(record.sleepHours, 0, 24) || !nullableNumber(record.fatigue, 0, 4, true)
    || !nullableNumber(record.soreness, 0, 4, true) || !['none', 'stable', 'worse', 'red_flags', 'unknown'].includes(record.symptoms)
    || !nullableNumber(record.yesterdayCourtMinutes, 0, 360, true) || !nullableNumber(record.yesterdayCourtRpe, 0, 10, true)
    || !['unknown', 'none', 'light', 'hard'].includes(record.todayCourtIntensity)) throw new Error('INVALID_READINESS');
  return { ...record };
}

/** Conservative training decision, not an injury diagnosis or medical clearance. */
export function evaluateReadiness(record, { today = localDate(), healthStatus, healthNotes = '' } = {}) {
  let ready;
  try { ready = validateReadiness(record, { today }); } catch { return { action: 'unknown', reasonCodes: ['missing_readiness'] }; }
  if (ready.date !== today) return { action: 'unknown', reasonCodes: ['stale_readiness'] };
  if (ready.symptoms === 'red_flags') return { action: 'rest', reasonCodes: ['red_flags'] };
  if (ready.symptoms === 'worse') return { action: 'rest', reasonCodes: ['worsening_symptoms'] };
  if (healthStatus === 'restricted' || /震波|shockwave|ESWT/i.test(healthNotes)) return { action: 'recover', reasonCodes: ['restricted'] };
  if (healthStatus === 'unknown') return { action: 'recover', reasonCodes: ['clinical_status_unknown'] };
  if (String(healthNotes || '').trim()) return { action: 'recover', reasonCodes: ['clinical_notes_review'] };
  const reasonCodes = [];
  const incomplete = [ready.sleepHours, ready.fatigue, ready.soreness, ready.yesterdayCourtMinutes].some(value => value === null)
    || (ready.yesterdayCourtMinutes > 0 && ready.yesterdayCourtRpe === null)
    || ready.symptoms === 'unknown' || ready.todayCourtIntensity === 'unknown';
  if (incomplete) reasonCodes.push('incomplete_readiness');
  const courtLoad = ready.yesterdayCourtMinutes === null || ready.yesterdayCourtRpe === null ? 0 : ready.yesterdayCourtMinutes * ready.yesterdayCourtRpe;
  let action = 'normal';
  if (ready.fatigue >= 4 || ready.soreness >= 4 || (ready.sleepHours !== null && ready.sleepHours < 5)
    || (courtLoad >= 720 && ready.fatigue >= 2)) {
    action = 'recover'; reasonCodes.push('high_recovery_need');
  } else if (ready.fatigue >= 3 || ready.soreness >= 3 || (ready.sleepHours !== null && ready.sleepHours < 6) || courtLoad >= 420) {
    action = 'reduce'; reasonCodes.push('elevated_load');
  }
  if (ready.symptoms === 'stable') { if (action === 'normal') action = 'reduce'; reasonCodes.push('stable_symptoms'); }
  if (ready.todayCourtIntensity === 'hard') { if (action === 'normal') action = 'reduce'; reasonCodes.push('today_hard_court'); }
  if (action === 'normal' && incomplete) action = 'unknown';
  if (!reasonCodes.length) reasonCodes.push('ready');
  return { action, reasonCodes };
}

function samePlan(first, second) {
  try { return JSON.stringify(plannedSnapshot(first)) === JSON.stringify(plannedSnapshot(second)); } catch { return false; }
}
function sameResistance(first, second) {
  return ['unit', 'perSide', 'variant', 'loadBasis', 'loadKg', 'resistanceLabel'].every(key => first[key] === second[key]);
}
function hasKnownResistance(log) {
  if (log.variant === 'bodyweight') return log.loadBasis === 'none' && Boolean(log.resistanceLabel.trim());
  if (['band', 'other'].includes(log.variant)) return log.loadBasis === 'description' && Boolean(log.resistanceLabel.trim());
  if (log.variant === 'cable' && !log.resistanceLabel.trim()) return false;
  return log.loadKg !== null && log.loadKg > 0 && (log.variant === 'dumbbell' ? ['per_dumbbell', 'total'].includes(log.loadBasis) : log.loadBasis === 'stack');
}
function achieved(log, target) {
  return log.unit === target.unit && log.perSide === target.perSide && log.sets.length === target.sets
    && log.sets.every(set => set.value >= targetRange(target.value, target.unit).min
      && (!target.perSide || set.otherSide >= targetRange(target.value, target.unit).min));
}
function daysToCompetition(date, today) {
  if (!isCalendarDate(date) || !isCalendarDate(today)) return null;
  return Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
}

/** Advice is a reviewable proposal. It never edits a prescription or a logged result. */
export function recommendExercise(plannedDose, exercise, logs, context = {}) {
  const today = context.today ?? localDate();
  const result = (code, reasonCodes, parameters = {}, evidenceDates = []) => ({ code, reasonCodes, parameters, evidenceDates });
  let planned;
  try { planned = plannedSnapshot(plannedDose); } catch { return result('hold', ['invalid_target']); }
  const healthStatus = ['unrestricted', 'restricted', 'unknown'].includes(context.healthStatus) ? context.healthStatus : 'unknown';
  const readiness = evaluateReadiness(context.readiness, { ...context, healthStatus, today });
  if (readiness.action === 'rest') return result('rest', readiness.reasonCodes);
  if (healthStatus === 'restricted' || context.restricted === true || /震波|shockwave|ESWT/i.test(context.healthNotes || '')) return result('hold', ['restricted']);
  if (healthStatus === 'unknown') return result('hold', ['clinical_status_unknown']);
  if (String(context.healthNotes || '').trim()) return result('hold', ['clinical_notes_review']);
  if (['reduce', 'recover'].includes(readiness.action)) return result('reduce', readiness.reasonCodes);
  const competitionDays = daysToCompetition(context.competitionDate, today);
  if (competitionDays !== null && competitionDays >= 0 && competitionDays <= 7) return result('hold', ['competition_taper']);
  if (readiness.action !== 'normal') return result('hold', readiness.reasonCodes);
  if (context.readiness?.fatigue >= 2 || context.readiness?.soreness >= 2) return result('hold', ['current_fatigue']);
  const strength = ['strength', 'accessory', 'legacy'].includes(planned.phase)
    && ['lower', 'upper_push', 'upper_pull'].includes(exercise?.type)
    && !['power', 'footwork', 'reaction', 'conditioning'].includes(exercise?.category) && !(exercise?.jumpContacts > 0);
  if (!strength || planned.unit !== 'reps') return result('hold', ['not_strength_progression']);
  const actual = [];
  for (const record of Array.isArray(logs) ? logs : []) {
    if (!record || record.exerciseId !== (exercise?.id ?? plannedDose.id ?? context.exerciseId)) continue;
    try { actual.push(validateTrainingLog(record, { today })); } catch { /* Invalid or future records cannot support advice. */ }
  }
  actual.sort((a, b) => b.date.localeCompare(a.date));
  const recent = actual.filter(record => {
    const age = Math.round((new Date(`${today}T00:00:00Z`) - new Date(`${record.date}T00:00:00Z`)) / 86400000);
    return age >= 0 && age <= 28;
  });
  const distinct = recent.filter((record, index, all) => all.findIndex(other => other.date === record.date) === index).slice(0, 2);
  const evidenceDates = distinct.map(record => record.date);
  const respond = (code, reasons, parameters = {}) => result(code, reasons, parameters, evidenceDates);
  if (distinct.some(record => record.symptoms === 'worse' || record.nextDay === 'worse')) return respond('reduce', ['adverse_response']);
  if (distinct.some(record => record.quality === 'unstable')) return respond('improve_quality', ['unstable_quality']);
  if (distinct.some(record => record.nextDay === 'pending')) return respond('complete_followup', ['pending_followup']);
  if (distinct.length < 2) return respond('record_more', [actual.length > recent.length ? 'recent_sessions_required' : 'two_sessions_required']);
  if (distinct.some(record => !samePlan(record.planned, planned))) return respond('hold', ['changed_target']);
  if (distinct.some(record => record.variant === 'bodyweight' && !record.resistanceLabel.trim())) return respond('hold', ['bodyweight_definition_required']);
  if (!sameResistance(distinct[0], distinct[1]) || !distinct.every(hasKnownResistance)) return respond('hold', ['incomparable_resistance']);
  if (distinct.some(record => record.quality !== 'good' || record.symptoms !== 'none' || record.rir === null || record.rir < 2)) return respond('hold', ['insufficient_quality_or_reserve']);
  if (!distinct.every(record => achieved(record, planned))) return respond('hold', ['target_not_met']);
  const range = targetRange(planned.value, planned.unit);
  const minimumAchieved = Math.min(...distinct.flatMap(record => record.sets.flatMap(set => record.perSide ? [set.value, set.otherSide] : [set.value])));
  const last = distinct[0];
  const parameters = { variant: last.variant, loadKg: last.loadKg, loadBasis: last.loadBasis, resistanceLabel: last.resistanceLabel, unit: planned.unit };
  if (range.min < range.max && minimumAchieved < range.max) return respond('progress_reps', ['two_stable_sessions'], { ...parameters, value: String(Math.min(range.max, minimumAchieved + 1)) });
  // No numeric increase is invented. Bands/bodyweight have no interchangeable kg increment.
  if (['dumbbell', 'cable'].includes(last.variant) && numberIn(context.loadIncrementKg, 0.001, 50)
    && last.loadKg + context.loadIncrementKg <= 500) return respond('consider_load', ['two_stable_sessions', 'known_increment'],
    { ...parameters, incrementKg: context.loadIncrementKg, proposedLoadKg: last.loadKg + context.loadIncrementKg, value: String(range.min) });
  if (['band', 'other', 'bodyweight'].includes(last.variant)) return respond('hold', ['two_stable_sessions', 'non_numeric_resistance_review'], parameters);
  return respond('consider_load', ['two_stable_sessions', 'choose_smallest_step'], { ...parameters, value: String(range.min) });
}

const adjustmentText = {
  zh: {
    reduce: '依今天狀態減量：只調整尚未完成的動作；肌力與輔助組數減少，保留暖身與必要準備組。今天若有高強度球局，取消額外跳躍與爆發訓練。',
    recover: '依今天狀態改成恢復：只保留原課表尚未完成的低負荷活動；不增加新動作。已完成的訓練與紀錄保留。',
    rest: '今天停止尚未完成的訓練，保留已完成的紀錄。症狀加重或新出現麻木、無力時，請聯絡治療或醫療人員；不要用訓練測試是否已恢復。',
    noFinish: '今天沒有新增收操。若沒有繼續訓練，不需要另補一套；症狀加重時依治療建議處理。',
  },
  en: {
    reduce: 'Reduced for today: only unfinished work changes. Fewer strength/accessory sets; warm-up and necessary preparation remain. With hard court play today, extra jumping and power work are removed.',
    recover: 'Recovery for today: only existing unfinished low-load activities remain; no exercises are added. Completed work and records are preserved.',
    rest: 'Stop unfinished training today; completed work stays recorded. For worsening symptoms or new numbness/weakness, contact your clinician. Do not use training to test recovery.',
    noFinish: 'No additional cooldown is prescribed today. If training stops, no extra routine is needed; follow clinical advice for worsening symptoms.',
  },
};
function isDone(completed, day, id) { return completed?.[exerciseKey(day, id)] === true || completed?.[id] === true; }
function lowLoad(exercise, id, clinicalRestriction = false) {
  return exercise && (!clinicalRestriction || exercise.catalogCode) && !exercise.shoulderLoaded && !(exercise.jumpContacts > 0)
    && (['warmup', 'recovery', 'cooldown', 'mobility'].includes(exercise.category) || exercise.type === 'mobility' || ['bf_D09', 'bf_I01', 'bf_G07'].includes(id));
}

/** Explicitly applied by the user; changes only future work, never completed results. */
export function adaptDayForReadiness(day, decision, completed = {}, exercises = {}, lang = 'zh', _time) {
  const next = structuredClone(day);
  if (!['reduce', 'recover', 'rest'].includes(decision?.action) || day.sessionType === 'rest' || !day.routine?.length) return next;
  // Recovery sessions never become training sessions under a readiness adjustment.
  const action = day.sessionType === 'recovery' && decision.action === 'reduce' ? 'recover' : decision.action;
  const texts = adjustmentText[lang] ?? adjustmentText.zh;
  const hardCourt = decision.reasonCodes?.includes('today_hard_court');
  const clinicalRestriction = decision.reasonCodes?.some(code => ['restricted', 'clinical_status_unknown', 'clinical_notes_review'].includes(code));
  const retain = id => {
    if (isDone(completed, day.day, id)) return true;
    if (action === 'rest') return false;
    if (action === 'recover') return lowLoad(exercises[id], id, clinicalRestriction);
    return id === 'bf_G07' || !hardCourt || !((exercises[id]?.jumpContacts > 0) || ['power', 'footwork', 'reaction'].includes(exercises[id]?.category) || exercises[id]?.type === 'power');
  };
  next.routine = day.routine.filter(retain);
  const original = new Map((day.prescriptions ?? []).map(dose => [dose.id, dose]));
  next.prescriptions = next.routine.map(id => {
    // Completed legacy slots must retain their original absence of a prescription too.
    if (isDone(completed, day.day, id)) return original.get(id) ? structuredClone(original.get(id)) : null;
    const exercise = exercises[id];
    const dose = structuredClone(prescription(id, exercise?.type, 1, exercise, day));
    const phase = exercisePhase(day, id, exercise);
    if (action === 'reduce' && ['strength', 'accessory', 'skill'].includes(phase)) {
      if (dose.sets > 1) dose.sets = Math.max(1, Math.floor(dose.sets / 2));
      else {
        const range = targetRange(dose.value, dose.unit);
        if (range) dose.value = String(Math.min(range.min, Math.max(1, Math.floor(range.min / 2))));
      }
    }
    return { ...dose, id, phase: action === 'recover' && !['warmup', 'cooldown'].includes(phase) ? 'recovery' : phase };
  }).filter(Boolean);
  next.coachAdvice = texts[action];
  next.warmupNote = action === 'reduce' ? (day.warmupNote || texts.reduce) : texts[action];
  next.cooldownNote = next.routine.some(id => exercisePhase(next, id, exercises[id]) === 'cooldown') ? (day.cooldownNote || texts[action]) : texts.noFinish;
  const remainingMain = next.routine.some(id => ['strength', 'accessory', 'skill'].includes(exercisePhase(next, id, exercises[id])));
  next.sessionType = !next.routine.length ? 'rest' : remainingMain ? 'training' : 'recovery';
  next.routine = orderedRoutine(next, exercises);
  return next;
}
