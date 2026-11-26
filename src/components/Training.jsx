import { completionKey } from '../domain/completionQueue.js';
import { useBackNavigation } from '../hooks/useBackNavigation.js';
import SessionTimeSummary from './SessionTimeSummary.jsx';
import { lazy, Suspense, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Bookmark, Brain, Check, CheckCircle2, ChevronDown, Circle, Edit2, Feather, Loader2, Pencil, Plus, RotateCcw, Save, Share2, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { journeyText } from '../i18n/journey.js';
import { dateForWeekDay, getDateForWeekDay, localDate } from '../domain/dates.js';
import { exerciseKey } from '../domain/training.js';
import { SESSION_PHASES } from '../domain/phases.js';
import { estimateSessionMinutes, sessionSections } from '../domain/sessions.js';
import { hydrateManualSession, manualPlannerErrorMessage } from '../domain/manualPlanner.js';
import { isExerciseRecordedOnDay, quickRemoveExerciseFromDay } from '../domain/singleDayEdit.js';
import ExerciseGuide from './ExerciseGuide.jsx';
import ExercisePicker from './ExercisePicker.jsx';
import ExerciseRow from './ExerciseRow.jsx';
import ExerciseDetails from './ExerciseDetails.jsx';
import ExerciseLog from './ExerciseLog.jsx';
import DailyReadiness from './DailyReadiness.jsx';

const QuickWorkoutPicker = lazy(() => import('./QuickWorkoutPicker.jsx'));

export default function Training({ t, lang = 'zh', schedule, draft, activeDay, setActiveDay, currentWeek, exercises, progress, level,
  editing, selected, setSelected, onEdit, onCancel, onSave, onAdd, onRemove, onMove, onPhase, onToggle, onFeedback, feedback, busy, completionState = { pending: {}, errors: {} }, completionDisabled = busy, saving, canEdit, canRestore, onRestore, exerciseLogs = [], readiness = null, readinessPreview = null, onSaveExerciseLog, onUpdateNextDay: _onUpdateNextDay, onSaveReadiness, onPreviewReadiness, onApplyReadiness, loggingBusy = false, readinessBusy = false, coachingContext = {}, readinessDisabled = false, loggingDisabled = false, mode = 'plan', onViewRecords, eligibleExercises = exercises, plannedTime, onSaveWorkout, onShare, onManualEdit, onAddToDay, onQuickSaveDay, quickSaving = false, workoutStore, onCreateExercise, createScope = 'device', aiConfig, onOpenCoach }) {
  const en = lang === 'en';
  const j = (key, values) => journeyText(lang, key, values);
  const completionView = (day, id) => {
    const key = completionKey(currentWeek, day, id);
    const pending = completionState.pending[key];
    const failed = !!completionState.errors[key];
    return { pending: !!pending, done: pending ? pending.value : !!progress[exerciseKey(day, id)], failed,
      status: pending ? en ? 'Saving…' : '儲存中…' : failed ? en ? 'Not saved. Tap again to retry.' : '未儲存，請再點一下重試。' : '' };
  };
  const isToday = mode === 'today' && !editing;
  const [details, setDetails] = useState({ scope: '', id: null, visited: [] });
  const [quickEditScope, setQuickEditScope] = useState('');
  const [quickPickerOpen, setQuickPickerOpen] = useState(false);
  const [quickUndo, setQuickUndo] = useState(null);
  const [quickError, setQuickError] = useState('');
  const [renamingScope, setRenamingScope] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const display = editing ? draft : schedule;
  const active = display.find(day => day.day === activeDay) || display[0];
  const sections = sessionSections(active, exercises, level);
  const rest = active.routine.length === 0;
  const date = dateForWeekDay(currentWeek, active.day);
  const today = coachingContext.today || localDate();
  const minutes = estimateSessionMinutes(active, exercises, level);
  const scope = `${currentWeek}-${active.day}-${today}`;
  const quickEdit = !editing && !!onQuickSaveDay && date >= today && quickEditScope === scope;
  const renamingTitle = !editing && !!onQuickSaveDay && date >= today && renamingScope === scope;
  const canRenameTitle = !editing && !!onQuickSaveDay && date >= today && !busy && !saving && !quickSaving;
  const currentDetails = details.scope === scope ? details : { id: null, visited: [] };
  const entries = sections.flatMap(section => section.items.map(entry => ({ ...entry, phase: section.phase })));
  const doneCount = active.routine.filter(id => progress[exerciseKey(active.day, id)]).length;
  const selectedEntry = entries.find(entry => entry.id === currentDetails.id);
  const currentIndex = entries.findIndex(entry => entry.id === selectedEntry?.id);
  const recordedIds = new Set(active.routine.filter(id => isExerciseRecordedOnDay(active.day, id, { progress, logs: exerciseLogs, week: currentWeek })));
  const openDetails = (id, opener) => {
    opener?.focus({ preventScroll: true });
    setDetails(previous => ({ scope, id, visited: [...new Set([...(previous.scope === scope ? previous.visited : []), id])] }));
  };
  const closeDetails = () => setDetails(previous => ({ ...previous, id: null }));
  const cancelRenameTitle = () => setRenamingScope('');
  const startRenameTitle = () => {
    if (!canRenameTitle) return;
    setQuickError('');
    setTitleDraft(active.theme || active.name || '');
    setRenamingScope(scope);
  };
  useBackNavigation(!!currentDetails.id, closeDetails, 100);
  useBackNavigation(quickPickerOpen, () => setQuickPickerOpen(false), 65);
  useBackNavigation(renamingTitle, cancelRenameTitle, 60);
  useBackNavigation(quickEdit && !quickPickerOpen, () => setQuickEditScope(''), 55);

  const hydratedActive = () => hydrateManualSession({ ...active, date }, exercises, lang);
  const saveRenameTitle = async () => {
    if (!onQuickSaveDay || quickSaving || busy) return;
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === (active.theme || active.name || '').trim()) {
      cancelRenameTitle();
      return;
    }
    setQuickError('');
    const next = { ...hydratedActive(), theme: trimmed, name: trimmed };
    const ok = await onQuickSaveDay(date, next, en ? 'Updated workout title.' : '已更新今日菜單名稱。');
    if (ok) cancelRenameTitle();
  };
  const handleQuickRemove = async id => {
    if (!onQuickSaveDay || quickSaving || busy) return;
    setQuickError('');
    try {
      const previous = hydratedActive();
      const next = quickRemoveExerciseFromDay(previous, id, { recordedIds, exercises, lang });
      const label = en ? `Removed ${exercises[id]?.name || id}` : `已移除「${exercises[id]?.name || id}」`;
      const ok = await onQuickSaveDay(date, next, label);
      if (ok) setQuickUndo({ scope, date, session: previous, label });
    } catch (problem) {
      const msg = problem?.message === 'AI_WARMUP_MISSING'
        ? (en ? 'A training day needs at least 1 warm-up movement. Remove strength moves first to clear the day.' : '訓練日至少需保留 1 個暖身動作；若要清空，請先移除主訓練動作。')
        : problem?.message === 'RECORDED_EXERCISE_LOCKED'
          ? (en ? 'This exercise already has a record and is preserved.' : '這個動作已有完成或實做紀錄，會自動保留。')
          : manualPlannerErrorMessage(problem, lang, exercises);
      setQuickError(msg);
      throw problem;
    }
  };
  const handleQuickApply = async operation => {
    if (!onQuickSaveDay || quickSaving || busy) return;
    setQuickError('');
    const previous = hydratedActive();
    const label = en ? `Updated today’s exercises (${operation.session.routine.length})` : `已更新當天動作（共 ${operation.session.routine.length} 項）`;
    const ok = await onQuickSaveDay(date, { ...operation.session, date }, label);
    if (ok) setQuickUndo({ scope, date, session: previous, label });
  };
  const handleQuickUndo = async () => {
    if (!onQuickSaveDay || !quickUndo || quickUndo.scope !== scope || quickSaving || busy) return;
    setQuickError('');
    const target = quickUndo;
    const ok = await onQuickSaveDay(target.date, target.session, en ? 'Undid last change.' : '已復原剛剛的動作調整。');
    if (ok) setQuickUndo(null);
  };
  const openQuickPicker = () => {
    setQuickError('');
    setQuickPickerOpen(true);
  };
  const toggleQuickEdit = () => {
    setQuickError('');
    if (!onQuickSaveDay) {
      onAddToDay?.(active);
      return;
    }
    if (rest && !quickEdit) {
      setQuickEditScope(scope);
      setQuickPickerOpen(true);
      return;
    }
    setQuickEditScope(quickEdit ? '' : scope);
  };

  const description = params => `${params.sets} ${t('setsUnit')} × ${params.value} ${t(params.unit)}${params.perSide ? ` · ${t('eachSide')}` : ''}`;
  const doseGrid = (params, phase = params.phase) => <div className="dose-grid" role="group" aria-label={`${description(params)}${params.restSeconds > 0 ? ` · ${t('restLabel')} ${params.restSeconds} ${t('seconds')}` : ''}`}><div><strong>{params.sets}</strong>{t(['strength', 'accessory'].includes(phase) ? 'workingSetsLabel' : 'setsUnit')}</div><div><strong>{params.value}</strong>{t(params.unit)}{params.perSide && ` · ${t('eachSide')}`}</div><div><strong>{params.restSeconds || '—'}</strong>{t('restLabel')}{params.restSeconds > 0 && ` · ${t('seconds')}`}</div></div>;
  const preparation = (id, dose) => dose && <div data-preparation-for={id} className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm"><p className="font-semibold text-amber-800">{t('preparationSetsLabel')} · {exercises[id].name}</p><p className="text-sm text-slate-600 mt-2">{description(dose)}{dose.restSeconds > 0 && ` · ${t('restLabel')} ${dose.restSeconds} ${t('seconds')}`}</p><p className="text-sm text-slate-600 mt-2">{dose.instruction}</p><p className="text-xs text-amber-700 mt-2">{t('preparationTrackingHint')}</p></div>;
  let sequence = 0;
  return <div className="session-body">
    {!isToday && <div className="flex bg-white rounded-2xl p-2 mb-6 gap-1 border border-slate-200 overflow-x-auto">{display.map(day => <button key={day.day} onClick={() => { closeDetails(); setQuickEditScope(''); cancelRenameTitle(); setActiveDay(day.day); }} className={`flex-1 min-w-12 rounded-xl p-3 text-sm ${active.day === day.day ? 'bg-sky-700 text-white' : 'text-slate-500'}`}><span className="block font-semibold">{t('dayShort')[day.day - 1]}</span><span className="block mt-1 text-xs">{getDateForWeekDay(currentWeek, day.day)}</span></button>)}</div>}
    {isToday ? <section className="session-hero" data-running={doneCount > 0} data-testid="session-hero">
      <div className="session-hero-top">
        <p className="eyebrow">{date} · {rest ? t('restSessionTitle') : j('progress', { done: doneCount, total: active.routine.length })}</p>
        {(onSaveWorkout || onShare) && (
          <div className="session-hero-tools">
            {onSaveWorkout && <button type="button" data-testid="save-day-workout" aria-label={en ? 'Save workout' : '收藏這天'} title={en ? 'Save workout' : '收藏這天'} disabled={busy || saving} onClick={() => onSaveWorkout(active)} className="session-hero-icon-btn"><Bookmark size={16} aria-hidden="true" /></button>}
            {onShare && <button type="button" data-testid="share-day-workout" aria-label={en ? 'Share workout' : '分享這天'} title={en ? 'Share workout' : '分享這天'} disabled={busy || saving} onClick={() => onShare(active)} className="session-hero-icon-btn"><Share2 size={16} aria-hidden="true" /></button>}
          </div>
        )}
      </div>

      {renamingTitle ? (
        <form className="session-title-form" onSubmit={event => { event.preventDefault(); saveRenameTitle(); }}>
          <input
            type="text"
            data-testid="session-title-input"
            autoFocus
            maxLength={60}
            value={titleDraft}
            onChange={event => setTitleDraft(event.target.value)}
            onKeyDown={event => { if (event.key === 'Escape') cancelRenameTitle(); }}
            placeholder={en ? 'Workout title' : '輸入今日菜單名稱'}
            aria-label={en ? 'Workout title' : '菜單名稱'}
            className="session-title-input"
          />
          <button type="submit" data-testid="session-title-save" disabled={quickSaving || !titleDraft.trim()} aria-label={en ? 'Save title' : '儲存名稱'} className="session-title-save"><Check size={16} aria-hidden="true" /></button>
          <button type="button" data-testid="session-title-cancel" disabled={quickSaving} onClick={cancelRenameTitle} aria-label={en ? 'Cancel' : '取消'} className="session-title-cancel"><X size={16} aria-hidden="true" /></button>
        </form>
      ) : (
        <div className="session-hero-title-row">
          <h2 data-testid="session-hero-title">{active.theme || j('today')}</h2>
          {onQuickSaveDay && date >= today && (
            <button
              type="button"
              data-testid="rename-day-title"
              aria-label={en ? 'Rename workout' : '修改菜單名稱'}
              title={en ? 'Rename workout' : '修改菜單名稱'}
              disabled={!canRenameTitle}
              onClick={startRenameTitle}
              className="session-hero-edit-btn"
            >
              <Pencil size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      <details className="session-time-details" data-testid="session-time-details">
        <summary className="session-time-summary-row">
          <div className="hero-metadata">
            <span><strong>{minutes}</strong>{t('minutes')}</span>
            <span><strong>{active.routine.length}</strong>{j('movementCount')}</span>
          </div>
          <span className="session-time-toggle">
            {en ? 'Timing' : '時間說明'}
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </summary>
        <div className="session-time-details-body">
          <SessionTimeSummary day={active} exercises={exercises} availableTime={plannedTime} context={coachingContext} lang={lang} />
        </div>
      </details>

      {rest && <p className="text-sm text-sky-700 mt-1">{j('rest')}</p>}
    </section> : <div className="session-plan-head mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{date} · {minutes} {t('minutes')}</p>
          <h2 className="text-2xl font-bold text-slate-800">{active.theme || j('week')}</h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {!editing && onSaveWorkout && <button type="button" data-testid="save-day-workout" aria-label={en ? 'Save workout' : '收藏這天'} title={en ? 'Save workout' : '收藏這天'} disabled={busy || saving} onClick={() => onSaveWorkout(active)} className="session-hero-icon-btn"><Bookmark size={16} aria-hidden="true" /></button>}
          {!editing && onShare && <button type="button" data-testid="share-day-workout" aria-label={en ? 'Share workout' : '分享這天'} title={en ? 'Share workout' : '分享這天'} disabled={busy || saving} onClick={() => onShare(active)} className="session-hero-icon-btn"><Share2 size={16} aria-hidden="true" /></button>}
          {!editing ? (canEdit || !onManualEdit) && <button disabled={!canEdit || saving || busy} onClick={onEdit} className="button-secondary disabled:opacity-50"><Edit2 size={15} />{t('editSchedule')}</button> : <><button disabled={saving} onClick={onCancel} className="button-secondary"><X size={15} />{t('cancelEdits')}</button><button disabled={saving || !canEdit} onClick={onSave} className="button-primary">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{t('saveEdits')}</button></>}
          {canRestore && !editing && <button disabled={saving} onClick={onRestore} className="text-link">{t('aiRestoreBtn')}</button>}
        </div>
      </div>
      {!editing && (
        <details className="session-time-details mt-2" data-testid="session-time-details">
          <summary className="session-time-summary-row">
            <span className="session-time-toggle">{en ? 'Timing details' : '時間與安排說明'}<ChevronDown size={14} aria-hidden="true" /></span>
          </summary>
          <div className="session-time-details-body">
            <SessionTimeSummary day={active} exercises={exercises} availableTime={plannedTime} context={coachingContext} lang={lang} />
          </div>
        </details>
      )}
    </div>}
    {!editing && (onQuickSaveDay || onAddToDay || onOpenCoach) && <div className="day-actions">
      {(onQuickSaveDay || onAddToDay) && <button type="button" data-testid="day-add-exercise" aria-pressed={onQuickSaveDay ? quickEdit : undefined} disabled={busy || saving || quickSaving || date < today} onClick={toggleQuickEdit} className={quickEdit ? 'button-primary' : 'button-secondary'}>{quickEdit ? <><Check size={16} aria-hidden="true" />{en ? 'Done' : '完成編輯'}</> : onQuickSaveDay && !rest ? <><SlidersHorizontal size={15} aria-hidden="true" />{en ? '+/- Exercises' : '± 增減動作'}</> : <><Plus size={16} aria-hidden="true" />{en ? 'Add exercise' : '新增動作'}</>}</button>}
      {onOpenCoach && <button type="button" data-testid="open-ai-coach" disabled={busy || saving} onClick={onOpenCoach} className="coach-inline-button"><Sparkles size={16} aria-hidden="true" />{en ? 'Ask AI Coach' : '問 AI 教練'}</button>}
    </div>}
    {quickEdit && <div className="quick-edit-banner" role="status" data-testid="quick-edit-banner">
      <div className="quick-edit-banner-copy">
        <strong>{en ? 'Edit mode' : '增減模式'}</strong>
        <span>{en ? 'Tap − to remove, or add exercises below.' : '點右側「−」直接移除（已紀錄動作自動鎖定），或點右側按鈕加入新動作。'}</span>
      </div>
      <div className="quick-edit-banner-actions">
        <button type="button" data-testid="quick-edit-add" disabled={quickSaving || busy} onClick={openQuickPicker} className="quick-edit-add-btn"><Plus size={15} aria-hidden="true" />{en ? 'Add' : '新增動作'}</button>
        {onManualEdit && <button type="button" data-testid="day-edit" disabled={quickSaving || busy || date < today} onClick={() => { setQuickEditScope(''); onManualEdit(active); }} className="text-link inline-flex items-center gap-1">{en ? 'Edit sets & reps' : '進階調整組次'}</button>}
        {!quickPickerOpen && quickUndo?.scope === scope && <button type="button" data-testid="quick-edit-undo" disabled={quickSaving} onClick={handleQuickUndo} className="text-link inline-flex items-center gap-1"><RotateCcw size={14} />{en ? 'Undo' : '復原'}</button>}
      </div>
    </div>}
    {!quickEdit && !quickPickerOpen && quickUndo?.scope === scope && <div className="quick-edit-banner" role="status" data-testid="quick-edit-undo-bar">
      <span>{quickUndo.label}</span>
      <button type="button" data-testid="quick-edit-undo" disabled={quickSaving} onClick={handleQuickUndo} className="text-link inline-flex items-center gap-1"><RotateCcw size={14} />{en ? 'Undo' : '復原'}</button>
    </div>}
    {quickError && <p role="alert" data-testid="quick-edit-error" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 mb-3">{quickError}</p>}
    {!rest && !active.routine.every(id => active.prescriptions?.some(dose => dose.id === id && dose.phase)) && <p className="text-sm text-amber-700 mb-4">{t('legacyPhaseNotice')}</p>}
    {!editing && !quickEdit && onSaveReadiness && (isToday || date === today || readiness) && <DailyReadiness key={date} compact lang={lang} value={readiness} date={date} onSave={onSaveReadiness} preview={readinessPreview} onPreview={onPreviewReadiness} onApply={onApplyReadiness} busy={readinessBusy} disabled={readinessDisabled} today={today} exercises={exercises} context={coachingContext} />}

    {entries.length < active.routine.length && <p role="status" className="text-sm text-amber-700">{j('unknown')}</p>}
    <div className={`space-y-5 ${quickEdit ? 'quick-edit-list' : ''}`} data-testid="daily-exercise-list">{!rest && sections.filter(section => section.items.length).map(section => <section key={section.phase} aria-label={t(`phase_${section.phase}`)} data-phase={section.phase} className="space-y-2">
      <div className="flex items-center justify-between gap-3 pt-2"><h3 className="font-semibold text-slate-700">{t(`phase_${section.phase}`)}</h3>{section.seconds > 0 && <span className="text-xs text-slate-500">{t('aboutTime')} {Math.ceil(section.seconds / 60)} {t('minutes')}</span>}</div>
      {section.items.map((entry, position) => {
        const { id, index, dose } = entry; const exercise = exercises[id]; sequence++;
        if (!editing) {
          const completion = completionView(active.day, id);
          return <ExerciseRow key={id} id={id} name={exercise.name} exercise={exercise} lang={lang} number={sequence} summary={description(dose)} preparation={dose.preparation ? j('hasPreparation') : null} actionLabel={j('detailsLog')} done={completion.done} status={completion.status} failed={completion.failed} disabled={completionDisabled || completion.pending || date > today} onToggle={() => onToggle(active.day, id)} onOpen={opener => openDetails(id, opener)} quickEdit={quickEdit} recorded={recordedIds.has(id)} removing={quickSaving} onQuickRemove={handleQuickRemove} />;
        }
        return <div key={id} className="exercise-card"><div className="flex items-center gap-3"><button aria-label={`${t('removeExercise')} ${exercise.name}`} disabled={saving} onClick={() => onRemove(active.day, index)} className="p-2 text-red-500 disabled:opacity-30"><Trash2 size={20} /></button><span className="exercise-title flex-1">{sequence}. {exercise.name}</span></div><div className="flex flex-wrap items-center gap-2 mt-3"><select aria-label={`${t('exercisePhaseLabel')} ${exercise.name}`} disabled={saving} value={section.phase} onChange={event => onPhase(active.day, id, event.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm">{SESSION_PHASES.map(value => <option key={value} value={value}>{t(`phase_${value}`)}</option>)}</select><button type="button" aria-label={`${t('moveUp')} ${exercise.name}`} disabled={saving || position === 0} onClick={() => onMove(active.day, id, -1)} className="p-3 rounded-lg bg-slate-50 disabled:opacity-30"><ArrowUp size={16} /></button><button type="button" aria-label={`${t('moveDown')} ${exercise.name}`} disabled={saving || position === section.items.length - 1} onClick={() => onMove(active.day, id, 1)} className="p-3 rounded-lg bg-slate-50 disabled:opacity-30"><ArrowDown size={16} /></button></div>{doseGrid(dose, section.phase)}<p className="text-sm text-slate-600 leading-relaxed">{exercise.tip}</p></div>;
      })}
    </section>)}
    {quickEdit && (
      <button type="button" data-testid="quick-edit-add-bottom" disabled={quickSaving || busy} onClick={openQuickPicker} className="quick-edit-add-bottom">
        <Plus size={18} aria-hidden="true" />
        <span>{en ? 'Add exercises or combos' : '新增動作或組合'}</span>
      </button>
    )}
    </div>
    {quickPickerOpen && onQuickSaveDay && (
      <Suspense fallback={null}>
        <QuickWorkoutPicker
          key={`quick-today-${date}`}
          session={hydratedActive()}
          exercises={exercises}
          eligibleExercises={eligibleExercises}
          lang={lang}
          t={t}
          dailyTime={240}
          context={coachingContext}
          store={workoutStore}
          initialTab="exercises"
          recordedIds={recordedIds}
          busy={quickSaving}
          onCreateExercise={onCreateExercise}
          createScope={createScope}
          aiConfig={aiConfig}
          onApply={handleQuickApply}
          onRemoveSingle={handleQuickRemove}
          onUndo={quickUndo?.scope === scope ? handleQuickUndo : undefined}
          canUndo={quickUndo?.scope === scope}
          onCancel={() => setQuickPickerOpen(false)}
        />
      </Suspense>
    )}
    <ExerciseDetails open={!editing && !!selectedEntry} title={selectedEntry ? exercises[selectedEntry.id].name : ''} subtitle={selectedEntry ? `${date} · ${t(`phase_${selectedEntry.phase}`)} · ${currentIndex + 1} / ${entries.length}` : date} closeLabel={j('returnList')} onClose={closeDetails} footer={selectedEntry && <><button type="button" disabled={currentIndex <= 0} onClick={() => openDetails(entries[currentIndex - 1].id)} className="button-secondary disabled:opacity-40">{j('previous')}</button>{currentIndex < entries.length - 1 && <button type="button" onClick={() => openDetails(entries[currentIndex + 1].id)} className="button-secondary">{j('next')}<ArrowRight size={16} /></button>}</>}>
      {entries.filter(entry => currentDetails.visited.includes(entry.id)).map(entry => {
        const { id, dose, phase } = entry; const exercise = exercises[id]; const done = !!progress[exerciseKey(active.day, id)]; const completion = completionView(active.day, id);
        return <section key={`${scope}-${id}`} hidden={currentDetails.id !== id} data-phase={phase} data-testid={currentDetails.id === id ? 'current-exercise' : undefined} className="exercise-card space-y-4">
          {preparation(id, dose.preparation)}
          <button type="button" aria-label={exercise.name} aria-pressed={completion.done} disabled={completionDisabled || completion.pending || date > today} onClick={() => onToggle(active.day, id)} className="flex items-center gap-3 text-sm text-sky-700 disabled:opacity-40">{completion.done ? <CheckCircle2 size={24} /> : <Circle size={24} />}{j(completion.done ? 'markedDone' : 'markDone')}</button>
          {completion.status && <p role={completion.failed ? 'alert' : 'status'} className={`text-sm ${completion.failed ? 'text-red-700' : 'text-sky-700'}`}>{completion.status}</p>}
          {doseGrid(dose, phase)}<p className="text-sm text-slate-600 leading-relaxed">{exercise.tip}</p>
          {phase === 'warmup' && <p className="text-sm text-slate-500">{active.warmupNote || t(active.sessionType === 'recovery' ? 'recoveryWarmupNote' : 'warmupSequenceNote')}</p>}
          {phase === 'cooldown' && <p className="text-sm text-slate-500">{active.cooldownNote || t('cooldownSequenceNote')}</p>}
          {date > today && <p className="text-sm text-sky-700">{j('futureReadonly')}</p>}
          <ExerciseGuide id={id} exercise={exercise} lang={lang} />
          {onSaveExerciseLog && ['strength', 'accessory', 'skill'].includes(phase) && <ExerciseLog autoOpen completed={done} lang={lang} exercise={exercise} id={id} dose={dose} phase={phase} date={date} week={currentWeek} day={active.day} logs={exerciseLogs} onSave={onSaveExerciseLog} busy={loggingBusy} disabled={loggingDisabled || date > today} context={{ ...coachingContext, readiness: Object.hasOwn(coachingContext, 'readiness') ? coachingContext.readiness : readiness, today }} />}
        </section>;
      })}
    </ExerciseDetails>
    {isToday && !rest && (() => {
      const liveEntries = entries.map(entry => ({ ...entry, done: completionView(active.day, entry.id).done }));
      const totalCount = liveEntries.length;
      const liveDoneCount = liveEntries.filter(item => item.done).length;
      const liveRemaining = Math.max(0, totalCount - liveDoneCount);
      const liveComplete = totalCount > 0 && liveDoneCount === totalCount;
      const completionPct = totalCount > 0 ? Math.round((liveDoneCount / totalCount) * 100) : 0;
      const todayLogs = (Array.isArray(exerciseLogs) ? exerciseLogs : []).filter(log => log && log.week === currentWeek && log.day === active.day);
      const todayLoggedExercises = new Set(todayLogs.map(log => log.exerciseId)).size;
      const todayLoggedSets = todayLogs.reduce((sum, log) => sum + (Array.isArray(log.sets) ? log.sets.length : 0), 0);
      const phaseProgress = sections
        .filter(section => section.items.length > 0)
        .map(section => ({
          phase: section.phase,
          label: j(`short_${section.phase}`),
          done: section.items.filter(item => completionView(active.day, item.id).done).length,
          total: section.items.length,
        }));
      const statusLabel = liveComplete
        ? (en ? 'Completed' : '全部完成')
        : liveDoneCount > 0
          ? (en ? `In progress · ${completionPct}%` : `進行中 · ${completionPct}%`)
          : (en ? 'Not started' : '尚未開始');
      const hintText = liveDoneCount === 0
        ? (en ? 'Tap the circle to mark exercises done, or open an exercise to log sets and weights.' : '點動作左側圓圈標記完成，點右側箭頭可查看說明並紀錄實做組數。')
        : !liveComplete
          ? (en ? `${liveDoneCount} done, ${liveRemaining} remaining. Resume anytime or wrap up based on today’s readiness.` : `已完成 ${liveDoneCount} 項，尚餘 ${liveRemaining} 項未勾選；可隨時接續完成，或依今日體感彈性收尾。`)
          : todayLoggedExercises > 0
            ? (en ? `All exercises and ${todayLoggedExercises} actual logs saved! Report next-day recovery in Records tomorrow.` : `全部動作與 ${todayLoggedExercises} 項實做紀錄都已保存！明天記得在紀錄頁回報恢復情況。`)
            : (en ? 'All planned exercises done! Open main lifts to log actual weights if you want progression tracking, and report recovery tomorrow.' : '今天安排的動作已全部完成！若需追蹤負重進步，可點主訓練動作補記重量，明天可在紀錄頁回報恢復。');

      return (
        <section data-testid="session-summary" data-complete={liveComplete} className="panel mt-5 session-summary-card">
          <div className="session-summary-head">
            <div>
              <h3 className="session-summary-title">{en ? 'Today’s training summary' : '今日訓練完成摘要'}</h3>
              <p className="session-summary-sub">{date}{active.theme ? ` · ${active.theme}` : ''}</p>
            </div>
            <span className={`session-summary-badge ${liveComplete ? 'is-complete' : liveDoneCount > 0 ? 'is-progress' : ''}`}>
              {liveComplete && <Check size={13} aria-hidden="true" />}
              {statusLabel}
            </span>
          </div>

          <div className="session-summary-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPct} aria-label={en ? 'Today completion progress' : '今日完成進度'}>
            <span style={{ width: `${completionPct}%` }} />
          </div>

          <div className="session-summary-metrics">
            <div className="session-summary-metric">
              <span className="session-summary-metric-label">{en ? 'Completed' : '完成動作'}</span>
              <strong>{liveDoneCount} / {totalCount}</strong>
              <small>{liveComplete ? (en ? 'All checked off' : '全數勾選完成') : liveDoneCount > 0 ? (en ? `${liveRemaining} remaining` : `尚餘 ${liveRemaining} 項`) : (en ? 'None checked yet' : '尚未勾選')}</small>
            </div>
            <div className="session-summary-metric">
              <span className="session-summary-metric-label">{en ? 'Logged sets' : '實做紀錄'}</span>
              <strong>{todayLoggedSets} {en ? 'sets' : '組'}</strong>
              <small>{todayLoggedExercises > 0 ? (en ? `${todayLoggedExercises} exercises` : `${todayLoggedExercises} 項動作`) : (en ? 'No weight logs' : '未填寫負重')}</small>
            </div>
          </div>

          {phaseProgress.length > 0 && (
            <div className="session-summary-phases">
              {phaseProgress.map(item => (
                <span key={item.phase} className={`session-summary-phase ${item.done === item.total ? 'is-done' : ''}`}>
                  {item.label} {item.done}/{item.total}
                </span>
              ))}
            </div>
          )}

          <p className="session-summary-hint">{hintText}</p>

          {(onOpenCoach || onViewRecords) && (
            <div className="session-summary-actions">
              {onOpenCoach && (
                <button type="button" onClick={onOpenCoach} className={liveDoneCount > 0 ? 'session-summary-primary' : 'coach-inline-button'}>
                  <Sparkles size={15} aria-hidden="true" />
                  {en ? 'Review today with AI Coach' : '請 AI 教練點評今天'}
                </button>
              )}
              {onViewRecords && (
                <button type="button" onClick={onViewRecords} className="button-secondary">
                  {j('records')}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </section>
      );
    })()}
    {editing && <ExercisePicker key={`${currentWeek}-${active.day}`} t={t} lang={lang} exercises={eligibleExercises} excludedIds={active.routine} selected={selected} setSelected={setSelected} onAdd={phase => onAdd(active.day, phase)} busy={saving} />}
    <div className="session-notes">
      {!editing && <details className="panel"><summary className="font-medium text-sm">{j('more')}</summary><h3 className="font-semibold mt-4 mb-2">{t('feedbackTitle')}</h3><p className="text-sm text-slate-500 mb-4">{t('feedbackSubtitle')}</p><div className="grid grid-cols-3 gap-2">{[[-1, 'feedbackHard'], [0, 'feedbackOk'], [1, 'feedbackEasy']].map(([value, label]) => <button key={value} disabled={busy} onClick={() => onFeedback(value)} aria-pressed={feedback === value} className={`rounded-xl p-3 text-sm border disabled:opacity-50 ${feedback === value ? 'bg-sky-50 border-sky-300 text-sky-700 font-semibold' : 'border-slate-200'}`}>{t(label)}<span className="block text-xs mt-1 text-slate-500">{t(`${label}Sub`)}</span></button>)}</div></details>}
      <details className="panel"><summary className="font-medium text-sm">{j('concept')}</summary><h3 className="font-semibold mt-4 mb-3 flex gap-2"><Feather size={17} />{active.theme}</h3><p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{active.concept}</p>{active.coachAdvice && <><h3 className="font-semibold mt-5 mb-2 flex items-center gap-2"><Brain size={17} />{j('advice')}</h3><p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{active.coachAdvice}</p></>}</details>
    </div>
  </div>;
}
