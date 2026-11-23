import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SCHEDULE_I18N } from '../locale.js';
import { auth } from '../services/firebase.js';
import { savePlan } from '../services/repository.js';
import { dateForWeekDay } from '../domain/dates.js';
import { datedPlanningSessions } from '../domain/mobility.js';
import { exercisePhase, moveWithinPhase, syncSessionType } from '../domain/phases.js';
import { normalizePlanningContext, planningExercises } from '../domain/planning.js';
import { recordPromotionEvent } from '../domain/promotion.js';
import { planningFingerprint } from '../domain/questionnaire.js';
import { readStorage, writeStorage } from '../domain/storage.js';
import { generateTemplatePlan, manualPlanningExercises } from '../domain/templatePlanner.js';
import { normalizeSchedule, prescription } from '../domain/training.js';
import { createWeeklyIntent } from '../domain/trainingPreferences.js';
import { buildWeeklyChoiceReport } from '../domain/weeklyChoices.js';

export const DEFAULT_AI_MODELS = [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }];

export function useLegacyWeeklyPlan({
  user, today, currentWeek, lastWeek, lang, t,
  data, allProgress, savedPlan, weeklyPlan, fallbackPlan, schedule, nativeSessions, hasNativeWeek,
  exercises, weeklyAvailable, difficultyLevel, progress, publicProgress, setPublicProgress,
  exerciseLogs, readinessRecords,
  planningContext, focus, time, goal, preferencesKey,
  apiKey,
  pendingDraft, onConsumeDraft, publicDraft, onPublicDraft,
  busy, busyRef, coachingBusyRef, completions, operation, requireUser, showToast,
  setReadinessPreview, onNavigateSettings, onPreviewReady, onPlanApplied, periodApplied,
}) {
  const [savingPlan, setSavingPlan] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [selected, setSelected] = useState('');
  const [adoptionError, setAdoptionError] = useState(false);
  const adoptionAttempt = useRef(false);
  const [generating, setGenerating] = useState(false);
  const [planningMode, setPlanningMode] = useState('byok');
  const [planningStep, setPlanningStep] = useState(0);
  const [message, setMessage] = useState('');
  const [editingAI, setEditingAI] = useState(true);
  const [legacyPreview, setLegacyPreview] = useState(null);
  const planRequest = useRef(0);
  const [model, setModel] = useState(() => readStorage('app_ai_model', 'gemini-2.5-flash'));
  const [models, setModels] = useState(DEFAULT_AI_MODELS);

  useEffect(() => {
    if (!apiKey || planningMode !== 'byok') return;
    let active = true;
    import('../services/gemini.js').then(({ checkAvailableModels }) => checkAvailableModels(apiKey)).then(options => {
      if (!active) return;
      setModels(options);
      setModel(previous => {
        if (options.some(option => option.id === previous)) return previous;
        writeStorage('app_ai_model', options[0].id);
        return options[0].id;
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [apiKey, planningMode]);

  const cancelEditing = () => { setDraft(null); setEditing(false); setSelected(''); };
  const enterEditing = () => {
    if (coachingBusyRef.current || busyRef.current || completions.isPending() || savingPlan || generating || pendingDraft || !requireUser() || !data.loaded.plans || !data.loaded.exercises) return;
    if (hasNativeWeek) { showToast(lang === 'zh' ? '日期課表請從日期規劃重新預覽調整。' : 'Replan the date range to edit date sessions.'); return; }
    setDraft(structuredClone(schedule)); setDraftRevision(weeklyPlan?.revision || 0); setEditing(true); setSelected('');
  };
  const saveEdits = () => operation(async () => {
    setSavingPlan(true);
    try {
      const plan = { ...(weeklyPlan || fallbackPlan), schedule: normalizeSchedule(draft, exercises), source: 'manual' };
      await savePlan(user.uid, currentWeek, plan, fallbackPlan, false, draftRevision);
      cancelEditing();
    } finally { setSavingPlan(false); }
  }, 'toastPlanSaved');
  const restore = () => operation(async () => {
    setSavingPlan(true);
    try { await savePlan(user.uid, currentWeek, null, fallbackPlan, true, weeklyPlan?.revision || 0); cancelEditing(); }
    finally { setSavingPlan(false); }
  }, 'toastRestored');
  const remove = (day, index) => setDraft(previous => previous.map(item => item.day === day ? syncSessionType({
    ...item,
    routine: item.routine.filter((_, i) => i !== index),
    ...(item.prescriptions ? { prescriptions: item.prescriptions.filter(dose => dose.id !== item.routine[index]) } : {}),
    warmupNote: '',
    cooldownNote: '',
  }, exercises) : item));
  const move = (day, id, direction) => setDraft(previous => previous.map(item => item.day === day ? moveWithinPhase(item, id, direction, exercises) : item));
  const changePhase = (day, id, phase) => {
    const target = draft.find(item => item.day === day);
    if ((target.prescriptions?.length || 0) >= 8 && !target.prescriptions.some(dose => dose.id === id)) { showToast(t('sessionExerciseLimit')); return; }
    setDraft(previous => previous.map(item => {
      if (item.day !== day) return item;
      const current = prescription(id, exercises[id].type, difficultyLevel, exercises[id], item);
      const dose = { restSeconds: 60, perSide: false, ...current, value: String(current.value), id, phase };
      if (!['strength', 'accessory'].includes(phase)) delete dose.preparation;
      return syncSessionType({ ...item, prescriptions: [...(item.prescriptions || []).filter(value => value.id !== id), dose], warmupNote: '', cooldownNote: '' }, exercises);
    }));
  };
  const add = (day, requestedPhase) => {
    if (draft.find(item => item.day === day).routine.length >= 8) { showToast(t('sessionExerciseLimit')); return; }
    if (!manualPlanningExercises(exercises, planningContext)[selected]) return;
    setDraft(previous => previous.map(item => {
      if (item.day !== day || item.routine.includes(selected)) return item;
      const exercise = exercises[selected];
      const current = prescription(selected, exercise.type, difficultyLevel, exercise);
      const dose = {
        restSeconds: 60,
        perSide: false,
        ...current,
        value: String(current.value),
        id: selected,
        phase: ['warmup', 'skill', 'strength', 'accessory', 'recovery', 'cooldown'].includes(requestedPhase)
          ? requestedPhase
          : exercisePhase({ ...item, sessionType: 'training' }, selected, exercise),
      };
      return syncSessionType({ ...item, routine: [...item.routine, selected], prescriptions: [...(item.prescriptions || []), dose], warmupNote: '', cooldownNote: '' }, exercises);
    }));
    setSelected('');
  };

  const adoptPreview = async () => {
    if (!pendingDraft || !user || savingPlan || !data.loaded.plans || !data.loaded.exercises) return;
    setSavingPlan(true); setAdoptionError(false);
    try {
      await savePlan(user.uid, currentWeek, pendingDraft.plan, fallbackPlan, false, savedPlan?.revision || 0, pendingDraft.completed, { logs: pendingDraft.logs || [], readiness: pendingDraft.readiness || [] });
      if (auth.currentUser?.uid !== user.uid) return;
      writeStorage(preferencesKey, JSON.stringify(pendingDraft.profile));
      onConsumeDraft(); showToast(t('templateSuccess'));
    } catch { setAdoptionError(true); }
    finally { setSavingPlan(false); }
  };

  useEffect(() => {
    if (!pendingDraft || !user || savedPlan || !data.loaded.plans || !data.loaded.exercises || adoptionAttempt.current) return;
    adoptionAttempt.current = true;
    // Wait for subscription state before adopting. An existing week always needs an explicit choice.
    Promise.resolve().then(async () => {
      setSavingPlan(true);
      try {
        await savePlan(user.uid, currentWeek, pendingDraft.plan, { conclusion: '', schedule: DEFAULT_SCHEDULE_I18N[lang], source: 'manual', baseDefault: true, language: lang }, false, 0, pendingDraft.completed, { logs: pendingDraft.logs || [], readiness: pendingDraft.readiness || [] });
        if (auth.currentUser?.uid !== user.uid) return;
        writeStorage(preferencesKey, JSON.stringify(pendingDraft.profile));
        onConsumeDraft();
      } catch { setAdoptionError(true); }
      finally { setSavingPlan(false); }
    });
  }, [pendingDraft, user, savedPlan, data.loaded.plans, data.loaded.exercises, currentWeek, lang, preferencesKey, onConsumeDraft]);

  const legacyFingerprint = planningFingerprint({
    week: currentWeek,
    uid: user?.uid || '',
    revision: savedPlan?.revision || 0,
    context: planningContext,
    focus,
    time,
    goal,
    message,
    mode: planningMode,
    lang,
    exercises,
    progress,
    schedule,
    feedback: allProgress[lastWeek]?.feedbackValue,
  }) + String(hasNativeWeek);

  const requestPlan = async () => {
    if (hasNativeWeek || !requireUser() || generating || savingPlan || busy || coachingBusyRef.current || pendingDraft) return;
    if (editing) { showToast(t('finishEditing')); return; }
    if (user && (!data.loaded.plans || !data.loaded.exercises)) { showToast(t('dataLoadFailed')); return; }
    if (planningMode !== 'template' && !requireUser()) return;
    if (planningMode === 'byok' && !apiKey) { showToast(t('toastNoKey')); onNavigateSettings(); return; }
    const context = normalizePlanningContext(planningContext);
    const available = planningExercises(exercises, context);
    const revision = savedPlan?.revision || 0;
    const request = ++planRequest.current;
    setGenerating(true);
    try {
      const profile = { week: currentWeek, goal, focus, time, context };
      const previous = allProgress[lastWeek] || {};
      const recentSessions = datedPlanningSessions(data.plans, nativeSessions);
      const aiGoal = [t(`focus_${focus}`), goal].filter(Boolean).join(': ');
      let result;
      if (planningMode === 'template') {
        result = generateTemplatePlan(exercises, context, time, lang,
          { currentDate: today, currentWeek, lastWeekFeedback: previous.feedbackValue, userGoal: goal, goalFocus: focus, previousPlan: savedPlan || data.plans[lastWeek] || null, previousSessions: recentSessions.filter(session => session.date < dateForWeekDay(currentWeek, 1)), mobilitySessions: recentSessions.filter(session => session.date < today), logs: exerciseLogs, progressByWeek: allProgress, readiness: readinessRecords });
      } else if (planningMode === 'trial') {
        const { requestTrialPlan } = await import('../services/aiTrial.js');
        result = await requestTrialPlan({ context, dailyTime: time, lang, currentWeek, userGoal: aiGoal.slice(0, 300), userMessage: message });
      } else {
        const { generateAIPlan } = await import('../services/gemini.js');
        result = await generateAIPlan(previous.completed || {}, difficultyLevel, previous.feedbackValue, apiKey, allProgress, data.metrics, aiGoal, time, message, available, lang, model,
          { context, currentDate: today, currentWeek, previousPlan: savedPlan || data.plans[lastWeek] || null, previousSessions: recentSessions, logs: exerciseLogs, progressByWeek: allProgress, readiness: readinessRecords });
      }
      if (request !== planRequest.current || (auth.currentUser?.uid || '') !== (user?.uid || '')) return;
      const plan = { ...result, weeklyIntent: createWeeklyIntent(context, focus, time), language: lang, source: planningMode === 'template' ? 'template' : 'ai' };
      const report = buildWeeklyChoiceReport(plan, exercises, context, weeklyAvailable, currentWeek, planningMode);
      if (report.length) {
        plan.conclusion += `\n\n${t('choiceReport')}\n${report.map(item => `${exercises[item.id]?.name || item.id}: ${item.days.length ? `${t('choicePlanned')} ${item.days.map(day => t('dayShort')[day - 1]).join(', ')}` : t(`choice_reason_${item.reason}`)}`).join('\n')}`;
      }
      const { prepareWeeklyApplication } = await import('../services/weeklyApplication.js');
      const application = await prepareWeeklyApplication(user.uid, { plan, profile, week: currentWeek }, { today, exercises, fallbackPlans: { ...data.plans, [currentWeek]: savedPlan || fallbackPlan } });
      if (request !== planRequest.current || auth.currentUser?.uid !== user.uid) return;
      setLegacyPreview({ application, plan, profile, week: currentWeek, revision, fingerprint: legacyFingerprint, mode: planningMode });
      onPreviewReady();
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error('Plan generation failed', err.code || err.message);
      showToast(t(err.message === 'PLAN_CHANGED' ? 'planChanged' : err.code === 'permission-denied' ? 'planPermissionDenied'
        : planningMode === 'template' ? 'templateError' : planningMode === 'trial' ? err.message === 'AI_TRIAL_WEEK_EXHAUSTED' ? 'trialQuota' : err.message === 'AI_TRIAL_SIGN_IN_REQUIRED' ? 'trialGoogle' : err.message === 'AI_TRIAL_WEEK_MISMATCH' ? 'trialWeekMismatch' : 'trialError' : 'toastAIError'));
    } finally { if (request === planRequest.current) setGenerating(false); }
  };

  const applyPlanPreview = async () => {
    const preview = legacyPreview;
    if (hasNativeWeek || !preview || savingPlan || generating || busy || coachingBusyRef.current || pendingDraft) return;
    if (preview.week !== currentWeek || preview.fingerprint !== legacyFingerprint) { showToast(t('choiceStale')); return; }
    setSavingPlan(true);
    try {
      const { plan, profile } = preview;
      if (!user) {
        const completed = Object.fromEntries(plan.schedule.flatMap(day => day.routine.map(id => [`day${day.day}_${id}`, publicProgress[`day${day.day}_${id}`]])).filter(([, done]) => done === true));
        onPublicDraft({ plan, profile, week: currentWeek, completed, logs: publicDraft?.logs || [], readiness: publicDraft?.readiness || [] });
        setPublicProgress(completed);
      } else {
        const { applyWeeklyApplication } = await import('../services/weeklyApplication.js');
        const result = await applyWeeklyApplication(user.uid, preview.application);
        if (auth.currentUser?.uid !== user.uid) return;
        writeStorage(preferencesKey, JSON.stringify(profile));
        periodApplied({ ...preview.application, ...result });
      }
      setReadinessPreview(null); setLegacyPreview(null); setPlanningStep(0); setEditingAI(false); setMessage('');
      onPlanApplied();
      window.scrollTo({ top: 0 });
      showToast(t(preview.mode === 'template' ? 'templateSuccess' : 'toastAISuccess'));
      recordPromotionEvent('first_plan', currentWeek);
    } catch (err) {
      showToast(t(['PLAN_CHANGED', 'PROGRESS_CHANGED'].includes(err.message) ? 'choiceStale' : err.code === 'permission-denied' ? 'planPermissionDenied' : 'toastSaveFail'));
    } finally { setSavingPlan(false); }
  };

  const selectModel = value => { setModel(value); writeStorage('app_ai_model', value); };
  const resetModels = () => setModels(DEFAULT_AI_MODELS);

  return {
    editing,
    draft,
    selected,
    setSelected,
    enterEditing,
    cancelEditing,
    saveEdits,
    restore,
    add,
    remove,
    move,
    changePhase,
    generating,
    planningMode,
    setPlanningMode,
    planningStep,
    setPlanningStep,
    message,
    setMessage,
    editingAI,
    setEditingAI,
    legacyPreview,
    setLegacyPreview,
    legacyFingerprint,
    requestPlan,
    applyPlanPreview,
    models,
    model,
    selectModel,
    resetModels,
    savingPlan,
    adoptionError,
    adoptPreview,
  };
}
