import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { assignmentConflicts, assignmentRange, assignmentSummary, materializeAssignments, planOffsets, shiftPlanDate, validateAssignmentConsent } from '../domain/planAssignments.js';
import { applyLocalPeriod, localPeriodState, periodProfile, normalizePeriodDraft, writePeriodDraft } from '../domain/periodDraft.js';
import { applyPeriodPlan, loadPeriodState } from '../services/periodRepository.js';
import { auth } from '../services/firebase.js';
import { readPeriodDraft } from '../domain/periodDraft.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import WorkoutPlanSummary from './WorkoutPlanSummary.jsx';

export default function ApplyWorkoutPlan({ days, name, initialDates, uid, today, exercises, lang = 'zh', localPeriod, onLocalPeriod, fallbackPlans = {}, profile = {}, onApplied, onCancel, onEdit }) {
  const en = lang === 'en';
  const offsets = planOffsets(days);
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
  return <section className="max-w-3xl space-y-5" data-testid="apply-workout-plan">
    <div className="flex flex-wrap justify-between gap-3"><button disabled={busy} type="button" className="screen-back" onClick={stage === 'review' ? () => setStage('dates') : onCancel}><ArrowLeft size={16} />{stage === 'review' ? en ? 'Change dates' : '修改日期' : en ? 'Back' : '返回'}</button>{stage !== 'done' && <button disabled={busy} type="button" className="text-link" onClick={onCancel}>{en ? 'Cancel' : '取消套用'}</button>}</div>
    <header className="screen-header"><p className="eyebrow">{name}</p><h2 ref={heading} tabIndex={-1} className="screen-title">{stage === 'dates' ? en ? 'Where should these days go?' : `這 ${days.length} 天，要排在哪天？` : stage === 'review' ? en ? 'Review before applying' : '最後確認，才會套用' : en ? 'Plan applied' : '課表已套用'}</h2><p className="screen-description">{en ? 'Every source day maps to one date. Review exercises and doses against your equipment and current needs before confirming.' : '每個來源日對應一個日期。請先確認動作、組次適合你的器材與目前狀況，再確認套用。'}</p></header>
    {error && <div role="alert" className="rounded-xl bg-amber-50 text-amber-900 p-4 text-sm">{error}{onEdit && <button className="text-link block mt-2" onClick={() => onEdit(days.map((day, index) => ({ ...day, date: dates[index] })))}>{en ? 'Edit this copy first' : '先編輯這份副本'}</button>}</div>}
    {stage === 'dates' && <><div className="segmented-control" role="group" aria-label={en ? 'Date mapping' : '日期安排方式'}><button type="button" disabled={busy} aria-pressed={mode === 'gaps'} onClick={() => { try { change(offsets.map(offset => shiftPlanDate(dates[0] || today, offset))); setMode('gaps'); } catch { change(days.map(() => '')); setMode('gaps'); } }}>{en ? 'Keep intervals' : '保留原間隔'}</button><button type="button" disabled={busy} aria-pressed={mode === 'individual'} onClick={() => setMode('individual')}>{en ? 'Choose each date' : '逐天指定日期'}</button></div>
      {mode === 'gaps' && <label className="block text-sm">{en ? 'Day 1 starts on' : '第 1 天，從哪天開始？'}<input type="date" min={today} value={dates[0]} disabled={busy} onChange={event => { try { change(offsets.map(offset => shiftPlanDate(event.target.value, offset))); } catch { change(days.map(() => '')); } }} className="block w-full mt-2 rounded-xl border border-slate-300 p-3" /></label>}
      <div className="space-y-3">{days.map((day, index) => { const conflict = conflicts[index]; return <div key={index} className="panel space-y-3"><p className="font-semibold">{en ? 'Source day' : '來源第'} {index + 1}{en ? '' : ' 天'} · {day.theme || day.name || name}</p><p className="text-sm text-slate-500">{day.routine.length} {en ? 'exercises' : '個動作'}</p>{mode === 'individual' ? <label className="block text-sm">{en ? 'Apply to date' : '套用到日期'}<input aria-label={`${en ? 'Day' : '第'} ${index + 1} ${en ? 'target date' : '天套用日期'}`} type="date" min={today} value={dates[index]} disabled={busy} onChange={event => change(dates.map((date, i) => i === index ? event.target.value : date))} className="block w-full mt-2 rounded-xl border border-slate-300 p-3" /></label> : <p className="font-medium text-sky-800">→ {dates[index] || (en ? 'Choose a date' : '請選日期')}</p>}
        {conflict?.protected ? <p className="text-sm text-amber-900">{en ? 'Training records exist. Change this date; records cannot be replaced.' : '已有訓練紀錄，不能覆蓋。請替這天改日期。'}</p> : conflict?.existing && <div className="rounded-xl bg-amber-50 p-3 space-y-2"><p className="text-sm">{en ? 'Existing plan' : '已有課表'}：{conflict.existing.theme || conflict.existing.name}</p><label className="flex items-center gap-3 min-h-11 text-sm"><input type="checkbox" className="size-5" checked={replacements.includes(dates[index])} disabled={busy} onChange={event => { setReplacements(previous => event.target.checked ? [...previous, dates[index]] : previous.filter(date => date !== dates[index])); setError(''); }} />{en ? 'Replace this unstarted plan at final confirmation' : '最後確認時，替換這份尚未開始的課表'}</label></div>}
      </div>; })}</div>{dateError && <p role="alert" className="text-sm text-amber-800">{dateError}</p>}<p className="text-xs text-slate-500">{uid ? en ? 'Will save to this signed-in account.' : '將儲存到目前登入帳號。' : en ? 'Will save on this device; sign in later to sync separately.' : '將儲存在這台裝置；登入帳號時另行預覽，不會自動覆蓋帳號資料。'}</p><button type="button" data-testid="assignment-preview" disabled={busy || !!dateError || unresolved} onClick={inspect} className="button-primary">{busy && <Loader2 className="animate-spin" size={17} />}{en ? 'Check dates and preview' : '檢查日期並預覽'}</button></>}
    {stage === 'review' && preview && <><p role="status" className="text-sm text-sky-800">{en ? 'Add' : '新增'} {dates.length - replacements.length} {en ? 'days' : '天'}{replacements.length > 0 && ` · ${en ? 'Replace' : '替換'} ${replacements.length} ${en ? 'days' : '天'}`}</p>{preview.sessions.map((day, index) => <section key={day.date} className="panel"><div className="flex justify-between gap-3"><div><p className="font-semibold">{day.date} · {day.theme}</p><p className="text-sm text-sky-800 mt-1">{day.routine.length} {en ? 'exercises' : '個動作'} · {estimateSessionMinutes(day, exercises)} {en ? 'min' : '分鐘'}</p>{Number(profile.time) > 0 && estimateSessionMinutes(day, exercises) > Number(profile.time) && <p className="text-sm text-amber-800 mt-1">{en ? `Exceeds your ${profile.time}-minute availability. Edit this copy before applying if needed.` : `超出你設定的 ${profile.time} 分鐘；請確認時間，或先編輯副本。`}</p>}<p className="text-sm text-slate-500 mt-1">{en ? 'Source day' : '來源第'} {index + 1}{en ? '' : ' 天'} · {replacements.includes(day.date) ? en ? 'Replace' : '替換' : en ? 'Add' : '新增'}</p>{replacements.includes(day.date) && <p className="text-xs text-amber-800 mt-2">{en ? 'Original' : '原課表'}：{conflictState.sessionsByDate[day.date]?.theme || conflictState.sessionsByDate[day.date]?.name}</p>}</div><button type="button" onClick={() => setExpanded(expanded === day.date ? null : day.date)} className="text-link min-h-11">{en ? 'Details' : '查看內容'}</button></div>{expanded === day.date && <div className="mt-4"><WorkoutPlanSummary {...{ day, exercises, lang }} /></div>}</section>)}{stale && <p role="alert" className="text-sm text-amber-800">{en ? 'Plan changed. Review the dates again.' : '資料已變更，請返回重新檢查。'}</p>}<button type="button" data-testid="assignment-apply" disabled={busy || stale} onClick={apply} className="button-primary">{busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}{en ? `Confirm ${dates.length} days` : `確認套用 ${dates.length} 天課表`}</button></>}
    {stage === 'done' && <p role="status" className="panel">{en ? 'Saved to your selected dates. Your source and training records are unchanged.' : '已儲存到所選日期，來源課表與訓練紀錄保持完整。'}<button className="button-primary mt-4" onClick={onCancel}>{en ? 'View my plans' : '查看我的課表'}</button></p>}
  </section>;
}
