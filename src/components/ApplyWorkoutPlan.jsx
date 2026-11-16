import { useBackNavigation } from '../hooks/useBackNavigation.js';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { assignmentConflicts, assignmentRange, assignmentSummary, materializeAssignments, planOffsets, shiftPlanDate, validateAssignmentConsent } from '../domain/planAssignments.js';
import { applyLocalPeriod, localPeriodState, periodProfile, normalizePeriodDraft, writePeriodDraft } from '../domain/periodDraft.js';
import { applyPeriodPlan, loadPeriodState } from '../services/periodRepository.js';
import { auth } from '../services/firebase.js';
import { readPeriodDraft } from '../domain/periodDraft.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { DEFAULT_PLANNING_CONTEXT } from '../domain/planning.js';
import { manualPlanningExercises } from '../domain/templatePlanner.js';
import { manualPlannerErrorMessage, prepareManualPreview } from '../domain/manualPlanner.js';
import WorkoutPlanSummary from './WorkoutPlanSummary.jsx';
import '../plannerVisual.css';
import './combo-assignment.css';

export default function ApplyWorkoutPlan({ days, name, initialDates, uid, today, exercises, lang = 'zh', localPeriod, onLocalPeriod, fallbackPlans = {}, profile = {}, onApplied, onCancel, onEdit, singleDayEdit = false }) {
  const en = lang === 'en';
  const offsets = planOffsets(days);
  const sourceTitle = day => {
    const title = days.length === 1 ? name : day.theme || day.name || '';
    return /^(第\s*\d+\s*天|Day\s*\d+)$/i.test(title) ? '' : title;
  };
  const [dates, setDates] = useState(() => initialDates || offsets.map(offset => shiftPlanDate(today, offset)));
  const [mode, setMode] = useState(initialDates ? 'individual' : 'gaps');
  const [replacements, setReplacements] = useState(() => singleDayEdit && initialDates?.length === 1 ? [...initialDates] : []);
  const [stage, setStage] = useState('dates');
  const [preview, setPreview] = useState(null);
  const [conflictState, setConflictState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useBackNavigation(stage === 'review' || busy, () => { if (!busy) { if (initialDates) returnToEditing(); else setStage('dates'); } }, 35);
  const [expanded, setExpanded] = useState(null);
  const heading = useRef(null);
  const running = useRef(false);
  const snapshot = JSON.stringify({ uid, localPeriod, fallbackPlans, days, name, dates, replacements, today, exercises, profile, lang });
  const live = useRef(snapshot);
  useEffect(() => { live.current = snapshot; }, [snapshot]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [stage]);
  let range; let dateError;
  try { range = assignmentRange(dates, today); } catch { dateError = en ? 'Choose distinct dates from today, within a 28-day span.' : '請選今天起、不重複、首末相距 28 天以內的日期。'; }
  const conflicts = conflictState ? assignmentConflicts(conflictState, dates) : [];
  const unresolved = conflicts.some(item => item.protected || item.existing && !replacements.includes(item.date));
  const stale = preview && preview.fingerprint !== snapshot;
  const returnToEditing = () => {
    if (initialDates && onEdit) onEdit(days.map((day, index) => ({ ...day, date: dateError ? initialDates[index] : dates[index] })));
    else onCancel();
  };
  const validateCurrentProfile = sessions => {
    const dailyTime = profile.time === undefined ? 240 : Number(profile.time);
    if (!Number.isFinite(dailyTime) || dailyTime < 5 || dailyTime > 240) throw new Error('INVALID_PLANNING_TIME');
    // Assignment materialization has already validated empty source rest days.
    // Keep that explicit choice while reusing the manual dose and context gate.
    prepareManualPreview(sessions.map(session => {
      const source = days[dates.indexOf(session.date)];
      return { ...session, explicitRest: source?.sessionType === 'rest' && source.routine?.length === 0 };
    }), {
      today, exercises, dailyTime, eligibleExercises: manualPlanningExercises(exercises, profile.context || DEFAULT_PLANNING_CONTEXT),
    });
  };
  const profileError = cause => /^(MANUAL_|INVALID_PLANNING_TIME|AI_SESSION_TOO_LONG)/.test(cause.message) ? manualPlannerErrorMessage(cause, lang, exercises) : null;
  const change = next => { setDates(next); setPreview(null); setConflictState(null); setReplacements([]); setError(''); };
  const inspect = async () => {
    if (running.current || dateError) return;
    running.current = true; setBusy(true); setError('');
    const captured = snapshot;
    try {
      const sessions = materializeAssignments(days, dates, { name, exercises, lang, today });
      validateCurrentProfile(sessions);
      const state = uid ? await loadPeriodState(uid, range, { today, exercises, fallbackPlans }) : localPeriodState(localPeriod, range, today);
      if (captured !== live.current) return;
      if (uid ? auth.currentUser?.uid !== uid : !!auth.currentUser) throw new Error('SESSION_CHANGED');
      setConflictState(state);
      validateAssignmentConsent(state, dates, replacements);
      setPreview({ range, dates: [...dates].sort(), selectedDates: [...dates], replaceDates: [...replacements], sessions, expectedState: state.expectedState,
        weeklySummaries: assignmentSummary(sessions, exercises, profile.focus), profile: periodProfile(profile), conclusion: name, fingerprint: captured });
      setStage('review'); window.scrollTo({ top: 0 });
    } catch (cause) {
      if (captured !== live.current) return;
      setError(profileError(cause) || (cause.message === 'DATE_PROTECTED' && singleDayEdit ? en ? 'This day has training records. They are preserved; these changes have not been saved.' : '這天已有訓練紀錄，會保留原內容；本次修改尚未儲存。' : cause.message === 'DATE_PROTECTED' ? en ? 'A date has training records. Nothing has been applied. Reschedule it, or return to editing to remove that date.' : '有日期已有訓練紀錄，本次尚未套用。請改期，或返回編輯移除該日期。'
        : cause.message === 'DATE_CONFLICT' ? en ? 'Review existing plans below. Change dates or explicitly replace an unstarted plan.' : '下方日期已有課表，請改日期，或明確勾選替換尚未開始的課表。'
          : cause.message === 'SESSION_CHANGED' ? en ? 'Your account changed. Reopen this preview.' : '帳號已變更，請重新開啟預覽。'
            : en ? 'Could not prepare this plan. Check exercises, warm-up, preparation sets and doses, then retry.' : '無法預覽。請確認動作、暖身、準備組與劑量完整，或先編輯這份課表。'));
    } finally { running.current = false; setBusy(false); }
  };
  const initialInspection = useRef(false);
  useEffect(() => {
    if (!initialDates || initialInspection.current) return;
    initialInspection.current = true; void inspect();
    // Inspect the original explicit manual dates once; later edits require another review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const apply = async () => {
    if (running.current || !preview || preview.fingerprint !== live.current || stale) return;
    running.current = true; setBusy(true); setError('');
    try {
      let applied;
      validateCurrentProfile(preview.sessions);
      if (uid) {
        if (auth.currentUser?.uid !== uid) throw new Error('SESSION_CHANGED');
        const result = await applyPeriodPlan(uid, preview);
        if (auth.currentUser?.uid !== uid) throw new Error('SESSION_CHANGED');
        if (result.appliedDates.length !== dates.length) throw new Error('PERIOD_CHANGED');
        applied = { ...preview, periodId: result.periodId };
      } else {
        // Recheck device state, including changes made in another browser tab.
        const stored = readPeriodDraft();
        if (auth.currentUser) throw new Error('SESSION_CHANGED');
        if (localPeriod?.periodId === 'legacy_public' ? stored !== null : JSON.stringify(stored) !== JSON.stringify(normalizePeriodDraft(localPeriod))) throw new Error('PERIOD_CHANGED');
        validateAssignmentConsent(localPeriodState(localPeriod, range, today), dates, replacements);
        const next = applyLocalPeriod(localPeriod, preview, today);
        if (preview.sessions.some(session => JSON.stringify(next.sessionsByDate[session.date]?.prescriptions) !== JSON.stringify(session.prescriptions) || JSON.stringify(next.sessionsByDate[session.date]?.routine) !== JSON.stringify(session.routine))) throw new Error('PERIOD_CHANGED');
        if (!writePeriodDraft(next)) throw new Error('LOCAL_STORAGE_FAILED');
        onLocalPeriod(next); applied = { ...preview, periodId: next.periodId };
      }
      setStage('done'); onApplied?.(applied);
    } catch (cause) {
      setPreview(null); setStage('dates'); setConflictState(null);
      setError(profileError(cause) || (cause.message === 'LOCAL_STORAGE_FAILED' ? en ? 'Device storage is unavailable. Nothing was saved.' : '裝置無法儲存，尚未套用；請釋放空間或使用帳號後再試。'
        : en ? 'Plans, records or your account changed. Inspect these dates again before applying.' : '課表、紀錄或帳號已變更。請重新檢查日期後再套用，沒有覆蓋既有紀錄。'));
    } finally { running.current = false; setBusy(false); }
  };
  const editCopy = date => { if (!busy) onEdit?.(days.map((day, index) => ({ ...day, date: dates[index] })), date); };
  const dateLabel = date => new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  const comparison = (existing, next) => <details className="assignment-comparison">
    <summary>{en ? 'Compare original and new plan' : '查看原課表與新內容'}</summary>
    <div className="assignment-comparison-columns"><section><h4>{en ? 'Original · will be removed' : '原課表 · 將被取代'}</h4><p>{existing.theme || existing.name}</p><WorkoutPlanSummary day={existing} {...{ exercises, lang }} /></section><section><h4>{en ? 'New plan' : '新內容'}</h4><p>{sourceTitle(next)}</p><WorkoutPlanSummary day={next} {...{ exercises, lang }} /></section></div>
  </details>;
  const back = () => { if (!busy) { if (stage === 'review' && !initialDates) setStage('dates'); else returnToEditing(); } };
  return <section className={`assignment-flow combo-assignment ${stage === 'review' ? 'assignment-review-flow' : ''}`} data-testid="apply-workout-plan" aria-busy={busy}>
    <div className="assignment-top"><button disabled={busy} type="button" onClick={back}><ArrowLeft size={18} />{initialDates ? en ? 'Back to editing' : '返回編輯' : stage === 'review' ? en ? 'Dates' : '調整日期' : en ? 'Back' : '返回'}</button></div>
    <header className="assignment-heading"><h2 ref={heading} tabIndex={-1}>{stage === 'done' ? en ? 'Plan applied' : '已套用課表' : singleDayEdit ? en ? 'Review changes' : '確認這天的修改' : stage === 'review' || initialDates && busy ? en ? 'Review plan' : '檢查課表' : en ? 'Choose dates' : '安排日期'}</h2>{name && <p>{name}</p>}</header>
    {error && <div role="alert" className="assignment-error">{error}{onEdit && <button disabled={busy} type="button" onClick={() => editCopy()}>{en ? 'Return to editing' : '返回編輯'}</button>}</div>}
    {stage === 'dates' && !singleDayEdit && <>
      {!initialDates && <div className="assignment-modes" role="group" aria-label={en ? 'Date mapping' : '日期安排方式'}><button type="button" disabled={busy} aria-pressed={mode === 'gaps'} onClick={() => { try { change(offsets.map(offset => shiftPlanDate(dates[0] || today, offset))); setMode('gaps'); } catch { change(days.map(() => '')); setMode('gaps'); } }}>{en ? 'Keep intervals' : '保留原間隔'}</button><button type="button" disabled={busy} aria-pressed={mode === 'individual'} onClick={() => setMode('individual')}>{en ? 'Choose each date' : '逐天指定'}</button></div>}
      {mode === 'gaps' && <div className="assignment-start"><label>{en ? 'Start date' : '開始日期'}<input type="date" min={today} value={dates[0]} disabled={busy} onChange={event => { try { change(offsets.map(offset => shiftPlanDate(event.target.value, offset))); } catch { change(days.map(() => '')); } }} /></label></div>}
      <div className="assignment-date-list">{days.map((day, index) => { const conflict = conflicts[index]; return <section key={index} className="assignment-date-card"><header><span className="assignment-number">{index + 1}</span><div><h3>{sourceTitle(day) || (en ? `Day ${index + 1}` : `第 ${index + 1} 天`)}</h3><p>{day.routine.length} {en ? 'exercises' : '個動作'} · {estimateSessionMinutes(day, exercises)} {en ? 'min' : '分鐘'}</p></div></header>
        {mode === 'individual' ? <label>{en ? 'Date' : '日期'}<input aria-label={`${en ? 'Day' : '第'} ${index + 1} ${en ? 'target date' : '天套用日期'}`} type="date" min={today} value={dates[index]} disabled={busy} onChange={event => change(dates.map((date, i) => i === index ? event.target.value : date))} /></label> : <p className="assignment-target"><strong>{dates[index] ? dateLabel(dates[index]) : en ? 'Choose a date' : '請選日期'}</strong></p>}
        {conflict?.protected ? <p className="assignment-warning">{en ? 'Training records exist. Reschedule this day or return to editing to remove it.' : '已有訓練紀錄。請改期，或返回編輯移除這一天。'}</p> : conflict?.existing ? <div className="assignment-warning"><p>{en ? 'This date already has a plan.' : '這天已有課表。'}</p>{comparison(conflict.existing, day)}<label className="assignment-replace"><input type="checkbox" checked={replacements.includes(dates[index])} disabled={busy} onChange={event => { setReplacements(previous => event.target.checked ? [...previous, dates[index]] : previous.filter(date => date !== dates[index])); setPreview(null); setError(''); }} />{en ? 'Replace the original plan on this date' : '取代這個日期的原課表'}</label></div> : null}
      </section>; })}</div>
      {dateError && <p role="alert" className="assignment-warning">{dateError}</p>}
      <footer className="assignment-actions"><div><strong>{days.length} {en ? 'days' : '天'}</strong></div><button type="button" data-testid="assignment-preview" disabled={busy || !!dateError || unresolved} onClick={inspect} className="button-primary">{busy && <Loader2 className="animate-spin" size={17} />}{busy ? en ? 'Checking…' : '檢查中…' : en ? 'Review plan' : '檢查課表'}</button></footer>
    </>}
    {stage === 'dates' && singleDayEdit && <div className="single-day-check"><p role="status">{busy ? en ? 'Checking this day…' : '正在檢查這天…' : en ? 'Changes have not been saved.' : '修改尚未儲存。'}</p>{!busy && <button type="button" className="button-secondary" onClick={inspect}>{en ? 'Retry check' : '重新檢查'}</button>}</div>}
    {stage === 'review' && preview && <>
      <div className="assignment-review-list">{preview.sessions.map(day => <section key={day.date}><header><h3 className="assignment-source-label">{dateLabel(day.date)}</h3>{onEdit && <button type="button" disabled={busy} className="assignment-modify-day text-link" onClick={() => editCopy(day.date)}>{en ? 'Edit' : '修改'}</button>}</header>
        <div className="assignment-day-summary"><div><h4>{day.theme}</h4><p>{day.routine.length} {en ? 'exercises' : '個動作'} · {estimateSessionMinutes(day, exercises)} {en ? 'min' : '分鐘'}</p></div><span className={replacements.includes(day.date) && conflictState?.sessionsByDate[day.date] ? 'assignment-replace-tag' : 'assignment-new-tag'}>{replacements.includes(day.date) && conflictState?.sessionsByDate[day.date] ? en ? 'Replace' : '取代' : en ? 'Add' : '新增'}</span></div>
        {Number(profile.time) > 0 && estimateSessionMinutes(day, exercises) > Number(profile.time) && <p className="assignment-warning">{en ? `Exceeds your ${profile.time}-minute limit. Edit to adjust.` : `超出設定的 ${profile.time} 分鐘，可返回修改。`}</p>}
        {replacements.includes(day.date) && conflictState?.sessionsByDate[day.date] ? comparison(conflictState.sessionsByDate[day.date], day) : <><button type="button" disabled={busy} aria-expanded={expanded === day.date} aria-controls={`assignment-details-${day.date}`} onClick={() => setExpanded(expanded === day.date ? null : day.date)} className="text-link">{expanded === day.date ? en ? 'Hide exercises' : '收起動作' : en ? 'View exercises' : '查看動作'}</button>{expanded === day.date && <div id={`assignment-details-${day.date}`}><WorkoutPlanSummary {...{ day, exercises, lang }} /></div>}</>}
      </section>)}</div>
      {!singleDayEdit && <button type="button" disabled={busy} className="assignment-change-dates text-link" onClick={() => { setStage('dates'); setPreview(null); }}>{en ? 'Change dates' : '調整日期'}</button>}
      {stale && <p role="alert" className="assignment-warning">{en ? 'Plan changed. Check these dates again.' : '資料已變更，請重新檢查日期。'}</p>}
      <footer className="assignment-actions"><div><strong>{dates.length} {en ? 'days' : '天'}{replacements.some(date => conflictState?.sessionsByDate[date]) && ` · ${en ? 'Replace' : '取代'} ${replacements.filter(date => conflictState?.sessionsByDate[date]).length}`}</strong><span>{uid ? en ? 'Your account' : '目前帳號' : en ? 'This device' : '這台裝置'}</span></div><button type="button" data-testid="assignment-apply" disabled={busy || stale} onClick={apply} className="button-primary">{busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}{busy ? en ? 'Applying…' : '套用中…' : singleDayEdit ? en ? 'Save changes' : '儲存變更' : en ? 'Apply to dates' : '套用到日期'}</button></footer>
    </>}
    {stage === 'done' && <div role="status" className="assignment-success">{en ? 'Saved to your selected dates.' : '已儲存到所選日期。'}<button type="button" className="button-primary" onClick={onCancel}>{en ? 'View my plans' : '查看我的課表'}</button></div>}
  </section>;
}
