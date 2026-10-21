import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, CalendarDays, Feather, Info, Loader2, ChevronLeft, ChevronRight, Pencil, Sparkles, Bookmark, Library, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { getDoc, setDoc } from 'firebase/firestore';
import { TRANSLATIONS, EXERCISES_I18N, DEFAULT_SCHEDULE_I18N, LEGACY_DEFAULT_SCHEDULE_I18N } from './locale.js';
import { auth } from './services/firebase.js';
import { savePlan, saveFeedback, setCompletion, saveMeasurement, userDoc } from './services/repository.js';
import { checkAvailableModels, generateAIPlan, generateExerciseDetails } from './services/gemini.js';
import { replaceNavigationLocation, useBackNavigation } from './hooks/useBackNavigation.js';
import { useAuth } from './hooks/useAuth.js';
import { useCalendar } from './hooks/useCalendar.js';
import { useUserData } from './hooks/useUserData.js';
import { useTrainingData } from './hooks/useTrainingData.js';
import { plannedSnapshot, saveTrainingLog, saveNextDayResponse, saveReadiness } from './services/trainingRepository.js';
import { validateTrainingLog, validateReadiness, trainingLogId, evaluateReadiness, adaptDayForReadiness } from './domain/coaching.js';
import { dateForWeekDay, getWeekString } from './domain/dates.js';
import { availableSchedule, calculateStats, clampLevel, normalizeSchedule, prescription } from './domain/training.js';
import { exercisePhase, moveWithinPhase, syncSessionType } from './domain/phases.js';
import { monthlyStats } from './domain/training.js';
import { emptyMetrics, metricsForm, parseMetrics } from './domain/metrics.js';
import { readLanguage, readStorage, writeStorage } from './domain/storage.js';
import { DEFAULT_PLANNING_CONTEXT, normalizePlanningContext, planningExercises } from './domain/planning.js';
import LoginPrompt from './components/LoginPrompt.jsx';
import Training from './components/Training.jsx';
import './plannerVisual.css';

import Settings from './components/Settings.jsx';
import PeriodWorkspace from './components/PeriodWorkspace.jsx';
import { enumeratePeriodDates } from './domain/periodPlanning.js';
import { periodQuestionnaireText } from './periodLocale.js';
import { usePlanningPeriods } from './hooks/usePlanningPeriods.js';
import { useDateSessions } from './hooks/useDateSessions.js';
import { saveDateReadinessAdjustment } from './services/periodRepository.js';
import { selectSavedPeriod, readPeriodDraft, writePeriodDraft, upsertLocalPeriodLog, periodFromWeeklyDraft, localPeriodProgressView } from './domain/periodDraft.js';
const SharedWorkout = lazy(() => import('./components/SharedWorkout.jsx'));
import { readShareFromLocation } from './domain/sharing.js';
import { readSharedPlanLocation } from './domain/sharedPlans.js';
import { useSavedWorkouts } from './hooks/useSavedWorkouts.js';
import { savedWorkoutDay } from './domain/savedWorkouts.js';
import { clearManualDraft } from './domain/manualPlanner.js';
import { generateTemplatePlan, manualPlanningExercises } from './domain/templatePlanner.js';
import { datedPlanningSessions } from './domain/mobility.js';
import { PROMOTION_TRANSLATIONS } from './promotionLocale.js';
import { createWeeklyIntent, MAX_WEEKLY_CHOICES } from './domain/trainingPreferences.js';
import { buildWeeklyChoiceReport, weeklyChoiceBlockReason } from './domain/weeklyChoices.js';
import WeeklyChoiceReport from './components/WeeklyChoiceReport.jsx';
import { trialEnabled, requestTrialPlan } from './services/aiTrial.js';
import { planningFingerprint } from './domain/questionnaire.js';
import { UX_TRANSLATIONS } from './uxLocale.js';
import { recordPromotionEvent, readPromotionDrafts, writePromotionDrafts, normalizePromotionDraft } from './domain/promotion.js';

const ManualPlanner = lazy(() => import('./components/ManualPlanner.jsx'));
const ApplyWorkoutPlan = lazy(() => import('./components/ApplyWorkoutPlan.jsx'));
const SavedWorkouts = lazy(() => import('./components/SavedWorkouts.jsx'));
const SaveWorkoutDialog = lazy(() => import('./components/SaveWorkoutDialog.jsx'));
const PlanShareDialog = lazy(() => import('./components/PlanShareDialog.jsx'));
const Coach = lazy(() => import('./components/Coach.jsx'));
const WeeklyPlanPreview = lazy(() => import('./components/WeeklyPlanPreview.jsx'));
const ExerciseLibrary = lazy(() => import('./components/ExerciseLibrary.jsx'));
const WeekOverview = lazy(() => import('./components/WeekOverview.jsx'));
const WeeklyBalance = lazy(() => import('./components/WeeklyBalance.jsx'));
const TrainingExport = lazy(() => import('./components/TrainingExport.jsx'));
const Metrics = lazy(() => import('./components/Metrics.jsx'));
const History = lazy(() => import('./components/History.jsx'));
const defaultModels = [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }];
function readSavedPeriod(key) { try { const value = JSON.parse(readStorage(key, 'null')); enumeratePeriodDates(value?.range); return value; } catch { return null; } }
const tabs = [['train', Feather, 'navTrain'], ['plan', CalendarDays, 'navPlan'], ['records', BarChart3, 'navRecords']];

export default function App() {
  const account = useAuth();
  const calendar = useCalendar();
  const [localPeriod, setLocalPeriod] = useState(readPeriodDraft);
  useEffect(() => { writePeriodDraft(localPeriod); }, [localPeriod]);
  const [publicDraft, setPublicDraft] = useState(() => readPromotionDrafts(calendar.currentWeek).publicDraft);
  const [pendingDraft, setPendingDraft] = useState(() => readPromotionDrafts(calendar.currentWeek).pendingDraft);
  useEffect(() => { writePromotionDrafts(publicDraft, pendingDraft); }, [publicDraft, pendingDraft]);
  const [shared, setShared] = useState(() => readSharedPlanLocation() || readShareFromLocation());
  useEffect(() => {
    const update = () => setShared(readSharedPlanLocation() || readShareFromLocation());
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update);
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); };
  }, []);
  const loginWithPreview = async method => {
    // Date plans retain the carried device facts and require an account preview.
    // An older weekly cache must not independently auto-adopt over that flow.
    const preview = !account.user && !localPeriod ? publicDraft : null;
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
  const exitShare = () => { replaceNavigationLocation(`${window.location.pathname}${window.location.search}`); setShared(null); };
  useBackNavigation(!!shared, exitShare, 10);
  if (shared) return <Suspense fallback={<p role="status" className="p-8">{readLanguage() === 'zh' ? '讀取分享課表…' : 'Loading shared plan…'}</p>}><SharedWorkout key={account.user?.uid || 'signed-out'} uid={account.user?.uid} authLoading={account.loading} today={calendar.today} localPeriod={localPeriod || (!account.user ? periodFromWeeklyDraft(publicDraft) : null)} onLocalPeriod={setLocalPeriod} onSignIn={account.googleLogin} payload={shared} exercises={EXERCISES_I18N[readLanguage()]} lang={readLanguage()} onExit={exitShare} /></Suspense>;
  if (account.loading) return <div className="min-h-screen flex items-center justify-center gap-2"><Loader2 className="animate-spin" />{readLanguage() === 'zh' ? '載入中…' : 'Loading…'}</div>;
  const sessionAccount = { ...account, logout, googleLogin: () => loginWithPreview('googleLogin'), guestLogin: () => loginWithPreview('guestLogin') };
  // A new UID starts with fresh data. Public previews are bound to the chosen UID only after sign-in.
  return <FitnessApp key={account.user?.uid || 'signed-out'} account={sessionAccount} calendar={calendar}
    localPeriod={localPeriod} onLocalPeriod={setLocalPeriod}
    publicDraft={publicDraft?.week === calendar.currentWeek ? publicDraft : null} onPublicDraft={setPublicDraft}
    pendingDraft={pendingDraft?.targetUid === account.user?.uid && pendingDraft?.week === calendar.currentWeek ? pendingDraft : null} onConsumeDraft={() => { writePromotionDrafts(null, null); setPendingDraft(null); }} />;
}

function FitnessApp({ account, calendar, publicDraft, onPublicDraft, pendingDraft, onConsumeDraft, localPeriod, onLocalPeriod }) {
  const { user } = account;
  const { currentWeek, lastWeek, today } = calendar;
  const [lang, setLang] = useState(readLanguage);
  useEffect(() => { document.documentElement.lang = lang === 'zh' ? 'zh-Hant' : 'en'; }, [lang]);
  const t = key => { const value = UX_TRANSLATIONS[lang][key] ?? PROMOTION_TRANSLATIONS[lang][key] ?? TRANSLATIONS[lang][key] ?? TRANSLATIONS.zh[key] ?? key; return key === 'dayShort' && Array.isArray(value) && value.length < 7 ? [...value, ...(lang === 'zh' ? ['週六', '週日'] : ['Sat', 'Sun'])] : value; };
  const [activeTab, setActiveTab] = useState('train');
  const [planView, setPlanView] = useState('week');
  const [planScreen, setPlanScreen] = useState('overview');
  const [periodCreating, setPeriodCreating] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [planScreen]);
  const workoutStore = useSavedWorkouts(user?.uid);
  const [saveWorkoutDay, setSaveWorkoutDay] = useState(null);
  const [shareRequest, setShareRequest] = useState(null);
  const [manualInput, setManualInput] = useState(undefined);
  const [assignment, setAssignment] = useState(null);
  const periodKey = `fitness_saved_period_${user?.uid || 'signed-out'}`;
  const [savedPeriod, setSavedPeriod] = useState(() => user ? readSavedPeriod(periodKey) : localPeriod);
  const [recordsView, setRecordsView] = useState('training');
  const [trainingMode, setTrainingMode] = useState('today');
  const [activeDay, setActiveDay] = useState(() => { return new Date(`${today}T12:00:00`).getDay() || 7; });
  const [weekLimit, setWeekLimit] = useState(104);
  const [metricLimit, setMetricLimit] = useState(365);
  const data = useUserData(user?.uid, weekLimit, metricLimit, currentWeek);
  const trainingData = useTrainingData(user?.uid, currentWeek);
  const periodsData = usePlanningPeriods(user?.uid);
  const dateData = useDateSessions(user?.uid, currentWeek);
  const nativeSessions = user ? dateData.sessionsByDate : localPeriod?.sessionsByDate || {};
  const hasNativeWeek = Object.keys(nativeSessions).some(date => date >= dateForWeekDay(currentWeek, 1) && date <= dateForWeekDay(currentWeek, 7));
  const [readinessPreview, setReadinessPreview] = useState(null);
  const [coachingBusy, setCoachingBusy] = useState(false);
  const coachingBusyRef = useRef(false);
  const exerciseLogs = user ? Object.values(trainingData.logs) : localPeriod?.logs || publicDraft?.logs || [];
  const readinessRecords = user ? Object.values(trainingData.readiness) : localPeriod?.readiness || publicDraft?.readiness || [];
  const activeDate = dateForWeekDay(currentWeek, activeDay);
  const readiness = readinessRecords.find(record => record.date === activeDate) || null;
  const defaultSchedule = DEFAULT_SCHEDULE_I18N[lang];
  const exercises = { ...EXERCISES_I18N[lang] };
  for (const [id, custom] of Object.entries(data.exercises)) exercises[id] = { ...exercises[id], ...custom };
  const allProgress = user ? data.progress : localPeriod ? localPeriodProgressView(localPeriod, exercises) : data.progress;
  const [publicProgress, setPublicProgress] = useState(() => publicDraft?.completed || {});
  const progress = user || localPeriod ? allProgress[currentWeek]?.completed || {} : publicProgress;
  const savedPlan = data.plans[currentWeek] || null;
  const weeklyPlan = savedPlan || (!user ? publicDraft?.plan : null) || null;
  // Default/manual themes can switch language without translating stored AI text.
  const localizedSchedule = weeklyPlan?.source === 'manual' && weeklyPlan.baseDefault
    ? weeklyPlan.schedule.map(day => { const base = defaultSchedule.find(item => item.day === day.day); return { ...day, name: base.name, theme: base.theme, concept: base.concept, coachAdvice: day.coachAdvice || base.coachAdvice }; })
    : weeklyPlan?.schedule;
  const currentSchedule = normalizeSchedule(localizedSchedule, exercises, defaultSchedule);
  const legacySchedule = weeklyPlan ? currentSchedule : availableSchedule(currentSchedule, exercises);
  const schedule = (hasNativeWeek ? Array.from({ length: 7 }, (_, index) => {
    const day = index + 1; const date = dateForWeekDay(currentWeek, day);
    return nativeSessions[date] || (weeklyPlan && !Object.hasOwn(nativeSessions, date) ? legacySchedule.find(item => item.day === day) : null) || { day, date, name: t('allDayNames')[index], theme: lang === 'zh' ? '未安排訓練' : 'No session scheduled', concept: '', routine: [], sessionType: 'rest' };
  }) : legacySchedule);
  const activeNative = nativeSessions[activeDate];
  useEffect(() => {
    if (trainingMode !== 'today') return;
    Promise.resolve().then(() => { setActiveDay(new Date(`${today}T12:00:00`).getDay() || 7); setReadinessPreview(null); });
  }, [today, trainingMode]);
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
  const [preferences] = useState(() => { try { return JSON.parse(readStorage(preferencesKey, '{}')) || {}; } catch { return {}; } });
  const initialProfile = pendingDraft?.profile || (Object.keys(preferences).length ? preferences : null) || (!user ? localPeriod?.profile || publicDraft?.profile : null) || {};
  const [goal, setGoal] = useState(initialProfile.goal || '');
  const [focus, setFocus] = useState(initialProfile.focus || 'balanced');
  const [adoptionError, setAdoptionError] = useState(false);
  const adoptionAttempt = useRef(false);
  const [time, setTime] = useState(initialProfile.time || '30');
  const [planningContext, setPlanningContext] = useState(() => normalizePlanningContext({ ...DEFAULT_PLANNING_CONTEXT, ...initialProfile.context }));
  useEffect(() => { writeStorage(preferencesKey, JSON.stringify({ context: planningContext, focus, time, goal })); }, [preferencesKey, planningContext, focus, time, goal]);
  const [generating, setGenerating] = useState(false);
  const [planningMode, setPlanningMode] = useState('byok');
  const [planningStep, setPlanningStep] = useState(0);
  const [message, setMessage] = useState('');
  const [editingAI, setEditingAI] = useState(true);
  const [legacyPreview, setLegacyPreview] = useState(null);
  const planRequest = useRef(0);
  const [apiKey, setApiKey] = useState(() => readStorage('gemini_byok_key'));
  const [keyInput, setKeyInput] = useState(() => readStorage('gemini_byok_key'));
  const [model, setModel] = useState(() => readStorage('app_ai_model', 'gemini-2.5-flash'));
  const [models, setModels] = useState(defaultModels);
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
    try { await savePlan(user.uid, currentWeek, null, fallbackPlan, true, weeklyPlan?.revision || 0); cancelEditing();  }
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
    if (nativeSessions[dateForWeekDay(currentWeek, day)] && dateForWeekDay(currentWeek, day) > today) return;
    const done = !progress[`day${day}_${id}`];
    if (!user && localPeriod && nativeSessions[dateForWeekDay(currentWeek, day)]) {
      if (dateForWeekDay(currentWeek, day) > today) return;
      const key = `day${day}_${id}`;
      const completed = { ...progress, [key]: done };
      const completedAt = { ...localPeriod.progressByWeek[currentWeek]?.completedAt };
      if (done) completedAt[key] = today; else delete completedAt[key];
      onLocalPeriod({ ...localPeriod, progressByWeek: { ...localPeriod.progressByWeek, [currentWeek]: { ...localPeriod.progressByWeek[currentWeek], completed, completedAt } } });
      return;
    }
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
    if (user && (!trainingData.loaded || !dateData.loaded || !data.loaded.plans || !data.loaded.exercises)) throw new Error('COACHING_NOT_LOADED');
    if (!user && !publicDraft && !localPeriod) throw new Error('COACHING_NO_PLAN');
    coachingBusyRef.current = true; setCoachingBusy(true);
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
      await saveTrainingLog(user.uid, clean, { fallback: weeklyPlan || fallbackPlan, expectedRevision: nativeSessions[scheduledDate]?.revision ?? weeklyPlan?.revision ?? 0, exercise: exercises[clean.exerciseId], level: difficultyLevel });
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
  const readinessFingerprint = () => JSON.stringify({ schedule, revision: activeNative?.revision ?? weeklyPlan?.revision ?? 0, completed: progress, context: normalizePlanningContext(planningContext), time, lang, today });
  const previewReadiness = value => coachingOperation(async () => {
    const clean = validateReadiness(value, { today });
    if (clean.date !== today || activeDate !== today) throw new Error('READINESS_DATE_CHANGED');
    const decision = evaluateReadiness(clean, { ...planningContext, today });
    const original = schedule.find(day => day.day === activeDay);
    const adapted = adaptDayForReadiness(original, decision, progress, exercises, lang, Number(time));
    const preview = { date: today, value: clean, decision, original, adapted, revision: activeNative?.revision ?? weeklyPlan?.revision ?? 0,
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
      try {
        if (activeNative) await saveDateReadinessAdjustment(user.uid, activeDate, adapted, { expectedRevision: preview.revision, expectedCompleted: progress });
        else await savePlan(user.uid, currentWeek, plan, fallbackPlan, false, preview.revision, {}, {}, progress);
      }
      catch (error) { if (['PLAN_CHANGED', 'PROGRESS_CHANGED'].includes(error.message)) { setReadinessPreview(null); throw new Error('READINESS_PLAN_CHANGED'); } throw error; }
    } else if (localPeriod && activeNative) onLocalPeriod({ ...localPeriod, sessionsByDate: { ...localPeriod.sessionsByDate, [activeDate]: { ...adapted, date: activeDate, week: currentWeek, revision: activeNative.revision + 1 } }, readiness: [...readinessRecords.filter(record => record.date !== clean.date), clean] });
    else onPublicDraft({ ...publicDraft, plan, baselinePlan: publicDraft.baselinePlan || publicDraft.plan,
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
  const choicesChanged = useRef(false);
  const weeklyAvailable = manualPlanningExercises(exercises, planningContext);
  const toggleWeeklyChoice = id => {
    choicesChanged.current = true;
    if (savingPlan) return;
    const ids = planningContext.weeklyExerciseIds;
    if (!ids.includes(id)) {
      if (ids.length >= MAX_WEEKLY_CHOICES) { showToast(t('choiceLimit')); return; }
      const blocked = weeklyChoiceBlockReason(id, exercises, planningContext, weeklyAvailable);
      if (blocked) { showToast(t(`choice_reason_${blocked}`)); return; }
    }
    setPlanningContext(previous => ({ ...previous, weeklyExerciseIds: previous.weeklyExerciseIds.includes(id) ? previous.weeklyExerciseIds.filter(item => item !== id) : [...previous.weeklyExerciseIds, id] }));
  };
  const legacyFingerprint = planningFingerprint({ week: currentWeek, uid: user?.uid || '', revision: savedPlan?.revision || 0, context: planningContext, focus, time, goal, message, mode: planningMode, lang, exercises, progress, schedule, feedback: allProgress[lastWeek]?.feedbackValue }) + String(hasNativeWeek);
  const requestPlan = async () => {
    if (hasNativeWeek || !requireUser() || generating || savingPlan || busy || coachingBusyRef.current || pendingDraft) return;
    if (editing) { showToast(t('finishEditing')); return; }
    if (user && (!data.loaded.plans || !data.loaded.exercises)) { showToast(t('dataLoadFailed')); return; }
    if (planningMode !== 'template' && !requireUser()) return;
    if (planningMode === 'byok' && !apiKey) { showToast(t('toastNoKey')); setActiveTab('settings'); return; }
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
      if (planningMode === 'template') result = generateTemplatePlan(exercises, context, time, lang,
        { currentDate: today, currentWeek, lastWeekFeedback: previous.feedbackValue, userGoal: goal, goalFocus: focus, previousPlan: savedPlan || data.plans[lastWeek] || null, previousSessions: recentSessions.filter(session => session.date < dateForWeekDay(currentWeek, 1)), mobilitySessions: recentSessions.filter(session => session.date < today), logs: exerciseLogs, progressByWeek: allProgress, readiness: readinessRecords });
      else if (planningMode === 'trial') result = await requestTrialPlan({ context, dailyTime: time, lang, currentWeek, userGoal: aiGoal.slice(0, 300), userMessage: message });
      else result = await generateAIPlan(previous.completed || {}, difficultyLevel, previous.feedbackValue, apiKey, allProgress, data.metrics, aiGoal, time, message, available, lang, undefined,
        { context, currentDate: today, currentWeek, previousPlan: savedPlan || data.plans[lastWeek] || null, previousSessions: recentSessions, logs: exerciseLogs, progressByWeek: allProgress, readiness: readinessRecords });
      if (request !== planRequest.current || (auth.currentUser?.uid || '') !== (user?.uid || '')) return;
      const plan = { ...result, weeklyIntent: createWeeklyIntent(context, focus, time), language: lang, source: planningMode === 'template' ? 'template' : 'ai' };
      const report = buildWeeklyChoiceReport(plan, exercises, context, weeklyAvailable, currentWeek, planningMode);
      if (report.length) {
        plan.conclusion += `\n\n${t('choiceReport')}\n${report.map(item => `${exercises[item.id]?.name || item.id}: ${item.days.length ? `${t('choicePlanned')} ${item.days.map(day => t('dayShort')[day - 1]).join(', ')}` : t(`choice_reason_${item.reason}`)}`).join('\n')}`;
      }
      setLegacyPreview({ plan, profile, week: currentWeek, revision, fingerprint: legacyFingerprint, mode: planningMode });
      setActiveTab('plan'); setPlanView('week'); setPlanScreen('legacy-preview'); window.scrollTo({ top: 0 });
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
        await savePlan(user.uid, currentWeek, plan, fallbackPlan, false, preview.revision, {}, {}, progress);
        if (auth.currentUser?.uid !== user.uid) return;
        writeStorage(preferencesKey, JSON.stringify(profile));
      }
      setReadinessPreview(null); setLegacyPreview(null); setPlanningStep(0); setEditingAI(false); setMessage('');
      setPeriodCreating(false); setTrainingMode('plan'); setActiveTab('plan'); setPlanView('week'); setPlanScreen('overview'); window.scrollTo({ top: 0 });
      showToast(t(preview.mode === 'template' ? 'templateSuccess' : 'toastAISuccess'));
      recordPromotionEvent('first_plan', currentWeek);
    } catch (err) { showToast(t(['PLAN_CHANGED', 'PROGRESS_CHANGED'].includes(err.message) ? 'choiceStale' : err.code === 'permission-denied' ? 'planPermissionDenied' : 'toastSaveFail')); }
    finally { setSavingPlan(false); }
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

  const planLoaded = !user || (data.loaded.plans && data.loaded.progress && data.loaded.exercises && dateData.loaded);
  const hasCurrentPlan = hasNativeWeek || !!weeklyPlan || (!!user && !!allProgress[currentWeek]);
  const calendarDay = new Date(`${today}T12:00:00`).getDay();
  const weekend = (calendarDay === 0 || calendarDay === 6) && !nativeSessions[today];
  const navigate = tab => {
    if (editing) { showToast(t('finishEditing')); return; }
    if (savingPlan) return;

    if (tab === 'train') {
      setTrainingMode('today');
      setActiveDay(calendarDay || 7);
    }
    setLegacyPreview(null);
    if (tab === 'plan') { setTrainingMode('plan'); setPlanScreen('overview'); setPlanView('week'); setPeriodCreating(false); }
    setActiveTab(tab); window.scrollTo({ top: 0 });
  };
  const viewRecords = () => { setRecordsView('training'); navigate('records'); };
  const showPlanArea = activeTab === 'train' || (activeTab === 'plan' && planView === 'week');
  const openPlanScreen = screen => { if (editing || savingPlan) return; setPlanScreen(screen); if (screen === 'settings') setPeriodCreating(true); window.scrollTo({ top: 0 }); };
  const selectPlanDay = day => { setActiveDay(day); setTrainingMode('plan'); openPlanScreen('day'); };
  const openWeeklySelection = () => { setActiveTab('plan'); setPlanView('week'); setPeriodCreating(true); setPlanScreen('settings'); };
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [localBrowseWeek, setLocalBrowseWeek] = useState(currentWeek);
  useEffect(() => { setLocalBrowseWeek(currentWeek); }, [currentWeek]);
  const localWeeks = [...new Set(Object.keys(localPeriod?.sessionsByDate || {}).map(date => getWeekString(new Date(`${date}T12:00:00`))))].sort().reverse();
  const cloudPeriod = periodsData.periods.find(period => period.periodId === selectedPeriodId) || periodsData.periods[0];
  const selectedPeriod = !user ? localPeriod : selectedPeriodId ? savedPeriod?.periodId === selectedPeriodId ? savedPeriod : cloudPeriod : selectSavedPeriod(savedPeriod, cloudPeriod);
  const displayWeek = localBrowseWeek || (selectedPeriod?.range?.from ? getWeekString(new Date(`${selectedPeriod.range.from}T12:00:00`)) : currentWeek);
  const dateOverview = !!selectedPeriod || displayWeek !== currentWeek;
  const calendarPeriod = useMemo(() => ({ ...selectedPeriod, range: { from: dateForWeekDay(displayWeek, 1), to: dateForWeekDay(displayWeek, 7) },
    dates: enumeratePeriodDates({ from: dateForWeekDay(displayWeek, 1), to: dateForWeekDay(displayWeek, 7) }), periodId: `view_${displayWeek}_${selectedPeriod?.periodId || 'empty'}` }), [displayWeek, selectedPeriod]);
  const shiftOverviewWeek = amount => setLocalBrowseWeek(getWeekString(new Date(`${dateForWeekDay(displayWeek, 1)}T12:00:00`), amount));
  const profile = { context: planningContext, focus, time, goal };
  const setProfile = action => { const next = typeof action === 'function' ? action(profile) : action; setPlanningContext(normalizePlanningContext(next.context)); setFocus(next.focus); setTime(next.time); setGoal(next.goal); };
  const periodApplied = preview => {
    const saved = { range: preview.range, dates: preview.dates || preview.selectedDates, profile: preview.profile, conclusion: preview.conclusion, weeklySummaries: preview.weeklySummaries, periodId: preview.periodId, createdAt: Date.now() };
    setSavedPeriod(saved); setSelectedPeriodId(preview.periodId || ''); if (user) { writeStorage(periodKey, JSON.stringify(saved)); writeStorage(preferencesKey, JSON.stringify(preview.profile)); }
    setLocalBrowseWeek(preview.sessions?.[0]?.week || currentWeek); setPeriodCreating(false); setActiveTab('plan'); setPlanView('week'); setPlanScreen('overview'); setReadinessPreview(null);
    showToast(lang === 'zh' ? '已套用所選日期的課表，已有紀錄與其他日期保持完整。' : 'Applied the selected dates. Recorded sessions and other dates are preserved.');
  };
  const openManual = (sessions) => {
    if (editing || savingPlan) return;
    setManualInput(sessions); setPeriodCreating(false); setActiveTab('plan'); setPlanView('week'); setPlanScreen('manual'); window.scrollTo({ top: 0 });
  };
  const shareDays = (days, name) => setShareRequest({ days: Array.isArray(days) ? days : [days], name: name || (lang === 'zh' ? '我的訓練課表' : 'My workout plan') });
  const useWorkout = item => {
    const day = savedWorkoutDay(item, lang);
    if (day.routine.some(id => !exercises[id] || exercises[id].deleted)) { showToast(lang === 'zh' ? '這份收藏包含已刪除或找不到的自訂動作，請先在動作庫還原，再套用。' : 'This saved workout includes unavailable custom exercises. Restore them in your library before applying.'); return; }
    setAssignment({ days: [day], name: item.name, returnScreen: 'saved' }); setPlanScreen('assign');
  };
  const plannerActions = <header className="planner-home-heading" data-testid="planner-actions">
    <h2>{lang === 'zh' ? '本週課表' : 'Weekly plan'}</h2><p>{lang === 'zh' ? '先看這週安排，再選一天查看。' : 'See your week, then open a day.'}</p>
    <div className="planner-week-nav"><button type="button" aria-label={lang === 'zh' ? '查看前一週' : 'Previous week'} onClick={() => shiftOverviewWeek(-1)}><ChevronLeft size={21} /></button><strong>{dateForWeekDay(displayWeek, 1)?.slice(5).replace('-', '/')} — {dateForWeekDay(displayWeek, 7)?.slice(5).replace('-', '/')}</strong><button type="button" aria-label={lang === 'zh' ? '查看下一週' : 'Next week'} onClick={() => shiftOverviewWeek(1)}><ChevronRight size={21} /></button></div>
    <div className="planner-mode-cards"><button type="button" data-testid="open-manual-planner" onClick={() => openManual()}><span className="planner-mode-icon"><Pencil size={23} /></span><strong>{lang === 'zh' ? '手動排課' : 'Manual plan'}</strong><span>{lang === 'zh' ? '自己挑動作、組次與日期' : 'Pick exercises, doses and dates'}</span><b>{lang === 'zh' ? '開始安排 ›' : 'Start planning ›'}</b></button><button type="button" data-testid="open-auto-planner" onClick={openWeeklySelection}><span className="planner-mode-icon planner-mode-auto"><Sparkles size={23} /></span><strong>{lang === 'zh' ? '自動排課' : 'Automatic plan'}</strong><span>{lang === 'zh' ? '回答問題，依條件搭配' : 'Answer questions for your plan'}</span><b>{lang === 'zh' ? '開始互動 ›' : 'Get started ›'}</b></button></div>
  </header>;
  const plannerTools = <div className="planner-home-tools"><button type="button" data-testid="open-saved-workouts" onClick={() => setPlanScreen('saved')}><Bookmark size={18} />{lang === 'zh' ? '我的課表' : 'My workouts'}</button><button type="button" onClick={() => changePlanView('library')}><Library size={18} />{lang === 'zh' ? '動作庫' : 'Exercise library'}</button></div>;
  const publicPeriodBase = localPeriod || (!user ? periodFromWeeklyDraft(publicDraft) : null);
  const periodWorkspace = <PeriodWorkspace key={`${user?.uid || 'public'}:${periodCreating ? 'create' : activeTab === 'plan' && dateOverview ? `${displayWeek}_${selectedPeriod?.periodId || ''}` : 'first'}`} uid={user?.uid} today={today} lang={lang} t={t} exercises={exercises} profile={profile} setProfile={setProfile} available={weeklyAvailable} onToggleWeekly={toggleWeeklyChoice} preserveCurrentChoices={choicesChanged.current} history={{ logs: exerciseLogs, progress: allProgress, readiness: readinessRecords }} localPeriod={publicPeriodBase} onLocalPeriod={onLocalPeriod} onApplied={periodApplied} fallbackPlans={data.plans} refreshToken={JSON.stringify({ progress: allProgress, logs: exerciseLogs, nativeSessions })} overview={periodCreating ? null : activeTab === 'plan' && dateOverview ? calendarPeriod : selectedPeriod} onClose={periodCreating ? () => { setPeriodCreating(false); setPlanScreen('overview'); } : undefined} onToday={() => navigate('train')} onSaveWorkout={setSaveWorkoutDay} onShare={shareDays} onEditWorkout={day => openManual([day])} />;
  const openLegacyAI = () => { if (hasNativeWeek || editing || savingPlan || !user) return; setActiveTab('plan'); setPlanView('week'); setPlanScreen('legacy-ai'); setPlanningMode('byok'); setPlanningStep(0); setEditingAI(true); setLegacyPreview(null); setPeriodCreating(false); };
  const firstPlan = <div data-testid="first-plan">{periodWorkspace}</div>;
  const changePlanView = value => {
    if (editing && value !== 'week') { showToast(t('finishEditing')); return; }
    setPlanView(value); setPlanScreen('overview');
  };
  useBackNavigation(activeTab !== 'train', () => {
    if (editing || savingPlan) { showToast(t('finishEditing')); return; }
    navigate('train');
  }, 10);
  useBackNavigation(activeTab === 'plan' && (planView !== 'week' || planScreen !== 'overview' || periodCreating), () => {
    if (editing || savingPlan || generating) { showToast(t('finishEditing')); return; }
    if (planScreen === 'assign' && assignment) { setPlanScreen(assignment.returnScreen); return; }
    setPlanScreen('overview'); setPlanView('week'); setPeriodCreating(false);
  }, 20);
  // Preserve the existing explicit Save/Cancel behavior of weekly edits.
  useBackNavigation(editing, () => showToast(t('finishEditing')), 40);
  useBackNavigation(!!saveWorkoutDay, () => setSaveWorkoutDay(null), 100);
  useBackNavigation(!!shareRequest, () => setShareRequest(null), 100);
  const subnav = (items, value, change, label) => <div aria-label={label} role="group" className="segmented-control">{items.map(([id, key]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => change(id)}>{t(key)}</button>)}</div>;


  return <div className={`app-shell ${activeTab === 'plan' ? 'planner-scope' : ''} ${activeTab === 'plan' && (['manual', 'assign'].includes(planScreen) || periodCreating) ? 'planner-immersive' : ''}`}>
    {toast && <div role="status" className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-sky-200 shadow-xl rounded-xl px-5 py-3 flex gap-2 text-sm max-w-[90vw]"><Info size={18} className="shrink-0 text-sky-600" />{toast}</div>}
    <aside className="app-sidebar">
      <header className="app-brand"><h1 className="brand-lockup"><span className="brand-mark"><Feather size={20} /></span>{t('appTitle')}</h1><button type="button" aria-current={activeTab === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')} className="settings-button"><SettingsIcon size={16} />{t('accountSettings')}</button></header>
      <nav aria-label={t('navigation')} className="app-nav">{tabs.map(([id, Icon, label]) => <button key={id} type="button" aria-current={activeTab === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={21} />{t(label)}</button>)}</nav>
    </aside>
    <main className="app-main">
      {account.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{t(account.error)}</p>}
      {periodsData.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{t('dataLoadFailed')}</p>}
      {dateData.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{t('dataLoadFailed')}</p>}
      {trainingData.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{t('dataLoadFailed')}</p>}
      {data.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{t('dataLoadFailed')}</p>}

      {account.migrationRenames?.length > 0 && <div role="status" className="panel mb-4 text-sm"><p>{lang === 'zh' ? '訪客收藏已保留。為避免覆蓋帳號中同名課表，以下收藏已改名：' : 'Guest workouts were retained. These names changed to avoid replacing existing saved workouts:'}</p><ul className="my-2 space-y-1">{account.migrationRenames.map(item => <li key={item.id}>{item.previousName} → {item.name}</li>)}</ul><button type="button" onClick={account.dismissMigrationSummary} className="text-link min-h-11">{lang === 'zh' ? '知道了' : 'Got it'}</button></div>}
      {account.migrationPending && <div role="alert" className="mb-4 bg-amber-50 p-4 rounded-xl text-sm">{t('migrationPending')}<button disabled={account.busy} onClick={account.retryMigration} className="ml-3 text-sky-600">{t('retry')}</button></div>}
      {user && localPeriod && <div role="status" className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm"><p>{lang === 'zh' ? '這台裝置的日期課表與暫存紀錄已保留。帳號課表需重新預覽後套用；暫存紀錄不會自動覆蓋帳號資料。' : 'This device’s date plan and temporary records are retained. Preview the range again to apply an account plan; local records remain available on this device.'}</p><button onClick={openWeeklySelection} className="text-link mt-2">{lang === 'zh' ? '重新預覽日期課表' : 'Preview date plan for this account'}</button><button onClick={() => navigate('settings')} className="text-link mt-2 ml-3">{lang === 'zh' ? '查看裝置暫存紀錄' : 'View this device’s temporary records'}</button>{activeTab === 'settings' && <details className="mt-4"><summary>{lang === 'zh' ? '匯出這台裝置的暫存實際紀錄' : 'Export this device’s temporary actual records'}</summary><Suspense fallback={<p>{t('loadingPlan')}</p>}><TrainingExport lang={lang} today={today} publicDraft={{ periodDraft: localPeriod }} exercises={exercises} sourceVersion={localPeriod} /></Suspense></details>}</div>}
      {pendingDraft && <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm space-y-3">
        <p>{t(adoptionError ? 'adoptionFailed' : savedPlan ? 'adoptExisting' : 'previewSaving')}</p>
        {(savedPlan || adoptionError) && <button disabled={savingPlan} onClick={adoptPreview} className="bg-indigo-600 text-white rounded-lg px-3 py-2">{t(savedPlan ? 'adoptPreview' : 'retryPreview')}</button>}
        <button disabled={savingPlan} onClick={onConsumeDraft} className="ml-3 underline">{t('discardPreview')}</button>
      </div>}
      {activeTab === 'plan' && planView === 'library' && <>{planView === 'library' && <div className="screen-header"><p className="eyebrow">{t('planEyebrow')}</p><h2 className="screen-title">{t('libraryTab')}</h2><p className="screen-description">{t('libraryDescription')}</p></div>}{subnav([['week', 'planningTab'], ['library', 'libraryTab']], planView, changePlanView, t('navPlan'))}</>}
      {showPlanArea && !planLoaded && <p role="status" className="p-6 text-sm">{t('loadingPlan')}</p>}
      {activeTab === 'plan' && planView === 'week' && planScreen === 'overview' && !periodCreating && plannerActions}
      {showPlanArea && planLoaded && !hasCurrentPlan && !selectedPeriod && !pendingDraft && (activeTab === 'train' || periodCreating) && !['manual', 'saved', 'assign', 'legacy-ai', 'legacy-preview'].includes(planScreen) && firstPlan}
      <Suspense fallback={<p role="status" className="p-6">{t('loadingPlan')}</p>}>
        {activeTab === 'plan' && planScreen === 'manual' && <ManualPlanner uid={user?.uid} today={today} lang={lang} t={t} exercises={exercises} eligibleExercises={weeklyAvailable} profile={profile} initialSessions={manualInput} onOrganize={organizeExercise} canManage={!!user} onSignIn={() => navigate('settings')} onContextChange={setPlanningContext} onProfileChange={setProfile} onCancel={() => setPlanScreen('overview')} onSaveWorkout={setSaveWorkoutDay} onShare={shareDays} onPreview={sessions => { setAssignment({ days: sessions, initialDates: sessions.map(day => day.date), name: lang === 'zh' ? '我的手動課表' : 'My manual plan', returnScreen: 'manual' }); setPlanScreen('assign'); }} />}
        {activeTab === 'plan' && planScreen === 'saved' && <SavedWorkouts store={workoutStore} exercises={exercises} lang={lang} onUse={useWorkout} onShare={item => shareDays(savedWorkoutDay(item, lang), item.name)} onClose={() => setPlanScreen('overview')} />}
        {activeTab === 'plan' && planScreen === 'assign' && assignment && <ApplyWorkoutPlan key={JSON.stringify(assignment)} {...assignment} uid={user?.uid} today={today} exercises={exercises} lang={lang} localPeriod={publicPeriodBase} onLocalPeriod={onLocalPeriod} fallbackPlans={data.plans} profile={profile} onCancel={() => setPlanScreen(assignment.returnScreen)} onEdit={days => openManual(days)} onApplied={preview => { if (assignment.returnScreen === 'manual') clearManualDraft(user?.uid); setAssignment(null); periodApplied(preview); }} />}
        {saveWorkoutDay && <SaveWorkoutDialog store={workoutStore} day={saveWorkoutDay} exercises={exercises} level={difficultyLevel} lang={lang} onClose={() => setSaveWorkoutDay(null)} onSaved={() => { setSaveWorkoutDay(null); showToast(lang === 'zh' ? '已加入我的收藏課表。' : 'Added to your saved workouts.'); }} />}
        {shareRequest && <PlanShareDialog days={shareRequest.days} name={shareRequest.name} exercises={exercises} level={difficultyLevel} uid={user?.uid} lang={lang} onClose={() => setShareRequest(null)} onSignIn={() => { setShareRequest(null); navigate('settings'); }} />}
      </Suspense>
      {activeTab === 'plan' && planView === 'week' && hasCurrentPlan && !periodCreating && ['day', 'settings'].includes(planScreen) && <button type="button" data-testid="back-to-week" disabled={editing || savingPlan} onClick={() => openPlanScreen('overview')} className="screen-back"><ArrowLeft size={16} />{t('backToWeek')}</button>}
      {activeTab === 'plan' && planView === 'week' && hasCurrentPlan && !dateOverview && !periodCreating && planScreen === 'overview' && <Suspense fallback={<p role="status" className="py-8 text-sm text-slate-500">{t('loadingPlan')}</p>}><WeekOverview compact schedule={schedule} exercises={exercises} week={currentWeek} plan={weeklyPlan} context={planningContext} focus={focus} time={time} level={difficultyLevel} lang={lang} t={t} currentDate={today} onEdit={() => openPlanScreen('settings')} onSelectDay={selectPlanDay}><WeeklyChoiceReport report={buildWeeklyChoiceReport(weeklyPlan, exercises)} exercises={exercises} t={t} /><WeeklyBalance schedule={schedule} exercises={exercises} context={planningContext} week={currentWeek} currentDate={today} lang={lang} /></WeekOverview></Suspense>}
      {activeTab === 'plan' && planView === 'week' && (hasCurrentPlan || dateOverview) && (periodCreating || (dateOverview && planScreen === 'overview')) && periodWorkspace}
      {activeTab === 'plan' && planView === 'week' && planScreen === 'overview' && !periodCreating && plannerTools}
      {activeTab === 'plan' && planView === 'week' && planScreen === 'overview' && !periodCreating && !user && localPeriod && (localWeeks.length > 1 || Object.keys(localPeriod.sessionsByDate).length > (localPeriod.dates?.length || 0)) && <details className="planner-browse-details"><summary>{lang === 'zh' ? '其他已安排日期' : 'Other scheduled dates'}</summary><label className="block text-sm mb-4">{lang === 'zh' ? '查看已安排的週' : 'Browse scheduled weeks'}<select data-testid="local-plan-view" className="block w-full mt-2 border rounded-xl p-3 bg-white" value={localBrowseWeek} onChange={event => setLocalBrowseWeek(event.target.value)}><option value="">{lang === 'zh' ? '最近套用日期' : 'Most recently applied dates'} · {localPeriod.range.from} — {localPeriod.range.to}</option>{localWeeks.map(week => <option key={week} value={week}>{dateForWeekDay(week, 1)} — {dateForWeekDay(week, 7)}</option>)}</select></label></details>}
      {activeTab === 'plan' && planView === 'week' && planScreen === 'overview' && !periodCreating && periodsData.periods.length > 1 && <label className="block text-sm mb-4">{lang === 'zh' ? '已儲存的日期規劃' : 'Saved date ranges'}<select className="block w-full mt-2 border rounded-xl p-3 bg-white" value={selectedPeriod?.periodId || ''} onChange={event => { setSelectedPeriodId(event.target.value); setSavedPeriod(null); setLocalBrowseWeek(''); }}>{periodsData.periods.map(period => <option key={period.periodId} value={period.periodId}>{period.range.from} — {period.range.to}</option>)}</select></label>}

      {activeTab === 'plan' && planView === 'week' && planScreen === 'overview' && user && !hasNativeWeek && <details className="panel mt-5 mb-5"><summary className="text-sm font-medium">{lang === 'zh' ? '進階：本週 AI 排課' : 'Advanced: AI for this week'}</summary><p className="text-sm text-slate-500 my-3">{lang === 'zh' ? `僅更新 ${currentWeek} 的週一至週五；使用自己的 API 金鑰或現有試用額度，不涵蓋所選日期範圍。` : `Updates Monday–Friday of ${currentWeek} only, using your API key or existing trial. It does not cover a selected date range.`}</p><button data-testid="legacy-ai-open" type="button" onClick={openLegacyAI} className="button-secondary">{lang === 'zh' ? '開啟本週 AI 排課' : 'Open this week’s AI planner'}</button></details>}
      {activeTab === 'plan' && hasNativeWeek && ['legacy-ai', 'legacy-preview'].includes(planScreen) && <p role="status" className="panel">{lang === 'zh' ? '本週已有日期課表，請使用日期規劃重新預覽。' : 'This week has date sessions. Use date planning to create a fresh preview.'}<button className="text-link ml-3" onClick={openWeeklySelection}>{lang === 'zh' ? '規劃日期' : 'Plan dates'}</button></p>}
      {activeTab === 'plan' && planView === 'week' && planScreen === 'legacy-ai' && !hasNativeWeek && <Suspense fallback={<p role="status">{t('loadingPlan')}</p>}><p className="text-sm text-indigo-800 mb-4">{currentWeek} · {lang === 'zh' ? '進階 AI 排課僅適用本週週一至週五' : 'Advanced AI plans Monday–Friday of this week only'}</p><Coach lang={lang} exercises={exercises} available={weeklyAvailable} onToggleWeekly={toggleWeeklyChoice} step={planningStep} onStepChange={setPlanningStep} standalone onClose={() => setPlanScreen('overview')} t={t} mode={planningMode} setMode={setPlanningMode} trialAvailable={trialEnabled()} focus={focus} setFocus={setFocus} plan={weeklyPlan} editing={editingAI} setEditing={setEditingAI} generating={generating} apiKey={apiKey} goal={goal} setGoal={setGoal} time={time} setTime={setTime} message={message} setMessage={setMessage} context={planningContext} setContext={setPlanningContext} onGenerate={requestPlan} onRestore={restore} /></Suspense>}
      {activeTab === 'plan' && planView === 'week' && planScreen === 'legacy-preview' && legacyPreview && <Suspense fallback={<p role="status">{t('loadingPlan')}</p>}><WeeklyPlanPreview preview={legacyPreview} t={t} lang={lang} exercises={exercises} available={weeklyAvailable} today={today} onBack={() => { setLegacyPreview(null); setPlanningStep(2); setPlanScreen('legacy-ai'); }} onApply={applyPlanPreview} busy={savingPlan} stale={hasNativeWeek || legacyPreview.fingerprint !== legacyFingerprint} /></Suspense>}
      {showPlanArea && hasCurrentPlan && <>

        {activeTab === 'train' && weekend && <section className="rounded-2xl border border-sky-100 bg-white p-6 space-y-3"><h2 className="font-bold">{t('noCourtWeekend')}</h2><p className="text-sm text-slate-500">{t('noCourtWeekendHint')}</p><button onClick={() => navigate('plan')} className="rounded-xl bg-sky-600 text-white px-4 py-3 text-sm">{t('planningTab')}</button><button onClick={viewRecords} className="block text-sm text-sky-700">{t('viewRecords')}</button></section>}
      </>}
      {activeTab === 'train' && planLoaded && !hasCurrentPlan && selectedPeriod && <section className="panel space-y-3"><h2 className="screen-title">{lang === 'zh' ? '今天尚未安排訓練' : 'No workout planned for today'}</h2><p className="text-sm text-slate-600">{lang === 'zh' ? '你已儲存其他日期的課表，可以到課表總覽查看，或另行規劃今天。' : 'You have plans on other dates. View your overview or plan today separately.'}</p><button type="button" onClick={() => navigate('plan')} className="button-primary">{lang === 'zh' ? '查看課表總覽' : 'View plan overview'}</button></section>}
      {hasNativeWeek && showPlanArea && !periodCreating && (activeTab === 'train' || planScreen === 'day') && <p className="mb-4 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900">{lang === 'zh' ? '日期課表的內容調整需先重新預覽；已有紀錄的日期會保留。' : 'Preview a date range to change its sessions. Dates with records are retained.'}<button type="button" onClick={openWeeklySelection} className="text-link ml-3">{lang === 'zh' ? '調整日期課表' : 'Replan dates'}</button></p>}
      {hasCurrentPlan && <div id="weekly-session-detail" hidden={!planLoaded || !showPlanArea || (activeTab === 'train' && weekend) || (activeTab === 'plan' && planScreen !== 'day')}>
        <Training onSaveWorkout={setSaveWorkoutDay} onShare={shareDays} onManualEdit={day => openManual([{ ...day, date: day.date || dateForWeekDay(currentWeek, day.day) }])} eligibleExercises={manualPlanningExercises(exercises, planningContext)} t={t} lang={lang} mode={trainingMode} onViewRecords={viewRecords} schedule={schedule} draft={draft} activeDay={activeDay} setActiveDay={setActiveDay} currentWeek={currentWeek} exercises={exercises} progress={progress} level={difficultyLevel} editing={editing} selected={selected} setSelected={setSelected} onEdit={enterEditing} onCancel={cancelEditing} onSave={saveEdits} onAdd={add} onRemove={remove} onMove={move} onPhase={changePhase} onToggle={toggle} onFeedback={feedback} feedback={allProgress[currentWeek]?.feedbackValue} busy={busy || generating || coachingBusy || savingPlan || !!pendingDraft} saving={savingPlan} canEdit={!hasNativeWeek && !!user && !!data.loaded.plans && !!data.loaded.exercises && !generating && !pendingDraft} canRestore={!hasNativeWeek && !!weeklyPlan?.previous} onRestore={restore} exerciseLogs={exerciseLogs} readiness={readiness} readinessPreview={readinessPreview?.date === activeDate ? readinessPreview : null} onSaveExerciseLog={user && !trainingData.loaded ? undefined : recordExercise} onUpdateNextDay={recordNextDay} onSaveReadiness={recordReadiness} onPreviewReadiness={previewReadiness} onApplyReadiness={applyReadiness} loggingBusy={coachingBusy || busy || savingPlan || generating || (!!user && !trainingData.loaded)} readinessBusy={coachingBusy || busy || savingPlan || generating || (!!user && !trainingData.loaded)} loggingDisabled={!!pendingDraft || editing || (!!user && !trainingData.loaded)} readinessDisabled={activeDate !== today || !!pendingDraft || editing || (!!user && !trainingData.loaded)} plannedTime={activeNative ? activeNative.weeklyIntent?.dailyTime || (!user ? localPeriod?.profile?.time : savedPeriod?.periodId === activeNative.periodId ? savedPeriod.profile?.time : undefined) : weeklyPlan?.weeklyIntent?.dailyTime} coachingContext={{ ...planningContext, today, readiness: readinessRecords.find(record => record.date === today) || null }} />
      </div>}
      {showPlanArea && hasCurrentPlan && (activeTab === 'train' || !['settings', 'saved', 'manual', 'assign'].includes(planScreen)) && !user && (publicDraft || localPeriod) && <details className="save-panel"><summary className="cursor-pointer text-sky-800">{t('localPreview')} · {localPeriod ? (lang === 'zh' ? '登入後重新預覽' : 'Sign in and re-preview') : t('saveAccount')}</summary><p className="mt-2 text-slate-600">{localPeriod ? (lang === 'zh' ? '登入後需要重新預覽並套用日期課表。這台裝置的暫存實際紀錄會保留，可在設定匯出，不會自動存入帳號。' : 'After signing in, preview and apply your date plan again. Temporary actual records stay on this device and can be exported in Settings; they are not automatically saved to your account.') : t('localPreviewHint')}</p><div className="flex flex-wrap gap-2 mt-3"><button disabled={account.busy} onClick={account.guestLogin} className="bg-indigo-600 text-white px-3 py-2 rounded-lg">{localPeriod ? (lang === 'zh' ? '訪客登入後重新預覽' : 'Guest sign-in and re-preview') : t('savePreviewGuest')}</button><button disabled={account.busy} onClick={account.googleLogin} className="bg-white text-sky-800 px-3 py-2 rounded-lg">{localPeriod ? (lang === 'zh' ? 'Google 登入後重新預覽' : 'Google sign-in and re-preview') : t('savePreviewGoogle')}</button></div></details>}
      <Suspense fallback={<div role="status" className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
        {activeTab === 'plan' && planView === 'library' && <ExerciseLibrary weeklyExerciseIds={planningContext.weeklyExerciseIds} weeklyAvailable={weeklyAvailable} planningContext={planningContext} onToggleWeekly={toggleWeeklyChoice} onOpenWeeklySelection={openWeeklySelection} t={periodQuestionnaireText(lang, t)} lang={lang} canManage={!!user} onOrganize={organizeExercise} onSignIn={() => navigate('settings')} exercises={exercises} name={newName} setName={setNewName} adding={adding} onAdd={addExercise} onToggle={toggleActive} onDelete={deleteExercise} busy={busy} />}
        {activeTab === 'records' && <div className="max-w-3xl"><div className="screen-header"><p className="eyebrow">{t('recordsEyebrow')}</p><h2 className="screen-title">{t('navRecords')}</h2><p className="screen-description">{t('recordsDescription')}</p></div>{subnav([['training', 'trainingRecordsTab'], ['body', 'bodyRecordsTab']], recordsView, setRecordsView, t('navRecords'))}
          {recordsView === 'body' ? (!user ? login : <Metrics t={t} form={metricForm} onChange={changeMetric} onSave={saveMetrics} history={data.metrics} saving={busy} hasMore={data.metrics.length >= metricLimit} onLoadMore={() => setMetricLimit(previous => previous + 365)} />)
            : !user && !publicDraft && !localPeriod ? login : stats && <History t={t} lang={lang} exportUid={user?.uid} publicDraft={localPeriod ? { ...publicDraft, periodDraft: localPeriod, logs: localPeriod.logs } : publicDraft} exportProgress={allProgress} exportDisabled={coachingBusy || busy || savingPlan || generating || editing || !!pendingDraft || (!!user && (!trainingData.loaded || !data.loaded.progress || !data.loaded.exercises))} previewOnly={!user} exercises={exercises} stats={stats} months={months} weeks={heatmapWeeks} logs={exerciseLogs} onUpdateNextDay={recordNextDay} loggingBusy={coachingBusy || busy || savingPlan || generating || editing || !!pendingDraft || (!!user && !trainingData.loaded)} today={today} hasMore={data.hasMoreProgress} onLoadMore={() => setWeekLimit(previous => previous + 104)} />}
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
