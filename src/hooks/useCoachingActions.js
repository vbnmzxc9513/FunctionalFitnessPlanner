import { useRef, useState } from 'react';
import { savePlan, setCompletion } from '../services/repository.js';
import { saveDateReadinessAdjustment } from '../services/periodRepository.js';
import { plannedSnapshot, saveNextDayResponse, saveReadiness, saveTrainingLog } from '../services/trainingRepository.js';
import { adaptDayForReadiness, evaluateReadiness, trainingLogId, validateReadiness, validateTrainingLog } from '../domain/coaching.js';
import { dateForWeekDay } from '../domain/dates.js';
import { upsertLocalPeriodLog } from '../domain/periodDraft.js';
import { normalizePlanningContext } from '../domain/planning.js';
import { recordPromotionEvent } from '../domain/promotion.js';
import { prescription } from '../domain/training.js';

export function useCoachingActions({
  user, today, currentWeek, activeDay, activeDate, lang,
  schedule, weeklyPlan, fallbackPlan, nativeSessions, activeNative,
  exercises, difficultyLevel, progress, publicProgress, setPublicProgress,
  exerciseLogs, readinessRecords,
  localPeriod, onLocalPeriod, publicDraft, onPublicDraft, pendingDraft,
  planningContext, time,
  dataLoaded, trainingLoaded, dateLoaded,
  busyRef, completions, legacyFlagsRef, coachingBusyRef: externalCoachingBusyRef,
  showToast,
}) {
  const [readinessPreview, setReadinessPreview] = useState(null);
  const [coachingBusy, setCoachingBusy] = useState(false);
  const internalCoachingBusyRef = useRef(false);
  const coachingBusyRef = externalCoachingBusyRef || internalCoachingBusyRef;

  const coachingOperation = async action => {
    const { savingPlan, generating, editing } = legacyFlagsRef?.current || {};
    if (coachingBusyRef.current || busyRef.current || completions.isPending() || savingPlan || generating || editing || pendingDraft) throw new Error('COACHING_BUSY');
    if (user && (!trainingLoaded || !dateLoaded || !dataLoaded.plans || !dataLoaded.exercises)) throw new Error('COACHING_NOT_LOADED');
    if (!user && !publicDraft && !localPeriod) throw new Error('COACHING_NO_PLAN');
    coachingBusyRef.current = true;
    setCoachingBusy(true);
    try { return await action(); }
    finally { coachingBusyRef.current = false; setCoachingBusy(false); }
  };

  const recordExercise = (record, { markComplete = false } = {}) => coachingOperation(async () => {
    const clean = validateTrainingLog(record, { today });
    if (clean.week !== currentWeek) throw new Error('INVALID_TRAINING_LOG');
    const scheduledDate = dateForWeekDay(clean.week, clean.day);
    const day = schedule.find(item => item.day === clean.day);
    const old = exerciseLogs.find(item => trainingLogId(item) === trainingLogId(clean));
    if (!day?.routine.includes(clean.exerciseId)) throw new Error('PLAN_CHANGED');
    if ((old && clean.date !== old.date) || (!old && clean.date !== today)) throw new Error('INVALID_TRAINING_LOG');
    const dose = prescription(clean.exerciseId, exercises[clean.exerciseId]?.type, difficultyLevel, exercises[clean.exerciseId], day);
    const expected = old?.planned || plannedSnapshot(dose);
    if (!['sets', 'value', 'unit', 'perSide', 'phase', 'restSeconds'].every(key => clean.planned[key] === expected[key])) throw new Error('PLAN_CHANGED');
    if (!user && !old && exerciseLogs.length >= (localPeriod ? 1120 : 40)) throw new Error('TRAINING_RECORD_LIMIT');
    if (user) {
      await saveTrainingLog(user.uid, clean, {
        fallback: weeklyPlan || fallbackPlan,
        expectedRevision: nativeSessions[scheduledDate]?.revision ?? weeklyPlan?.revision ?? 0,
        exercise: exercises[clean.exerciseId],
        level: difficultyLevel,
      });
      if (markComplete && progress[`day${clean.day}_${clean.exerciseId}`] !== true) {
        try { await setCompletion(user.uid, currentWeek, clean.day, clean.exerciseId, true, exercises[clean.exerciseId], schedule); }
        catch { throw new Error('LOG_SAVED_COMPLETION_FAILED'); }
        recordPromotionEvent('first_completion', currentWeek);
      }
    } else if (localPeriod && nativeSessions[scheduledDate]) {
      onLocalPeriod(upsertLocalPeriodLog(localPeriod, clean, markComplete, today));
    } else {
      const completed = markComplete ? { ...publicProgress, [`day${clean.day}_${clean.exerciseId}`]: true } : publicProgress;
      onPublicDraft({ ...publicDraft, completed, logs: [...exerciseLogs.filter(item => trainingLogId(item) !== trainingLogId(clean)), clean] });
      if (markComplete) { setPublicProgress(completed); recordPromotionEvent('first_completion', currentWeek); }
    }
  });

  const recordNextDay = (log, status) => coachingOperation(async () => {
    const original = exerciseLogs.find(item => trainingLogId(item) === trainingLogId(log));
    if (!original || original.date >= today || !['good', 'worse'].includes(status)) throw new Error('INVALID_NEXT_DAY');
    const clean = validateTrainingLog({ ...original, nextDay: status }, { today });
    if (user) await saveNextDayResponse(user.uid, trainingLogId(clean), status);
    else if (localPeriod) onLocalPeriod({ ...localPeriod, logs: localPeriod.logs.map(item => trainingLogId(item) === trainingLogId(clean) ? clean : item) });
    else onPublicDraft({ ...publicDraft, logs: exerciseLogs.map(item => trainingLogId(item) === trainingLogId(clean) ? clean : item) });
  });

  const recordReadiness = value => coachingOperation(async () => {
    const clean = validateReadiness(value, { today });
    if (clean.date !== today || activeDate !== today) throw new Error('READINESS_DATE_CHANGED');
    if (user) await saveReadiness(user.uid, clean);
    else if (localPeriod) onLocalPeriod({ ...localPeriod, readiness: [...readinessRecords.filter(record => record.date !== clean.date), clean] });
    else onPublicDraft({ ...publicDraft, readiness: [...readinessRecords.filter(record => record.date !== clean.date), clean] });
    setReadinessPreview(null);
  });

  const readinessFingerprint = () => JSON.stringify({
    schedule,
    revision: activeNative?.revision ?? weeklyPlan?.revision ?? 0,
    completed: progress,
    context: normalizePlanningContext(planningContext),
    time,
    lang,
    today,
  });

  const previewReadiness = value => coachingOperation(async () => {
    const clean = validateReadiness(value, { today });
    if (clean.date !== today || activeDate !== today) throw new Error('READINESS_DATE_CHANGED');
    const decision = evaluateReadiness(clean, { ...planningContext, today });
    const original = schedule.find(day => day.day === activeDay);
    const adapted = adaptDayForReadiness(original, decision, progress, exercises, lang, Number(time));
    const preview = {
      date: today,
      value: clean,
      decision,
      original,
      adapted,
      revision: activeNative?.revision ?? weeklyPlan?.revision ?? 0,
      changed: JSON.stringify({ routine: original.routine, prescriptions: original.prescriptions, sessionType: original.sessionType })
        !== JSON.stringify({ routine: adapted.routine, prescriptions: adapted.prescriptions, sessionType: adapted.sessionType }),
      fingerprint: readinessFingerprint(),
    };
    setReadinessPreview(preview);
    return preview;
  });

  const applyReadiness = value => coachingOperation(async () => {
    const clean = validateReadiness(value, { today });
    const preview = readinessPreview;
    if (!preview || clean.date !== today || activeDate !== today || preview.date !== today || JSON.stringify(preview.value) !== JSON.stringify(clean)
      || preview.fingerprint !== readinessFingerprint() || !preview.changed || ['normal', 'unknown'].includes(preview.decision.action)) {
      throw new Error('READINESS_PREVIEW_CHANGED');
    }
    // Recalculate from current unfinished work. A checkbox change or another plan revision requires a new preview.
    const adapted = adaptDayForReadiness(schedule.find(day => day.day === activeDay), preview.decision, progress, exercises, lang, Number(time));
    const plan = { ...(weeklyPlan || fallbackPlan), schedule: schedule.map(day => day.day === activeDay ? adapted : day) };
    if (user) {
      await saveReadiness(user.uid, clean);
      try {
        if (activeNative) await saveDateReadinessAdjustment(user.uid, activeDate, adapted, { expectedRevision: preview.revision, expectedCompleted: progress });
        else await savePlan(user.uid, currentWeek, plan, fallbackPlan, false, preview.revision, {}, {}, progress);
      } catch (error) {
        if (['PLAN_CHANGED', 'PROGRESS_CHANGED'].includes(error.message)) {
          setReadinessPreview(null);
          throw new Error('READINESS_PLAN_CHANGED');
        }
        throw error;
      }
    } else if (localPeriod && activeNative) {
      onLocalPeriod({
        ...localPeriod,
        sessionsByDate: { ...localPeriod.sessionsByDate, [activeDate]: { ...adapted, date: activeDate, week: currentWeek, revision: activeNative.revision + 1 } },
        readiness: [...readinessRecords.filter(record => record.date !== clean.date), clean],
      });
    } else {
      onPublicDraft({
        ...publicDraft,
        plan,
        baselinePlan: publicDraft.baselinePlan || publicDraft.plan,
        adjustment: {
          days: [...new Set([...(publicDraft.adjustment?.days || []), activeDay])],
          completed: publicDraft.adjustment?.completed || Object.fromEntries(Object.entries(progress).filter(([, done]) => done === true)),
        },
        readiness: [...readinessRecords.filter(record => record.date !== clean.date), clean],
      });
    }
    setReadinessPreview(null);
    showToast(lang === 'zh' ? '已依今日狀態調整尚未完成的訓練。' : 'Adjusted today’s unfinished training.');
  });

  return {
    coachingBusy,
    coachingBusyRef,
    readinessPreview,
    setReadinessPreview,
    coachingOperation,
    recordExercise,
    recordNextDay,
    recordReadiness,
    previewReadiness,
    applyReadiness,
  };
}
