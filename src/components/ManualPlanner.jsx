import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, Copy } from 'lucide-react';
import BatchExercisePicker from './BatchExercisePicker.jsx';
import SessionPlanEditor from './SessionPlanEditor.jsx';
import { localDate } from '../domain/dates.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { EQUIPMENT } from '../domain/exerciseCatalog.js';
import {
  addManualExercises, clearManualDraft, copyManualSession, createManualSession, hydrateManualSession,
  loadManualDraft, manualDraftStorageKey, manualPlannerErrorMessage, prepareManualPreview,
  saveManualDraft, shiftManualDate, validateManualDates,
} from '../domain/manualPlanner.js';

const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600';
const primary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600';
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
  onPreview, onCancel, onSaveWorkout, onShare, onContextChange, onProfileChange, initialSessions }) {
  const en = lang === 'en';
  const [initial] = useState(() => initialDraft({ uid, initialSessions, exercises, lang }));
  const [sessions, setSessions] = useState(initial.sessions);
  const [dates, setDates] = useState(() => initial.sessions.map(session => session.date));
  const [stage, setStage] = useState(initial.blocked ? 'unreadable' : initial.sessions.length ? 'edit' : 'dates');
  const [range, setRange] = useState(() => ({ from: initial.sessions[0]?.date || today, to: initial.sessions.at(-1)?.date || shiftManualDate(today, 6) }));
  const [activeDate, setActiveDate] = useState(initial.sessions[0]?.date || '');
  const [picker, setPicker] = useState(null);
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState(initial.error ? manualPlannerErrorMessage(initial.error, lang, exercises) : '');
  const [notice, setNotice] = useState('');
  const [stored, setStored] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');
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
  useEffect(() => {
    if (stage !== 'edit' || !sessions.length) return;
    let active = true, success = true;
    try { saveManualDraft(uid, sessions); } catch { success = false; }
    Promise.resolve().then(() => { if (active) setStored(success); });
    return () => { active = false; };
  }, [uid, sessions, stage]);
  const update = next => {
    setSessions(current => current.map(value => value.date === next.date ? next : value));
    setNotice('');
  };
  const dateLabel = date => new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  const startEditing = () => {
    try {
      const chosen = validateManualDates(dates, { today });
      setSessions(chosen.map(date => sessions.find(value => value.date === date) || createManualSession(date, lang)));
      setActiveDate(chosen.includes(activeDate) ? activeDate : chosen[0]); setStage('edit'); setError(''); setPicker(null);
      requestAnimationFrame(() => heading.current?.focus());
    } catch (problem) { report(problem); }
  };
  const toggleDate = date => {
    try { setDates(validateManualDates(dates.includes(date) ? dates.filter(value => value !== date) : [...dates, date], { today, allowEmpty: true })); setError(''); }
    catch (problem) { report(problem); }
  };
  const saveAndExit = () => {
    if (stage === 'edit' && sessions.length) {
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
      try { saveManualDraft(uid, sessions); setStored(true); } catch { setStored(false); }
      await onPreview?.(prepared);
    } catch (problem) { if (mounted.current) report(problem); }
    finally { if (mounted.current) setBusy(false); }
  };
  const openPicker = phase => {
    openedBy.current = document.activeElement;
    setPicker(phase); setSelected([]); setError(''); setNotice('');
  };
  const closePicker = () => {
    const phase = picker;
    setPicker(null); setSelected([]); setError('');
    requestAnimationFrame(() => {
      const target = openedBy.current?.isConnected ? openedBy.current : heading.current?.closest('section')?.querySelector(`[data-testid="manual-add-${phase}"]`);
      target?.focus();
    });
  };
  const addSelected = ids => {
    try {
      const next = addManualExercises(session, ids, { exercises, eligibleExercises, phase: picker, lang });
      update(next); closePicker(); setNotice(en ? `Added ${ids.length} exercises to ${session.date}'s draft.` : `已加入 ${ids.length} 個動作到 ${session.date} 的草稿。`);
    } catch (problem) { report(problem); }
  };
  const reusableAction = callback => callback ? value => {
    const [clean] = prepareManualPreview([value], { today, exercises, eligibleExercises, dailyTime });
    return callback(clean);
  } : undefined;
  const copyDay = () => {
    if (!copyTarget) return;
    update(copyManualSession(session, copyTarget, { exercises, lang }));
    setCopyTarget(''); setNotice(en ? 'Copied into the target draft day. Existing schedules have not changed.' : '已取代目的日期的草稿，既有正式課表尚未變動。');
  };
  let availableDates = [], rangeValid = true;
  try {
    validateManualDates(range.from === range.to ? [range.from] : [range.from, range.to], { today });
    if (range.to < range.from) rangeValid = false;
    else for (let date = range.from; date <= range.to; date = shiftManualDate(date, 1)) availableDates.push(date);
  } catch { rangeValid = false; }
  return <section data-testid="manual-planner" className="mx-auto w-full max-w-5xl space-y-5 pb-6">
    <button type="button" className={button} disabled={busy} onClick={saveAndExit}><ArrowLeft size={16} aria-hidden="true" />{en ? 'Back to planner' : '返回課表'}</button>
    <header><p className="mb-2 text-sm text-slate-500">{stage === 'dates' ? en ? '1 Dates → 2 Add exercises → 3 Review' : '1 日期 → 2 加入動作 → 3 檢查' : en ? '1 Dates → 2 Add exercises → 3 Review' : '1 日期 → 2 加入動作 → 3 檢查'}</p><h1 ref={heading} tabIndex="-1" className="text-2xl font-bold text-slate-800 outline-none">{en ? 'Manual planner' : '手動排課'}</h1><p className="mt-2 text-sm leading-relaxed text-slate-600">{en ? 'Choose dates, then build each day. Nothing changes your scheduled sessions until you review and apply.' : '先選日期，再安排每天的動作。檢查並確認套用前，不會更動既有課表。'}</p></header>
    {(onContextChange || onProfileChange) && stage !== 'unreadable' && <details className="rounded-xl border border-sky-100 bg-white p-4"><summary className="flex min-h-11 cursor-pointer items-center font-semibold text-sky-800">{en ? 'Available time and equipment' : '可用器材設定與每日時間'} · {profile?.context?.equipment?.length || 0}</summary>{onProfileChange && <label className="my-3 block text-sm font-medium text-slate-700">{en ? 'Daily time limit (5–240 minutes)' : '每日時間上限（5–240 分鐘）'}<input data-testid="manual-daily-time" type="number" min="5" max="240" step="1" value={profile?.time ?? '240'} onChange={event => onProfileChange({ ...profile, time: event.target.value })} className={input} /></label>}{!validTime && <p role="status" className="text-sm text-amber-800">{en ? 'Enter a time from 5 to 240 minutes before reviewing.' : '請填入 5–240 分鐘後再檢查課表。'}</p>}<p className="my-3 text-sm text-slate-600">{en ? 'Equipment changes the available exercise list. Partner, experience and treatment restrictions still apply. No equipment selected means bodyweight choices only. Doses will not be changed automatically to fit your time.' : '器材會影響可加入動作；搭檔、經驗與治療限制仍會保留。未勾選器材時，只會列出徒手可用的動作。改時間不會自動變更你的組次。'}</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{EQUIPMENT.map(value => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={profile?.context?.equipment?.includes(value) || false} onChange={event => { const context = { ...(profile?.context || {}), equipment: event.target.checked ? [...new Set([...(profile?.context?.equipment || []), value])] : (profile?.context?.equipment || []).filter(item => item !== value) }; if (onContextChange) onContextChange(context); else onProfileChange({ ...profile, context }); }} className="h-5 w-5 accent-sky-600" />{t?.(`equipment_${value}`) || value}</label>)}</div></details>}
    {error && <p ref={errorBox} tabIndex="-1" role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800 focus-visible:outline-2 focus-visible:outline-red-500">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">{notice}</p>}
    {stage === 'unreadable' ? <button type="button" className={button} onClick={() => {
      try { clearManualDraft(uid); setSessions([]); setDates([]); setStage('dates'); setError(''); } catch { report(new Error('MANUAL_STORAGE_UNAVAILABLE')); }
    }}>{en ? 'Discard unreadable draft and start again' : '捨棄無法讀取的草稿並重新開始'}</button> : stage === 'dates' ? <>
      <section className="space-y-4 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5"><h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800"><CalendarDays size={20} aria-hidden="true" />{en ? 'Choose dates (not necessarily consecutive)' : '選擇要排課的日期（可以不連續）'}</h2><p className="text-sm text-slate-600">{en ? 'Choose a date window of up to 28 days, then select individual days below.' : '先顯示最多 28 天的期間，再點選其中想安排的日期。'}</p>
        <div className="grid gap-3 sm:grid-cols-2"><label className="min-w-0 text-sm text-slate-700">{en ? 'Show dates from' : '顯示開始日期'}<input data-testid="manual-range-from" type="date" min={today} value={range.from} onChange={event => setRange({ ...range, from: event.target.value })} className={input} /></label><label className="min-w-0 text-sm text-slate-700">{en ? 'Show dates through' : '顯示結束日期'}<input data-testid="manual-range-to" type="date" min={range.from || today} max={range.from ? (() => { try { return shiftManualDate(range.from, 27); } catch { return undefined; } })() : undefined} value={range.to} onChange={event => setRange({ ...range, to: event.target.value })} className={input} /></label></div>
        {!rangeValid && <p role="status" className="text-sm text-amber-800">{en ? 'Use valid dates, in order, covering at most 28 days. Existing selections remain below.' : '請填有效、先後順序正確且不超過 28 天的期間；原本選取仍保留在下方。'}</p>}
        <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-7" aria-label={en ? 'Dates available to select' : '可點選日期'}>{availableDates.map(date => <button type="button" key={date} data-testid={`manual-date-${date}`} aria-pressed={dates.includes(date)} onClick={() => toggleDate(date)} className={`${button} ${dates.includes(date) ? 'border-sky-500 bg-sky-50 font-semibold text-sky-900' : ''}`}>{dates.includes(date) && '✓ '}{dateLabel(date)}</button>)}</div>
        <button type="button" className={button} disabled={!rangeValid} onClick={() => {
          try { setDates(validateManualDates(availableDates.filter(date => [1, 3, 5].includes(new Date(`${date}T12:00:00Z`).getUTCDay())), { today, allowEmpty: true })); setError(''); }
          catch (problem) { report(problem); }
        }}>{en ? 'Select Mon / Wed / Fri in this window' : '選取此期間的每週一、三、五'}</button>
      </section>
      <section className="rounded-2xl bg-sky-50 p-4"><h2 className="font-semibold text-sky-900">{en ? `${dates.length} dates selected` : `已選 ${dates.length} 天`}</h2><p className="mt-1 text-sm text-slate-600">{en ? 'The inclusive first-to-last selected date span can be at most 28 days.' : '所選第一天到最後一天含端點，最多 28 天。'}</p><div className="mt-3 flex flex-wrap gap-2">{dates.map(date => <button type="button" key={date} aria-label={`${en ? 'Remove date' : '取消日期'} ${date}`} onClick={() => toggleDate(date)} className={button}>{dateLabel(date)} ×</button>)}</div></section>
      <button type="button" data-testid="manual-start" disabled={!dates.length} onClick={startEditing} className={primary}>{en ? `Build ${dates.length} draft days` : `開始排 ${dates.length} 天草稿`}</button>
    </> : session && <>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800">{en ? 'Draft · not applied' : '目前為草稿・尚未套用'}</p><button type="button" className={button} disabled={!!picker || busy} onClick={() => { setStage('dates'); setDates(sessions.map(value => value.date)); setError(''); }}>{en ? 'Change dates' : '調整日期'}</button></div>
      {!picker && <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label={en ? 'Draft dates' : '切換草稿日期'}>{sessions.map(value => {
        let minutes = 0; try { minutes = estimateSessionMinutes(value, exercises); } catch { /* Review will explain invalid content. */ }
        return <button type="button" key={value.date} data-testid={`manual-tab-${value.date}`} aria-pressed={session.date === value.date} onClick={() => { setActiveDate(value.date); setError(''); setCopyTarget(''); }} className={`${button} flex-col gap-1 ${session.date === value.date ? 'border-sky-500 bg-sky-50 font-semibold text-sky-900' : ''}`}><span>{session.date === value.date && '✓ '}{dateLabel(value.date)}</span><span className="text-xs">{value.routine.length} {en ? 'exercises' : '個動作'} · {minutes} {en ? 'min' : '分'}</span></button>;
      })}</div>}
      {picker ? <BatchExercisePicker key={`${session.date}-${picker}`} {...{ exercises, eligibleExercises, lang, t }} selectedIds={selected} onSelectionChange={setSelected} existingIds={session.routine} remainingCapacity={Math.max(0, 8 - session.routine.length)} phase={picker} date={session.date} onAdd={addSelected} onCancel={closePicker} /> : <>
        <SessionPlanEditor key={session.date} {...{ session, exercises, eligibleExercises, lang, t }} onChange={update} onAddExercises={openPicker} onSaveWorkout={reusableAction(onSaveWorkout)} onShare={reusableAction(onShare)} />
        {sessions.length > 1 && <section className="rounded-xl border border-slate-200 p-4"><label className="block text-sm text-slate-700">{en ? 'Copy this day into another draft date' : '複製這天到其他草稿日期'}<select value={copyTarget} onChange={event => setCopyTarget(event.target.value)} className={input}><option value="">{en ? 'Choose target date' : '選擇目的日期'}</option>{sessions.filter(value => value.date !== session.date).map(value => <option key={value.date} value={value.date}>{dateLabel(value.date)}</option>)}</select></label><p className="my-2 text-xs text-slate-500">{en ? 'This replaces the target draft day, including its exercises and doses. Scheduled sessions are untouched.' : '這會取代目的日期的草稿動作與組次，尚不更動正式課表。'}</p><button type="button" disabled={!copyTarget} className={button} onClick={copyDay}><Copy size={16} aria-hidden="true" />{en ? 'Copy and replace target draft' : '複製並取代目的草稿'}</button></section>}
        <footer className="space-y-3 rounded-2xl border border-indigo-100 bg-white p-4"><p role="status" className={`text-sm ${stored === false ? 'text-amber-800' : 'text-slate-600'}`}>{stored === false ? en ? 'Draft could not be saved on this device. Keep this page open and retry saving.' : '目前無法在這台裝置保存草稿。請保持此頁開啟，再重試保存。' : en ? 'Draft saved on this device for the current account. Nothing has been applied.' : '草稿保留在這台裝置的目前帳號；尚未套用到日期。'}</p><p className="text-xs text-slate-500">{en ? `Daily time limit for review: ${validTime ? dailyTime : '—'} min. Completed or logged dates will be checked before applying.` : `檢查用每日時間上限：${validTime ? dailyTime : '—'} 分鐘。有完成或訓練紀錄的日期會在套用前另行檢查。`}</p><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={saveAndExit}>{en ? 'Save draft and leave' : '保留草稿後離開'}</button><button type="button" data-testid="manual-review" className={primary} disabled={busy || !validTime} onClick={preview}>{en ? `Review ${sessions.length} days` : `檢查 ${sessions.length} 天課表`}</button></div></footer>
      </>}
    </>}
  </section>;
}
