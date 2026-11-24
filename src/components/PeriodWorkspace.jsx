import { useBackNavigation } from '../hooks/useBackNavigation.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Crown, KeyRound, Pin, Plus, Sparkles, SlidersHorizontal, X, XCircle } from 'lucide-react';
import PlanningRange from './PlanningRange.jsx';
import PeriodPlanPreview from './PeriodPlanPreview.jsx';
import Onboarding from './Onboarding.jsx';
import { defaultPlanningRange, generatePeriodPlan, normalizePlanningRange } from '../domain/periodPlanning.js';
import { estimateDailyRequiredMinutes, generateAIPeriodPlan, lockedWarmupMinutes } from '../domain/aiPeriodPlanning.js';
import { DAILY_WARMUP_IDS } from '../domain/quickWorkouts.js';
import { MAX_DAILY_REQUIRED, planningExercises } from '../domain/planning.js';
import { buildRefinementMessage } from '../domain/aiCoachChat.js';
import { summarizeRecentPerformance } from '../domain/periodAnalytics.js';
import { applyPeriodPlan, loadPeriodState, loadPeriodOverview } from '../services/periodRepository.js';
import { applyLocalPeriod, localPeriodState, periodProfile, writePeriodDraft, readPeriodDraft, normalizePeriodDraft } from '../domain/periodDraft.js';
import { generateAIPeriodChunk } from '../services/gemini.js';
import { requestMemberAiPeriodChunk } from '../services/aiMembership.js';
import { readStorage, writeStorage } from '../domain/storage.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { buildWeeklyChoiceReport } from '../domain/weeklyChoices.js';
import { manualPlanningExercises } from '../domain/templatePlanner.js';
import { auth } from '../services/firebase.js';
import { periodQuestionnaireText } from '../i18n/period.js';
import './period-analytics.css';

const DEFAULT_AI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];

function aiErrorMessage(code, lang) {
  const en = lang === 'en';
  if (code === 'API_KEY_MISSING') {
    return en
      ? 'Enter your Google API Key above (or sign in with an active member account) to use AI planning.'
      : '請先在上方貼上你的 Google API Key（或使用具會員權限的 Google 帳號登入），再啟動 AI 排課。';
  }
  if (code === 'API_KEY_INVALID') {
    return en
      ? 'Your Google API Key was rejected. Check the key or switch to the free rule planner.'
      : 'Google API Key 驗證失敗，請確認金鑰是否正確，或改用免費規則排課。';
  }
  if (code === 'RATE_LIMITED') {
    return en
      ? 'Google API rate limit reached (429). Wait a moment and retry, or use the free rule planner.'
      : '已達 Google API 頻率上限（429），請稍候重試或改用免費規則排課。';
  }
  if (code === 'AI_MEMBER_NOT_ACTIVE') {
    return en
      ? 'Cloud member AI is not active for this account. You can still use your own Google API Key or the free planner.'
      : '此帳號目前未開通雲端會員 AI 權限，你仍可改用自己的 Google API Key 或免費規則排課。';
  }
  if (code === 'AI_MEMBER_DAILY_LIMIT') {
    return en
      ? 'Today’s member cloud AI quota is full. Retry tomorrow, use your own API key, or use the free planner.'
      : '今日會員雲端 AI 額度已達上限，可明天再試、改用個人 API Key 或免費規則排課。';
  }
  if (code === 'AI_MEMBER_UNAVAILABLE') {
    return en
      ? 'Member cloud AI service is not available right now. Use your own API key or the free planner.'
      : '會員雲端 AI 服務目前無法連線（請確認後端已部署），可改用個人 API Key 或免費規則排課。';
  }
  if (code === 'AI_MEMBER_SIGN_IN_REQUIRED') {
    return en
      ? 'Please sign in with Google to use Member Cloud AI, or switch to your own API key / free planner.'
      : '請先使用 Google 帳號登入以啟用會員雲端 AI，或改用個人 API Key／免費規則排課。';
  }
  if (code === 'AI_MEMBER_FAILED') {
    return en
      ? 'The cloud AI model did not complete this request (it may be temporarily busy). Please retry or switch to Gemini 2.5 Flash / the free planner.'
      : '雲端 AI 模型暫時未能完成回覆（可能過載或逾時），請重試一次、切換至 Gemini 2.5 Flash，或改用免費規則排課。';
  }
  if (code === 'AI_MEMBER_INVALID_INPUT') {
    return en
      ? 'The request exceeded the cloud AI input limit. Try shortening your notes or planning fewer weeks at once.'
      : '送出的條件內容超出雲端 AI 上限，請精簡補充說明或縮短單次規劃天數後再試。';
  }
  if (code === 'AI_INVALID_JSON' || code === 'AI_INCOMPLETE_RESULT' || code === 'AI_EMPTY_RESPONSE' || code === 'AI_REQUEST_FAILED') {
    return en
      ? 'The AI model returned an incomplete response. Please retry or switch to Gemini 2.5 Flash.'
      : 'AI 模型這次未完整回覆，請重試一次，或改選 Gemini 2.5 Flash。';
  }
  if (code === 'NETWORK_ERROR') {
    return en
      ? 'Network error while contacting Gemini. Check your connection and retry.'
      : '連線至 Gemini 時發生網路錯誤，請檢查網路後重試。';
  }
  if (code === 'INVALID_PLANNING_RANGE') {
    return en ? 'Choose your dates again.' : '日期範圍已變更，請重新選擇。';
  }
  return en
    ? 'AI could not produce a valid plan within your safety and time limits. Retry or switch to the free rule planner.'
    : 'AI 產出的課表未通過安全、暖身或時間上限檢查，請重試一次，或先改用免費規則排課。';
}

export default function PeriodWorkspace({
  uid,
  today,
  lang,
  t,
  exercises,
  profile,
  setProfile,
  available,
  onToggleWeekly,
  localPeriod,
  onLocalPeriod,
  onApplied,
  onClose,
  overview,
  refreshToken = 0,
  fallbackPlans = {},
  onToday,
  preserveCurrentChoices = false,
  history = {},
  metrics = [],
  apiKey = '',
  onSaveKey,
  model = 'gemini-2.5-flash',
  models = [],
  onSelectModel,
  aiMember = { active: false, loaded: true },
  onSignIn,
  onSaveWorkout,
  onShare,
  onEditWorkout,
  onPlanDate,
  onOverviewLoaded,
  onAddToDay,
  initialCoachNote = '',
  onConsumeInitialCoachNote,
}) {
  const en = lang === 'en';
  const scope = uid || 'signed-out';
  const questionnaireT = periodQuestionnaireText(lang, t);
  const storageKey = `fitness_period_questionnaire_${scope}`;
  const modeKey = `fitness_period_planner_mode_${scope}`;
  const restored = useRef(null);
  if (!restored.current) {
    try { restored.current = JSON.parse(readStorage(storageKey, '{}')); } catch { restored.current = {}; }
  }
  const trimmedCoachNote = String(initialCoachNote || '').trim();
  let initialRange = overview?.range;
  if (trimmedCoachNote && initialRange) {
    try { initialRange = normalizePlanningRange(initialRange, today); } catch { initialRange = defaultPlanningRange(today); }
  }
  if (!initialRange) {
    try { initialRange = normalizePlanningRange(restored.current.range, today); } catch { initialRange = defaultPlanningRange(today); }
  }

  const [range, setRange] = useState(initialRange);
  const [stage, setStage] = useState(trimmedCoachNote ? 'questionnaire' : overview ? 'overview' : 'range');
  const [step, setStep] = useState(trimmedCoachNote ? 2 : 0);
  const [plannerMode, setPlannerMode] = useState(() => (trimmedCoachNote || readStorage(modeKey, 'template') === 'ai' ? 'ai' : 'template'));
  const [preferOwnKey, setPreferOwnKey] = useState(false);
  const [inlineKeyInput, setInlineKeyInput] = useState('');
  const [showKeyEditor, setShowKeyEditor] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiProgress, setAiProgress] = useState(null);
  const [error, setError] = useState('');
  const [aiFailed, setAiFailed] = useState(false);
  const [message, setMessage] = useState(trimmedCoachNote);
  const [lastCoachNote, setLastCoachNote] = useState(trimmedCoachNote);
  const [requiredQuery, setRequiredQuery] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);

  if (trimmedCoachNote && trimmedCoachNote !== lastCoachNote) {
    setLastCoachNote(trimmedCoachNote);
    setMessage(trimmedCoachNote);
    setPlannerMode('ai');
    setRange(previous => {
      try { return normalizePlanningRange(previous, today); } catch { return defaultPlanningRange(today); }
    });
    setPreview(null);
    setStage('questionnaire');
    setStep(2);
    setError('');
    setAiFailed(false);
  } else if (!trimmedCoachNote && lastCoachNote) {
    setLastCoachNote('');
  }

  useEffect(() => {
    if (!trimmedCoachNote) return;
    writeStorage(modeKey, 'ai');
    onConsumeInitialCoachNote?.();
  }, [trimmedCoachNote, modeKey, onConsumeInitialCoachNote]);

  const request = useRef(0);
  const abortRef = useRef(null);

  useBackNavigation(stage === 'preview' || stage === 'questionnaire', () => {
    if (busy) return;
    if (stage === 'preview') { setStage('questionnaire'); return; }
    if (step > 0) { setStep(step - 1); return; }
    setStage('range');
  }, 30);

  const rangeKey = `${range.from}_${range.to}`;
  const fingerprint = useMemo(
    () => JSON.stringify({ uid, range, profile, exercises, localPeriod, history, today, lang, refreshToken }),
    [uid, range, profile, exercises, localPeriod, history, today, lang, refreshToken],
  );
  const fingerprintRef = useRef(fingerprint);
  useEffect(() => { fingerprintRef.current = fingerprint; }, [fingerprint]);
  useEffect(() => () => {
    ++request.current;
    abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const value = {
      ...restored.current,
      range,
      drafts: {
        ...restored.current.drafts,
        ...(stage === 'questionnaire' ? { [rangeKey]: periodProfile(profile) } : {}),
      },
    };
    restored.current = value;
    if (!writeStorage(storageKey, JSON.stringify(value))) Promise.resolve().then(() => setStorageFailed(true));
  }, [storageKey, rangeKey, range, profile, stage]);

  const switchMode = nextMode => {
    setPlannerMode(nextMode);
    writeStorage(modeKey, nextMode);
    setError('');
    setAiFailed(false);
  };

  const usingMemberProxy = Boolean(aiMember?.active && !preferOwnKey);
  const availableModels = usingMemberProxy
    ? DEFAULT_AI_MODELS
    : (models?.length ? models : DEFAULT_AI_MODELS);
  const activeModel = availableModels.some(item => item.id === model) ? model : availableModels[0].id;

  const invokeChunk = async ({ prompt, includeReport, signal }) => {
    if (!usingMemberProxy) {
      return generateAIPeriodChunk({ prompt, apiKey, model: activeModel, includeReport, signal });
    }
    try {
      return await requestMemberAiPeriodChunk({ prompt, includeReport, model: activeModel, signal });
    } catch (error) {
      if (activeModel !== 'gemini-2.5-flash' && error?.message === 'AI_MEMBER_FAILED' && !signal?.aborted) {
        return requestMemberAiPeriodChunk({ prompt, includeReport, model: 'gemini-2.5-flash', signal });
      }
      throw error;
    }
  };

  const loadState = selected => (
    uid
      ? loadPeriodState(uid, selected, { today, exercises, fallbackPlans })
      : Promise.resolve(localPeriodState(localPeriod, selected, today))
  );

  useEffect(() => {
    if (!overview) return;
    let active = true;
    const loading = uid
      ? loadPeriodOverview(uid, overview.range, { today, exercises, fallbackPlans })
      : Promise.resolve(localPeriodState(localPeriod, overview.range, today));
    loading.then(state => {
      if (!active) return;
      const sessions = Object.values(state.sessionsByDate)
        .filter(session => session.date >= overview.range.from && session.date <= overview.range.to && (!overview.dates || overview.dates.includes(session.date)))
        .sort((a, b) => a.date.localeCompare(b.date));
      const weeklySummaries = [...new Set(sessions.map(session => session.week))].map(week => {
        const days = sessions.filter(session => session.week === week);
        const saved = overview.weeklySummaries?.find(summary => summary.week === week);
        return {
          ...saved,
          week,
          from: days[0].date,
          to: days.at(-1).date,
          focus: saved?.focus || overview.profile?.focus || 'balanced',
          trainingSessions: days.filter(day => day.sessionType === 'training' || (!day.sessionType && day.routine.length)).length,
          recoverySessions: days.filter(day => day.sessionType === 'recovery').length,
          restDays: days.filter(day => day.sessionType === 'rest' || (!day.sessionType && !day.routine.length)).length,
          minutes: days.reduce((sum, day) => sum + estimateSessionMinutes(day, exercises), 0),
        };
      });
      const recentSummary = summarizeRecentPerformance({
        today,
        logs: history.logs || [],
        progressByWeek: history.progress || {},
        readiness: history.readiness || [],
        sessions,
        metrics,
        exercises,
        context: overview.profile?.context || profile.context,
      });
      onOverviewLoaded?.(sessions);
      setPreview({ ...overview, sessions, weeklySummaries, protectedDates: state.protectedDates, recentSummary });
    }).catch(() => {
      if (active) setError(en ? 'Could not load this date plan. Please retry.' : '無法載入日期課表，請稍後重試。');
    });
    return () => { active = false; };
    // The overview is refreshed whenever cloud data or local actuals change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, uid, refreshToken, localPeriod]);

  const changeRange = value => {
    ++request.current;
    abortRef.current?.abort();
    setRange(value);
    setPreview(null);
    setError('');
    setAiFailed(false);
  };

  const continueRange = () => {
    try {
      const clean = normalizePlanningRange(range, today);
      setRange(clean);
      const previous = restored.current.drafts?.[`${clean.from}_${clean.to}`];
      if (previous) {
        setProfile({
          ...periodProfile(previous),
          context: {
            ...periodProfile(previous).context,
            weeklyExerciseIds: preserveCurrentChoices ? profile.context.weeklyExerciseIds : previous.context?.weeklyExerciseIds || [],
          },
        });
      }
      setStep(0);
      setStage('questionnaire');
      setError('');
      setAiFailed(false);
    } catch {
      setError(en ? 'Choose a valid future range of 1–28 days.' : '請選擇今天起 1–28 天的有效日期範圍。');
    }
  };

  const cancelGeneration = () => {
    ++request.current;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setAiProgress(null);
  };

  const generate = async (overrideMode = null) => {
    if (busy) return;
    const effectiveMode = overrideMode || plannerMode;
    if (effectiveMode === 'ai' && !usingMemberProxy && !String(apiKey || '').trim()) {
      setError(aiErrorMessage('API_KEY_MISSING', lang));
      setAiFailed(true);
      return;
    }

    const id = ++request.current;
    const captured = fingerprint;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError('');
    setAiFailed(false);
    setAiProgress(null);

    try {
      const selected = normalizePlanningRange(range, today);
      const state = await loadState(selected);
      const logs = [
        ...new Map(
          [...(history.logs || []), ...Object.values(state.logs || {})]
            .map(log => [`${log.week}_${log.day}_${log.exerciseId}`, log]),
        ).values(),
      ];
      const combinedProgress = { ...history.progress, ...state.progressByWeek };
      const normalizedProfile = periodProfile(profile);

      let result;
      if (effectiveMode === 'ai') {
        result = await generateAIPeriodPlan({
          exercises,
          profile: normalizedProfile,
          range: selected,
          today,
          existingSessions: state.sessionsByDate,
          protectedDates: state.protectedDates,
          previousSessions: state.previousSessions,
          logs,
          progressByWeek: combinedProgress,
          readiness: history.readiness || [],
          metrics,
          userGoal: profile.goal || '',
          userMessage: message || '',
          lang,
          onProgress: info => {
            if (id === request.current) setAiProgress(info);
          },
          callChunk: ({ prompt, includeReport }) => invokeChunk({ prompt, includeReport, signal: controller.signal }),
        });
      } else {
        const templateResult = generatePeriodPlan(
          exercises,
          normalizedProfile,
          selected,
          {
            today,
            existingSessions: state.sessionsByDate,
            protectedDates: state.protectedDates,
            previousSessions: state.previousSessions,
            logs,
            progressByWeek: combinedProgress,
            readiness: history.readiness,
          },
          lang,
        );
        const recentSummary = summarizeRecentPerformance({
          today,
          logs,
          progressByWeek: combinedProgress,
          readiness: history.readiness || [],
          sessions: state.previousSessions || [],
          metrics,
          exercises,
          context: normalizedProfile.context,
        });
        result = { ...templateResult, recentSummary, source: 'template' };
      }

      if (id !== request.current || captured !== fingerprintRef.current) return;
      setPreview({
        ...result,
        profile: normalizedProfile,
        protectedDates: state.protectedDates,
        expectedState: state.expectedState,
        fingerprint: captured,
      });
      setStage('preview');
      window.scrollTo({ top: 0 });
    } catch (cause) {
      if (cause?.message === 'ABORTED' || controller.signal.aborted) return;
      if (id !== request.current) return;
      if (effectiveMode === 'ai') {
        console.warn('[AI Period]', cause?.message || 'UNKNOWN');
        setError(aiErrorMessage(cause?.message, lang));
        setAiFailed(true);
      } else {
        setError(
          cause.message === 'INVALID_PLANNING_RANGE'
            ? (en ? 'Choose your dates again.' : '日期範圍已變更，請重新選擇。')
            : (en ? 'Could not create the plan. Please retry.' : '無法產生課表，請稍後重試。'),
        );
      }
    } finally {
      if (id === request.current) {
        setBusy(false);
        setAiProgress(null);
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const refinePreview = async (feedback, refineDates = []) => {
    if (busy || !preview || preview.source !== 'ai') return false;
    const refinement = buildRefinementMessage(preview.sessions, feedback, lang, message);
    if (!refinement) return false;
    if (!usingMemberProxy && !String(apiKey || '').trim()) {
      setError(aiErrorMessage('API_KEY_MISSING', lang));
      setAiFailed(true);
      return false;
    }

    const id = ++request.current;
    const captured = fingerprint;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError('');
    setAiFailed(false);
    setAiProgress(null);

    try {
      const selected = normalizePlanningRange(preview.range || range, today);
      const state = await loadState(selected);
      const logs = [
        ...new Map(
          [...(history.logs || []), ...Object.values(state.logs || {})]
            .map(log => [`${log.week}_${log.day}_${log.exerciseId}`, log]),
        ).values(),
      ];
      const combinedProgress = { ...history.progress, ...state.progressByWeek };
      const normalizedProfile = periodProfile(preview.profile || profile);
      const selectedRefineDates = Array.isArray(refineDates) ? refineDates.filter(Boolean) : [];

      const result = await generateAIPeriodPlan({
        exercises,
        profile: normalizedProfile,
        range: selected,
        today,
        existingSessions: state.sessionsByDate,
        protectedDates: state.protectedDates,
        previousSessions: state.previousSessions,
        logs,
        progressByWeek: combinedProgress,
        readiness: history.readiness || [],
        metrics,
        userGoal: normalizedProfile.goal || '',
        userMessage: refinement,
        lang,
        refineDates: selectedRefineDates,
        baseSessions: preview.sessions,
        baseCoachReport: preview.coachReport || null,
        onProgress: info => {
          if (id === request.current) setAiProgress(info);
        },
        callChunk: ({ prompt, includeReport }) => invokeChunk({ prompt, includeReport, signal: controller.signal }),
      });

      if (id !== request.current || captured !== fingerprintRef.current) return false;
      setPreview({
        ...result,
        profile: normalizedProfile,
        protectedDates: state.protectedDates,
        expectedState: state.expectedState,
        fingerprint: captured,
      });
      window.scrollTo({ top: 0 });
      return true;
    } catch (cause) {
      if (cause?.message === 'ABORTED' || controller.signal.aborted) return false;
      if (id !== request.current) return false;
      console.warn('[AI Period Refine]', cause?.message || 'UNKNOWN');
      setError(aiErrorMessage(cause?.message, lang));
      setAiFailed(true);
      return false;
    } finally {
      if (id === request.current) {
        setBusy(false);
        setAiProgress(null);
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const apply = async () => {
    if (!preview || busy || preview.fingerprint !== fingerprint) return;
    setBusy(true);
    setError('');
    try {
      let applied = preview;
      if (uid) {
        if (auth.currentUser?.uid !== uid) throw new Error('PERIOD_CHANGED');
        const result = await applyPeriodPlan(uid, preview);
        applied = { ...preview, periodId: result.periodId };
        if (auth.currentUser?.uid !== uid) return;
      } else {
        if (auth.currentUser) throw new Error('SESSION_CHANGED');
        const stored = readPeriodDraft();
        if (localPeriod?.periodId === 'legacy_public' ? stored !== null : JSON.stringify(stored) !== JSON.stringify(normalizePeriodDraft(localPeriod))) {
          throw new Error('PERIOD_CHANGED');
        }
        const saved = applyLocalPeriod(localPeriod, preview, today);
        if (!writePeriodDraft(saved)) throw new Error('LOCAL_STORAGE_FAILED');
        onLocalPeriod(saved);
      }
      onApplied(applied);
      setStage('overview');
    } catch (cause) {
      setPreview(previous => (previous ? { ...previous, fingerprint: '' } : previous));
      setError(
        ['PLAN_CHANGED', 'PROGRESS_CHANGED', 'PERIOD_CHANGED', 'PERIOD_STATE_CHANGED'].includes(cause.message)
          ? (en ? 'Plans or records changed. Create a fresh preview.' : '課表或紀錄已變更，請重新預覽。')
          : (en ? 'Could not apply this plan. Create a fresh preview and retry.' : '無法套用課表。請重新預覽後再試。'),
      );
    } finally {
      setBusy(false);
    }
  };

  const saveInlineKey = () => {
    const trimmed = inlineKeyInput.trim();
    if (!trimmed) return;
    const saved = onSaveKey ? onSaveKey(trimmed) : writeStorage('gemini_byok_key', trimmed);
    if (saved !== false) {
      setInlineKeyInput('');
      setShowKeyEditor(false);
      setError('');
      setAiFailed(false);
    }
  };

  const choices = preview
    ? buildWeeklyChoiceReport(
      { schedule: preview.sessions, weeklyIntent: { weeklyExerciseIds: preview.profile?.context?.weeklyExerciseIds } },
      exercises,
      preview.profile?.context,
      manualPlanningExercises(exercises, preview.profile?.context),
      preview.sessions?.[0]?.week,
    )
    : [];
  const update = (key, value) => setProfile(previous => ({ ...previous, [key]: typeof value === 'function' ? value(previous[key]) : value }));

  const dailyRequiredWarmup = profile.context?.dailyRequiredWarmup !== false;
  const dailyRequiredIds = useMemo(
    () => (Array.isArray(profile.context?.dailyRequiredExerciseIds) ? profile.context.dailyRequiredExerciseIds : []),
    [profile.context?.dailyRequiredExerciseIds],
  );
  const aiEligible = useMemo(() => planningExercises(exercises, profile.context), [exercises, profile.context]);
  const warmupCost = useMemo(() => lockedWarmupMinutes(exercises), [exercises]);
  const requiredMinutes = useMemo(
    () => estimateDailyRequiredMinutes(exercises, profile.context),
    [exercises, profile.context],
  );
  const dailyRequiredOptions = useMemo(() => {
    const lockedSet = new Set(DAILY_WARMUP_IDS);
    const weeklySet = new Set(profile.context?.weeklyExerciseIds || []);
    const q = requiredQuery.trim().toLowerCase();
    const entries = Object.entries(aiEligible)
      .filter(([id, ex]) => !ex.legacySequence && ex.active !== false && !ex.deleted && !(dailyRequiredWarmup && lockedSet.has(id)))
      .filter(([id, ex]) => !q || [id, ex.name, ...(ex.aliases || []), ex.category || ''].join(' ').toLowerCase().includes(q));
    entries.sort(([idA, exA], [idB, exB]) => {
      const score = (id, ex) => (dailyRequiredIds.includes(id) ? 0 : weeklySet.has(id) ? 1 : ['warmup', 'recovery', 'core'].includes(ex.category) ? 2 : ex.priority ? 3 : 4);
      return score(idA, exA) - score(idB, exB) || String(exA.name || idA).localeCompare(String(exB.name || idB));
    });
    return entries.slice(0, q ? 12 : 6);
  }, [aiEligible, dailyRequiredIds, dailyRequiredWarmup, profile.context?.weeklyExerciseIds, requiredQuery]);

  const toggleDailyRequiredWarmup = checked => update('context', previous => ({
    ...previous,
    dailyRequiredWarmup: checked,
  }));
  const toggleDailyRequiredExercise = id => update('context', previous => {
    const list = Array.isArray(previous?.dailyRequiredExerciseIds) ? previous.dailyRequiredExerciseIds : [];
    const next = list.includes(id)
      ? list.filter(item => item !== id)
      : list.length < MAX_DAILY_REQUIRED
        ? [...list, id]
        : list;
    return { ...previous, dailyRequiredExerciseIds: next };
  });

  const replan = () => {
    if (range.from < today) setRange(defaultPlanningRange(today));
    setPreview(null);
    setStage('range');
    setStep(0);
  };

  const choiceReport = choices.length > 0 ? (
    <details data-testid="weekly-choice-report" className="period-secondary">
      <summary>{t('choiceReport')}</summary>
      <p data-testid="choice-outcome-summary" role="status" className="text-sm mt-2">
        {en ? `Scheduled ${choices.filter(item => item.days.length).length} / ${choices.length}` : `已排入 ${choices.filter(item => item.days.length).length} / ${choices.length}`}
        {choices.some(item => !item.days.length) && (
          <span className="block text-amber-800 mt-1">
            {en
              ? 'Some selected movements are missing. Review the reasons below or go back to adjust before applying.'
              : '有手選動作未安排。請查看下方原因，或返回調整後再套用。'}
          </span>
        )}
      </p>
      <p className="text-xs text-slate-500 mt-2">{t('choiceReportHint')}</p>
      <ul className="space-y-4 mt-4">
        {choices.map(item => (
          <li key={item.id} data-choice-status={item.reason}>
            <p className="text-sm font-medium">{exercises[item.id]?.name || item.id}</p>
            <p className="text-xs text-slate-500 mt-1">
              {item.days.length
                ? `${t('choicePlanned')} · ${preview.sessions.filter(session => session.routine.includes(item.id)).map(session => session.date).join('、')}`
                : `${t('choiceNotPlanned')} · ${questionnaireT(`choice_reason_${item.reason}`)}`}
            </p>
          </li>
        ))}
      </ul>
    </details>
  ) : null;

  const choiceSummary = choices.some(item => !item.days.length) ? (
    <p role="status">
      {en
        ? `${choices.filter(item => !item.days.length).length} selected movements were not scheduled. Review the reasons below or go back to adjust.`
        : `有 ${choices.filter(item => !item.days.length).length} 個手選動作未安排。請查看列表後的明細，或返回調整後再套用。`}
    </p>
  ) : null;

  const aiModePanel = (
    <section className="period-mode-panel" data-testid="period-planner-mode">
      <div className="period-mode-header">
        <strong>{en ? 'Planning engine' : '選擇排課方式'}</strong>
        <span className="text-xs text-slate-500">
          {plannerMode === 'ai'
            ? (dailyRequiredWarmup
              ? (en ? 'Personalized AI + daily must-haves + coach report' : 'AI 個人化編排＋每日必須鎖定＋教練總結與圖表')
              : (en ? 'Personalized AI + custom warm-up + coach report' : 'AI 個人化編排＋自訂暖身＋教練總結與圖表'))
            : (en ? 'Instant deterministic rules + visual charts' : '即時免費規則排課＋統計圖表')}
        </span>
      </div>
      <div className="period-mode-switch" role="group" aria-label={en ? 'Planning engine' : '排課引擎'}>
        <button
          type="button"
          data-testid="mode-template"
          aria-pressed={plannerMode === 'template'}
          disabled={busy}
          onClick={() => switchMode('template')}
        >
          <SlidersHorizontal size={16} />
          {en ? 'Free Rules' : '免費規則排課'}
        </button>
        <button
          type="button"
          data-testid="mode-ai"
          aria-pressed={plannerMode === 'ai'}
          disabled={busy}
          onClick={() => switchMode('ai')}
        >
          <Sparkles size={16} />
          {en ? 'AI Coach' : 'AI 教練排課'}
        </button>
      </div>

      {plannerMode === 'ai' && (
        <div className="period-ai-auth-box" data-testid="period-ai-auth">
          {aiMember?.active ? (
            <>
              <span className="period-ai-member-badge" data-testid="ai-member-badge">
                <Crown size={15} />
                {en ? 'Member Cloud AI Active · No API Key Needed' : '會員專屬雲端 AI 已啟用 · 免填 API Key'}
              </span>
              <div className="period-ai-controls">
                <label className="text-xs flex items-center gap-2">
                  <span>{en ? 'Model' : '模型'}</span>
                  <select
                    data-testid="period-ai-model"
                    disabled={busy}
                    value={activeModel}
                    onChange={event => onSelectModel?.(event.target.value)}
                  >
                    {DEFAULT_AI_MODELS.map(item => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferOwnKey}
                    disabled={busy}
                    onChange={event => setPreferOwnKey(event.target.checked)}
                  />
                  {en ? 'Use my own API key instead' : '改用我自己本機的 Google API Key'}
                </label>
              </div>
            </>
          ) : null}

          {(!aiMember?.active || preferOwnKey) && (
            <>
              {apiKey && !showKeyEditor ? (
                <div className="period-ai-controls">
                  <span className="text-xs font-semibold text-sky-800 inline-flex items-center gap-1" data-testid="period-byok-ready">
                    <KeyRound size={14} />
                    {en
                      ? `Saved browser key (${apiKey.trim().length > 8 ? `${apiKey.trim().slice(0, 4)}…${apiKey.trim().slice(-4)}` : '••••'})`
                      : `已連結本機 API Key（${apiKey.trim().length > 8 ? `${apiKey.trim().slice(0, 4)}…${apiKey.trim().slice(-4)}` : '••••'}）`}
                  </span>
                  <select
                    data-testid="period-ai-model"
                    disabled={busy}
                    value={activeModel}
                    onChange={event => onSelectModel?.(event.target.value)}
                  >
                    {availableModels.map(item => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="text-link text-xs"
                    disabled={busy}
                    onClick={() => setShowKeyEditor(true)}
                  >
                    {en ? 'Change key' : '更換金鑰'}
                  </button>
                </div>
              ) : (
                <div className="space-y-2" data-testid="period-inline-key-box">
                  <p className="text-xs text-slate-600 m-0">
                    {en
                      ? 'Paste your Google AI Studio API Key (stored only in this browser, never uploaded to Firestore).'
                      : '貼上你的 Google AI Studio API Key（僅保存在此瀏覽器，不會上傳至雲端資料庫）。'}
                    {!uid && onSignIn && (
                      <>
                        {' '}
                        <button type="button" className="text-link text-xs" onClick={onSignIn}>
                          {en ? 'Active member? Sign in' : '已是會員？前往登入'}
                        </button>
                      </>
                    )}
                  </p>
                  <div className="period-ai-key-row">
                    <input
                      type="password"
                      data-testid="period-inline-key-input"
                      value={inlineKeyInput}
                      onChange={event => setInlineKeyInput(event.target.value)}
                      placeholder={en ? 'AIza... Google API Key' : '貼上 AIza... Google API Key'}
                      aria-label="Google API Key"
                    />
                    <button
                      type="button"
                      data-testid="period-inline-key-save"
                      className="button-primary"
                      disabled={!inlineKeyInput.trim()}
                      onClick={saveInlineKey}
                    >
                      {en ? 'Save key' : '儲存金鑰'}
                    </button>
                    {apiKey && (
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => setShowKeyEditor(false)}
                      >
                        {en ? 'Cancel' : '取消'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="period-daily-required" data-testid="period-daily-required">
            <div className="period-daily-required-head">
              <span className="period-daily-required-title">
                <Pin size={14} />
                {en ? 'Daily must-haves' : '每日必須設定'}
              </span>
              <span
                className={`period-daily-required-budget ${requiredMinutes > Number(profile.time || 30) ? 'is-over' : ''}`}
                data-testid="daily-required-budget"
              >
                {en
                  ? `~${requiredMinutes} / ${profile.time} min`
                  : `約占 ${requiredMinutes} / ${profile.time} 分鐘`}
              </span>
            </div>

            <label className="period-daily-warmup-toggle">
              <input
                type="checkbox"
                data-testid="daily-required-warmup-toggle"
                checked={dailyRequiredWarmup}
                disabled={busy}
                onChange={event => toggleDailyRequiredWarmup(event.target.checked)}
              />
              <span>
                <strong>{en ? '8-movement dynamic stretch (required warm-up)' : '八段動態拉伸為每日暖身必須'}</strong>
                <small>
                  {en
                    ? `Auto-locked at the start of every training & recovery day (8 tracked items, ~${warmupCost} min). Uncheck to let AI design custom warm-ups.`
                    : `自動鎖定於每個訓練與恢復日開頭（8 項獨立紀錄，約 ${warmupCost} 分鐘）；取消勾選則由 AI 自由安排暖身。`}
                </small>
              </span>
            </label>

            {dailyRequiredWarmup && Number(profile.time || 30) <= warmupCost + 1 && (
              <p className="period-daily-required-warn" role="status">
                {en
                  ? `Your daily limit (${profile.time} min) is tight for the ~${warmupCost}-min warm-up; short days will automatically switch to a lighter warm-up.`
                  : `目前每日時間上限（${profile.time} 分鐘）偏短，不足容納約 ${warmupCost} 分鐘的八段拉伸時，系統會自動改為精簡暖身。`}
              </p>
            )}

            {dailyRequiredIds.length > 0 && (
              <div className="period-daily-required-chips" data-testid="daily-required-chips">
                {dailyRequiredIds.map(id => {
                  const unavailable = !Object.hasOwn(aiEligible, id);
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={busy}
                      data-testid={`daily-required-chip-${id}`}
                      className={`period-daily-chip ${unavailable ? 'is-muted' : ''}`}
                      onClick={() => toggleDailyRequiredExercise(id)}
                      aria-label={en ? `Remove ${exercises[id]?.name || id}` : `移除每日必須 ${exercises[id]?.name || id}`}
                    >
                      <span>{exercises[id]?.name || id}{unavailable ? (en ? ' (ineligible)' : '（目前條件不符）') : ''}</span>
                      <X size={14} />
                    </button>
                  );
                })}
              </div>
            )}

            <details className="period-daily-required-picker" data-testid="daily-required-picker">
              <summary>
                <Plus size={14} />
                {en
                  ? `Pin extra daily must-have exercises (${dailyRequiredIds.length}/${MAX_DAILY_REQUIRED})`
                  : `追加其他每日必須動作（選填，${dailyRequiredIds.length}/${MAX_DAILY_REQUIRED}）`}
              </summary>
              <div className="period-daily-picker-body">
                <input
                  type="search"
                  data-testid="daily-required-search"
                  value={requiredQuery}
                  disabled={busy}
                  onChange={event => setRequiredQuery(event.target.value)}
                  placeholder={en ? 'Search eligible exercises (e.g. dead bug, plank, stretch)…' : '搜尋符合資格的動作（例如：死蟲、棒式、前鋸肌、伸展）…'}
                  aria-label={en ? 'Search daily must-have exercises' : '搜尋每日必須動作'}
                />
                <div className="period-daily-option-grid">
                  {dailyRequiredOptions.map(([id, ex]) => {
                    const selected = dailyRequiredIds.includes(id);
                    const limitReached = !selected && dailyRequiredIds.length >= MAX_DAILY_REQUIRED;
                    return (
                      <button
                        key={id}
                        type="button"
                        data-testid={`daily-required-option-${id}`}
                        aria-pressed={selected}
                        disabled={busy || limitReached}
                        onClick={() => toggleDailyRequiredExercise(id)}
                        className={`period-daily-option ${selected ? 'is-selected' : ''}`}
                      >
                        <span>{ex.name}</span>
                        <span className="period-daily-option-badge">
                          {selected ? (en ? 'Pinned' : '已鎖定') : (en ? 'Pin' : '設為必須')}
                        </span>
                      </button>
                    );
                  })}
                  {dailyRequiredOptions.length === 0 && (
                    <p className="text-xs text-slate-500 m-0">
                      {en ? 'No matching eligible exercises found.' : '找不到符合目前器材與健康條件的動作。'}
                    </p>
                  )}
                </div>
                <p className="text-xs text-slate-500 m-0">
                  {en
                    ? 'Pinned exercises are included on every training day (mobility/stretches also carry over to recovery days) while still respecting your daily time limit and safety rules.'
                    : '設為必須的動作會鎖定排入每個訓練日（安全活動度／伸展亦會配合恢復日），並仍嚴格遵守每日時間上限與安全規則。'}
                </p>
              </div>
            </details>
          </div>

          <p className="text-xs text-slate-500 m-0">
            {en
              ? 'AI planning sends your preferences, eligible exercise list and de-identified 28-day training summary to Google Gemini.'
              : 'AI 排課會將本次條件、符合資格的動作清單與近 28 天去識別化訓練摘要傳送至 Google Gemini。'}
          </p>
        </div>
      )}
    </section>
  );

  return (
    <section
      className={`period-workspace ${stage === 'overview' || stage === 'preview' ? 'max-w-3xl mx-auto' : 'setup-card'}`}
      data-stage={stage}
      data-testid="period-workspace"
    >
      {onClose && (
        <button type="button" disabled={busy} className="period-flow-back" onClick={onClose}>
          <ArrowLeft size={16} />
          {t('backToWeek')}
        </button>
      )}

      {error && (
        <div role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900 mb-4" data-testid="period-error">
          <p className="m-0 text-sm">{error}</p>
          {aiFailed && stage === 'questionnaire' && (
            <div className="period-ai-error-actions">
              <button type="button" className="button-primary" disabled={busy} onClick={() => generate('ai')}>
                {en ? 'Retry AI' : '重試 AI 排課'}
              </button>
              <button
                type="button"
                data-testid="fallback-free-template"
                className="button-secondary"
                disabled={busy}
                onClick={() => { switchMode('template'); generate('template'); }}
              >
                {en ? 'Use Free Rules instead' : '改用免費規則立即產生'}
              </button>
            </div>
          )}
        </div>
      )}

      {storageFailed && <p role="status" className="text-sm text-amber-800 mb-4">{t('choiceDraftUnavailable')}</p>}

      {busy && aiProgress && (
        <div role="status" className="period-ai-progress" data-testid="period-ai-progress">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <strong className="text-sky-900">
              {en
                ? `AI Coach is planning week ${aiProgress.chunkIndex + 1} / ${aiProgress.totalChunks} (${aiProgress.from} – ${aiProgress.to})…`
                : `AI 教練正在編排第 ${aiProgress.chunkIndex + 1} / ${aiProgress.totalChunks} 週（${aiProgress.from} – ${aiProgress.to}）…`}
            </strong>
            <button type="button" onClick={cancelGeneration} className="text-link text-xs inline-flex items-center gap-1">
              <XCircle size={15} />
              {en ? 'Cancel' : '取消'}
            </button>
          </div>
          <div className="period-ai-progress-bar">
            <div
              className="period-ai-progress-fill"
              style={{ width: `${Math.round(((aiProgress.chunkIndex + 0.5) / aiProgress.totalChunks) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 m-0">
            {dailyRequiredWarmup
              ? (en
                ? 'Locking your daily must-haves (8-movement warm-up) and balancing badminton strength & mobility…'
                : '正在鎖定每日必須項目（八段動態拉伸）並平衡羽球各部位肌力與活動度，整理個人化總結報告…')
              : (en
                ? 'Designing custom warm-ups, applying your daily must-haves, and balancing badminton strength & mobility…'
                : '正在為每日設計專屬暖身、套用每日必須動作，並平衡羽球各部位肌力與活動度…')}
          </p>
        </div>
      )}

      {stage === 'range' && (
        <PlanningRange range={range} onChange={changeRange} today={today} disabled={busy} onContinue={continueRange} lang={lang} />
      )}

      {stage === 'questionnaire' && (
        <>
          <header className="period-auto-heading">
            <h2>{en ? 'Plan your next training block' : '一起安排這次訓練'}</h2>
            <div>
              <p>{range.from} — {range.to}</p>
              <button type="button" disabled={busy} className="text-link" onClick={() => setStage('range')}>
                {en ? 'Change dates' : '修改日期'}
              </button>
            </div>
            <p>
              {plannerMode === 'ai'
                ? (en ? 'AI Coach period planning · review before applying' : 'AI 教練日期排課 · 檢視總結與圖表後才會套用')
                : (en ? 'Free template plan · review before applying' : '免費固定規則排課 · 檢查後才會套用')}
            </p>
          </header>
          {aiModePanel}
          <Onboarding
            range={range}
            lang={lang}
            t={questionnaireT}
            exercises={exercises}
            available={available}
            onToggleWeekly={onToggleWeekly}
            step={step}
            onStepChange={setStep}
            mode={plannerMode === 'ai' ? 'byok' : 'template'}
            context={profile.context}
            setContext={value => update('context', value)}
            focus={profile.focus}
            setFocus={value => update('focus', value)}
            time={profile.time}
            setTime={value => update('time', value)}
            goal={profile.goal}
            setGoal={value => update('goal', value)}
            message={message}
            setMessage={setMessage}
            generating={busy}
            onGenerate={() => generate()}
          />
        </>
      )}

      {(stage === 'preview' || stage === 'overview') && preview && (
        <PeriodPlanPreview
          onAdjust={stage === 'preview' ? next => { setPreview(null); setStage('questionnaire'); setStep(next); window.scrollTo({ top: 0 }); } : undefined}
          preview={preview}
          choiceReport={choiceReport}
          choiceSummary={choiceSummary}
          lang={lang}
          t={t}
          exercises={exercises}
          today={today}
          onBack={stage === 'preview' ? () => { setStage('questionnaire'); setStep(2); } : undefined}
          onApply={stage === 'preview' ? apply : undefined}
          onRefine={stage === 'preview' ? refinePreview : undefined}
          onSaveWorkout={onSaveWorkout}
          onShare={onShare}
          onEditWorkout={onEditWorkout}
          onPlanDate={onPlanDate}
          onAddToDay={onAddToDay}
          busy={busy}
          stale={stage === 'preview' && preview.fingerprint !== fingerprint}
        />
      )}

      {stage === 'overview' && (
        <div className="flex gap-3 mt-5">
          <button className="button-primary" onClick={replan}>
            {en ? 'Plan another date range' : '規劃另一段日期'}
          </button>
          {onToday && (
            <button className="button-secondary" onClick={onToday}>
              {en ? 'Go to Today' : '回到今日訓練'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
