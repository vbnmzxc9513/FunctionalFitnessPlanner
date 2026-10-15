import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, CalendarDays, Feather, Info, Loader2, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { getDoc, setDoc } from 'firebase/firestore';
import { TRANSLATIONS, EXERCISES_I18N, DEFAULT_SCHEDULE_I18N, LEGACY_DEFAULT_SCHEDULE_I18N } from './locale.js';
import { auth } from './services/firebase.js';
import { savePlan, saveFeedback, setCompletion, saveMeasurement, userDoc } from './services/repository.js';
import { checkAvailableModels, generateAIPlan, generateExerciseDetails } from './services/gemini.js';
import { useAuth } from './hooks/useAuth.js';
import { useCalendar } from './hooks/useCalendar.js';
import { useUserData } from './hooks/useUserData.js';
import { useTrainingData } from './hooks/useTrainingData.js';
import { plannedSnapshot, saveTrainingLog, saveNextDayResponse, saveReadiness } from './services/trainingRepository.js';
import { validateTrainingLog, validateReadiness, trainingLogId, evaluateReadiness, adaptDayForReadiness } from './domain/coaching.js';
import { dateForWeekDay } from './domain/dates.js';
import { availableSchedule, calculateStats, clampLevel, normalizeSchedule, prescription } from './domain/training.js';
import { exercisePhase, moveWithinPhase, syncSessionType } from './domain/phases.js';
import { monthlyStats } from './domain/training.js';
import { emptyMetrics, metricsForm, parseMetrics } from './domain/metrics.js';
import { readLanguage, readStorage, writeStorage } from './domain/storage.js';
import { DEFAULT_PLANNING_CONTEXT, normalizePlanningContext, planningExercises } from './domain/planning.js';
import LoginPrompt from './components/LoginPrompt.jsx';
import Training from './components/Training.jsx';

import Settings from './components/Settings.jsx';
import Onboarding from './components/Onboarding.jsx';
import SharedWorkout from './components/SharedWorkout.jsx';
import { readShareFromLocation } from './domain/sharing.js';
import { generateTemplatePlan, manualPlanningExercises } from './domain/templatePlanner.js';
import { trialEnabled, requestTrialPlan } from './services/aiTrial.js';
import { PROMOTION_TRANSLATIONS } from './promotionLocale.js';
import { createWeeklyIntent, normalizeWeeklyIntent } from './domain/trainingPreferences.js';
import { UX_TRANSLATIONS } from './uxLocale.js';
import { recordPromotionEvent, readPromotionDrafts, writePromotionDrafts, normalizePromotionDraft } from './domain/promotion.js';

const Coach = lazy(() => import('./components/Coach.jsx'));
const ExerciseLibrary = lazy(() => import('./components/ExerciseLibrary.jsx'));
const WeekOverview = lazy(() => import('./components/WeekOverview.jsx'));
const WeeklyBalance = lazy(() => import('./components/WeeklyBalance.jsx'));
const Metrics = lazy(() => import('./components/Metrics.jsx'));
const History = lazy(() => import('./components/History.jsx'));
const defaultModels = [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }];
const tabs = [['train', Feather, 'navTrain'], ['plan', CalendarDays, 'navPlan'], ['records', BarChart3, 'navRecords']];

export default function App() {
  const account = useAuth();
  const calendar = useCalendar();
  const [publicDraft, setPublicDraft] = useState(() => readPromotionDrafts(calendar.currentWeek).publicDraft);
  const [pendingDraft, setPendingDraft] = useState(() => readPromotionDrafts(calendar.currentWeek).pendingDraft);
  useEffect(() => { writePromotionDrafts(publicDraft, pendingDraft); }, [publicDraft, pendingDraft]);
  const [shared, setShared] = useState(() => readShareFromLocation());
  useEffect(() => {
    const update = () => setShared(readShareFromLocation());
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, []);
  const loginWithPreview = async method => {
    const preview = !account.user ? publicDraft : null;
    await account[method]();
    const uid = auth.currentUser?.uid;
    if (preview && uid) {
      const bound = { ...preview, targetUid: uid };
      writePromotionDrafts(null, bound); setPendingDraft(bound); setPublicDraft(null);
    }
  };
  const logout = async () => {
    await account.logout();
    if (!auth.currentUser) { writePromotionDrafts(null, null); setPendingDraft(null); setPublicDraft(null); }
  };
  const exitShare = () => { window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`); setShared(null); };
  if (shared) return <SharedWorkout payload={shared} exercises={EXERCISES_I18N[readLanguage()]} lang={readLanguage()} onExit={exitShare} />;
  if (account.loading) return <div className="min-h-screen flex items-center justify-center gap-2"><Loader2 className="animate-spin" />{readLanguage() === 'zh' ? '載入中…' : 'Loading…'}</div>;
  const sessionAccount = { ...account, logout, googleLogin: () => loginWithPreview('googleLogin'), guestLogin: () => loginWithPreview('guestLogin') };
  // A new UID starts with fresh data. Public previews are bound to the chosen UID only after sign-in.
  return <FitnessApp key={`${account.user?.uid || 'signed-out'}:${calendar.currentWeek}`} account={sessionAccount} calendar={calendar}
    publicDraft={publicDraft?.week === calendar.currentWeek ? publicDraft : null} onPublicDraft={setPublicDraft}
    pendingDraft={pendingDraft?.targetUid === account.user?.uid && pendingDraft?.week === calendar.currentWeek ? pendingDraft : null} onConsumeDraft={() => { writePromotionDrafts(null, null); setPendingDraft(null); }} />;
}

function FitnessApp({ account, calendar, publicDraft, onPublicDraft, pendingDraft, onConsumeDraft }) {
  const { user } = account;
  const { currentWeek, lastWeek, today } = calendar;
  const [lang, setLang] = useState(readLanguage);
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en'; }, [lang]);
  const t = key => UX_TRANSLATIONS[lang][key] ?? PROMOTION_TRANSLATIONS[lang][key] ?? TRANSLATIONS[lang][key] ?? TRANSLATIONS.zh[key] ?? key;
  const [activeTab, setActiveTab] = useState('train');
  const [planView, setPlanView] = useState('week');
  const [planScreen, setPlanScreen] = useState('overview');
  const [coachVisited, setCoachVisited] = useState(false);
  const [recordsView, setRecordsView] = useState('training');
  const [trainingMode, setTrainingMode] = useState('today');
  const [activeDay, setActiveDay] = useState(() => { const day = new Date().getDay(); return day >= 1 && day <= 5 ? day : 1; });
  const [weekLimit, setWeekLimit] = useState(104);
  const [metricLimit, setMetricLimit] = useState(365);
  const data = useUserData(user?.uid, weekLimit, metricLimit, currentWeek);
  const trainingData = useTrainingData(user?.uid, currentWeek);
  const [readinessPreview, setReadinessPreview] = useState(null);
  const [coachingBusy, setCoachingBusy] = useState(false);
  const coachingBusyRef = useRef(false);
  const exerciseLogs = user ? Object.values(trainingData.logs) : publicDraft?.logs || [];
  const readinessRecords = user ? Object.values(trainingData.readiness) : publicDraft?.readiness || [];
  const activeDate = dateForWeekDay(currentWeek, activeDay);
  const readiness = readinessRecords.find(record => record.date === activeDate) || null;
  const defaultSchedule = DEFAULT_SCHEDULE_I18N[lang];
  const exercises = { ...EXERCISES_I18N[lang] };
  for (const [id, custom] of Object.entries(data.exercises)) exercises[id] = { ...exercises[id], ...custom };
  const allProgress = data.progress;
  const [publicProgress, setPublicProgress] = useState(() => publicDraft?.completed || {});
  const progress = user ? allProgress[currentWeek]?.completed || {} : publicProgress;
  const savedPlan = data.plans[currentWeek] || null;
  const weeklyPlan = savedPlan || (!user ? publicDraft?.plan : null) || null;
  // Default/manual themes can switch language without translating stored AI text.
  const localizedSchedule = weeklyPlan?.source === 'manual' && weeklyPlan.baseDefault
    ? weeklyPlan.schedule.map(day => { const base = defaultSchedule.find(item => item.day === day.day); return { ...day, name: base.name, theme: base.theme, concept: base.concept, coachAdvice: day.coachAdvice || base.coachAdvice }; })
    : weeklyPlan?.schedule;
  const currentSchedule = normalizeSchedule(localizedSchedule, exercises, defaultSchedule);
  const schedule = weeklyPlan ? currentSchedule : availableSchedule(currentSchedule, exercises);
  const difficultyLevel = clampLevel(data.difficultyLevel);
  const [toast, setToast] = useState('');
  const toastTimer = useRef();
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const showToast = message => { clearTimeout(toastTimer.current); setToast(message); toastTimer.current = setTimeout(() => setToast(''), 3500); };
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftRevision, setDraftRevision] = useState(0);
  const [selected, setSelected] = useState('');
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [metricForm, setMetricForm] = useState(() => emptyMetrics(today));
  const preferencesKey = `planning_preferences_${user?.uid || 'signed-out'}`;
  const [preferences] = useState(() => {
    try { return JSON.parse(readStorage(preferencesKey, '{}')) || {}; } catch { return {}; }
  });
  const initialProfile = pendingDraft?.profile || (!user ? publicDraft?.profile : null) || preferences;
  const [goal, setGoal] = useState(initialProfile.goal || '');
  const [focus, setFocus] = useState(initialProfile.focus || 'balanced');
  const [planningMode, setPlanningMode] = useState('template');
  const [adoptionError, setAdoptionError] = useState(false);
  const adoptionAttempt = useRef(false);
  const [time, setTime] = useState(initialProfile.time || '30');
  const [planningContext, setPlanningContext] = useState(() => normalizePlanningContext({ ...DEFAULT_PLANNING_CONTEXT, ...initialProfile.context }));
  const [message, setMessage] = useState('');
  const [editingAI, setEditingAI] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [apiKey, setApiKey] = useState(() => readStorage('gemini_byok_key'));
  const [keyInput, setKeyInput] = useState(() => readStorage('gemini_byok_key'));
  const [model, setModel] = useState(() => readStorage('app_ai_model', 'gemini-2.5-flash'));
  const [models, setModels] = useState(defaultModels);
  const intentInitialized = useRef(false);
  useEffect(() => {
    const intent = normalizeWeeklyIntent(weeklyPlan?.weeklyIntent);
    if (!user || !intent || intentInitialized.current || pendingDraft) return;
    intentInitialized.current = true;
    // Restore only saved non-clinical weekly intent; never infer health or equipment on another device.
    Promise.resolve().then(() => {
      setFocus(intent.focus); setTime(String(intent.dailyTime));
      setPlanningContext(previous => ({ ...previous, targetRegions: intent.targetRegions, stiffnessRegions: intent.stiffnessRegions,
        badmintonDays: intent.badmintonDays, competitionDate: intent.competitionDate }));
    });
  }, [weeklyPlan?.weeklyIntent, user, pendingDraft]);
  const profileApplied = useRef(null);
  useEffect(() => {
    if (!pendingDraft || profileApplied.current === pendingDraft) return;
    profileApplied.current = pendingDraft;
    Promise.resolve().then(() => {
      setGoal(pendingDraft.profile.goal || ''); setFocus(pendingDraft.profile.focus || 'balanced');
      setTime(pendingDraft.profile.time || '30'); setPlanningContext(normalizePlanningContext(pendingDraft.profile.context));
    });
  }, [pendingDraft]);
  useEffect(() => {
    if (!apiKey || planningMode !== 'byok') return;
    let active = true;
    checkAvailableModels(apiKey).then(options => {
      if (!active) return;
      setModels(options);
      setModel(previous => {
        if (options.some(option => option.id === previous)) return previous;
        writeStorage('app_ai_model', options[0].id);
        return options[0].id;
      });
    });
    return () => { active = false; };
  }, [apiKey, planningMode]);

  const requireUser = () => { if (user) return true; showToast(t('toastRequireLogin')); setActiveTab('settings'); return false; };
  const operation = async (action, success) => {
    if (!requireUser() || busyRef.current || coachingBusyRef.current || savingPlan || generating || pendingDraft) return false;
    busyRef.current = true; setBusy(true);
    try { await action(); if (success) showToast(t(success)); return true; }
    catch (err) { console.error('Data operation failed', err); showToast(t(err.message === 'PLAN_CHANGED' ? 'planChanged' : err.message === 'INVALID_METRICS' ? 'invalidMetrics' : 'toastSaveFail')); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const fallbackPlan = { conclusion: t('manualPlan'), schedule, source: 'manual', baseDefault: true, language: lang };
  const cancelEditing = () => { setDraft(null); setEditing(false); setSelected(''); };
  const enterEditing = () => {
    if (coachingBusyRef.current || busyRef.current || savingPlan || generating || pendingDraft || !requireUser() || !data.loaded.plans || !data.loaded.exercises) return;
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
    try { await savePlan(user.uid, currentWeek, null, fallbackPlan, true, weeklyPlan?.revision || 0); cancelEditing(); setEditingAI(false); }
    finally { setSavingPlan(false); }
  }, 'toastRestored');
  const remove = (day, index) => setDraft(previous => previous.map(item => item.day === day ? syncSessionType({ ...item, routine: item.routine.filter((_, i) => i !== index),
    ...(item.prescriptions ? { prescriptions: item.prescriptions.filter(dose => dose.id !== item.routine[index]) } : {}), warmupNote: '', cooldownNote: '' }, exercises) : item));
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
      const dose = { restSeconds: 60, perSide: false, ...current, value: String(current.value), id: selected, phase: ['warmup', 'skill', 'strength', 'accessory', 'recovery', 'cooldown'].includes(requestedPhase) ? requestedPhase : exercisePhase({ ...item, sessionType: 'training' }, selected, exercise) };
      return syncSessionType({ ...item, routine: [...item.routine, selected], prescriptions: [...(item.prescriptions || []), dose], warmupNote: '', cooldownNote: '' }, exercises);
    })); setSelected('');
  };
  const toggle = (day, id) => {
    if (coachingBusyRef.current || busyRef.current || savingPlan || generating || pendingDraft) return;
    const done = !progress[`day${day}_${id}`];
    if (!user && publicDraft) {
      const completed = { ...publicProgress, [`day${day}_${id}`]: done };
      const candidate = { ...publicDraft, completed };
      if ((publicDraft.baselinePlan || publicDraft.adjustment) && !normalizePromotionDraft(candidate, currentWeek)) {
        showToast(lang === 'zh' ? '這個保留項目需要先重新產生課表再修改完成狀態；原課表與私人紀錄已保留。' : 'Generate a new plan before changing this retained item’s completion. Your current plan and private records are preserved.');
        return;
      }
      setPublicProgress(completed); onPublicDraft(candidate);
      if (done) recordPromotionEvent('first_completion', currentWeek);
      return;
    }
    operation(async () => { await setCompletion(user.uid, currentWeek, day, id, done, exercises[id], schedule); if (done) recordPromotionEvent('first_completion', currentWeek); });
  };
  const feedback = value => operation(() => saveFeedback(user.uid, currentWeek, value), 'toastFeedback');

  const coachingOperation = async action => {
    if (coachingBusyRef.current || busyRef.current || savingPlan || generating || editing || pendingDraft) throw new Error('COACHING_BUSY');
    if (user && (!trainingData.loaded || !data.loaded.plans || !data.loaded.exercises)) throw new Error('COACHING_NOT_LOADED');
    if (!user && !publicDraft) throw new Error('COACHING_NO_PLAN');
    coachingBusyRef.current = true; setCoachingBusy(true);
    try { return await action(); }
    finally { coachingBusyRef.current = false; setCoachingBusy(false); }
  };
  const recordExercise = (record, { markComplete = false } = {}) => coachingOperation(async () => {
    const clean = validateTrainingLog(record, { today });
    if (clean.week !== currentWeek) throw new Error('INVALID_TRAINING_LOG');
    const day = schedule.find(item => item.day === clean.day);
    const old = exerciseLogs.find(item => trainingLogId(item) === trainingLogId(clean));
    if (!day?.routine.includes(clean.exerciseId)) throw new Error('PLAN_CHANGED');
    if ((old && clean.date !== old.date) || (!old && clean.date !== today)) throw new Error('INVALID_TRAINING_LOG');
    const dose = prescription(clean.exerciseId, exercises[clean.exerciseId]?.type, difficultyLevel, exercises[clean.exerciseId], day);
    const expected = old?.planned || plannedSnapshot(dose);
    if (!['sets', 'value', 'unit', 'perSide', 'phase', 'restSeconds'].every(key => clean.planned[key] === expected[key])) throw new Error('PLAN_CHANGED');
    if (!user && !old && exerciseLogs.length >= 40) throw new Error('TRAINING_RECORD_LIMIT');
    if (user) {
      await saveTrainingLog(user.uid, clean, { fallback: weeklyPlan || fallbackPlan, expectedRevision: weeklyPlan?.revision || 0, exercise: exercises[clean.exerciseId], level: difficultyLevel });
      if (markComplete && progress[`day${clean.day}_${clean.exerciseId}`] !== true) {
        try { await setCompletion(user.uid, currentWeek, clean.day, clean.exerciseId, true, exercises[clean.exerciseId], schedule); }
        catch { throw new Error('LOG_SAVED_COMPLETION_FAILED'); }
        recordPromotionEvent('first_completion', currentWeek);
      }
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
    else onPublicDraft({ ...publicDraft, logs: exerciseLogs.map(item => trainingLogId(item) === trainingLogId(clean) ? clean : item) });
  });
  const recordReadiness = value => coachingOperation(async () => {
    const clean = validateReadiness(value, { today });
    if (clean.date !== today || activeDate !== today) throw new Error('READINESS_DATE_CHANGED');
    if (user) await saveReadiness(user.uid, clean);
    else onPublicDraft({ ...publicDraft, readiness: [...readinessRecords.filter(record => record.date !== clean.date), clean] });
    setReadinessPreview(null);
  });
  const readinessFingerprint = () => JSON.stringify({ schedule, revision: weeklyPlan?.revision || 0, completed: progress, context: normalizePlanningContext(planningContext), time, lang, today });
  const previewReadiness = value => coachingOperation(async () => {
    const clean = validateReadiness(value, { today });
    if (clean.date !== today || activeDate !== today) throw new Error('READINESS_DATE_CHANGED');
    const decision = evaluateReadiness(clean, { ...planningContext, today });
    const original = schedule.find(day => day.day === activeDay);
    const adapted = adaptDayForReadiness(original, decision, progress, exercises, lang, Number(time));
    const preview = { date: today, value: clean, decision, original, adapted, revision: weeklyPlan?.revision || 0,
      changed: JSON.stringify({ routine: original.routine, prescriptions: original.prescriptions, sessionType: original.sessionType }) !== JSON.stringify({ routine: adapted.routine, prescriptions: adapted.prescriptions, sessionType: adapted.sessionType }), fingerprint: readinessFingerprint() };
    setReadinessPreview(preview);
    return preview;
  });
  const applyReadiness = value => coachingOperation(async () => {
    const clean = validateReadiness(value, { today });
    const preview = readinessPreview;
    if (!preview || clean.date !== today || activeDate !== today || preview.date !== today || JSON.stringify(preview.value) !== JSON.stringify(clean)
      || preview.fingerprint !== readinessFingerprint() || !preview.changed || ['normal', 'unknown'].includes(preview.decision.action)) throw new Error('READINESS_PREVIEW_CHANGED');
    // Recalculate from current unfinished work. A checkbox change or another plan revision requires a new preview.
    const adapted = adaptDayForReadiness(schedule.find(day => day.day === activeDay), preview.decision, progress, exercises, lang, Number(time));
    const plan = { ...(weeklyPlan || fallbackPlan), schedule: schedule.map(day => day.day === activeDay ? adapted : day) };
    if (user) {
      await saveReadiness(user.uid, clean);
      try { await savePlan(user.uid, currentWeek, plan, fallbackPlan, false, preview.revision, {}, {}, progress); }
      catch (error) { if (['PLAN_CHANGED', 'PROGRESS_CHANGED'].includes(error.message)) { setReadinessPreview(null); throw new Error('READINESS_PLAN_CHANGED'); } throw error; }
    } else onPublicDraft({ ...publicDraft, plan, baselinePlan: publicDraft.baselinePlan || publicDraft.plan,
      adjustment: { days: [...new Set([...(publicDraft.adjustment?.days || []), activeDay])], completed: publicDraft.adjustment?.completed || Object.fromEntries(Object.entries(progress).filter(([, done]) => done === true)) },
      readiness: [...readinessRecords.filter(record => record.date !== clean.date), clean] });
    setReadinessPreview(null); showToast(lang === 'zh' ? '已依今日狀態調整尚未完成的訓練。' : 'Adjusted today’s unfinished training.');
  });

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
    recordPromotionEvent('next_week_visit', currentWeek);
  }, [currentWeek]);
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
  const requestPlan = async () => {
    if (generating || savingPlan || busy || coachingBusyRef.current || pendingDraft) return;
    if (editing) { showToast(t('finishEditing')); setActiveTab('train'); return; }
    if (user && (!data.loaded.plans || !data.loaded.exercises)) { showToast(t('dataLoadFailed')); return; }
    if (planningMode !== 'template' && !requireUser()) return;
    if (planningMode === 'byok' && !apiKey) { showToast(t('toastNoKey')); setActiveTab('settings'); return; }
    const context = normalizePlanningContext(planningContext);
    const available = planningExercises(exercises, context);
    const revision = savedPlan?.revision || 0;
    setGenerating(true);
    try {
      const profile = { goal, focus, time, context };
      const previous = allProgress[lastWeek] || {};
      const aiGoal = [t(`focus_${focus}`), goal].filter(Boolean).join(': ');
      let result;
      if (planningMode === 'template') result = generateTemplatePlan(exercises, context, time, lang,
        { currentDate: today, currentWeek, lastWeekFeedback: previous.feedbackValue, userGoal: goal, goalFocus: focus, previousPlan: savedPlan || data.plans[lastWeek] || null });
      else if (planningMode === 'trial') result = await requestTrialPlan({ context, dailyTime: time, lang, currentWeek, userGoal: aiGoal.slice(0, 300), userMessage: message });
      else result = await generateAIPlan(previous.completed || {}, difficultyLevel, previous.feedbackValue, apiKey, allProgress, data.metrics, aiGoal, time, message, available, lang, undefined,
        { context, currentDate: today, currentWeek, previousPlan: savedPlan || data.plans[lastWeek] || null });
      const plan = { ...result, weeklyIntent: createWeeklyIntent(context, focus, time), language: lang, source: planningMode === 'template' ? 'template' : 'ai' };
      if (!user) {
        const completed = Object.fromEntries(plan.schedule.flatMap(day => day.routine.map(id => [`day${day.day}_${id}`, publicProgress[`day${day.day}_${id}`]])).filter(([, done]) => done === true));
        onPublicDraft({ plan, profile, week: currentWeek, completed, logs: publicDraft?.logs || [], readiness: publicDraft?.readiness || [] }); setReadinessPreview(null); setPublicProgress(completed); setActiveTab('train');
      } else {
        if (auth.currentUser?.uid !== user.uid) return;
        await savePlan(user.uid, currentWeek, plan, fallbackPlan, false, revision);
        setReadinessPreview(null);
        writeStorage(preferencesKey, JSON.stringify(profile));
        showToast(t(planningMode === 'template' ? 'templateSuccess' : 'toastAISuccess'));
        setActiveTab('train');
      }
      recordPromotionEvent('first_plan', currentWeek);
      setTrainingMode('today');
      const dayOfWeek = new Date(`${today}T12:00:00`).getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) setActiveDay(dayOfWeek);
      setEditingAI(false); setMessage('');
    } catch (err) {
      console.error('Plan generation failed', err.code || err.message);
      showToast(t(err.message === 'PLAN_CHANGED' ? 'planChanged' : err.code === 'permission-denied' ? 'planPermissionDenied'
        : planningMode === 'template' ? 'templateError' : planningMode === 'trial' ? err.message === 'AI_TRIAL_WEEK_EXHAUSTED' ? 'trialQuota' : err.message === 'AI_TRIAL_SIGN_IN_REQUIRED' ? 'trialGoogle' : err.message === 'AI_TRIAL_WEEK_MISMATCH' ? 'trialWeekMismatch' : 'trialError' : 'toastAIError'));
    } finally { setGenerating(false); }
  };
  const addExercise = async () => {
    if (!requireUser() || adding || !newName.trim()) return;
    if (!apiKey) { showToast(t('toastNoKeyExercise')); return; }
    setAdding(true);
    try {
      const details = await generateExerciseDetails(newName, apiKey);
      if (auth.currentUser?.uid !== user.uid) return;
      const id = `custom_${crypto.randomUUID().replaceAll('-', '_')}`;
      await setDoc(userDoc(user.uid, 'exercises', 'custom'), { exercises: { [id]: { name: newName.trim(), ...details, active: true } } }, { merge: true });
      setNewName(''); showToast(t('toastExerciseAdded'));
    } catch (err) { console.error('Exercise creation failed', err); showToast(t('toastExerciseFail')); }
    finally { setAdding(false); }
  };
  const organizeExercise = (id, groups) => operation(async () => {
    if (!exercises[id] || exercises[id].deleted || !Array.isArray(groups) || groups.some(group => !['warmup', 'training', 'cooldown'].includes(group))) throw new Error('INVALID_LIBRARY_GROUPS');
    await setDoc(userDoc(user.uid, 'exercises', 'custom'), { exercises: { [id]: { libraryGroups: [...new Set(groups)] } } }, { merge: true });
  });
  const toggleActive = id => operation(() => setDoc(userDoc(user.uid, 'exercises', 'custom'), { exercises: { [id]: { active: exercises[id].active === false } } }, { merge: true }));
  const deleteExercise = id => { if (window.confirm(t('confirmDeleteExercise'))) operation(() => setDoc(userDoc(user.uid, 'exercises', 'custom'), { exercises: { [id]: { deleted: true, active: false } } }, { merge: true }), 'toastExerciseDeleted'); };
  const metricDateRequest = useRef(0);
  const changeMetric = async event => {
    const { name, value } = event.target;
    if (name !== 'date') { ++metricDateRequest.current; setMetricForm(previous => ({ ...previous, [name]: value })); return; }
    const request = ++metricDateRequest.current;
    const record = data.metrics.find(item => item.date === value);
    setMetricForm(metricsForm(value, record));
    if (user && value && !record) {
      try {
        const existing = await getDoc(userDoc(user.uid, 'metrics', value));
        if (request === metricDateRequest.current && auth.currentUser?.uid === user.uid && existing.exists()) setMetricForm(metricsForm(value, existing.data()));
      } catch { showToast(t('toastSaveFail')); }
    }
  };
  const saveMetrics = event => { event.preventDefault(); ++metricDateRequest.current; operation(() => saveMeasurement(user.uid, parseMetrics(metricForm)), 'toastMetricSaved'); };
  const toggleLanguage = () => { const next = lang === 'zh' ? 'en' : 'zh'; writeStorage('app_lang', next); setLang(next); };
  const saveKey = () => { if (!writeStorage('gemini_byok_key', keyInput.trim())) { showToast(t('storageUnavailable')); return; } setApiKey(keyInput.trim()); showToast(t('toastKeySaved')); };
  const clearKey = () => { if (!writeStorage('gemini_byok_key', null)) { showToast(t('storageUnavailable')); return; } setApiKey(''); setKeyInput(''); setModels(defaultModels); showToast(t('keyCleared')); };
  const selectModel = value => { setModel(value); writeStorage('app_ai_model', value); };
  const stats = activeTab === 'records' ? calculateStats(allProgress, exercises) : null;
  const months = activeTab === 'records' ? monthlyStats(allProgress, data.plans, LEGACY_DEFAULT_SCHEDULE_I18N[lang], exercises) : [];
  const heatmapWeeks = stats ? [...new Set(Object.keys(stats.dailyMap).map(key => key.slice(0, 8)))].sort().slice(-12) : [];
  const login = <LoginPrompt t={t} googleLogin={account.googleLogin} guestLogin={account.guestLogin} busy={account.busy} />;

  const planLoaded = !user || (data.loaded.plans && data.loaded.progress && data.loaded.exercises);
  const hasCurrentPlan = !!weeklyPlan || (!!user && !!allProgress[currentWeek]);
  const calendarDay = new Date(`${today}T12:00:00`).getDay();
  const weekend = calendarDay === 0 || calendarDay === 6;
  const navigate = tab => {
    if (editing) { showToast(t('finishEditing')); return; }
    if (tab === 'train') {
      setTrainingMode('today');
      if (!weekend) setActiveDay(calendarDay);
    }
    if (tab === 'plan') { setTrainingMode('plan'); setPlanScreen('overview'); setPlanView('week'); }
    setActiveTab(tab); window.scrollTo({ top: 0 });
  };
  const viewRecords = () => { setRecordsView('training'); navigate('records'); };
  const showPlanArea = activeTab === 'train' || (activeTab === 'plan' && planView === 'week');
  const firstPlan = <section data-testid="first-plan" className="setup-card">
    <div className="setup-heading"><p className="eyebrow">{t('firstPlanHint')}</p><h2>{t('firstPlanTitle')}</h2><p className="text-sm text-slate-500 mt-2">{t('firstPlanIntro')}</p></div>
    <Onboarding guided t={t} context={planningContext} setContext={setPlanningContext} time={time} setTime={setTime} focus={focus} setFocus={setFocus} goal={goal} setGoal={setGoal} message={message} setMessage={setMessage} generating={generating} onGenerate={requestPlan} />
  </section>;
  const openPlanScreen = screen => {
    if (editing && screen !== 'day') { showToast(t('finishEditing')); return; }
    setPlanScreen(screen);
    if (screen === 'settings') { setCoachVisited(true); setEditingAI(true); setPlanningMode('template'); }
    window.scrollTo({ top: 0 });
  };
  const selectPlanDay = day => { setActiveDay(day); setTrainingMode('plan'); openPlanScreen('day'); };
  const changePlanView = value => {
    if (editing && value !== 'week') { showToast(t('finishEditing')); return; }
    setPlanView(value); setPlanScreen('overview');
  };
  const subnav = (items, value, change, label) => <div aria-label={label} role="group" className="segmented-control">{items.map(([id, key]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => change(id)}>{t(key)}</button>)}</div>;


  return <div className="app-shell">
    {toast && <div role="status" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-sky-200 shadow-xl rounded-xl px-5 py-3 flex gap-2 text-sm max-w-[90vw]"><Info size={18} className="shrink-0 text-sky-600" />{toast}</div>}
    <aside className="app-sidebar">
      <header className="app-brand"><h1 className="brand-lockup"><span className="brand-mark"><Feather size={20} /></span>{t('appTitle')}</h1><button type="button" aria-current={activeTab === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')} className="settings-button"><SettingsIcon size={16} />{t('accountSettings')}</button></header>
      <nav aria-label={t('navigation')} className="app-nav">{tabs.map(([id, Icon, label]) => <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={21} />{t(label)}</button>)}</nav>
    </aside>
    <main className="app-main">
      {account.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{t(account.error)}</p>}
      {trainingData.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{t('dataLoadFailed')}</p>}
      {data.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{t('dataLoadFailed')}</p>}
      {account.migrationPending && <div role="alert" className="mb-4 bg-amber-50 p-4 rounded-xl text-sm">{t('migrationPending')}<button disabled={account.busy} onClick={account.retryMigration} className="ml-3 text-sky-600">{t('retry')}</button></div>}
      {pendingDraft && <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm space-y-3">
        <p>{t(adoptionError ? 'adoptionFailed' : savedPlan ? 'adoptExisting' : 'previewSaving')}</p>
        {(savedPlan || adoptionError) && <button disabled={savingPlan} onClick={adoptPreview} className="bg-indigo-600 text-white rounded-lg px-3 py-2">{t(savedPlan ? 'adoptPreview' : 'retryPreview')}</button>}
        <button disabled={savingPlan} onClick={onConsumeDraft} className="ml-3 underline">{t('discardPreview')}</button>
      </div>}
      {activeTab === 'plan' && (planView === 'library' || planScreen === 'overview') && <>{planView === 'library' && <div className="screen-header"><p className="eyebrow">{t('planEyebrow')}</p><h2 className="screen-title">{t('libraryTab')}</h2><p className="screen-description">{t('libraryDescription')}</p></div>}{subnav([['week', 'planningTab'], ['library', 'libraryTab']], planView, changePlanView, t('navPlan'))}</>}
      {showPlanArea && !planLoaded && <p role="status" className="p-6 text-sm">{t('loadingPlan')}</p>}
      {showPlanArea && planLoaded && !hasCurrentPlan && !pendingDraft && firstPlan}
      {activeTab === 'plan' && planView === 'week' && hasCurrentPlan && planScreen !== 'overview' && <button type="button" data-testid="back-to-week" disabled={editing} onClick={() => openPlanScreen('overview')} className="screen-back"><ArrowLeft size={16} />{t('backToWeek')}</button>}
      {activeTab === 'plan' && planView === 'week' && hasCurrentPlan && planScreen === 'overview' && <Suspense fallback={<p role="status" className="py-8 text-sm text-slate-500">{t('loadingPlan')}</p>}><WeekOverview schedule={schedule} exercises={exercises} week={currentWeek} plan={weeklyPlan} context={planningContext} focus={focus} time={time} level={difficultyLevel} lang={lang} t={t} currentDate={today} onEdit={() => openPlanScreen('settings')} onSelectDay={selectPlanDay}><WeeklyBalance schedule={schedule} exercises={exercises} context={planningContext} week={currentWeek} currentDate={today} lang={lang} /></WeekOverview></Suspense>}
      {showPlanArea && hasCurrentPlan && <>

        {activeTab === 'train' && weekend && <section className="rounded-2xl border border-sky-100 bg-white p-6 space-y-3"><h2 className="font-bold">{t('noCourtWeekend')}</h2><p className="text-sm text-slate-500">{t('noCourtWeekendHint')}</p><button onClick={() => navigate('plan')} className="rounded-xl bg-sky-600 text-white px-4 py-3 text-sm">{t('planningTab')}</button><button onClick={viewRecords} className="block text-sm text-sky-700">{t('viewRecords')}</button></section>}
      </>}
      {hasCurrentPlan && <div id="weekly-session-detail" hidden={!showPlanArea || (activeTab === 'train' && weekend) || (activeTab === 'plan' && planScreen !== 'day')}>
        <Training eligibleExercises={manualPlanningExercises(exercises, planningContext)} t={t} lang={lang} mode={trainingMode} onViewRecords={viewRecords} schedule={schedule} draft={draft} activeDay={activeDay} setActiveDay={setActiveDay} currentWeek={currentWeek} exercises={exercises} progress={progress} level={difficultyLevel} editing={editing} selected={selected} setSelected={setSelected} onEdit={enterEditing} onCancel={cancelEditing} onSave={saveEdits} onAdd={add} onRemove={remove} onMove={move} onPhase={changePhase} onToggle={toggle} onFeedback={feedback} feedback={allProgress[currentWeek]?.feedbackValue} busy={busy || generating || coachingBusy || savingPlan || !!pendingDraft} saving={savingPlan} canEdit={!!user && !!data.loaded.plans && !!data.loaded.exercises && !generating && !pendingDraft} canRestore={!!weeklyPlan?.previous} onRestore={restore} exerciseLogs={exerciseLogs} readiness={readiness} readinessPreview={readinessPreview?.date === activeDate ? readinessPreview : null} onSaveExerciseLog={user && !trainingData.loaded ? undefined : recordExercise} onUpdateNextDay={recordNextDay} onSaveReadiness={recordReadiness} onPreviewReadiness={previewReadiness} onApplyReadiness={applyReadiness} loggingBusy={coachingBusy || busy || savingPlan || generating || (!!user && !trainingData.loaded)} readinessBusy={coachingBusy || busy || savingPlan || generating || (!!user && !trainingData.loaded)} loggingDisabled={!!pendingDraft || editing || (!!user && !trainingData.loaded)} readinessDisabled={activeDate !== today || !!pendingDraft || editing || (!!user && !trainingData.loaded)} coachingContext={{ ...planningContext, today, readiness: readinessRecords.find(record => record.date === today) || null }} />
      </div>}
      {showPlanArea && hasCurrentPlan && (activeTab === 'train' || planScreen !== 'settings') && !user && publicDraft && <details className="save-panel"><summary className="cursor-pointer text-sky-800">{t('localPreview')} · {t('saveAccount')}</summary><p className="mt-2 text-slate-600">{t('localPreviewHint')}</p><div className="flex flex-wrap gap-2 mt-3"><button disabled={account.busy} onClick={account.guestLogin} className="bg-indigo-600 text-white px-3 py-2 rounded-lg">{t('savePreviewGuest')}</button><button disabled={account.busy} onClick={account.googleLogin} className="bg-white text-sky-800 px-3 py-2 rounded-lg">{t('savePreviewGoogle')}</button></div></details>}
      <Suspense fallback={<div role="status" className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
        {hasCurrentPlan && coachVisited && <div hidden={activeTab !== 'plan' || planView !== 'week' || planScreen !== 'settings'} className="max-w-3xl"><Coach standalone onClose={() => openPlanScreen('overview')} t={t} mode={planningMode} setMode={setPlanningMode} trialAvailable={trialEnabled()} focus={focus} setFocus={setFocus} plan={weeklyPlan} editing={editingAI} setEditing={setEditingAI} generating={generating} apiKey={apiKey} goal={goal} setGoal={setGoal} time={time} setTime={setTime} message={message} setMessage={setMessage} context={planningContext} setContext={setPlanningContext} onGenerate={requestPlan} onRestore={restore} /></div>}
        {activeTab === 'plan' && planView === 'library' && <ExerciseLibrary t={t} lang={lang} canManage={!!user} onOrganize={organizeExercise} onSignIn={() => navigate('settings')} exercises={exercises} name={newName} setName={setNewName} adding={adding} onAdd={addExercise} onToggle={toggleActive} onDelete={deleteExercise} busy={busy} />}
        {activeTab === 'records' && <div className="max-w-3xl"><div className="screen-header"><p className="eyebrow">{t('recordsEyebrow')}</p><h2 className="screen-title">{t('navRecords')}</h2><p className="screen-description">{t('recordsDescription')}</p></div>{subnav([['training', 'trainingRecordsTab'], ['body', 'bodyRecordsTab']], recordsView, setRecordsView, t('navRecords'))}
          {recordsView === 'body' ? (!user ? login : <Metrics t={t} form={metricForm} onChange={changeMetric} onSave={saveMetrics} history={data.metrics} saving={busy} hasMore={data.metrics.length >= metricLimit} onLoadMore={() => setMetricLimit(previous => previous + 365)} />)
            : !user && !publicDraft ? login : stats && <History t={t} lang={lang} previewOnly={!user} exercises={exercises} stats={stats} months={months} weeks={heatmapWeeks} logs={exerciseLogs} onUpdateNextDay={recordNextDay} loggingBusy={coachingBusy || busy || savingPlan || generating || editing || !!pendingDraft || (!!user && !trainingData.loaded)} today={today} hasMore={data.hasMoreProgress} onLoadMore={() => setWeekLimit(previous => previous + 104)} />}
        </div>}
      </Suspense>
      {activeTab === 'settings' && <div className="space-y-5 max-w-2xl"><h2 className="screen-title">{t('accountSettings')}</h2><section className="bg-white p-5 rounded-2xl border border-sky-100 space-y-4">
        <p className="text-sm text-slate-600">{t(!user ? 'accountStoragePublic' : user.isAnonymous ? 'accountStorageAnonymous' : 'accountStorageGoogle')}</p>
        <button onClick={toggleLanguage} className="text-sky-700 bg-sky-50 px-3 py-2 rounded-lg text-sm">🌐 {t('langToggle')}</button>
        {user ? <div className="flex flex-wrap gap-3">{user.isAnonymous && <button disabled={account.busy || !!pendingDraft} onClick={account.googleLogin} className="rounded-lg bg-sky-600 text-white px-3 py-2 text-sm disabled:opacity-50">{t('upgradeGuest')}</button>}<button disabled={account.busy} onClick={account.logout} className="flex gap-1 items-center text-sm rounded-lg bg-slate-100 px-3 py-2"><LogOut size={14} />{t('logout')}</button></div> : login}
      </section><Settings t={t} input={keyInput} setInput={setKeyInput} apiKey={apiKey} model={model} setModel={selectModel} models={models} onSave={saveKey} onClear={clearKey} /></div>}
    </main>
  </div>;
}
