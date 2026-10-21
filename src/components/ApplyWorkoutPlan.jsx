import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { assignmentConflicts, assignmentRange, assignmentSummary, materializeAssignments, planOffsets, shiftPlanDate, validateAssignmentConsent } from '../domain/planAssignments.js';
import { applyLocalPeriod, localPeriodState, periodProfile, normalizePeriodDraft, writePeriodDraft } from '../domain/periodDraft.js';
import { applyPeriodPlan, loadPeriodState } from '../services/periodRepository.js';
import { auth } from '../services/firebase.js';
import { readPeriodDraft } from '../domain/periodDraft.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import WorkoutPlanSummary from './WorkoutPlanSummary.jsx';
import '../plannerVisual.css';

export default function ApplyWorkoutPlan({ days, name, initialDates, uid, today, exercises, lang = 'zh', localPeriod, onLocalPeriod, fallbackPlans = {}, profile = {}, onApplied, onCancel, onEdit }) {
  const en = lang === 'en';
  const offsets = planOffsets(days);
  const sourceTitle = day => {
    const title = days.length === 1 ? name : day.theme || day.name || '';
    return /^(第\s*\d+\s*天|Day\s*\d+)$/i.test(title) ? '' : title;
  };
  const [dates, setDates] = useState(() => initialDates || offsets.map(offset => shiftPlanDate(today, offset)));
  const [mode, setMode] = useState(initialDates ? 'individual' : 'gaps');
  const [replacements, setReplacements] = useState([]);
  const [stage, setStage] = useState('dates');
  const [preview, setPreview] = useState(null);
  const [conflictState, setConflictState] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const heading = useRef(null);
  const running = useRef(false);
  const snapshot = JSON.stringify({ uid, localPeriod, fallbackPlans, days, dates, replacements, today, exercises, profile });
  const live = useRef(snapshot);
  useEffect(() => { live.current = snapshot; }, [snapshot]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [stage]);
  let range; let dateError;
  try { range = assignmentRange(dates, today); } catch { dateError = en ? 'Choose distinct dates from today, within a 28-day span.' : '請選今天起、不重複、首末相距 28 天以內的日期。'; }
  const conflicts = conflictState ? assignmentConflicts(conflictState, dates) : [];
  const unresolved = conflicts.some(item => item.protected || item.existing && !replacements.includes(item.date));
  const stale = preview && preview.fingerprint !== snapshot;
  const change = next => { setDates(next); setPreview(null); setConflictState(null); setReplacements([]); setError(''); };
  const inspect = async () => {
    if (running.current || dateError) return;
    running.current = true; setBusy(true); setError('');
    const captured = snapshot;
    try {
      const sessions = materializeAssignments(days, dates, { name, exercises, lang, today });
      const state = uid ? await loadPeriodState(uid, range, { today, exercises, fallbackPlans }) : localPeriodState(localPeriod, range, today);
      if (captured !== live.current) return;
      setConflictState(state);
      validateAssignmentConsent(state, dates, replacements);
      setPreview({ range, dates: [...dates].sort(), selectedDates: [...dates], replaceDates: [...replacements], sessions, expectedState: state.expectedState,
        weeklySummaries: assignmentSummary(sessions, exercises, profile.focus), profile: periodProfile(profile), conclusion: name, fingerprint: captured });
      setStage('review'); window.scrollTo({ top: 0 });
    } catch (cause) {
      setError(cause.message === 'DATE_PROTECTED' ? en ? 'A target date has training records. Choose another date.' : '目的日期已有訓練紀錄，請改日期，原紀錄會保留。'
        : cause.message === 'DATE_CONFLICT' ? en ? 'Review existing plans below. Change dates or explicitly replace an unstarted plan.' : '下方日期已有課表，請改日期，或明確勾選替換尚未開始的課表。'
          : cause.message === 'SESSION_CHANGED' ? en ? 'Your account changed. Reopen this preview.' : '帳號已變更，請重新開啟預覽。'
            : en ? 'Could not prepare this plan. Check exercises, warm-up, preparation sets and doses, then retry.' : '無法預覽。請確認動作、暖身、準備組與劑量完整，或先編輯這份課表。');
    } finally { running.current = false; setBusy(false); }
  };
  const apply = async () => {
    if (running.current || !preview || stale) return;
    running.current = true; setBusy(true); setError('');
    try {
      let applied;
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
        if (!writePeriodDraft(next)) throw new Error('LOCAL_STORAGE_FAILED');
        onLocalPeriod(next); applied = { ...preview, periodId: next.periodId };
      }
      setStage('done'); onApplied?.(applied);
    } catch (cause) {
      setPreview(null); setStage('dates'); setConflictState(null);
      setError(cause.message === 'LOCAL_STORAGE_FAILED' ? en ? 'Device storage is unavailable. Nothing was saved.' : '裝置無法儲存，尚未套用；請釋放空間或使用帳號後再試。'
        : en ? 'Plans, records or your account changed. Inspect these dates again before applying.' : '課表、紀錄或帳號已變更。請重新檢查日期後再套用，沒有覆蓋既有紀錄。');
    } finally { running.current = false; setBusy(false); }
  };
  return <section className="assignment-flow" data-testid="apply-workout-plan">
    <div className="assignment-top"><button disabled={busy} type="button" onClick={stage === 'review' ? () => setStage('dates') : onCancel}><ArrowLeft size={18} />{stage === 'review' ? en ? 'Change dates' : '修改日期' : en ? 'Back to preview' : '回到預覽'}</button>{stage !== 'done' && <button disabled={busy} type="button" onClick={onCancel}>{en ? 'Cancel' : '取消套用'}</button>}</div>
    <div className="assignment-steps"><span data-active={stage === 'dates'}>1 {en ? 'Dates' : '選日期'}</span><i /><span data-active={stage === 'review'}>2 {en ? 'Review and apply' : '檢查並套用'}</span></div>
    <header className="assignment-heading"><h2 ref={heading} tabIndex={-1}>{stage === 'dates' ? en ? 'Where should these days go?' : `這 ${days.length} 天，要排在哪天？` : stage === 'review' ? en ? 'Review before applying' : '最後確認，才會套用' : en ? 'Plan applied' : '課表已套用'}</h2><p>{stage === 'dates' ? en ? 'Each source day maps to one of your dates.' : '每個來源日都會明確對應你的日期。' : `${name} · ${days.length} ${en ? 'days' : '天課表'}`}</p></header>
    {error && <div role="alert" className="assignment-error">{error}{onEdit && <button onClick={() => onEdit(days.map((day, index) => ({ ...day, date: dates[index] })))}>{en ? 'Edit this copy first' : '先編輯這份副本'}</button>}</div>}
    {stage === 'dates' && <>
      <div className="assignment-modes" role="group" aria-label={en ? 'Date mapping' : '日期安排方式'}><button type="button" disabled={busy} aria-pressed={mode === 'gaps'} onClick={() => { try { change(offsets.map(offset => shiftPlanDate(dates[0] || today, offset))); setMode('gaps'); } catch { change(days.map(() => '')); setMode('gaps'); } }}>{en ? 'Keep intervals' : '保留原間隔'}</button><button type="button" disabled={busy} aria-pressed={mode === 'individual'} onClick={() => setMode('individual')}>{en ? 'Choose each date' : '逐天指定日期'}</button></div>
      {mode === 'gaps' && <div className="assignment-start"><label>{en ? 'Day 1 starts on' : '第 1 天，從哪天開始？'}<input type="date" min={today} value={dates[0]} disabled={busy} onChange={event => { try { change(offsets.map(offset => shiftPlanDate(event.target.value, offset))); } catch { change(days.map(() => '')); } }} /></label><p>{en ? 'The other days follow the original intervals. To move days separately, choose each date.' : '改開始日，其他日期會按原間隔一起移動。想單獨改，請選「逐天指定日期」。'}</p></div>}
      <div className="assignment-date-list">{days.map((day, index) => { const conflict = conflicts[index]; return <section key={index} className="assignment-date-card"><header><span className="assignment-number">{index + 1}</span><div><h3>{en ? 'Day' : '第'} {index + 1}{en ? '' : ' 天'}{sourceTitle(day) && ` · ${sourceTitle(day)}`}</h3><p>{estimateSessionMinutes(day, exercises)} {en ? 'min' : '分鐘'} · {day.routine.length} {en ? 'exercises' : '個動作'}</p></div></header>
        {mode === 'individual' ? <label>{en ? 'Apply to date' : '套用到日期 ↓'}<input aria-label={`${en ? 'Day' : '第'} ${index + 1} ${en ? 'target date' : '天套用日期'}`} type="date" min={today} value={dates[index]} disabled={busy} onChange={event => change(dates.map((date, i) => i === index ? event.target.value : date))} /></label> : <p className="assignment-target"><span>{en ? 'Apply to ↓' : '套用到 ↓'}</span><strong>{dates[index] || (en ? 'Choose a date' : '請選日期')}</strong></p>}
        {conflict?.protected ? <p className="assignment-warning">{en ? 'Training records exist. Change this date; records cannot be replaced.' : '已有訓練紀錄，不能覆蓋。請替這天改日期。'}</p> : conflict?.existing ? <div className="assignment-warning"><p>{en ? 'Existing plan' : '已有課表'}：{conflict.existing.theme || conflict.existing.name}</p><label className="assignment-replace"><input type="checkbox" checked={replacements.includes(dates[index])} disabled={busy} onChange={event => { setReplacements(previous => event.target.checked ? [...previous, dates[index]] : previous.filter(date => date !== dates[index])); setError(''); }} />{en ? 'Replace this unstarted plan at final confirmation' : '最後確認時，替換這份尚未開始的課表'}</label></div> : <p className="assignment-date-state">{conflictState ? en ? '✓ Available' : '✓ 可安排' : en ? 'Check before confirming' : '確認前檢查日期'}</p>}
      </section>; })}</div>
      {dateError && <p role="alert" className="assignment-warning">{dateError}</p>}
      <p className="assignment-storage">{uid ? en ? 'Will save to your signed-in account.' : '確認後儲存到目前登入帳號。' : en ? 'Will save on this device. Importing never marks training complete.' : '確認後儲存在這台裝置；套用不會標記訓練完成。'}</p>
      <footer className="assignment-actions"><div><strong>{en ? `Apply ${days.length} days` : `要套用 ${days.length} 天`}</strong><span>{en ? 'One source day per date' : '每一天對應一個日期'}</span></div><button type="button" data-testid="assignment-preview" disabled={busy || !!dateError || unresolved} onClick={inspect} className="button-primary">{busy && <Loader2 className="animate-spin" size={17} />}{en ? 'Check dates and preview' : '檢查日期並預覽'}</button></footer>
    </>}
    {stage === 'review' && preview && <>
      <div className="assignment-review-list">{preview.sessions.map((day, index) => <section key={day.date}><header><span className="assignment-source-label">{en ? 'Day' : '第'} {index + 1}{en ? '' : ' 天'}</span><span className={replacements.includes(day.date) ? 'assignment-replace-tag' : 'assignment-new-tag'}>{replacements.includes(day.date) ? en ? 'Replace' : '替換' : en ? 'Add' : '新增'}</span></header><h3>{day.theme}</h3><p className="assignment-review-date">→ {day.date} · {estimateSessionMinutes(day, exercises)} {en ? 'min' : '分鐘'}</p>
        {Number(profile.time) > 0 && estimateSessionMinutes(day, exercises) > Number(profile.time) && <p className="assignment-warning">{en ? `Exceeds your ${profile.time}-minute availability. Edit this copy if needed.` : `超出你設定的 ${profile.time} 分鐘；請確認時間，或先編輯副本。`}</p>}
        {replacements.includes(day.date) && <p className="assignment-warning">{en ? 'Original' : '原課表'}：{conflictState.sessionsByDate[day.date]?.theme || conflictState.sessionsByDate[day.date]?.name}</p>}
        <button type="button" aria-expanded={expanded === day.date} onClick={() => setExpanded(expanded === day.date ? null : day.date)} className="text-link">{en ? 'Details' : '查看內容'}</button>{expanded === day.date && <WorkoutPlanSummary {...{ day, exercises, lang }} />}
      </section>)}</div>
      <p role="status" className="assignment-success">{en ? '✓ Existing training records will be retained.' : '✓ 既有訓練紀錄會保留。'}{replacements.length === 0 && (en ? ' No existing plans will be replaced.' : '不覆蓋任何既有課表。')}</p>
      {onEdit && <button className="assignment-edit-copy" onClick={() => onEdit(days.map((day, index) => ({ ...day, date: dates[index] })))}>{en ? 'Edit this copy before applying' : '套用前調整這份副本'} →</button>}
      <p className="assignment-storage">{uid ? en ? 'Saves to your signed-in account.' : '將儲存到目前登入帳號。' : en ? 'Saves to this device.' : '將儲存在這台裝置。'}{en ? ' Your source and actual records stay unchanged.' : '來源與實際訓練紀錄保持完整。'}</p>
      {stale && <p role="alert" className="assignment-warning">{en ? 'Plan changed. Review the dates again.' : '資料已變更，請返回重新檢查。'}</p>}
      <footer className="assignment-actions"><div><strong>{en ? 'Add' : '新增'} {dates.length - replacements.length} {en ? 'days' : '天'}{replacements.length > 0 && ` · ${en ? 'Replace' : '替換'} ${replacements.length} ${en ? 'days' : '天'}`}</strong><span>{en ? 'Only changes after confirmation' : '確認後才更新我的課表'}</span></div><button type="button" data-testid="assignment-apply" disabled={busy || stale} onClick={apply} className="button-primary">{busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}{en ? `Confirm ${dates.length} days` : `確認套用 ${dates.length} 天課表`}</button></footer>
    </>}
    {stage === 'done' && <div role="status" className="assignment-success">{en ? 'Saved to your selected dates.' : '已儲存到所選日期。'}<button className="button-primary" onClick={onCancel}>{en ? 'View my plans' : '查看我的課表'}</button></div>}
  </section>;
}
