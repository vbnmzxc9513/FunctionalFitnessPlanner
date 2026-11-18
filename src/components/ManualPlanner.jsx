import { useBackNavigation } from '../hooks/useBackNavigation.js';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, CalendarDays } from 'lucide-react';
import QuickWorkoutPicker from './QuickWorkoutPicker.jsx';
import { undoQuickWorkout } from '../domain/quickWorkoutDraft.js';
import SessionPlanEditor from './SessionPlanEditor.jsx';
import './manual-planner.css';
import './combo-first.css';
import { localDate } from '../domain/dates.js';
import { EQUIPMENT } from '../domain/exerciseCatalog.js';
import {
  clearManualDraft, copyManualSession, createManualSession, hydrateManualSession,
  loadManualDraft, manualDraftStorageKey, manualPlannerErrorMessage, prepareManualPreview,
  saveManualDraft, shiftManualDate, validateManualDates,
} from '../domain/manualPlanner.js';

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600';
const input = 'mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600';

function initialDraft({ uid, initialSessions, exercises, lang }) {
  try {
    const sessions = initialSessions?.length ? initialSessions.map(session => hydrateManualSession(session, exercises, lang)) : loadManualDraft(uid, { exercises, lang }) || [];
    if (sessions.length) validateManualDates(sessions.map(session => session.date));
    return { sessions, error: null, blocked: false };
  } catch (error) {
    const blocked = ['MANUAL_INVALID_DRAFT', 'MANUAL_INVALID_DATES', 'MANUAL_DATE_SPAN'].includes(error.message);
    return { sessions: [], error: blocked ? error : new Error('MANUAL_STORAGE_UNAVAILABLE'), blocked };
  }
}

// A scope change remounts all draft, picker and form state before rendering the next account.
export default function ManualPlanner(props) {
  return <ManualPlannerWorkspace key={manualDraftStorageKey(props.uid)} {...props} />;
}

function ManualPlannerWorkspace({ uid, today = localDate(), lang = 'zh', t, exercises = {}, eligibleExercises = {}, profile,
  onPreview, onCancel, onSaveWorkout, onShare, workoutStore, onContextChange, onProfileChange, initialSessions, initialActiveDate, singleDay = false, initialAdd = false, onCreateExercise, createScope }) {
  const en = lang === 'en';
  const [initial] = useState(() => initialDraft({ uid, initialSessions, exercises, lang }));
  const [sessions, setSessions] = useState(initial.sessions);
  const [dates, setDates] = useState(() => initial.sessions.map(session => session.date));
  const [stage, setStage] = useState(initial.blocked ? 'unreadable' : initial.sessions.length ? 'edit' : 'dates');
  const [range, setRange] = useState(() => ({ from: initial.sessions[0]?.date || today, to: initial.sessions.at(-1)?.date || shiftManualDate(today, 6) }));
  const [calendarMonth, setCalendarMonth] = useState(() => (initial.sessions[0]?.date || today).slice(0, 7));
  const [activeDate, setActiveDate] = useState(initial.sessions.some(value => value.date === initialActiveDate) ? initialActiveDate : initial.sessions[0]?.date || '');
  const [picker, setPicker] = useState(initialAdd ? true : null);
  const [selectedCombo, setSelectedCombo] = useState(null);
  const [lastOperation, setLastOperation] = useState(null);
  const [error, setError] = useState(initial.error ? manualPlannerErrorMessage(initial.error, lang, exercises) : '');
  const [noticeState, setNoticeState] = useState({ text: '', version: 0 });
  const [noticeCollapsed, setNoticeCollapsed] = useState(false);
  const notice = noticeState.text;
  const setNotice = text => { setNoticeState(current => ({ text, version: current.version + 1 })); setNoticeCollapsed(false); };
  const [stored, setStored] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');
  const [copyConfirmed, setCopyConfirmed] = useState(false);
  const errorBox = useRef(null);
  const heading = useRef(null);
  const openedBy = useRef(null);
  const mounted = useRef(true);
  const session = sessions.find(value => value.date === activeDate) || sessions[0];
  const dailyTime = profile?.time === undefined ? 240 : Number(profile.time);
  const validTime = Number.isFinite(dailyTime) && dailyTime >= 5 && dailyTime <= 240;
  const report = problem => {
    setError(manualPlannerErrorMessage(problem, lang, exercises));
    requestAnimationFrame(() => errorBox.current?.focus({ preventScroll: false }));
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (!noticeState.text) return; const timer = setTimeout(() => setNoticeCollapsed(true), 3000); return () => clearTimeout(timer); }, [noticeState]);
  useEffect(() => {
    if (singleDay || stage !== 'edit' || !sessions.length) return;
    let active = true, success = true;
    try { saveManualDraft(uid, sessions); } catch { success = false; }
    Promise.resolve().then(() => { if (active) setStored(success); });
    return () => { active = false; };
  }, [uid, sessions, stage, singleDay]);
  const update = (next, operation = null) => {
    setSessions(current => current.map(value => value.date === next.date ? next : value));
    setNotice(operation ? en ? 'Removed from this draft.' : '已從草稿移除。' : ''); setLastOperation(operation);
  };
  const dateLabel = date => new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace(/[（）()]/g, '').replace(/週([一二三四五六日])/, '（$1）');
  const startEditing = () => {
    try {
      const chosen = validateManualDates(dates, { today });
      setSessions(chosen.map(date => sessions.find(value => value.date === date) || createManualSession(date, lang)));
      setActiveDate(chosen.includes(activeDate) ? activeDate : chosen[0]); setStage('edit'); setError(''); setPicker(null); setNotice(''); setLastOperation(null);
      requestAnimationFrame(() => heading.current?.focus());
    } catch (problem) { report(problem); }
  };
  const toggleDate = date => {
    try { setDates(validateManualDates(dates.includes(date) ? dates.filter(value => value !== date) : [...dates, date], { today, allowEmpty: true })); setError(''); }
    catch (problem) { report(problem); }
  };
  const saveAndExit = () => {
    if (!singleDay && stage === 'edit' && sessions.length) {
      try { saveManualDraft(uid, sessions); setStored(true); }
      catch { setStored(false); report(new Error('MANUAL_STORAGE_UNAVAILABLE')); return; }
    }
    onCancel?.();
  };
  const preview = async () => {
    if (busy) return;
    try {
      if (!validTime) throw new Error('INVALID_PLANNING_TIME');
      const prepared = prepareManualPreview(sessions, { today, exercises, eligibleExercises, dailyTime });
      setBusy(true); setError('');
      if (!singleDay) { try { saveManualDraft(uid, sessions); setStored(true); } catch { setStored(false); } }
      await onPreview?.(prepared);
    } catch (problem) { if (mounted.current) report(problem); }
    finally { if (mounted.current) setBusy(false); }
  };
  const openPicker = (workout = null) => {
    openedBy.current = document.activeElement;
    setSelectedCombo(workout); setPicker(true); setError('');
  };
  const closePicker = () => {
    setPicker(null); setSelectedCombo(null); setError('');
    requestAnimationFrame(() => {
      const target = openedBy.current?.isConnected ? openedBy.current : heading.current;
      target?.focus();
    });
  };
  useBackNavigation(!!picker, closePicker, 60);
  useBackNavigation(stage === 'edit', saveAndExit, 30);
  const applyOperation = operation => {
    update(operation.session); setLastOperation(operation);
    setNotice(en ? `Added ${operation.addedCount}${operation.keptCount ? ` · ${operation.keptCount} duplicates kept` : ''}${operation.replacedCount ? ` · ${operation.replacedCount} doses updated` : ''}` : `新增 ${operation.addedCount}${operation.keptCount ? `，${operation.keptCount} 個重複保留原設定` : ''}${operation.replacedCount ? `，更新 ${operation.replacedCount} 項劑量` : ''}`);
  };
  const undoAddition = () => { if (!lastOperation || lastOperation.session.date !== session.date) return; update(undoQuickWorkout(lastOperation)); setNotice(en ? 'Last draft change undone.' : '已撤銷最近一次草稿變更。'); };
  const reusableAction = callback => callback ? async value => {
    try { const [clean] = prepareManualPreview([value], { today, exercises, eligibleExercises, dailyTime }); await callback(clean); }
    catch (problem) { report(problem); }
  } : undefined;
  const copyDay = () => {
    if (!copyTarget || !copyConfirmed) return;
    update(copyManualSession(session, copyTarget, { exercises, lang }));
    setCopyTarget(''); setNotice(en ? 'Copied into the target draft day. Existing schedules have not changed.' : '已取代目的日期的草稿，既有正式課表尚未變動。');
  };
  const configure = () => {
    closePicker(); requestAnimationFrame(() => {
      const target = document.getElementById('manual-configuration');
      if (target) { const menu = target.closest('.manual-more'); if (menu) menu.open = true; target.open = true; target.querySelector('summary')?.focus(); target.scrollIntoView({ block: 'center' }); }
    });
  };
  const dayActions = session && <>{lastOperation && <button type="button" data-testid="manual-undo-change" className="manual-text-action" onClick={undoAddition}>{en ? 'Undo last change' : '撤銷最近一次變更'}</button>}<div className="manual-more-actions">{onSaveWorkout && <button type="button" data-testid="manual-save-day" className={button} onClick={() => onSaveWorkout(session)}>{en ? 'Save as combo' : '收藏成組合'}</button>}{onShare && <button type="button" className={button} onClick={() => reusableAction(onShare)(session)}>{en ? 'Share draft' : '分享草稿'}</button>}</div>{sessions.length > 1 && <details className="manual-secondary-details"><summary>{en ? 'Copy this day' : '複製這天'}</summary><label className="block text-sm text-slate-700">{en ? 'Copy this day into another draft date' : '複製這天到其他草稿日期'}<select value={copyTarget} onChange={event => { setCopyTarget(event.target.value); setCopyConfirmed(false); }} className={input}><option value="">{en ? 'Choose target date' : '選擇目的日期'}</option>{sessions.filter(value => value.date !== session.date).map(value => <option key={value.date} value={value.date}>{dateLabel(value.date)}</option>)}</select></label><p className="my-2 text-xs text-slate-500">{en ? 'This replaces the target draft day, including its exercises and doses. Scheduled sessions are untouched.' : '這會取代目的日期的草稿動作與組次，尚不更動正式課表。'}</p>{copyTarget && <div className="quick-conflict"><strong>{en ? 'Content to remove' : '將移除的目的草稿內容'}</strong>{sessions.find(value => value.date === copyTarget)?.prescriptions.map(dose => <p key={dose.id}>{exercises[dose.id]?.name || dose.id} · {dose.sets} × {dose.value}</p>)}<strong>{en ? 'Replacement content' : '取代後內容'}</strong>{session.prescriptions.map(dose => <p key={dose.id}>{exercises[dose.id]?.name || dose.id} · {dose.sets} × {dose.value}</p>)}<label className="quick-check"><input type="checkbox" checked={copyConfirmed} onChange={event => setCopyConfirmed(event.target.checked)} />{en ? 'Replace this target draft with the current day' : '確認以目前這天取代目的草稿'}</label></div>}<button type="button" disabled={!copyTarget || !copyConfirmed} className={button} onClick={copyDay}><Copy size={16} aria-hidden="true" />{en ? 'Copy and replace target draft' : '複製並取代目的草稿'}</button></details>}
        <div className="manual-leave-row"><button type="button" className="manual-text-action" disabled={busy} onClick={saveAndExit}>{singleDay ? en ? 'Leave without saving changes' : '離開，不儲存修改' : en ? 'Save draft and leave' : '保留草稿後離開'}</button></div></>;
  const timeControls = session && (onContextChange || onProfileChange) && stage !== 'unreadable' && <details id="manual-configuration" className="manual-configuration"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-sky-800">{en ? 'Available time and equipment' : '時間與器材'} · {`${profile?.context?.equipment?.length || 0} ${en ? 'equipment' : '種器材'}`}</summary>{onProfileChange && <label className="my-3 block text-sm font-medium text-slate-700">{en ? 'Daily time limit (5–240 minutes)' : '每日時間上限（5–240 分鐘）'}<input data-testid="manual-daily-time" type="number" min="5" max="240" step="1" value={profile?.time ?? '240'} onChange={event => onProfileChange({ ...profile, time: event.target.value })} className={input} /></label>}{!validTime && <p role="status" className="text-sm text-amber-800">{en ? 'Enter a time from 5 to 240 minutes before reviewing.' : '請填入 5–240 分鐘後再檢查課表。'}</p>}<p className="my-3 text-sm text-slate-600">{en ? 'Equipment changes the available exercise list. Partner, experience and treatment restrictions still apply. No equipment selected means bodyweight choices only. Doses will not be changed automatically to fit your time.' : '器材會影響可加入動作；搭檔、經驗與治療限制仍會保留。未勾選器材時，只會列出徒手可用的動作。改時間不會自動變更你的組次。'}</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{EQUIPMENT.map(value => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={profile?.context?.equipment?.includes(value) || false} onChange={event => { const context = { ...(profile?.context || {}), equipment: event.target.checked ? [...new Set([...(profile?.context?.equipment || []), value])] : (profile?.context?.equipment || []).filter(item => item !== value) }; if (onContextChange) onContextChange(context); else onProfileChange({ ...profile, context }); }} className="h-5 w-5 accent-sky-600" />{t?.(`equipment_${value}`) || value}</label>)}</div></details>;
  let availableDates = [], rangeValid = true;
  try {
    validateManualDates(range.from === range.to ? [range.from] : [range.from, range.to], { today });
    if (range.to < range.from) rangeValid = false;
    else for (let date = range.from; date <= range.to; date = shiftManualDate(date, 1)) availableDates.push(date);
  } catch { rangeValid = false; }
  const monthStart = `${calendarMonth}-01`;
  const leading = (new Date(`${monthStart}T12:00:00Z`).getUTCDay() || 7) - 1;
  const monthDays = new Date(Date.UTC(Number(calendarMonth.slice(0, 4)), Number(calendarMonth.slice(5, 7)), 0)).getUTCDate();
  const monthCells = [...Array(leading).fill(null), ...Array.from({ length: monthDays }, (_, index) => `${calendarMonth}-${String(index + 1).padStart(2, '0')}`)];
  const monthLabel = new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${monthStart}T12:00:00Z`));
  const changeMonth = offset => {
    const next = new Date(`${monthStart}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + offset); setCalendarMonth(next.toISOString().slice(0, 7));
  };
  return <section data-testid="manual-planner" className={`manual-workspace ${stage === 'edit' ? 'manual-edit-workspace' : ''}`}>
    <div className="manual-topline"><button type="button" className="manual-back" disabled={busy} onClick={saveAndExit}><ArrowLeft size={16} aria-hidden="true" />{singleDay ? en ? 'Back to workout' : '返回當天' : en ? 'My plan' : '我的課表'}</button></div>
    {stage === 'edit' && session ? <header className="combo-first-day-header">
      <div className="combo-first-month"><span>{new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${session.date}T12:00:00Z`))}</span>{!singleDay && <button type="button" onClick={() => { setStage('dates'); setDates(sessions.map(value => value.date)); setError(''); setNotice(''); setLastOperation(null); }}>{en ? 'Change dates' : '調整日期'}<CalendarDays size={15} aria-hidden="true" /></button>}</div>
      {!singleDay && <div className="manual-dates" aria-label={en ? 'Draft dates' : '切換草稿日期'}>{sessions.map(value => <button type="button" key={value.date} data-testid={`manual-tab-${value.date}`} aria-pressed={session.date === value.date} aria-label={dateLabel(value.date)} onClick={() => { setActiveDate(value.date); setError(''); setCopyTarget(''); setCopyConfirmed(false); setNotice(''); setLastOperation(null); }} className="manual-date-tab"><span>{new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${value.date}T12:00:00Z`))}</span><strong>{Number(value.date.slice(8))}</strong>{value.routine.length > 0 && <i aria-hidden="true" />}</button>)}</div>}
      <h1 ref={heading} tabIndex={-1}>{new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${session.date}T12:00:00Z`))}<span>{new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${session.date}T12:00:00Z`))}</span></h1>
      <button type="button" className="combo-first-day-meta" onClick={configure}><i aria-hidden="true" />{en ? 'Not applied' : '尚未套用'}<span>·</span>{dailyTime} {en ? 'min limit' : '分鐘上限'}</button>
    </header> : <header className="manual-intro">{stage === 'dates' && <ol className="manual-steps" aria-label={en ? 'Planning steps' : '排課步驟'}>{[en ? '1 Dates' : '1 日期', en ? '2 Build a draft' : '2 安排草稿', en ? '3 Review' : '3 檢查'].map((label, index) => <li key={label} aria-current={index === (stage === 'dates' ? 0 : 1) ? 'step' : undefined}>{label}</li>)}</ol>}<div className="manual-title-row"><h1 ref={heading} tabIndex="-1">{stage === 'dates' ? en ? 'Which days are you planning?' : '要安排哪幾天？' : en ? `Plan ${dateLabel(session?.date || today)}` : `安排 ${dateLabel(session?.date || today)}`}</h1>{stage === 'edit' && <button type="button" className="manual-change-dates" disabled={!!picker || busy} onClick={() => { setStage('dates'); setDates(sessions.map(value => value.date)); setError(''); setNotice(''); setLastOperation(null); }}>{en ? 'Change dates' : '調整日期'}</button>}</div></header>}

    {error && <p ref={errorBox} tabIndex="-1" role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800 focus-visible:outline-2 focus-visible:outline-red-500">{error}</p>}
    {notice && <div role="status" className="manual-operation-notice" data-collapsed={noticeCollapsed}><p>{notice}</p>{lastOperation && <button type="button" className="manual-text-action" onClick={undoAddition}>{en ? 'Undo' : '撤銷'}</button>}</div>}
    {stage === 'unreadable' ? <button type="button" className={button} onClick={() => {
      try { clearManualDraft(uid); setSessions([]); setDates([]); setStage('dates'); setError(''); } catch { report(new Error('MANUAL_STORAGE_UNAVAILABLE')); }
    }}>{en ? 'Discard unreadable draft and start again' : '捨棄無法讀取的草稿並重新開始'}</button> : stage === 'dates' ? <>
      <section className="manual-calendar" aria-label={en ? 'Choose training dates' : '選擇要排課的日期'}>
        <header><button type="button" aria-label={en ? 'Previous month' : '上一個月'} onClick={() => changeMonth(-1)}><ChevronLeft size={20} aria-hidden="true" /></button><h2>{monthLabel}</h2><button type="button" aria-label={en ? 'Next month' : '下一個月'} onClick={() => changeMonth(1)}><ChevronRight size={20} aria-hidden="true" /></button></header>
        <div className="manual-calendar-weekdays" aria-hidden="true">{(en ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['一', '二', '三', '四', '五', '六', '日']).map((value, index) => <span key={index}>{value}</span>)}</div>
        <div className="manual-calendar-grid" role="group" aria-label={en ? 'Dates available to select' : '可點選日期'}>{monthCells.map((date, index) => date ? <button type="button" key={date} data-testid={`manual-date-${date}`} aria-pressed={dates.includes(date)} aria-label={`${dateLabel(date)}${dates.includes(date) ? en ? ', selected' : '，已選' : ''}`} disabled={date < today} onClick={() => toggleDate(date)}>{Number(date.slice(8))}</button> : <span key={`empty-${index}`} aria-hidden="true" />)}</div>
        <div className="manual-calendar-selection" role="status">{en ? `${dates.length} dates selected` : `已選 ${dates.length} 天`}{dates.length > 0 && <span>：{dates.map(date => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`).join('、')}</span>}</div>
      </section>
      <button type="button" className="manual-text-action" onClick={() => {
        try { const candidates = availableDates.filter(date => date >= today && [1, 3, 5].includes(new Date(`${date}T12:00:00Z`).getUTCDay())); setDates(validateManualDates(candidates, { today, allowEmpty: true })); setError(''); }
        catch (problem) { report(problem); }
      }}>{en ? 'Quick select: Mon / Wed / Fri' : '快速選取此期間：一、三、五'}</button>
      <details className="manual-secondary-details"><summary data-testid="manual-range-options">{en ? 'Adjust displayed period' : '調整顯示期間'}</summary><div className="grid gap-3 sm:grid-cols-2"><label className="min-w-0 text-sm text-slate-700">{en ? 'Show dates from' : '顯示開始日期'}<input data-testid="manual-range-from" type="date" min={today} value={range.from} onChange={event => { setRange({ ...range, from: event.target.value }); if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setCalendarMonth(event.target.value.slice(0, 7)); }} className={input} /></label><label className="min-w-0 text-sm text-slate-700">{en ? 'Show dates through' : '顯示結束日期'}<input data-testid="manual-range-to" type="date" min={range.from || today} max={range.from ? (() => { try { return shiftManualDate(range.from, 27); } catch { return undefined; } })() : undefined} value={range.to} onChange={event => setRange({ ...range, to: event.target.value })} className={input} /></label></div>{!rangeValid && <p role="status" className="text-sm text-amber-800">{en ? 'Use valid dates, in order, covering at most 28 days.' : '請填有效、先後順序正確且不超過 28 天的期間。'}</p>}<button type="button" className="manual-text-action" disabled={!rangeValid} onClick={() => { try { setDates(validateManualDates(availableDates.filter(date => [1, 3, 5].includes(new Date(`${date}T12:00:00Z`).getUTCDay())), { today, allowEmpty: true })); setError(''); } catch (problem) { report(problem); } }}>{en ? 'Select Mon / Wed / Fri in this window' : '選取此期間的每週一、三、五'}</button></details>

      {dates.length > 0 && <details className="manual-secondary-details"><summary>{en ? 'Review selected dates' : '檢查已選日期'}</summary><div className="flex flex-wrap gap-2">{dates.map(date => <button type="button" key={date} aria-label={`${en ? 'Remove date' : '取消日期'} ${date}`} onClick={() => toggleDate(date)} className={button}>{dateLabel(date)} ×</button>)}</div></details>}
      <footer className="manual-fixed-actions"><div className="manual-fixed-inner"><div><strong>{en ? `${dates.length} dates selected` : `已選 ${dates.length} 天`}</strong><p>{dates.slice(0, 3).map(date => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`).join('、')}{dates.length > 3 && '…'}</p></div><button type="button" data-testid="manual-start" disabled={!dates.length} onClick={startEditing} className="manual-primary">{en ? `Build ${dates.length} days` : `開始安排 ${dates.length} 天`}</button></div></footer>
    </> : session && <>
      <div className="manual-workbench"><div className="manual-day-content">
      <>
        {!singleDay && <QuickWorkoutPicker compact key={`common-${session.date}`} {...{ session, exercises, eligibleExercises, lang, dailyTime }} context={profile?.context || {}} store={workoutStore} onApply={applyOperation} onOpen={openPicker} />}
        <SessionPlanEditor key={session.date} {...{ session, exercises, eligibleExercises, lang, t }} onChange={update} dailyTime={dailyTime} timeControls={timeControls} moreControls={dayActions} />
        {!session.routine.length && <div className="manual-empty-options"><button type="button" className="manual-text-action" onClick={() => update({ ...session, explicitRest: true })}>{en ? 'Explicitly plan a rest day' : '明確安排為休息日'}</button>{sessions.length > 1 && <button type="button" className="manual-text-action" onClick={() => { setSessions(sessions.filter(value => value.date !== session.date)); setActiveDate(sessions.find(value => value.date !== session.date).date); setNotice(''); setLastOperation(null); }}>{en ? 'Remove this draft date' : '移除這個草稿日期'}</button>}</div>}
        <footer className="manual-fixed-actions"><div className="manual-fixed-inner"><div className="manual-draft-state" role="status"><strong>{singleDay ? en ? 'Unsaved changes' : '修改尚未儲存' : stored === false ? en ? 'Draft not saved' : '草稿尚未成功保存' : en ? 'Device draft' : '此裝置草稿'}</strong><p>{stored === false ? en ? 'Keep this page open and retry. Not applied.' : '請保持此頁開啟再重試，尚未套用。' : ''}</p></div><button type="button" data-testid="manual-add-content" className="manual-primary" onClick={() => openPicker()}>{en ? '+ Add content' : '＋ 加入內容'}</button>{<button type="button" data-testid="manual-review" className="manual-review-button" disabled={busy || !validTime || !session.routine.length && !session.explicitRest} onClick={preview}>{singleDay ? en ? 'Review changes' : '確認修改' : en ? 'Review plan' : '檢查課表'}</button>}</div></footer>
      </>
    </div></div>{picker && <QuickWorkoutPicker key={`picker-${session.date}`} {...{ session, exercises, eligibleExercises, lang, dailyTime }} context={profile?.context || {}} store={workoutStore} t={t} onCreateExercise={onCreateExercise} createScope={createScope} initialSelected={selectedCombo} initialTab={singleDay ? 'exercises' : 'combos'} onCancel={closePicker} onApply={applyOperation} onUndo={undoAddition} canUndo={!!lastOperation} onConfigure={configure} />}</>}
  </section>;
}
