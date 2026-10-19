import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import PlanningRange from './PlanningRange.jsx';
import PeriodPlanPreview from './PeriodPlanPreview.jsx';
import Onboarding from './Onboarding.jsx';
import { defaultPlanningRange, generatePeriodPlan, normalizePlanningRange } from '../domain/periodPlanning.js';
import { applyPeriodPlan, loadPeriodState } from '../services/periodRepository.js';
import { applyLocalPeriod, localPeriodState, periodProfile } from '../domain/periodDraft.js';
import { readStorage, writeStorage } from '../domain/storage.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { buildWeeklyChoiceReport } from '../domain/weeklyChoices.js';
import { manualPlanningExercises } from '../domain/templatePlanner.js';
import { auth } from '../services/firebase.js';
import { periodQuestionnaireText } from '../periodLocale.js';

export default function PeriodWorkspace({ uid, today, lang, t, exercises, profile, setProfile, available, onToggleWeekly,
  localPeriod, onLocalPeriod, onApplied, onClose, overview, refreshToken = 0, fallbackPlans = {}, onToday, preserveCurrentChoices = false, history = {} }) {
  const scope = uid || 'signed-out';
  const questionnaireT = periodQuestionnaireText(lang, t);
  const storageKey = `fitness_period_questionnaire_${scope}`;
  const restored = useRef(null);
  if (!restored.current) {
    try { restored.current = JSON.parse(readStorage(storageKey, '{}')); } catch { restored.current = {}; }
  }
  const initialRange = overview?.range || restored.current.range || defaultPlanningRange(today);
  const [range, setRange] = useState(initialRange);
  const [stage, setStage] = useState(overview ? 'overview' : 'range');
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);
  const request = useRef(0);
  const rangeKey = `${range.from}_${range.to}`;
  const fingerprint = JSON.stringify({ uid, range, profile, exercises, localPeriod, history, today, lang, refreshToken });
  const fingerprintRef = useRef(fingerprint);
  useEffect(() => { fingerprintRef.current = fingerprint; }, [fingerprint]);
  useEffect(() => () => { ++request.current; }, []);
  useEffect(() => {
    const value = { ...restored.current, range, drafts: { ...restored.current.drafts, ...(stage === 'questionnaire' ? { [rangeKey]: periodProfile(profile) } : {}) } };
    restored.current = value;
    if (!writeStorage(storageKey, JSON.stringify(value))) Promise.resolve().then(() => setStorageFailed(true));
  }, [storageKey, rangeKey, range, profile, stage]);
  const loadState = selected => uid ? loadPeriodState(uid, selected, { today, exercises, fallbackPlans }) : Promise.resolve(localPeriodState(localPeriod, selected, today));
  useEffect(() => {
    if (!overview) return;
    let active = true;
    loadState(overview.range).then(state => {
      if (!active) return;
      const sessions = Object.values(state.sessionsByDate).filter(session => session.date >= overview.range.from && session.date <= overview.range.to).sort((a, b) => a.date.localeCompare(b.date));
      const weeklySummaries = [...new Set(sessions.map(session => session.week))].map(week => {
        const days = sessions.filter(session => session.week === week);
        const saved = overview.weeklySummaries?.find(summary => summary.week === week);
        return { ...saved, week, from: days[0].date, to: days.at(-1).date, focus: saved?.focus || overview.profile?.focus || 'balanced',
          trainingSessions: days.filter(day => day.sessionType === 'training' || (!day.sessionType && day.routine.length)).length,
          recoverySessions: days.filter(day => day.sessionType === 'recovery').length,
          restDays: days.filter(day => day.sessionType === 'rest' || (!day.sessionType && !day.routine.length)).length,
          minutes: days.reduce((sum, day) => sum + estimateSessionMinutes(day, exercises), 0) };
      });
      setPreview({ ...overview, sessions, weeklySummaries, protectedDates: state.protectedDates });
    }).catch(() => { if (active) setError(lang === 'zh' ? '無法載入日期課表，請稍後重試。' : 'Could not load this date plan. Please retry.'); });
    return () => { active = false; };
    // The overview is refreshed whenever cloud data or local actuals change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview, uid, refreshToken, localPeriod]);
  const changeRange = value => { ++request.current; setRange(value); setPreview(null); setError(''); };
  const continueRange = () => {
    try {
      const clean = normalizePlanningRange(range, today);
      setRange(clean);
      const previous = restored.current.drafts?.[`${clean.from}_${clean.to}`];
      if (previous) setProfile({ ...periodProfile(previous), context: { ...periodProfile(previous).context, weeklyExerciseIds: preserveCurrentChoices ? profile.context.weeklyExerciseIds : previous.context?.weeklyExerciseIds || [] } });
      setStep(0); setStage('questionnaire'); setError('');
    } catch { setError(lang === 'zh' ? '請選擇今天起 1–28 天的有效日期範圍。' : 'Choose a valid future range of 1–28 days.'); }
  };
  const generate = async () => {
    if (busy) return;
    const id = ++request.current;
    const captured = fingerprint;
    setBusy(true); setError('');
    try {
      const selected = normalizePlanningRange(range, today);
      const state = await loadState(selected);
      const logs = [...new Map([...(history.logs || []), ...Object.values(state.logs || {})].map(log => [`${log.week}_${log.day}_${log.exerciseId}`, log])).values()];
      const result = generatePeriodPlan(exercises, periodProfile(profile), selected, { today, existingSessions: state.sessionsByDate, protectedDates: state.protectedDates, previousSessions: state.previousSessions, logs, progressByWeek: { ...history.progress, ...state.progressByWeek }, readiness: history.readiness }, lang);
      if (id !== request.current || captured !== fingerprintRef.current) return;
      setPreview({ ...result, profile: periodProfile(profile), protectedDates: state.protectedDates, expectedState: state.expectedState, fingerprint: captured });
      setStage('preview'); window.scrollTo({ top: 0 });
    } catch (cause) { setError(cause.message === 'INVALID_PLANNING_RANGE' ? (lang === 'zh' ? '日期範圍已變更，請重新選擇。' : 'Choose your dates again.') : (lang === 'zh' ? '無法產生課表，請稍後重試。' : 'Could not create the plan. Please retry.')); }
    finally { if (id === request.current) setBusy(false); }
  };
  const apply = async () => {
    if (!preview || busy || preview.fingerprint !== fingerprint) return;
    setBusy(true); setError('');
    try {
      let applied = preview;
      if (uid) {
        if (auth.currentUser?.uid !== uid) throw new Error('PERIOD_CHANGED');
        const result = await applyPeriodPlan(uid, preview);
        applied = { ...preview, periodId: result.periodId };
        if (auth.currentUser?.uid !== uid) return;
      } else onLocalPeriod(applyLocalPeriod(localPeriod, preview, today));
      onApplied(applied); setStage('overview');
    } catch (cause) {
      setPreview(previous => previous ? { ...previous, fingerprint: '' } : previous);
      setError(['PLAN_CHANGED', 'PROGRESS_CHANGED', 'PERIOD_CHANGED', 'PERIOD_STATE_CHANGED'].includes(cause.message)
        ? (lang === 'zh' ? '課表或紀錄已變更，請重新預覽。' : 'Plans or records changed. Create a fresh preview.')
        : (lang === 'zh' ? '無法套用課表。請重新預覽後再試。' : 'Could not apply this plan. Create a fresh preview and retry.'));
    } finally { setBusy(false); }
  };
  const choices = preview ? buildWeeklyChoiceReport({ schedule: preview.sessions, weeklyIntent: { weeklyExerciseIds: preview.profile?.context?.weeklyExerciseIds } }, exercises, preview.profile?.context, manualPlanningExercises(exercises, preview.profile?.context), preview.sessions?.[0]?.week) : [];
  const update = (key, value) => setProfile(previous => ({ ...previous, [key]: typeof value === 'function' ? value(previous[key]) : value }));
  const replan = () => { if (range.from < today) setRange(defaultPlanningRange(today)); setPreview(null); setStage('range'); setStep(0); };
  return <section className="setup-card" data-testid="period-workspace">
    {onClose && <button type="button" disabled={busy} className="screen-back" onClick={onClose}><ArrowLeft size={16} />{t('backToWeek')}</button>}
    {error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900 mb-4">{error}</p>}
    {storageFailed && <p role="status" className="text-sm text-amber-800 mb-4">{t('choiceDraftUnavailable')}</p>}
    {stage === 'range' && <PlanningRange range={range} onChange={changeRange} today={today} disabled={busy} onContinue={continueRange} lang={lang} />}
    {stage === 'questionnaire' && <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5"><p className="text-sm font-medium text-indigo-800">{range.from} — {range.to}</p><button type="button" disabled={busy} className="text-link" onClick={() => setStage('range')}>{lang === 'zh' ? '修改日期' : 'Change dates'}</button></div>
      <p className="text-xs text-slate-500 mb-4">{lang === 'zh' ? '日期課表使用免費範本規劃，依所選日期、訓練日與身體狀態安排。' : 'Date plans use the free template planner, guided by your selected dates, training days and current condition.'}</p>
      <Onboarding lang={lang} t={questionnaireT} exercises={exercises} available={available} onToggleWeekly={onToggleWeekly} step={step} onStepChange={setStep}
        context={profile.context} setContext={value => update('context', value)} focus={profile.focus} setFocus={value => update('focus', value)} time={profile.time} setTime={value => update('time', value)} goal={profile.goal} setGoal={value => update('goal', value)} message={message} setMessage={setMessage} generating={busy} onGenerate={generate} />
    </>}
    {(stage === 'preview' || stage === 'overview') && choices.length > 0 && <section data-testid="weekly-choice-report" className="panel mb-5"><h3 className="aside-title">{t('choiceReport')}</h3><p data-testid="choice-outcome-summary" role="status" className="text-sm mt-2">{lang === 'en' ? `Scheduled ${choices.filter(item => item.days.length).length} / ${choices.length}` : `已排入 ${choices.filter(item => item.days.length).length} / ${choices.length}`}{choices.some(item => !item.days.length) && <span className="block text-amber-800 mt-1">{lang === 'en' ? 'Some selected movements are missing. Review the reasons below or go back to adjust before applying.' : '有手選動作未安排。請查看下方原因，或返回調整後再套用。'}</span>}</p><p className="text-xs text-slate-500 mt-2">{t('choiceReportHint')}</p><ul className="space-y-4 mt-4">{choices.map(item => <li key={item.id} data-choice-status={item.reason}><p className="text-sm font-medium">{exercises[item.id]?.name || item.id}</p><p className="text-xs text-slate-500 mt-1">{item.days.length ? `${t('choicePlanned')} · ${preview.sessions.filter(session => session.routine.includes(item.id)).map(session => session.date).join('、')}` : `${t('choiceNotPlanned')} · ${questionnaireT(`choice_reason_${item.reason}`)}`}</p></li>)}</ul></section>}
    {(stage === 'preview' || stage === 'overview') && preview && <PeriodPlanPreview preview={preview} lang={lang} t={t} exercises={exercises} today={today} onBack={stage === 'preview' ? () => { setStage('questionnaire'); setStep(2); } : replan} onApply={stage === 'preview' ? apply : undefined} busy={busy} stale={stage === 'preview' && preview.fingerprint !== fingerprint} />}
    {stage === 'overview' && <div className="flex gap-3 mt-5"><button className="button-primary" onClick={replan}>{lang === 'zh' ? '規劃另一段日期' : 'Plan another date range'}</button>{onToday && <button className="button-secondary" onClick={onToday}>{lang === 'zh' ? '回到今日訓練' : 'Go to Today'}</button>}</div>}
  </section>;
}
