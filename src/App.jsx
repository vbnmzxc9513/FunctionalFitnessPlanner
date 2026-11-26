import './usability.css';
import './exercise-browser.css';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, CalendarDays, Feather, Info, Loader2, ChevronLeft, ChevronRight, Plus, Share2, Sparkles, Bookmark, Library, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { auth } from './services/firebase.js';
import { saveFeedback, setCompletion } from './services/repository.js';
import { replaceNavigationLocation, useBackNavigation } from './hooks/useBackNavigation.js';
import { useAuth } from './hooks/useAuth.js';
import { useCalendar } from './hooks/useCalendar.js';
import { useCompletionQueue } from './hooks/useCompletionQueue.js';
import { useUserData } from './hooks/useUserData.js';
import { useTrainingData } from './hooks/useTrainingData.js';
import { useDateSessions } from './hooks/useDateSessions.js';
import { usePlanningPeriods } from './hooks/usePlanningPeriods.js';
import { useSavedWorkouts } from './hooks/useSavedWorkouts.js';
import { useCustomExercises } from './hooks/useCustomExercises.js';
import { useCoachingActions } from './hooks/useCoachingActions.js';
import { useLegacyWeeklyPlan } from './hooks/useLegacyWeeklyPlan.js';
import { useMetricsForm } from './hooks/useMetricsForm.js';
import { useAiMembership } from './hooks/useAiMembership.js';
import { createNavigationState, navigationReducer } from './domain/appNavigation.js';
import { dateForWeekDay, getWeekString } from './domain/dates.js';
import { availableSchedule, calculateStats, clampLevel, monthlyStats, normalizeSchedule } from './domain/training.js';
import { readLanguage, readStorage, writeStorage } from './domain/storage.js';
import { DEFAULT_PLANNING_CONTEXT, normalizePlanningContext } from './domain/planning.js';
import { enumeratePeriodDates } from './domain/periodPlanning.js';
import { selectSavedPeriod, readPeriodDraft, writePeriodDraft, periodFromWeeklyDraft, localPeriodProgressView, saveLocalSingleDaySession } from './domain/periodDraft.js';
import { saveSingleDaySession } from './services/periodRepository.js';
import { getRecordedExerciseIds, quickAddExerciseToDay, quickRemoveExerciseFromDay } from './domain/singleDayEdit.js';
import { DAILY_WARMUP_IDS } from './domain/quickWorkouts.js';
import { readShareFromLocation } from './domain/sharing.js';
import { readSharedPlanLocation } from './domain/sharedPlans.js';
import { savedWorkoutDay } from './domain/savedWorkouts.js';
import { clearManualDraft, createManualSession } from './domain/manualPlanner.js';
import { manualPlanningExercises } from './domain/templatePlanner.js';
import { MAX_WEEKLY_CHOICES } from './domain/trainingPreferences.js';
import { buildWeeklyChoiceReport, weeklyChoiceBlockReason } from './domain/weeklyChoices.js';
import { recordPromotionEvent, readPromotionDrafts, writePromotionDrafts, normalizePromotionDraft } from './domain/promotion.js';
import { summarizeRecentPerformance } from './domain/periodAnalytics.js';
import { trialEnabled } from './services/aiTrialFlag.js';
import { EXERCISES_I18N, DEFAULT_SCHEDULE_I18N, LEGACY_DEFAULT_SCHEDULE_I18N } from './locale.js';
import { createTranslator } from './i18n/index.js';
import { periodQuestionnaireText } from './i18n/period.js';
import LoginPrompt from './components/LoginPrompt.jsx';
import Training from './components/Training.jsx';
import WeeklyChoiceReport from './components/WeeklyChoiceReport.jsx';
import './plannerVisual.css';

const PeriodWorkspace = lazy(() => import('./components/PeriodWorkspace.jsx'));
const Settings = lazy(() => import('./components/Settings.jsx'));

const SharedWorkout = lazy(() => import('./components/SharedWorkout.jsx'));
const ManualPlanner = lazy(() => import('./components/ManualPlanner.jsx'));
const ApplyWorkoutPlan = lazy(() => import('./components/ApplyWorkoutPlan.jsx'));
const SavedWorkouts = lazy(() => import('./components/SavedWorkouts.jsx'));
const SaveWorkoutDialog = lazy(() => import('./components/SaveWorkoutDialog.jsx'));
const PlanShareDialog = lazy(() => import('./components/PlanShareDialog.jsx'));
const Coach = lazy(() => import('./components/Coach.jsx'));
const AICoachDrawer = lazy(() => import('./components/AICoachDrawer.jsx'));
const WeeklyPlanPreview = lazy(() => import('./components/WeeklyPlanPreview.jsx'));
const ExerciseLibrary = lazy(() => import('./components/ExerciseLibrary.jsx'));
const WeekOverview = lazy(() => import('./components/WeekOverview.jsx'));
const WeeklyBalance = lazy(() => import('./components/WeeklyBalance.jsx'));
const TrainingExport = lazy(() => import('./components/TrainingExport.jsx'));
const Metrics = lazy(() => import('./components/Metrics.jsx'));
const History = lazy(() => import('./components/History.jsx'));

const EMPTY_RECORDS = Object.freeze({});
const EMPTY_ITEMS = Object.freeze([]);
function readSavedPeriod(key) { try { const value = JSON.parse(readStorage(key, 'null')); enumeratePeriodDates(value?.range); return value; } catch { return null; } }
const tabs = [['train', Feather, 'navTrain'], ['plan', CalendarDays, 'navPlan'], ['library', Library, 'navLibrary'], ['records', BarChart3, 'navRecords']];

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
  const t = useMemo(() => createTranslator(lang), [lang]);

  const [nav, dispatchNav] = useReducer(navigationReducer, { today, currentWeek }, createNavigationState);
  const { activeTab, planScreen, periodCreating, trainingMode, activeDay, recordsView, manualInput, manualActiveDate, manualSavedSource, singleDayEdit, assignment, saveWorkoutDay, shareRequest, selectedPeriodId, localBrowseWeek } = nav;
  useEffect(() => { window.scrollTo({ top: 0 }); }, [planScreen]);
  useEffect(() => { dispatchNav({ type: 'SET_LOCAL_BROWSE_WEEK', week: currentWeek }); }, [currentWeek]);

  const workoutStore = useSavedWorkouts(user?.uid);
  const [libraryView, setLibraryView] = useState('exercises');
  const [overviewSessions, setOverviewSessions] = useState({});
  const periodKey = `fitness_saved_period_${user?.uid || 'signed-out'}`;
  const [savedPeriod, setSavedPeriod] = useState(() => user ? readSavedPeriod(periodKey) : localPeriod);
  const [weekLimit, setWeekLimit] = useState(104);
  const [metricLimit, setMetricLimit] = useState(365);
  const data = useUserData(user?.uid, weekLimit, metricLimit, currentWeek);
  const trainingData = useTrainingData(user?.uid, currentWeek);
  const periodsData = usePlanningPeriods(user?.uid);
  const dateData = useDateSessions(user?.uid, currentWeek);
  const nativeSessions = user ? dateData.sessionsByDate : localPeriod?.sessionsByDate || EMPTY_RECORDS;
  const hasNativeWeek = Object.keys(nativeSessions).some(date => date >= dateForWeekDay(currentWeek, 1) && date <= dateForWeekDay(currentWeek, 7));

  const cloudLogs = user ? trainingData.logs : EMPTY_RECORDS;
  const exerciseLogs = useMemo(() => user ? Object.values(cloudLogs) : localPeriod?.logs || publicDraft?.logs || EMPTY_ITEMS, [user, cloudLogs, localPeriod?.logs, publicDraft?.logs]);
  const cloudReadiness = user ? trainingData.readiness : EMPTY_RECORDS;
  const readinessRecords = useMemo(() => user ? Object.values(cloudReadiness) : localPeriod?.readiness || publicDraft?.readiness || EMPTY_ITEMS, [user, cloudReadiness, localPeriod?.readiness, publicDraft?.readiness]);
  const activeDate = dateForWeekDay(currentWeek, activeDay);
  const readiness = readinessRecords.find(record => record.date === activeDate) || null;
  const defaultSchedule = DEFAULT_SCHEDULE_I18N[lang];

  const [toast, setToast] = useState('');
  const toastTimer = useRef();
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const showToast = useCallback(text => { clearTimeout(toastTimer.current); setToast(text); toastTimer.current = setTimeout(() => setToast(''), 3500); }, []);

  const completions = useCompletionQueue({
    confirmedProgress: data.progress,
    save: item => setCompletion(item.uid, item.week, item.day, item.id, item.value, item.exercise, item.schedule),
    onSaved: item => { if (item.value) recordPromotionEvent('first_completion', item.week); },
    onError: (_item, error) => showToast(t(error.message === 'PLAN_CHANGED' ? 'planChanged' : 'toastSaveFail')),
  });
  const [operationBusy, setBusy] = useState(false);
  const busy = operationBusy || completions.pending;
  const busyRef = useRef(false);
  const calendarDay = new Date(`${today}T12:00:00`).getDay();
  const requireUser = () => { if (user) return true; showToast(t('toastRequireLogin')); dispatchNav({ type: 'NAVIGATE', tab: 'settings' }); return false; };

  const legacyFlags = useRef({ savingPlan: false, generating: false, editing: false });
  const coachingBusySharedRef = useRef(false);
  const operation = async (action, success) => {
    if (!requireUser() || busyRef.current || completions.isPending() || coachingBusySharedRef.current || legacyFlags.current.savingPlan || legacyFlags.current.generating || pendingDraft) return false;
    busyRef.current = true; setBusy(true);
    try { await action(); if (success) showToast(t(success)); return true; }
    catch (err) { console.error('Data operation failed', err); showToast(t(err.message === 'PLAN_CHANGED' ? 'planChanged' : err.message === 'INVALID_METRICS' ? 'invalidMetrics' : 'toastSaveFail')); return false; }
    finally { busyRef.current = false; setBusy(false); }
  };

  const { exercises, adding, addExercise, organizeExercise, toggleActive, deleteExercise } = useCustomExercises({
    user, cloudExercises: data.exercises, lang, t, showToast, operation,
  });

  const allProgress = useMemo(() => user ? data.progress : localPeriod ? localPeriodProgressView(localPeriod, exercises) : data.progress, [user, data.progress, localPeriod, exercises]);
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
  const difficultyLevel = clampLevel(data.difficultyLevel);

  const preferencesKey = `planning_preferences_${user?.uid || 'signed-out'}`;
  const [preferences] = useState(() => { try { return JSON.parse(readStorage(preferencesKey, '{}')) || {}; } catch { return {}; } });
  const initialProfile = pendingDraft?.profile || (Object.keys(preferences).length ? preferences : null) || (!user ? localPeriod?.profile || publicDraft?.profile : null) || {};
  const [goal, setGoal] = useState(initialProfile.goal || '');
  const [focus, setFocus] = useState(initialProfile.focus || 'balanced');
  const [time, setTime] = useState(initialProfile.time || '30');
  const [planningContext, setPlanningContext] = useState(() => normalizePlanningContext({ ...DEFAULT_PLANNING_CONTEXT, ...initialProfile.context }));
  useEffect(() => { writeStorage(preferencesKey, JSON.stringify({ context: planningContext, focus, time, goal })); }, [preferencesKey, planningContext, focus, time, goal]);
  const [apiKey, setApiKey] = useState(() => readStorage('gemini_byok_key'));
  const [keyInput, setKeyInput] = useState(() => readStorage('gemini_byok_key'));
  const profileApplied = useRef(null);
  useEffect(() => {
    if (!pendingDraft || profileApplied.current === pendingDraft) return;
    profileApplied.current = pendingDraft;
    Promise.resolve().then(() => {
      setGoal(pendingDraft.profile.goal || ''); setFocus(pendingDraft.profile.focus || 'balanced');
      setTime(pendingDraft.profile.time || '30'); setPlanningContext(normalizePlanningContext(pendingDraft.profile.context));
    });
  }, [pendingDraft]);

  const fallbackPlan = { conclusion: t('manualPlan'), schedule, source: 'manual', baseDefault: true, language: lang };
  const coaching = useCoachingActions({
    user, today, currentWeek, activeDay, activeDate, lang,
    schedule, weeklyPlan, fallbackPlan, nativeSessions, activeNative,
    exercises, difficultyLevel, progress, publicProgress, setPublicProgress,
    exerciseLogs, readinessRecords,
    localPeriod, onLocalPeriod, publicDraft, onPublicDraft, pendingDraft,
    planningContext, time,
    dataLoaded: data.loaded, trainingLoaded: trainingData.loaded, dateLoaded: dateData.loaded,
    busyRef, completions, legacyFlagsRef: legacyFlags, coachingBusyRef: coachingBusySharedRef,
    showToast,
  });
  const { coachingBusy, coachingBusyRef, readinessPreview, setReadinessPreview, recordExercise, recordNextDay, recordReadiness, previewReadiness, applyReadiness } = coaching;

  useEffect(() => {
    if (trainingMode !== 'today') return;
    Promise.resolve().then(() => { dispatchNav({ type: 'SYNC_TODAY_DAY', today }); setReadinessPreview(null); });
  }, [today, trainingMode, setReadinessPreview]);

  const recordAppliedPeriod = preview => {
    const saved = { range: preview.range, dates: preview.dates || preview.selectedDates, profile: preview.profile, conclusion: preview.conclusion, weeklySummaries: preview.weeklySummaries, periodId: preview.periodId, createdAt: Date.now() };
    setSavedPeriod(saved);
    if (user) { writeStorage(periodKey, JSON.stringify(saved)); writeStorage(preferencesKey, JSON.stringify(preview.profile)); }
    setReadinessPreview(null);
    showToast(lang === 'zh' ? '已套用所選日期的課表，已有紀錄與其他日期保持完整。' : 'Applied the selected dates. Recorded sessions and other dates are preserved.');
  };
  const periodApplied = preview => {
    recordAppliedPeriod(preview);
    dispatchNav({ type: 'PERIOD_APPLIED', periodId: preview.periodId || '', browseWeek: preview.sessions?.[0]?.week || currentWeek });
  };

  const weeklyAvailable = useMemo(() => manualPlanningExercises(exercises, planningContext), [exercises, planningContext]);
  const legacy = useLegacyWeeklyPlan({
    user, today, currentWeek, lastWeek, lang, t,
    data, allProgress, savedPlan, weeklyPlan, fallbackPlan, schedule, nativeSessions, hasNativeWeek,
    exercises, weeklyAvailable, difficultyLevel, progress, publicProgress, setPublicProgress,
    exerciseLogs, readinessRecords,
    planningContext, focus, time, goal, preferencesKey, apiKey,
    pendingDraft, onConsumeDraft, publicDraft, onPublicDraft,
    busy, busyRef, coachingBusyRef, completions, operation, requireUser, showToast,
    setReadinessPreview,
    onNavigateSettings: () => dispatchNav({ type: 'NAVIGATE', tab: 'settings' }),
    onPreviewReady: () => dispatchNav({ type: 'LEGACY_PREVIEW_READY' }),
    onPlanApplied: () => dispatchNav({ type: 'LEGACY_PLAN_APPLIED' }),
    periodApplied,
  });
  useLayoutEffect(() => {
    legacyFlags.current = { savingPlan: legacy.savingPlan, generating: legacy.generating, editing: legacy.editing };
  }, [legacy.savingPlan, legacy.generating, legacy.editing]);
  const { editing, draft, selected, setSelected, enterEditing, cancelEditing, saveEdits, restore, add, remove, move, changePhase,
    generating, planningMode, setPlanningMode, planningStep, setPlanningStep, message, setMessage, editingAI, setEditingAI,
    legacyPreview, setLegacyPreview, legacyFingerprint, requestPlan, applyPlanPreview, models, model, selectModel, resetModels,
    savingPlan, adoptionError, adoptPreview } = legacy;

  const { metricForm, changeMetric, saveMetrics } = useMetricsForm({ user, metrics: data.metrics, today, t, showToast, operation });

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
    if (!requireUser()) return;
    completions.enqueue({ uid: user.uid, week: currentWeek, day, id, value: done, exercise: exercises[id], schedule });
  };
  const feedback = value => operation(() => saveFeedback(user.uid, currentWeek, value), 'toastFeedback');

  useEffect(() => { recordPromotionEvent('next_week_visit', currentWeek); }, [currentWeek]);
  const choicesChanged = useRef(false);
  const updatePlanningConditions = updater => {
    setPlanningContext(previous => normalizePlanningContext(typeof updater === 'function' ? updater(previous) : { ...previous, ...updater }));
  };
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

  const aiMember = useAiMembership(user?.uid);
  const toggleLanguage = () => { const next = lang === 'zh' ? 'en' : 'zh'; writeStorage('app_lang', next); setLang(next); };
  const saveKey = nextValue => {
    const cleaned = (typeof nextValue === 'string' ? nextValue : keyInput).trim();
    if (!writeStorage('gemini_byok_key', cleaned)) { showToast(t('storageUnavailable')); return false; }
    setApiKey(cleaned); setKeyInput(cleaned); showToast(t('toastKeySaved')); return true;
  };
  const clearKey = () => { if (!writeStorage('gemini_byok_key', null)) { showToast(t('storageUnavailable')); return; } setApiKey(''); setKeyInput(''); resetModels(); showToast(t('keyCleared')); };
  const stats = activeTab === 'records' ? calculateStats(allProgress, exercises) : null;
  const months = activeTab === 'records' ? monthlyStats(allProgress, data.plans, LEGACY_DEFAULT_SCHEDULE_I18N[lang], exercises) : [];
  const heatmapWeeks = stats ? [...new Set(Object.keys(stats.dailyMap).map(key => key.slice(0, 8)))].sort().slice(-12) : [];
  const login = <LoginPrompt t={t} googleLogin={account.googleLogin} guestLogin={account.guestLogin} busy={account.busy} />;

  const planLoaded = !user || (data.loaded.plans && data.loaded.progress && data.loaded.exercises && dateData.loaded);
  const hasCurrentPlan = hasNativeWeek || !!weeklyPlan || (!!user && !!allProgress[currentWeek]);
  const weekend = (calendarDay === 0 || calendarDay === 6) && !nativeSessions[today];
  const navigate = tab => {
    if (editing) { showToast(t('finishEditing')); return; }
    if (savingPlan) return;
    setLegacyPreview(null);
    dispatchNav({ type: 'NAVIGATE', tab, calendarDay });
    window.scrollTo({ top: 0 });
  };
  const viewRecords = () => {
    if (editing) { showToast(t('finishEditing')); return; }
    if (savingPlan) return;
    setLegacyPreview(null);
    dispatchNav({ type: 'VIEW_RECORDS' });
    window.scrollTo({ top: 0 });
  };
  const showPlanArea = activeTab === 'train' || activeTab === 'plan';
  const openPlanScreen = screen => { if (editing || savingPlan) return; dispatchNav({ type: 'OPEN_PLAN_SCREEN', screen }); window.scrollTo({ top: 0 }); };
  const selectPlanDay = day => { if (editing || savingPlan) return; dispatchNav({ type: 'SELECT_PLAN_DAY', day }); window.scrollTo({ top: 0 }); };
  const openWeeklySelection = () => dispatchNav({ type: 'OPEN_WEEKLY_SELECTION' });

  const localWeeks = [...new Set(Object.keys(localPeriod?.sessionsByDate || {}).map(date => getWeekString(new Date(`${date}T12:00:00`))))].sort().reverse();
  const cloudPeriod = periodsData.periods.find(period => period.periodId === selectedPeriodId) || periodsData.periods[0];
  const selectedPeriod = !user ? localPeriod : selectedPeriodId ? savedPeriod?.periodId === selectedPeriodId ? savedPeriod : cloudPeriod : selectSavedPeriod(savedPeriod, cloudPeriod);
  const displayWeek = localBrowseWeek || (selectedPeriod?.range?.from ? getWeekString(new Date(`${selectedPeriod.range.from}T12:00:00`)) : currentWeek);
  const dateOverview = !!selectedPeriod || displayWeek !== currentWeek || !hasCurrentPlan;
  const calendarPeriod = useMemo(() => ({ ...selectedPeriod, range: { from: dateForWeekDay(displayWeek, 1), to: dateForWeekDay(displayWeek, 7) },
    dates: enumeratePeriodDates({ from: dateForWeekDay(displayWeek, 1), to: dateForWeekDay(displayWeek, 7) }), periodId: `view_${displayWeek}_${selectedPeriod?.periodId || 'empty'}` }), [displayWeek, selectedPeriod]);
  const shiftOverviewWeek = amount => dispatchNav({ type: 'SET_LOCAL_BROWSE_WEEK', week: getWeekString(new Date(`${dateForWeekDay(displayWeek, 1)}T12:00:00`), amount) });
  const profile = useMemo(() => ({ context: planningContext, focus, time, goal }), [planningContext, focus, time, goal]);
  const setProfile = action => { const next = typeof action === 'function' ? action(profile) : action; setPlanningContext(normalizePlanningContext(next.context)); setFocus(next.focus); setTime(next.time); setGoal(next.goal); };

  const [quickSaving, setQuickSaving] = useState(false);
  const quickSaveDay = async (date, nextSession, successMessage) => {
    if (quickSaving || busyRef.current || coachingBusyRef.current || savingPlan || generating || pendingDraft) return false;
    setQuickSaving(true);
    try {
      if (user) {
        if (auth.currentUser?.uid !== user.uid) throw new Error('SESSION_CHANGED');
        await saveSingleDaySession(user.uid, date, nextSession, { exercises, profile, fallbackPlans: data.plans, lang });
      } else {
        if (auth.currentUser) throw new Error('SESSION_CHANGED');
        const next = saveLocalSingleDaySession(publicPeriodBase, date, nextSession, { today, exercises, profile, lang });
        if (!writePeriodDraft(next)) throw new Error('LOCAL_STORAGE_FAILED');
        onLocalPeriod(next);
      }
      if (successMessage) showToast(successMessage);
      return true;
    } catch (error) {
      console.error('Quick single-day save failed', error);
      const text = error?.message === 'AI_WARMUP_MISSING'
        ? (lang === 'zh' ? '訓練日至少需保留 1 個暖身動作；建議先加入暖身或先移除主訓練動作。' : 'A training day needs at least 1 warm-up movement.')
        : error?.message === 'LOCAL_STORAGE_FAILED'
          ? (lang === 'zh' ? '裝置儲存空間不足，修改尚未儲存。' : 'Device storage is unavailable. Not saved.')
          : t('toastSaveFail');
      showToast(text);
      return false;
    } finally {
      setQuickSaving(false);
    }
  };
  const openManual = (sessions, sourceItem = null, activeDateArg = null, options = {}) => {
    if (editing || savingPlan) return;
    dispatchNav({
      type: 'OPEN_MANUAL',
      sessions,
      sourceItem,
      activeDate: activeDateArg,
      singleDayEdit: options.single ? { returnTab: options.returnTab || activeTab, returnScreen: options.returnScreen || planScreen, returnDay: options.returnDay || sessions?.[0]?.day || activeDay, add: !!options.add } : null,
    });
    window.scrollTo({ top: 0 });
  };
  const shareDays = (days, name) => dispatchNav({ type: 'SET_SHARE_REQUEST', request: { days: Array.isArray(days) ? days : [days], name: name || (lang === 'zh' ? '我的訓練課表' : 'My workout plan') } });
  const useWorkout = async item => {
    const day = savedWorkoutDay(item, lang);
    if (day.routine.some(id => !exercises[id] || exercises[id].deleted)) { showToast(lang === 'zh' ? '這份收藏包含已刪除或找不到的自訂動作，請先在動作庫還原，再套用。' : 'This saved workout includes unavailable custom exercises. Restore them in your library before applying.'); return; }
    if (workoutStore.markUsed) await workoutStore.markUsed(item.id, item.revision);
    dispatchNav({ type: 'USE_SAVED_WORKOUT', day, name: item.name, returnTab: activeTab });
  };

  const [coachOpen, setCoachOpen] = useState(false);
  const coachActiveSession = useMemo(() => {
    if (activeTab === 'train' && weekend) return null;
    const found = schedule.find(day => day.day === activeDay) || schedule[0] || null;
    return found ? { ...found, date: found.date || dateForWeekDay(currentWeek, found.day) } : null;
  }, [activeTab, weekend, schedule, activeDay, currentWeek]);
  const coachRecentSummary = useMemo(() => (
    coachOpen
      ? summarizeRecentPerformance({
        today,
        logs: exerciseLogs,
        progressByWeek: allProgress,
        readiness: readinessRecords,
        sessions: Object.values(nativeSessions),
        metrics: data.metrics,
        exercises,
        context: planningContext,
      })
      : null
  ), [coachOpen, today, exerciseLogs, allProgress, readinessRecords, nativeSessions, data.metrics, exercises, planningContext]);

  const displayWeekDates = calendarPeriod.dates;
  const displayWeekSessions = overviewSessions[displayWeek]?.sessions
    || (displayWeek === currentWeek && hasCurrentPlan
      ? schedule.map((day, idx) => ({ ...day, date: day.date || dateForWeekDay(currentWeek, day.day || idx + 1) }))
      : []);
  const weekdayShortLabels = lang === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['一', '二', '三', '四', '五', '六', '日'];
  const stripSessionKind = (session, dayNumber) => {
    const isCourt = !!(session?.badminton || session?.courtDay || planningContext?.badmintonDays?.includes(dayNumber));
    if (!session) return isCourt ? 'court' : 'empty';
    const type = session.sessionType || (session.routine?.length ? 'training' : 'rest');
    if (type === 'training') return 'strength';
    if (type === 'recovery') return isCourt ? 'court' : 'recovery';
    return isCourt ? 'court' : 'rest';
  };
  const handleStripSelectDate = (date, index) => {
    const row = document.querySelector(`[data-testid="period-day-${date}"]`);
    if (row) {
      row.click();
      return;
    }
    if (!dateOverview && displayWeek === currentWeek && hasCurrentPlan) {
      selectPlanDay(index + 1);
    }
  };
  const savedCount = workoutStore.items?.length || 0;
  const plannerActions = <header className="planner-home-heading" data-testid="planner-actions">
    <div className="planner-week-bar">
      <div className="planner-week-nav">
        <button type="button" aria-label={lang === 'zh' ? '查看前一週' : 'Previous week'} onClick={() => shiftOverviewWeek(-1)}><ChevronLeft size={19} /></button>
        <strong>{dateForWeekDay(displayWeek, 1)?.slice(5).replace('-', '/')} — {dateForWeekDay(displayWeek, 7)?.slice(5).replace('-', '/')}</strong>
        <button type="button" aria-label={lang === 'zh' ? '查看下一週' : 'Next week'} onClick={() => shiftOverviewWeek(1)}><ChevronRight size={19} /></button>
      </div>
      <div className="planner-week-bar-tools">
        {displayWeekSessions.length > 0 && <button type="button" data-testid="share-week-plan" aria-label={lang === 'zh' ? '選擇日期分享課表' : 'Share selected days'} title={lang === 'zh' ? '選擇日期分享課表' : 'Share selected days'} onClick={() => shareDays(displayWeekSessions)} className="session-hero-icon-btn"><Share2 size={17} aria-hidden="true" /></button>}
      </div>
    </div>
    <div className="planner-day-strip" data-testid="planner-day-strip" role="group" aria-label={lang === 'zh' ? '本週日期總覽' : 'This week calendar strip'}>
      {displayWeekDates.map((date, index) => {
        const session = displayWeekSessions.find(item => item.date === date);
        const kind = stripSessionKind(session, index + 1);
        const isCurrent = date === today;
        return (
          <button
            key={date}
            type="button"
            data-testid={`planner-strip-${date}`}
            data-today={isCurrent || undefined}
            data-kind={kind}
            onClick={() => handleStripSelectDate(date, index)}
            className={`planner-strip-day ${isCurrent ? 'is-today' : ''}`}
            aria-label={`${date} ${weekdayShortLabels[index]}`}
          >
            <span className="planner-strip-weekday">{weekdayShortLabels[index]}</span>
            <strong className="planner-strip-num">{Number(date.slice(8))}</strong>
            <span className={`planner-strip-dot is-${kind}`} aria-hidden="true" />
          </button>
        );
      })}
    </div>
    <div className="planner-create-actions">
      <button type="button" data-testid="open-auto-planner" onClick={openWeeklySelection} className="button-primary"><Sparkles size={17} aria-hidden="true" />{lang === 'zh' ? '自動排課' : 'Auto plan'}</button>
      <button type="button" data-testid="open-manual-planner" onClick={() => openManual()} className="button-secondary"><Plus size={17} aria-hidden="true" />{lang === 'zh' ? '手動排課' : 'Create workout'}</button>
    </div>
  </header>;
  // A stable conversion prevents overview load -> parent update -> reload loops.
  const publicPeriodBase = useMemo(() => localPeriod || (!user ? periodFromWeeklyDraft(publicDraft) : null), [localPeriod, user, publicDraft]);
  const periodHistory = useMemo(() => ({ logs: exerciseLogs, progress: allProgress, readiness: readinessRecords }), [exerciseLogs, allProgress, readinessRecords]);
  const periodRefresh = useMemo(() => JSON.stringify({ progress: allProgress, logs: exerciseLogs, nativeSessions }), [allProgress, exerciseLogs, nativeSessions]);
  const [coachPlannerNote, setCoachPlannerNote] = useState('');
  const consumeCoachPlannerNote = useCallback(() => setCoachPlannerNote(''), []);
  const swapCoachExercise = async (oldId, newId) => {
    if (!coachActiveSession || !oldId || !newId || oldId === newId) return false;
    if (DAILY_WARMUP_IDS.includes(oldId)) {
      showToast(lang === 'zh' ? '固定八段動態暖身不可替換。' : 'The 8-item dynamic warm-up cannot be swapped.');
      return false;
    }
    const sessionDate = coachActiveSession.date || activeDate;
    const routine = Array.isArray(coachActiveSession.routine) ? coachActiveSession.routine : [];
    if (!routine.includes(oldId) || routine.includes(newId)) return false;
    if (!weeklyAvailable[newId]) {
      showToast(lang === 'zh' ? '目標替代動作不符合目前器材或安全條件。' : 'Suggested replacement does not match current equipment or safety settings.');
      return false;
    }
    const recordedIds = getRecordedExerciseIds(sessionDate, { progressByWeek: allProgress, logs: exerciseLogs });
    if (recordedIds.has(oldId)) {
      showToast(lang === 'zh' ? '該動作今天已有完成紀錄，無法直接替換。' : 'This exercise already has a record today and cannot be swapped.');
      return false;
    }
    try {
      let swapped;
      try {
        const removed = quickRemoveExerciseFromDay(coachActiveSession, oldId, { recordedIds, exercises, lang });
        swapped = quickAddExerciseToDay(removed, newId, { exercises, eligibleExercises: weeklyAvailable, lang });
      } catch (inner) {
        if (inner?.message !== 'AI_WARMUP_MISSING') throw inner;
        const added = quickAddExerciseToDay(coachActiveSession, newId, { exercises, eligibleExercises: weeklyAvailable, lang });
        swapped = quickRemoveExerciseFromDay(added, oldId, { recordedIds, exercises, lang });
      }
      const oldName = exercises[oldId]?.name || oldId;
      const newName = exercises[newId]?.name || newId;
      const msg = lang === 'zh' ? `已將「${oldName}」換成「${newName}」` : `Swapped "${oldName}" to "${newName}"`;
      return await quickSaveDay(sessionDate, swapped, msg);
    } catch (error) {
      console.error('AI Coach swap failed', error);
      showToast(t('toastSaveFail'));
      return false;
    }
  };
  const sendCoachToPlanner = note => {
    const clean = String(note || '').trim();
    if (!clean) return;
    setCoachPlannerNote(clean);
    setCoachOpen(false);
    openWeeklySelection();
  };

  const renderPeriodWorkspace = () => <PeriodWorkspace key={`${user?.uid || 'public'}:${periodCreating ? 'create' : activeTab === 'plan' && dateOverview ? `${displayWeek}_${selectedPeriod?.periodId || ''}` : 'first'}`} uid={user?.uid} today={today} lang={lang} t={t} exercises={exercises} profile={profile} setProfile={setProfile} available={weeklyAvailable} onToggleWeekly={toggleWeeklyChoice} preserveCurrentChoices={choicesChanged.current} history={periodHistory} metrics={data.metrics} apiKey={apiKey} onSaveKey={saveKey} model={model} models={models} onSelectModel={selectModel} aiMember={aiMember} onSignIn={() => navigate('settings')} localPeriod={publicPeriodBase} onLocalPeriod={onLocalPeriod} onApplied={periodApplied} fallbackPlans={data.plans} refreshToken={periodRefresh} overview={periodCreating ? null : activeTab === 'plan' && dateOverview ? calendarPeriod : selectedPeriod} onClose={periodCreating ? () => dispatchNav({ type: 'CLOSE_PERIOD_CREATING' }) : undefined} onToday={() => navigate('train')} onSaveWorkout={day => dispatchNav({ type: 'SET_SAVE_WORKOUT_DAY', day })} onShare={shareDays} onOverviewLoaded={sessions => { const sig = JSON.stringify(sessions.map(s => [s.date, s.sessionType, s.theme, s.routine?.length, s.badminton, s.courtDay])); setOverviewSessions(previous => previous[displayWeek]?.sig === sig ? previous : { ...previous, [displayWeek]: { sig, sessions } }); }} onPlanDate={date => openManual([createManualSession(date, lang)], null, date, { single: true, add: true })} onEditWorkout={day => openManual(Array.isArray(day) ? day : [day], null, null, { single: !Array.isArray(day) })} onAddToDay={day => openManual([day], null, null, { single: true, add: true })} initialCoachNote={coachPlannerNote} onConsumeInitialCoachNote={consumeCoachPlannerNote} />;
  const openLegacyAI = () => { if (hasNativeWeek || editing || savingPlan || !user) return; dispatchNav({ type: 'OPEN_LEGACY_AI' }); setPlanningMode('byok'); setPlanningStep(0); setEditingAI(true); setLegacyPreview(null); };
  const firstPlan = <section data-testid="first-plan" className="panel"><h2 className="text-xl font-bold text-slate-800">{lang === 'zh' ? '今天尚未安排訓練' : 'No workout today'}</h2><div className="day-actions"><button type="button" data-testid="today-create-workout" className="button-primary" onClick={() => openManual([createManualSession(today, lang)], null, today, { single: true, add: true })}>{lang === 'zh' ? '＋ 新增今天的動作' : '+ Add today’s exercises'}</button><button type="button" className="button-secondary" onClick={() => navigate('plan')}>{lang === 'zh' ? '查看課表' : 'View plan'}</button><button type="button" data-testid="open-ai-coach" className="coach-inline-button" onClick={() => setCoachOpen(true)}><Sparkles size={16} aria-hidden="true" />{lang === 'zh' ? '問 AI 教練' : 'Ask AI Coach'}</button></div></section>;

  useBackNavigation(activeTab !== 'train', () => {
    if (editing || savingPlan) { showToast(t('finishEditing')); return; }
    navigate('train');
  }, 10);
  useBackNavigation(activeTab === 'plan' && (planScreen !== 'overview' || periodCreating), () => {
    if (editing || savingPlan || generating) { showToast(t('finishEditing')); return; }
    dispatchNav({ type: 'PLAN_BACK' });
  }, 20);
  // Preserve the existing explicit Save/Cancel behavior of weekly edits.
  useBackNavigation(editing, () => showToast(t('finishEditing')), 40);
  useBackNavigation(!!saveWorkoutDay, () => dispatchNav({ type: 'SET_SAVE_WORKOUT_DAY', day: null }), 100);
  useBackNavigation(!!shareRequest, () => dispatchNav({ type: 'SET_SHARE_REQUEST', request: null }), 100);
  const subnav = (items, value, change, label) => <div aria-label={label} role="group" className="segmented-control">{items.map(([id, key]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => change(id)}>{t(key)}</button>)}</div>;

  return <div className={`app-shell ${activeTab === 'plan' ? 'planner-scope' : ''} ${activeTab === 'plan' && (['manual', 'assign'].includes(planScreen) || periodCreating) ? 'planner-immersive' : ''}`}>
    {toast && <div role="status" className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-sky-200 shadow-xl rounded-xl px-5 py-3 flex gap-2 text-sm max-w-[90vw]"><Info size={18} className="shrink-0 text-sky-600" />{toast}</div>}
    <aside className="app-sidebar">
      <header className="app-brand">
        <h1 className="brand-lockup"><span className="brand-mark"><Feather size={20} /></span>{t('appTitle')}</h1>
        <div className="app-brand-actions">
          <button type="button" data-testid="global-ai-coach" onClick={() => setCoachOpen(true)} className="coach-header-button"><Sparkles size={16} aria-hidden="true" /><span>{lang === 'zh' ? 'AI 教練' : 'AI Coach'}</span></button>
          <button type="button" aria-current={activeTab === 'settings' ? 'page' : undefined} onClick={() => navigate('settings')} className="settings-button"><SettingsIcon size={16} />{t('accountSettings')}</button>
        </div>
      </header>
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
      {activeTab === 'library' && <div className="screen-header"><h2 className="screen-title">{t('libraryTab')}</h2></div>}
      {activeTab === 'library' && (
        <div aria-label={t('libraryTab')} role="group" className="segmented-control" data-testid="library-subnav">
          <button type="button" data-testid="library-tab-exercises" aria-pressed={libraryView === 'exercises'} onClick={() => setLibraryView('exercises')}>
            {lang === 'zh' ? '動作清單' : 'Exercises'}
          </button>
          <button type="button" data-testid="open-saved-workouts" aria-pressed={libraryView === 'saved'} onClick={() => setLibraryView('saved')}>
            <Bookmark size={14} className="inline mr-1 -mt-0.5" aria-hidden="true" />
            {lang === 'zh' ? (savedCount > 0 ? `我的收藏 (${savedCount})` : '我的收藏') : (savedCount > 0 ? `My favorites (${savedCount})` : 'My favorites')}
          </button>
        </div>
      )}
      {showPlanArea && !planLoaded && <p role="status" className="p-6 text-sm">{t('loadingPlan')}</p>}
      {activeTab === 'plan' && planScreen === 'overview' && !periodCreating && plannerActions}
      {showPlanArea && planLoaded && !hasCurrentPlan && !pendingDraft && activeTab === 'train' && !['manual', 'saved', 'assign', 'legacy-ai', 'legacy-preview'].includes(planScreen) && firstPlan}
      <Suspense fallback={<p role="status" className="p-6">{t('loadingPlan')}</p>}>
        {activeTab === 'plan' && planScreen === 'manual' && <ManualPlanner workoutStore={workoutStore} uid={user?.uid} today={today} lang={lang} t={t} exercises={exercises} eligibleExercises={weeklyAvailable} profile={profile} initialSessions={manualInput} initialActiveDate={manualActiveDate} onCreateExercise={addExercise} createScope={user ? 'account' : 'device'} singleDay={!!singleDayEdit} initialAdd={!!singleDayEdit?.add} recordedIds={singleDayEdit && manualInput?.[0]?.date ? getRecordedExerciseIds(manualInput[0].date, { progressByWeek: allProgress, logs: exerciseLogs }) : undefined} onOrganize={organizeExercise} canManage={!!user} onSignIn={() => navigate('settings')} onContextChange={setPlanningContext} onProfileChange={setProfile} onCancel={() => dispatchNav({ type: 'MANUAL_CANCEL' })} onSaveWorkout={day => dispatchNav({ type: 'SET_SAVE_WORKOUT_DAY', day })} onShare={shareDays} onPreview={sessions => dispatchNav({ type: 'MANUAL_PREVIEW', sessions, name: lang === 'zh' ? '我的手動課表' : 'My manual plan' })} />}
        {activeTab === 'plan' && planScreen === 'saved' && <SavedWorkouts onEdit={item => openManual([{ ...savedWorkoutDay(item, lang), date: today }], item)} store={workoutStore} exercises={exercises} lang={lang} onUse={useWorkout} onShare={item => shareDays(savedWorkoutDay(item, lang), item.name)} onClose={() => dispatchNav({ type: 'SET_PLAN_SCREEN', screen: 'overview' })} />}
        {activeTab === 'plan' && planScreen === 'assign' && assignment && <ApplyWorkoutPlan key={JSON.stringify(assignment)} {...assignment} singleDayEdit={!!assignment.editOrigin} uid={user?.uid} today={today} exercises={exercises} lang={lang} localPeriod={publicPeriodBase} onLocalPeriod={onLocalPeriod} fallbackPlans={data.plans} profile={profile} onCancel={() => dispatchNav({ type: 'ASSIGNMENT_CANCEL' })} onEdit={(days, activeDateArg) => openManual(days, assignment.returnScreen === 'manual' ? manualSavedSource : null, activeDateArg, assignment.editOrigin ? { ...assignment.editOrigin, single: true, add: false } : {})} onApplied={preview => {
          if (assignment.returnScreen === 'manual' && !assignment.editOrigin) clearManualDraft(user?.uid);
          recordAppliedPeriod(preview);
          dispatchNav({ type: 'ASSIGNMENT_APPLIED', editOrigin: assignment.editOrigin, periodId: preview.periodId || '', browseWeek: preview.sessions?.[0]?.week || currentWeek });
        }} />}
        {saveWorkoutDay && <SaveWorkoutDialog sourceItem={planScreen === 'manual' ? manualSavedSource : null} store={workoutStore} day={saveWorkoutDay} exercises={exercises} level={difficultyLevel} lang={lang} onClose={() => dispatchNav({ type: 'SET_SAVE_WORKOUT_DAY', day: null })} onSaved={() => { dispatchNav({ type: 'SET_SAVE_WORKOUT_DAY', day: null }); showToast(lang === 'zh' ? '已存入我的收藏，可在動作庫「我的收藏」查看。' : 'Saved to my favorites in Library.'); }} />}
        {shareRequest && <PlanShareDialog days={shareRequest.days} name={shareRequest.name} exercises={exercises} level={difficultyLevel} uid={user?.uid} lang={lang} onClose={() => dispatchNav({ type: 'SET_SHARE_REQUEST', request: null })} onSignIn={() => { dispatchNav({ type: 'SET_SHARE_REQUEST', request: null }); navigate('settings'); }} />}
      </Suspense>
      {activeTab === 'plan' && hasCurrentPlan && !periodCreating && ['day', 'settings'].includes(planScreen) && <button type="button" data-testid="back-to-week" disabled={editing || savingPlan} onClick={() => openPlanScreen('overview')} className="screen-back"><ArrowLeft size={16} />{t('backToWeek')}</button>}
      {activeTab === 'plan' && hasCurrentPlan && !dateOverview && !periodCreating && planScreen === 'overview' && <Suspense fallback={<p role="status" className="py-8 text-sm text-slate-500">{t('loadingPlan')}</p>}><WeekOverview compact schedule={schedule} exercises={exercises} week={currentWeek} plan={weeklyPlan} context={planningContext} focus={focus} time={time} level={difficultyLevel} lang={lang} t={t} currentDate={today} onEdit={() => openPlanScreen('settings')} onSelectDay={selectPlanDay}><WeeklyChoiceReport report={buildWeeklyChoiceReport(weeklyPlan, exercises)} exercises={exercises} t={t} /><WeeklyBalance schedule={schedule} exercises={exercises} context={planningContext} week={currentWeek} currentDate={today} lang={lang} /></WeekOverview></Suspense>}
      {activeTab === 'plan' && (hasCurrentPlan || dateOverview) && (periodCreating || (dateOverview && planScreen === 'overview')) && <Suspense fallback={<p role="status" className="p-6 text-sm">{t('loadingPlan')}</p>}>{renderPeriodWorkspace()}</Suspense>}
      {activeTab === 'plan' && planScreen === 'overview' && !periodCreating && !user && localPeriod && (localWeeks.length > 1 || Object.keys(localPeriod.sessionsByDate).length > (localPeriod.dates?.length || 0)) && <details className="planner-browse-details"><summary>{lang === 'zh' ? '其他已安排日期' : 'Other scheduled dates'}</summary><label className="block text-sm mb-4">{lang === 'zh' ? '查看已安排的週' : 'Browse scheduled weeks'}<select data-testid="local-plan-view" className="block w-full mt-2 border rounded-xl p-3 bg-white" value={localBrowseWeek} onChange={event => dispatchNav({ type: 'SET_LOCAL_BROWSE_WEEK', week: event.target.value })}><option value="">{lang === 'zh' ? '最近套用日期' : 'Most recently applied dates'} · {localPeriod.range.from} — {localPeriod.range.to}</option>{localWeeks.map(week => <option key={week} value={week}>{dateForWeekDay(week, 1)} — {dateForWeekDay(week, 7)}</option>)}</select></label></details>}
      {activeTab === 'plan' && planScreen === 'overview' && !periodCreating && periodsData.periods.length > 1 && <label className="block text-sm mb-4">{lang === 'zh' ? '已儲存的日期規劃' : 'Saved date ranges'}<select className="block w-full mt-2 border rounded-xl p-3 bg-white" value={selectedPeriod?.periodId || ''} onChange={event => { dispatchNav({ type: 'SET_SELECTED_PERIOD_ID', periodId: event.target.value, resetBrowseWeek: true }); setSavedPeriod(null); }}>{periodsData.periods.map(period => <option key={period.periodId} value={period.periodId}>{period.range.from} — {period.range.to}</option>)}</select></label>}

      {activeTab === 'plan' && planScreen === 'overview' && user && !hasNativeWeek && <details className="panel mt-5 mb-5"><summary className="text-sm font-medium">{lang === 'zh' ? '進階：本週 AI 排課' : 'Advanced: AI for this week'}</summary><p className="text-sm text-slate-500 my-3">{lang === 'zh' ? `僅更新 ${currentWeek} 的週一至週五；使用自己的 API 金鑰或現有試用額度，不涵蓋所選日期範圍。` : `Updates Monday–Friday of ${currentWeek} only, using your API key or existing trial. It does not cover a selected date range.`}</p><button data-testid="legacy-ai-open" type="button" onClick={openLegacyAI} className="button-secondary">{lang === 'zh' ? '開啟本週 AI 排課' : 'Open this week’s AI planner'}</button></details>}
      {activeTab === 'plan' && hasNativeWeek && ['legacy-ai', 'legacy-preview'].includes(planScreen) && <p role="status" className="panel">{lang === 'zh' ? '本週已有日期課表，請使用日期規劃重新預覽。' : 'This week has date sessions. Use date planning to create a fresh preview.'}<button className="text-link ml-3" onClick={openWeeklySelection}>{lang === 'zh' ? '規劃日期' : 'Plan dates'}</button></p>}
      {activeTab === 'plan' && planScreen === 'legacy-ai' && !hasNativeWeek && <Suspense fallback={<p role="status">{t('loadingPlan')}</p>}><p className="text-sm text-indigo-800 mb-4">{currentWeek} · {lang === 'zh' ? '進階 AI 排課僅適用本週週一至週五' : 'Advanced AI plans Monday–Friday of this week only'}</p><Coach lang={lang} exercises={exercises} available={weeklyAvailable} onToggleWeekly={toggleWeeklyChoice} step={planningStep} onStepChange={setPlanningStep} standalone onClose={() => dispatchNav({ type: 'SET_PLAN_SCREEN', screen: 'overview' })} t={t} mode={planningMode} setMode={setPlanningMode} trialAvailable={trialEnabled()} focus={focus} setFocus={setFocus} plan={weeklyPlan} editing={editingAI} setEditing={setEditingAI} generating={generating} apiKey={apiKey} goal={goal} setGoal={setGoal} time={time} setTime={setTime} message={message} setMessage={setMessage} context={planningContext} setContext={setPlanningContext} onGenerate={requestPlan} onRestore={restore} /></Suspense>}
      {activeTab === 'plan' && planScreen === 'legacy-preview' && legacyPreview && <Suspense fallback={<p role="status">{t('loadingPlan')}</p>}><WeeklyPlanPreview preview={legacyPreview} t={t} lang={lang} exercises={exercises} available={weeklyAvailable} today={today} onBack={() => { setLegacyPreview(null); setPlanningStep(2); dispatchNav({ type: 'SET_PLAN_SCREEN', screen: 'legacy-ai' }); }} onApply={applyPlanPreview} busy={savingPlan} stale={hasNativeWeek || legacyPreview.fingerprint !== legacyFingerprint} /></Suspense>}
      {showPlanArea && hasCurrentPlan && <>
        {activeTab === 'train' && weekend && <section className="rounded-2xl border border-sky-100 bg-white p-6 space-y-3"><h2 className="font-bold">{t('noCourtWeekend')}</h2><p className="text-sm text-slate-500">{t('noCourtWeekendHint')}</p><div className="day-actions"><button type="button" onClick={() => navigate('plan')} className="button-primary">{t('planningTab')}</button><button type="button" data-testid="open-ai-coach" onClick={() => setCoachOpen(true)} className="coach-inline-button"><Sparkles size={16} aria-hidden="true" />{lang === 'zh' ? '問 AI 教練' : 'Ask AI Coach'}</button></div><button onClick={viewRecords} className="block text-sm text-sky-700">{t('viewRecords')}</button></section>}
      </>}

      {hasCurrentPlan && <div id="weekly-session-detail" hidden={!planLoaded || !showPlanArea || (activeTab === 'train' && weekend) || (activeTab === 'plan' && planScreen !== 'day')}>
        <Training completionState={completions.state} completionDisabled={operationBusy || generating || coachingBusy || savingPlan || quickSaving || !!pendingDraft} onOpenCoach={!(activeTab === 'train' && weekend) ? () => setCoachOpen(true) : undefined} onSaveWorkout={day => dispatchNav({ type: 'SET_SAVE_WORKOUT_DAY', day })} onShare={shareDays} onManualEdit={day => openManual([{ ...day, date: day.date || dateForWeekDay(currentWeek, day.day) }], null, null, { single: true })} onAddToDay={day => openManual([{ ...day, date: day.date || dateForWeekDay(currentWeek, day.day) }], null, null, { single: true, add: true })} onQuickSaveDay={quickSaveDay} quickSaving={quickSaving} workoutStore={workoutStore} onCreateExercise={addExercise} createScope={user ? 'account' : 'device'} eligibleExercises={weeklyAvailable} t={t} lang={lang} mode={trainingMode} onViewRecords={viewRecords} schedule={schedule} draft={draft} activeDay={activeDay} setActiveDay={day => dispatchNav({ type: 'SET_ACTIVE_DAY', day })} currentWeek={currentWeek} exercises={exercises} progress={progress} level={difficultyLevel} editing={editing} selected={selected} setSelected={setSelected} onEdit={enterEditing} onCancel={cancelEditing} onSave={saveEdits} onAdd={add} onRemove={remove} onMove={move} onPhase={changePhase} onToggle={toggle} onFeedback={feedback} feedback={allProgress[currentWeek]?.feedbackValue} busy={busy || generating || coachingBusy || savingPlan || quickSaving || !!pendingDraft} saving={savingPlan} canEdit={!hasNativeWeek && !!user && !!data.loaded.plans && !!data.loaded.exercises && !generating && !pendingDraft} canRestore={!hasNativeWeek && !!weeklyPlan?.previous} onRestore={restore} exerciseLogs={exerciseLogs} readiness={readiness} readinessPreview={readinessPreview?.date === activeDate ? readinessPreview : null} onSaveExerciseLog={user && !trainingData.loaded ? undefined : recordExercise} onUpdateNextDay={recordNextDay} onSaveReadiness={recordReadiness} onPreviewReadiness={previewReadiness} onApplyReadiness={applyReadiness} loggingBusy={coachingBusy || busy || savingPlan || generating || quickSaving || (!!user && !trainingData.loaded)} readinessBusy={coachingBusy || busy || savingPlan || generating || quickSaving || (!!user && !trainingData.loaded)} loggingDisabled={!!pendingDraft || editing || (!!user && !trainingData.loaded)} readinessDisabled={activeDate !== today || !!pendingDraft || editing || (!!user && !trainingData.loaded)} plannedTime={activeNative ? activeNative.weeklyIntent?.dailyTime || (!user ? localPeriod?.profile?.time : savedPeriod?.periodId === activeNative.periodId ? savedPeriod.profile?.time : undefined) : weeklyPlan?.weeklyIntent?.dailyTime} coachingContext={{ ...planningContext, today, readiness: readinessRecords.find(record => record.date === today) || null }} />
      </div>}
      {showPlanArea && hasCurrentPlan && (activeTab === 'train' || !['settings', 'saved', 'manual', 'assign'].includes(planScreen)) && !user && (publicDraft || localPeriod) && <details className="save-panel"><summary className="cursor-pointer text-sky-800">{t('localPreview')} · {localPeriod ? (lang === 'zh' ? '登入後重新預覽' : 'Sign in and re-preview') : t('saveAccount')}</summary><p className="mt-2 text-slate-600">{localPeriod ? (lang === 'zh' ? '登入後需要重新預覽並套用日期課表。這台裝置的暫存實際紀錄會保留，可在設定匯出，不會自動存入帳號。' : 'After signing in, preview and apply your date plan again. Temporary actual records stay on this device and can be exported in Settings; they are not automatically saved to your account.') : t('localPreviewHint')}</p><div className="flex flex-wrap gap-2 mt-3"><button disabled={account.busy} onClick={account.guestLogin} className="bg-indigo-600 text-white px-3 py-2 rounded-lg">{localPeriod ? (lang === 'zh' ? '訪客登入後重新預覽' : 'Guest sign-in and re-preview') : t('savePreviewGuest')}</button><button disabled={account.busy} onClick={account.googleLogin} className="bg-white text-sky-800 px-3 py-2 rounded-lg">{localPeriod ? (lang === 'zh' ? 'Google 登入後重新預覽' : 'Google sign-in and re-preview') : t('savePreviewGoogle')}</button></div></details>}
      <Suspense fallback={<div role="status" className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
        {activeTab === 'library' && (libraryView === 'saved'
          ? <SavedWorkouts onEdit={item => openManual([{ ...savedWorkoutDay(item, lang), date: today }], item)} store={workoutStore} exercises={exercises} lang={lang} onUse={useWorkout} onShare={item => shareDays(savedWorkoutDay(item, lang), item.name)} />
          : <ExerciseLibrary weeklyExerciseIds={planningContext.weeklyExerciseIds} weeklyAvailable={weeklyAvailable} planningContext={planningContext} onUpdateContext={updatePlanningConditions} onToggleWeekly={toggleWeeklyChoice} t={periodQuestionnaireText(lang, t)} lang={lang} canManage={!!user} onOrganize={organizeExercise} onSignIn={() => navigate('settings')} exercises={exercises} createScope={user ? 'account' : 'device'} adding={adding} onAdd={addExercise} onToggle={toggleActive} onDelete={deleteExercise} busy={busy} />)}
        {activeTab === 'records' && <div className="max-w-3xl"><div className="screen-header"><p className="eyebrow">{t('recordsEyebrow')}</p><h2 className="screen-title">{t('navRecords')}</h2></div>{subnav([['training', 'trainingRecordsTab'], ['body', 'bodyRecordsTab']], recordsView, view => dispatchNav({ type: 'SET_RECORDS_VIEW', view }), t('navRecords'))}
          {recordsView === 'body' ? (!user ? login : <Metrics t={t} form={metricForm} onChange={changeMetric} onSave={saveMetrics} history={data.metrics} saving={busy} hasMore={data.metrics.length >= metricLimit} onLoadMore={() => setMetricLimit(previous => previous + 365)} />)
            : !user && !publicDraft && !localPeriod ? login : stats && <History t={t} lang={lang} exportUid={user?.uid} publicDraft={localPeriod ? { ...publicDraft, periodDraft: localPeriod, logs: localPeriod.logs } : publicDraft} exportProgress={allProgress} exportDisabled={coachingBusy || busy || savingPlan || generating || editing || !!pendingDraft || (!!user && (!trainingData.loaded || !data.loaded.progress || !data.loaded.exercises))} previewOnly={!user} exercises={exercises} stats={stats} months={months} weeks={heatmapWeeks} logs={exerciseLogs} onUpdateNextDay={recordNextDay} loggingBusy={coachingBusy || busy || savingPlan || generating || editing || !!pendingDraft || (!!user && !trainingData.loaded)} today={today} hasMore={data.hasMoreProgress} onLoadMore={() => setWeekLimit(previous => previous + 104)} />}
        </div>}
      </Suspense>
      {activeTab === 'settings' && <div className="space-y-5 max-w-2xl"><h2 className="screen-title">{t('accountSettings')}</h2><section className="bg-white p-5 rounded-2xl border border-sky-100 space-y-4">
        <p className="text-sm text-slate-600">{t(!user ? 'accountStoragePublic' : user.isAnonymous ? 'accountStorageAnonymous' : 'accountStorageGoogle')}</p>
        {aiMember.active && <p data-testid="settings-member-badge" className="text-sm font-medium text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">{lang === 'zh' ? '會員專屬雲端 AI 已啟用：自動排課與 AI 教練對話皆可直接免填 API Key 使用安全雲端模型。' : 'Member Cloud AI active: use AI auto-planning and AI Coach chat without entering an API key.'}</p>}
        <button onClick={toggleLanguage} className="text-sky-700 bg-sky-50 px-3 py-2 rounded-lg text-sm">🌐 {t('langToggle')}</button>
        {user ? <div className="flex flex-wrap gap-3">{user.isAnonymous && <button disabled={account.busy || completions.pending || !!pendingDraft} onClick={account.googleLogin} className="rounded-lg bg-sky-600 text-white px-3 py-2 text-sm disabled:opacity-50">{t('upgradeGuest')}</button>}<button disabled={account.busy || completions.pending} onClick={account.logout} className="flex gap-1 items-center text-sm rounded-lg bg-slate-100 px-3 py-2"><LogOut size={14} />{t('logout')}</button></div> : login}
        {completions.pending && <p role="status" className="text-sm text-sky-700">{lang === 'zh' ? '完成狀態儲存中，完成後即可登出或切換帳號。' : 'Saving completion changes. You can sign out or switch accounts when saving finishes.'}</p>}
      </section><Suspense fallback={<p role="status" className="p-6 text-sm">{t('loadingPlan')}</p>}><Settings t={t} input={keyInput} setInput={setKeyInput} apiKey={apiKey} model={model} setModel={selectModel} models={models} onSave={saveKey} onClear={clearKey} /></Suspense></div>}
      {coachOpen && (
        <Suspense fallback={null}>
          <AICoachDrawer
            key={user?.uid || 'public'}
            open={coachOpen}
            onClose={() => setCoachOpen(false)}
            today={today}
            lang={lang}
            activeSession={coachActiveSession}
            schedule={schedule}
            exercises={exercises}
            profile={profile}
            recentSummary={coachRecentSummary}
            readiness={readiness}
            metrics={data.metrics}
            exerciseLogs={exerciseLogs}
            onSwapExercise={coachActiveSession ? swapCoachExercise : undefined}
            onSendToPlanner={sendCoachToPlanner}
            apiKey={apiKey}
            onSaveKey={saveKey}
            onClearKey={clearKey}
            model={model}
            models={models}
            onSelectModel={selectModel}
            aiMember={aiMember}
            uid={user?.uid}
            onSignIn={() => { setCoachOpen(false); navigate('settings'); }}
          />
        </Suspense>
      )}
    </main>
  </div>;
}
