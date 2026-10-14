import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Activity, BarChart3, Brain, Dumbbell, Feather, Info, Loader2, LogIn, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { getDoc, setDoc } from 'firebase/firestore';
import { TRANSLATIONS, EXERCISES_I18N, DEFAULT_SCHEDULE_I18N, LEGACY_DEFAULT_SCHEDULE_I18N } from './locale.js';
import { auth } from './services/firebase.js';
import { savePlan, saveFeedback, setCompletion, saveMeasurement, userDoc } from './services/repository.js';
import { checkAvailableModels, generateAIPlan, generateExerciseDetails } from './services/gemini.js';
import { useAuth } from './hooks/useAuth.js';
import { useCalendar } from './hooks/useCalendar.js';
import { useUserData } from './hooks/useUserData.js';
import { availableSchedule, calculateStats, clampLevel, countCompleted, normalizeSchedule, prescription } from './domain/training.js';
import { exercisePhase, moveWithinPhase, syncSessionType } from './domain/phases.js';
import { monthlyStats } from './domain/training.js';
import { emptyMetrics, metricsForm, parseMetrics } from './domain/metrics.js';
import { readLanguage, readStorage, writeStorage } from './domain/storage.js';
import { DEFAULT_PLANNING_CONTEXT, normalizePlanningContext, planningExercises } from './domain/planning.js';
import LoginPrompt from './components/LoginPrompt.jsx';
import Training from './components/Training.jsx';
import ExerciseLibrary from './components/ExerciseLibrary.jsx';
import Settings from './components/Settings.jsx';
import Onboarding from './components/Onboarding.jsx';
import SharedWorkout from './components/SharedWorkout.jsx';
import { readShareFromLocation } from './domain/sharing.js';
import { generateTemplatePlan } from './domain/templatePlanner.js';
import { trialEnabled, requestTrialPlan } from './services/aiTrial.js';
import { PROMOTION_TRANSLATIONS } from './promotionLocale.js';
import { recordPromotionEvent, readPromotionDrafts, writePromotionDrafts } from './domain/promotion.js';

const Coach = lazy(() => import('./components/Coach.jsx'));
const Metrics = lazy(() => import('./components/Metrics.jsx'));
const History = lazy(() => import('./components/History.jsx'));
const defaultModels = [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }];
const tabs = [['train', Feather, 'navTrain'], ['ai', Brain, 'navAI'], ['exercises', Dumbbell, 'navExercises'], ['metrics', Activity, 'navMetrics'], ['history', BarChart3, 'navHistory'], ['settings', SettingsIcon, 'navSettings']];

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
  const t = key => PROMOTION_TRANSLATIONS[lang][key] ?? TRANSLATIONS[lang][key] ?? TRANSLATIONS.zh[key] ?? key;
  const [activeTab, setActiveTab] = useState('train');
  const [activeDay, setActiveDay] = useState(() => { const day = new Date().getDay(); return day >= 1 && day <= 5 ? day : 1; });
  const [weekLimit, setWeekLimit] = useState(104);
  const [metricLimit, setMetricLimit] = useState(365);
  const data = useUserData(user?.uid, weekLimit, metricLimit, currentWeek);
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
  const counts = countCompleted(schedule, progress);
  const progressPercent = counts.total ? Math.round(counts.completed / counts.total * 100) : 0;
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
    if (!requireUser() || busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await action(); if (success) showToast(t(success)); }
    catch (err) { console.error('Data operation failed', err); showToast(t(err.message === 'PLAN_CHANGED' ? 'planChanged' : err.message === 'INVALID_METRICS' ? 'invalidMetrics' : 'toastSaveFail')); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const fallbackPlan = { conclusion: t('manualPlan'), schedule, source: 'manual', baseDefault: true, language: lang };
  const cancelEditing = () => { setDraft(null); setEditing(false); setSelected(''); };
  const enterEditing = () => {
    if (!requireUser() || !data.loaded.plans || !data.loaded.exercises) return;
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
  const add = day => {
    if (draft.find(item => item.day === day).routine.length >= 8) { showToast(t('sessionExerciseLimit')); return; }
    if (!exercises[selected] || exercises[selected].deleted || exercises[selected].active === false) return;
    setDraft(previous => previous.map(item => {
      if (item.day !== day || item.routine.includes(selected)) return item;
      const exercise = exercises[selected];
      const current = prescription(selected, exercise.type, difficultyLevel, exercise);
      const dose = { restSeconds: 60, perSide: false, ...current, value: String(current.value), id: selected, phase: exercisePhase({ ...item, sessionType: 'training' }, selected, exercise) };
      return syncSessionType({ ...item, routine: [...item.routine, selected], prescriptions: [...(item.prescriptions || []), dose], warmupNote: '', cooldownNote: '' }, exercises);
    })); setSelected('');
  };
  const toggle = (day, id) => {
    const done = !progress[`day${day}_${id}`];
    if (!user && publicDraft) {
      const completed = { ...publicProgress, [`day${day}_${id}`]: done };
      setPublicProgress(completed); onPublicDraft({ ...publicDraft, completed });
      if (done) recordPromotionEvent('first_completion', currentWeek);
      return;
    }
    operation(async () => { await setCompletion(user.uid, currentWeek, day, id, done, exercises[id], schedule); if (done) recordPromotionEvent('first_completion', currentWeek); });
  };
  const feedback = value => operation(() => saveFeedback(user.uid, currentWeek, value), 'toastFeedback');

  const adoptPreview = async () => {
    if (!pendingDraft || !user || savingPlan || !data.loaded.plans || !data.loaded.exercises) return;
    setSavingPlan(true); setAdoptionError(false);
    try {
      await savePlan(user.uid, currentWeek, pendingDraft.plan, fallbackPlan, false, savedPlan?.revision || 0, pendingDraft.completed);
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
        await savePlan(user.uid, currentWeek, pendingDraft.plan, { conclusion: '', schedule: DEFAULT_SCHEDULE_I18N[lang], source: 'manual', baseDefault: true, language: lang }, false, 0, pendingDraft.completed);
        if (auth.currentUser?.uid !== user.uid) return;
        writeStorage(preferencesKey, JSON.stringify(pendingDraft.profile));
        onConsumeDraft();
      } catch { setAdoptionError(true); }
      finally { setSavingPlan(false); }
    });
  }, [pendingDraft, user, savedPlan, data.loaded.plans, data.loaded.exercises, currentWeek, lang, preferencesKey, onConsumeDraft]);
  const requestPlan = async () => {
    if (generating || savingPlan || busy) return;
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
      const plan = { ...result, language: lang, source: planningMode === 'template' ? 'template' : 'ai' };
      if (!user) {
        onPublicDraft({ plan, profile, week: currentWeek, completed: {} }); setPublicProgress({}); setActiveTab('train');
      } else {
        if (auth.currentUser?.uid !== user.uid) return;
        await savePlan(user.uid, currentWeek, plan, fallbackPlan, false, revision);
        writeStorage(preferencesKey, JSON.stringify(profile));
        showToast(t(planningMode === 'template' ? 'templateSuccess' : 'toastAISuccess'));
        setActiveTab('train');
      }
      recordPromotionEvent('first_plan', currentWeek);
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
  const stats = activeTab === 'history' ? calculateStats(allProgress, exercises) : null;
  const months = activeTab === 'history' ? monthlyStats(allProgress, data.plans, LEGACY_DEFAULT_SCHEDULE_I18N[lang], exercises) : [];
  const heatmapWeeks = stats ? [...new Set(Object.keys(stats.dailyMap).map(key => key.slice(0, 8)))].sort().slice(-12) : [];
  const login = <LoginPrompt t={t} googleLogin={account.googleLogin} guestLogin={account.guestLogin} busy={account.busy} />;

  return <div className="min-h-screen bg-slate-50 text-slate-700 pb-24 lg:pb-0">
    {toast && <div role="status" className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-sky-200 shadow-xl rounded-xl px-5 py-3 flex gap-2 text-sm max-w-[90vw]"><Info size={18} className="shrink-0 text-sky-600" />{toast}</div>}
    <aside className="lg:fixed lg:inset-y-0 lg:left-0 lg:w-56 bg-white border-b lg:border-r border-sky-100 lg:flex lg:flex-col">
      <header className="p-4 lg:p-5"><h1 className="font-bold text-lg flex items-center gap-2"><Feather className="text-sky-600 shrink-0" size={22} />{t('appTitle')}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
          <button onClick={toggleLanguage} className="text-sky-700 bg-sky-50 px-3 py-2 rounded-lg">🌐 {t('langToggle')}</button>
          {user ? <>
            {user.isAnonymous && <button disabled={account.busy || !!pendingDraft} onClick={account.googleLogin} className="text-sky-600 disabled:opacity-50">{t('upgradeGuest')}</button>}
            <button disabled={account.busy} onClick={account.logout} className="flex gap-1 items-center"><LogOut size={14} />{t('logout')}</button>
          </> : <>
            <button disabled={account.busy} onClick={account.googleLogin} className="flex gap-1 items-center text-sky-600"><LogIn size={14} />{t('login')}</button>
            <button disabled={account.busy} onClick={account.guestLogin}>{t('guest')}</button>
          </>}
        </div>
      </header>
      <nav aria-label={t('navigation')} className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-sky-100 flex lg:static lg:border-t-0 lg:flex-col lg:px-3 lg:gap-1">
        {tabs.map(([id, Icon, label]) => <button key={id} aria-current={activeTab === id ? 'page' : undefined} onClick={() => setActiveTab(id)} className={`flex flex-col lg:flex-row items-center justify-center lg:justify-start gap-1 lg:gap-3 flex-1 lg:flex-none py-3 lg:px-3 lg:rounded-xl text-[10px] lg:text-sm ${activeTab === id ? 'text-sky-600 bg-sky-50' : 'text-slate-500'}`}><Icon size={20} />{t(label)}</button>)}
      </nav>
    </aside>
    <main className="lg:ml-56 p-4 lg:p-8 max-w-7xl">
      {account.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{t(account.error)}</p>}
      {data.error && <p role="alert" className="mb-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{t('dataLoadFailed')}</p>}
      {account.migrationPending && <div role="alert" className="mb-4 bg-amber-50 p-4 rounded-xl text-sm">{t('migrationPending')}<button disabled={account.busy} onClick={account.retryMigration} className="ml-3 text-sky-600">{t('retry')}</button></div>}
      {pendingDraft && <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm space-y-3">
        <p>{t(adoptionError ? 'adoptionFailed' : savedPlan ? 'adoptExisting' : 'previewSaving')}</p>
        {(savedPlan || adoptionError) && <button disabled={savingPlan} onClick={adoptPreview} className="bg-indigo-600 text-white rounded-lg px-3 py-2">{t(savedPlan ? 'adoptPreview' : 'retryPreview')}</button>}
        <button disabled={savingPlan} onClick={onConsumeDraft} className="ml-3 underline">{t('discardPreview')}</button>
      </div>}
      {activeTab === 'train' && <>
        {!user && !publicDraft && <section className="bg-white p-5 rounded-2xl border border-sky-100 mb-6 space-y-4"><h2 className="font-bold text-lg text-indigo-700">{t('plannerTitle')}</h2><p className="text-sm">{t('plannerIntro')}</p><Onboarding t={t} context={planningContext} setContext={setPlanningContext} time={time} setTime={setTime} focus={focus} setFocus={setFocus} goal={goal} setGoal={setGoal} message={message} setMessage={setMessage} generating={generating} onGenerate={requestPlan} /></section>}
        {!user && publicDraft && <section className="bg-sky-50 border border-sky-200 p-4 rounded-xl mb-5 space-y-3"><h2 className="font-bold">{t('previewReady')}</h2><p className="text-sm">{t('previewHint')}</p><div className="flex flex-wrap gap-3"><button disabled={account.busy} onClick={account.guestLogin} className="bg-indigo-600 text-white rounded-lg px-3 py-2 text-sm">{t('savePreviewGuest')}</button><button disabled={account.busy} onClick={account.googleLogin} className="bg-white rounded-lg px-3 py-2 text-sm">{t('savePreviewGoogle')}</button><button onClick={() => setActiveTab('ai')} className="text-sm underline">{t('newFreePlan')}</button></div></section>}
        <div className="mb-6"><div className="flex items-center justify-between text-sm"><span>{t('weekLabel')}: {currentWeek} · {t('difficultyLabel')}: {t(['diffLow', 'diffMid', 'diffHigh'][difficultyLevel])}</span><strong className="text-2xl text-sky-600">{progressPercent}%</strong></div><div className="h-2 bg-sky-100 rounded-full mt-3 overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${progressPercent}%` }} /></div></div>
        <Training t={t} lang={lang} schedule={schedule} draft={draft} activeDay={activeDay} setActiveDay={setActiveDay} currentWeek={currentWeek} exercises={exercises} progress={progress} level={difficultyLevel} editing={editing} selected={selected} setSelected={setSelected} onEdit={enterEditing} onCancel={cancelEditing} onSave={saveEdits} onAdd={add} onRemove={remove} onMove={move} onPhase={changePhase} onToggle={toggle} onFeedback={feedback} feedback={allProgress[currentWeek]?.feedbackValue} busy={busy || generating} saving={savingPlan} canEdit={!!user && !!data.loaded.plans && !!data.loaded.exercises && !generating} canRestore={!!weeklyPlan?.previous} onRestore={restore} />
      </>}
      <div className={activeTab === 'train' ? '' : 'max-w-3xl mx-auto'}>
        {['metrics', 'history'].includes(activeTab) && !user ? login : <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>}>
          {activeTab === 'ai' && <Coach t={t} mode={planningMode} setMode={setPlanningMode} trialAvailable={trialEnabled()} focus={focus} setFocus={setFocus} plan={weeklyPlan} editing={editingAI} setEditing={setEditingAI} generating={generating} apiKey={apiKey} goal={goal} setGoal={setGoal} time={time} setTime={setTime} message={message} setMessage={setMessage} context={planningContext} setContext={setPlanningContext} onGenerate={requestPlan} onRestore={restore} />}
          {activeTab === 'metrics' && <Metrics t={t} form={metricForm} onChange={changeMetric} onSave={saveMetrics} history={data.metrics} saving={busy} hasMore={data.metrics.length >= metricLimit} onLoadMore={() => setMetricLimit(previous => previous + 365)} />}
          {activeTab === 'history' && stats && <History t={t} lang={lang} stats={stats} months={months} weeks={heatmapWeeks} hasMore={data.hasMoreProgress} onLoadMore={() => setWeekLimit(previous => previous + 104)} />}
          {activeTab === 'exercises' && <ExerciseLibrary t={t} exercises={exercises} name={newName} setName={setNewName} adding={adding} onAdd={addExercise} onToggle={toggleActive} onDelete={deleteExercise} busy={busy} />}
        </Suspense>}
        {activeTab === 'settings' && <div className="space-y-6">{!user && login}<Settings t={t} input={keyInput} setInput={setKeyInput} apiKey={apiKey} model={model} setModel={selectModel} models={models} onSave={saveKey} onClear={clearKey} /></div>}
      </div>
    </main>
  </div>;
}
