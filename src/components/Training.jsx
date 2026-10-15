import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Brain, Check, CheckCircle2, Circle, Edit2, Feather, Loader2, Save, Trash2, X } from 'lucide-react';
import { journeyText } from '../journeyLocale.js';
import { dateForWeekDay, getDateForWeekDay, localDate } from '../domain/dates.js';
import { exerciseKey } from '../domain/training.js';
import { SESSION_PHASES } from '../domain/phases.js';
import { estimateSessionMinutes, sessionSections } from '../domain/sessions.js';
import ExerciseGuide from './ExerciseGuide.jsx';
import ExercisePicker from './ExercisePicker.jsx';
import WorkoutShare from './WorkoutShare.jsx';
import ExerciseLog from './ExerciseLog.jsx';
import DailyReadiness from './DailyReadiness.jsx';

function CourtMark() {
  return <svg className="court-mark" viewBox="0 0 160 220" fill="none" aria-hidden="true"><rect x="10" y="10" width="140" height="200" rx="3" stroke="currentColor" strokeWidth="2" /><path d="M10 110H150M10 65H150M10 155H150M80 10V65M80 155V210M25 10V210M135 10V210" stroke="currentColor" strokeWidth="2" /></svg>;
}

export default function Training({ t, lang = 'zh', schedule, draft, activeDay, setActiveDay, currentWeek, exercises, progress, level,
  editing, selected, setSelected, onEdit, onCancel, onSave, onAdd, onRemove, onMove, onPhase, onToggle, onFeedback, feedback, busy, saving, canEdit, canRestore, onRestore, exerciseLogs = [], readiness = null, readinessPreview = null, onSaveExerciseLog, onUpdateNextDay: _onUpdateNextDay, onSaveReadiness, onPreviewReadiness, onApplyReadiness, loggingBusy = false, readinessBusy = false, coachingContext = {}, readinessDisabled = false, loggingDisabled = false, mode = 'plan', onViewRecords, eligibleExercises = exercises }) {
  const j = (key, values) => journeyText(lang, key, values);
  const isToday = mode === 'today' && !editing;
  const [journey, setJourney] = useState({ scope: '', started: false, focus: null, full: false });
  const display = editing ? draft : schedule;
  const active = display.find(day => day.day === activeDay) || display[0];
  const sections = sessionSections(active, exercises, level);
  const rest = active.routine.length === 0;
  const date = dateForWeekDay(currentWeek, active.day);
  const today = coachingContext.today || localDate();
  const minutes = estimateSessionMinutes(active, exercises, level);
  const scope = `${currentWeek}-${active.day}-${today}-${level}-${JSON.stringify({ routine: active.routine, prescriptions: active.prescriptions, sessionType: active.sessionType })}`;
  const currentJourney = journey.scope === scope ? journey : { started: false, focus: null, full: false };
  const updateJourney = patch => setJourney({ scope, ...currentJourney, ...patch });
  const entries = sections.flatMap(section => section.items.map(entry => ({ ...entry, phase: section.phase })));
  const doneCount = active.routine.filter(id => progress[exerciseKey(active.day, id)]).length;
  const complete = !rest && doneCount === active.routine.length;
  const firstPending = entries.find(entry => !progress[exerciseKey(active.day, entry.id)]);
  const focused = entries.find(entry => entry.id === currentJourney.focus && !progress[exerciseKey(active.day, entry.id)]) || firstPending;
  const started = currentJourney.started || complete;
  const full = !isToday || currentJourney.full;
  const currentIndex = entries.findIndex(entry => entry.id === focused?.id);
  const preparingCurrent = sections.some(section => section.preparation.some(item => item.id === focused?.id));
  const nextEntry = entries.slice(currentIndex + 1).find(entry => !progress[exerciseKey(active.day, entry.id)]);
  const nextExercise = () => { if (nextEntry) updateJourney({ started: true, focus: nextEntry.id }); };
  const focusedId = focused?.id;
  useEffect(() => {
    if (!isToday || !started || full || !focusedId) return;
    const frame = requestAnimationFrame(() => {
      const preparation = [...document.querySelectorAll('[data-preparation-for]')].find(element => element.dataset.preparationFor === focusedId && element.getClientRects().length && !element.closest('[hidden]'));
      const target = preparation || document.querySelector('[data-testid="current-exercise"]');
      if (target?.getClientRects().length && !target.closest('[hidden]')) target.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedId, full, isToday, started]);
  let sequence = 0;
  const exerciseCard = (entry, phase, section) => {
    const { id, index, dose: params } = entry;
    const exercise = exercises[id];
    const done = !!progress[exerciseKey(active.day, id)];
    const position = section.items.findIndex(item => item.id === id);
    const isCurrent = isToday && started && focused?.id === id;
    const description = `${params.sets} ${t('setsUnit')} × ${params.value} ${t(params.unit)}${params.perSide ? ` · ${t('eachSide')}` : ''}${params.restSeconds > 0 ? ` · ${t('restLabel')} ${params.restSeconds} ${t('seconds')}` : ''}`;
    sequence++;
    return <div key={id} hidden={isToday && (!started || !full && focused?.id !== id)} data-current={isCurrent} data-testid={isCurrent ? 'current-exercise' : undefined} className={`exercise-card ${done && !editing ? 'bg-sky-50' : ''}`}>
      {isCurrent && !full && <p className="eyebrow">{t(`phase_${phase}`)} · {currentIndex + 1} / {entries.length}</p>}
      <div className="flex items-center gap-3">
        {editing ? <button aria-label={`${t('removeExercise')} ${exercise.name}`} disabled={saving} onClick={() => onRemove(active.day, index)} className="p-2 text-red-500 disabled:opacity-30"><Trash2 size={20} /></button> : <button aria-label={exercise.name} aria-pressed={done} disabled={busy} onClick={() => onToggle(active.day, id)} className="flex items-center text-left gap-3 flex-1 disabled:opacity-50">{done ? <CheckCircle2 size={26} className="text-sky-600 shrink-0" /> : <Circle size={26} className="text-slate-400 shrink-0" />}<span className={`exercise-title ${done ? 'line-through text-slate-500' : ''}`}>{sequence}. {exercise.name}</span></button>}
        {editing && <span className="exercise-title flex-1">{sequence}. {exercise.name}</span>}
      </div>
      {editing && <div className="flex flex-wrap items-center gap-2 mt-3">
        <select aria-label={`${t('exercisePhaseLabel')} ${exercise.name}`} disabled={saving} value={phase} onChange={event => onPhase(active.day, id, event.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm">{SESSION_PHASES.map(value => <option key={value} value={value}>{t(`phase_${value}`)}</option>)}</select>
        <button type="button" aria-label={`${t('moveUp')} ${exercise.name}`} disabled={saving || position === 0} onClick={() => onMove(active.day, id, -1)} className="p-3 rounded-lg bg-slate-50 disabled:opacity-30"><ArrowUp size={16} /></button><button type="button" aria-label={`${t('moveDown')} ${exercise.name}`} disabled={saving || position === section.items.length - 1} onClick={() => onMove(active.day, id, 1)} className="p-3 rounded-lg bg-slate-50 disabled:opacity-30"><ArrowDown size={16} /></button>
      </div>}
      <div className="dose-grid" role="group" aria-label={description}><div><strong>{params.sets}</strong>{['strength', 'accessory'].includes(phase) ? t('workingSetsLabel') : t('setsUnit')}</div><div><strong>{params.value}</strong>{t(params.unit)}{params.perSide && ` · ${t('eachSide')}`}</div><div><strong>{params.restSeconds || '—'}</strong>{t('restLabel')}{params.restSeconds > 0 && ` · ${t('seconds')}`}</div></div>
      {(!done || editing) && <p className="text-sm text-slate-600 leading-relaxed">{exercise.tip}</p>}
      {!editing && <ExerciseGuide id={id} exercise={exercise} lang={lang} />}
      {!editing && onSaveExerciseLog && ['strength', 'accessory', 'skill'].includes(phase) && <ExerciseLog key={`${currentWeek}-${active.day}-${id}-${today}`} autoOpen={isCurrent && !full} completed={done} lang={lang} exercise={exercise} id={id} dose={params} phase={phase} date={date} week={currentWeek} day={active.day} logs={exerciseLogs} onSave={onSaveExerciseLog} busy={loggingBusy} disabled={loggingDisabled} context={{ ...coachingContext, readiness: Object.hasOwn(coachingContext, 'readiness') ? coachingContext.readiness : readiness, today }} />}
      {isCurrent && !full && !done && ['warmup', 'recovery', 'cooldown'].includes(phase) && <button type="button" disabled={busy} onClick={() => onToggle(active.day, id)} className="button-primary w-full mt-5"><Check size={18} />{j('markDone')}</button>}
    </div>;
  };
  return <div className="session-body">
    {!isToday && <div className="flex bg-white rounded-2xl p-2 mb-6 gap-1 border border-slate-200 overflow-x-auto">{display.map(day => <button key={day.day} onClick={() => setActiveDay(day.day)} className={`flex-1 min-w-12 rounded-xl p-3 text-sm ${active.day === day.day ? 'bg-sky-700 text-white' : 'text-slate-500'}`}><span className="block font-semibold">{t('dayShort')[day.day - 1]}</span><span className="block mt-1 text-xs">{getDateForWeekDay(currentWeek, day.day)}</span></button>)}</div>}
    {isToday && !started && <div className="session-heading"><p className="eyebrow">{date} · {t('dayShort')[active.day - 1]}</p><h2 className="screen-title">{j('today')}</h2></div>}
    {isToday ? <section className="session-hero" data-running={started} data-testid="session-hero"><CourtMark /><p className="eyebrow">{rest ? t('restSessionTitle') : started ? `${j('progress', { done: doneCount, total: active.routine.length })}` : t('dayShort')[active.day - 1]}</p><h2>{active.theme || j('today')}</h2><div className="hero-metadata"><span><strong>{minutes}</strong>{t('minutes')}</span><span><strong>{active.routine.length}</strong>{j('movementCount')}</span></div>
      {!rest && !complete && !currentJourney.started && <button type="button" data-testid="session-start" disabled={busy || !focused} onClick={() => updateJourney({ started: true, focus: firstPending?.id })} className="button-primary">{j(doneCount ? 'resume' : 'start')}<ArrowRight size={18} /></button>}
      {!rest && !complete && <button type="button" onClick={() => updateJourney({ full: !currentJourney.full, started: true })} className="text-link mt-2 ml-4">{j(full ? 'collapse' : 'full')}</button>}
      {rest && <p className="text-sm text-sky-700">{j('rest')}</p>}
    </section> : <div className="flex flex-wrap items-start justify-between gap-4 mb-5"><div><p className="eyebrow">{date} · {minutes} {t('minutes')}</p><h2 className="text-2xl font-bold text-slate-800">{active.theme || j('week')}</h2></div><div className="flex gap-2 text-sm">{!editing ? <button disabled={!canEdit || saving || busy} onClick={onEdit} className="button-secondary disabled:opacity-50"><Edit2 size={15} />{t('editSchedule')}</button> : <><button disabled={saving} onClick={onCancel} className="button-secondary"><X size={15} />{t('cancelEdits')}</button><button disabled={saving || !canEdit} onClick={onSave} className="button-primary">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{t('saveEdits')}</button></>}{canRestore && !editing && <button disabled={saving} onClick={onRestore} className="text-link">{t('aiRestoreBtn')}</button>}</div></div>}
    {!rest && !active.routine.every(id => active.prescriptions?.some(dose => dose.id === id && dose.phase)) && <p className="text-sm text-amber-700 mb-4">{t('legacyPhaseNotice')}</p>}
    {!editing && onSaveReadiness && (isToday || date === today || readiness) && <DailyReadiness key={date} compact lang={lang} value={readiness} date={date} onSave={onSaveReadiness} preview={readinessPreview} onPreview={onPreviewReadiness} onApply={onApplyReadiness} busy={readinessBusy} disabled={readinessDisabled} today={today} exercises={exercises} context={coachingContext} />}
    {isToday && !rest && <div className="phase-rail" aria-label={j('sequence')}>{sections.filter(section => section.items.length || section.preparation.length).map(section => <div key={section.phase} className="phase-stop" data-active={started && focused?.phase === section.phase}><b>{j(`short_${section.phase}`)}</b>{Math.ceil(section.seconds / 60)} {t('minutes')}</div>)}</div>}
    {isToday && !started && !rest && <p className="text-sm text-slate-500 leading-relaxed mb-5">{j('startHint')}</p>}
    {entries.length < active.routine.length && <p role="status" className="text-sm text-amber-700">{j('unknown')}</p>}
    <div className="space-y-5">{!rest && sections.filter(section => section.items.length || section.preparation.length || ['warmup', 'cooldown'].includes(section.phase)).map(section => <section key={section.phase} aria-label={t(`phase_${section.phase}`)} data-phase={section.phase} hidden={isToday && (!started || !full && section.phase !== focused?.phase && !(section.phase === 'warmup' && preparingCurrent && !complete) && !(section.phase === 'cooldown' && !section.items.length && currentIndex === entries.length - 1))} className="space-y-3">
      <div className="flex items-center justify-between gap-3 pt-2"><h3 className="font-semibold text-slate-700">{t(`phase_${section.phase}`)}</h3>{section.seconds > 0 && <span className="text-xs text-slate-500">{t('aboutTime')} {Math.ceil(section.seconds / 60)} {t('minutes')}</span>}</div>
      {section.phase === 'warmup' && (!isToday || full || focused?.phase === 'warmup') && <p className="text-sm text-slate-500 leading-relaxed">{active.warmupNote || t(active.sessionType === 'recovery' ? 'recoveryWarmupNote' : section.items.length || section.preparation.length ? 'warmupSequenceNote' : 'warmupNotPlanned')}</p>}
      {section.items.map(entry => exerciseCard(entry, section.phase, section))}
      {section.preparation.length > 0 && isToday && (full || preparingCurrent) && <p className="text-sm font-semibold text-amber-800">{j('preparation')}</p>}
      {section.preparation.filter(item => !isToday || full || item.id === focused?.id).map(({ id, dose }) => <div key={`prep_${id}`} data-preparation-for={id} className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm"><p className="font-semibold text-amber-800">{t('preparationSetsLabel')} · {exercises[id].name}</p><p className="text-sm text-slate-600 mt-2">{dose.sets} {t('setsUnit')} × {dose.value} {t(dose.unit)}{dose.perSide && ` · ${t('eachSide')}`}{dose.restSeconds > 0 && ` · ${t('restLabel')} ${dose.restSeconds} ${t('seconds')}`}</p><p className="text-sm text-slate-600 mt-2">{dose.instruction}</p><p className="text-xs text-amber-700 mt-2">{t('preparationTrackingHint')}</p></div>)}
      {section.phase === 'cooldown' && <p className="text-sm text-slate-500 leading-relaxed">{active.cooldownNote || t(section.items.length ? 'cooldownSequenceNote' : 'cooldownNotPlanned')}</p>}
    </section>)}</div>
    {isToday && started && !complete && <div className="space-y-2 mt-5"><div className="flex flex-wrap gap-2">{nextEntry && <button type="button" onClick={nextExercise} className="button-secondary">{j('next')}<ArrowRight size={16} /></button>}{focused?.id !== firstPending?.id && <button type="button" onClick={() => updateJourney({ focus: firstPending?.id })} className="text-link">{j('back')}</button>}</div><p className="text-xs text-slate-500">{j('nextHint')}</p>{onViewRecords && <button type="button" onClick={onViewRecords} className="text-link">{j('records')}</button>}</div>}
    {isToday && (complete || rest) && <section data-testid="session-summary" className="panel mt-5 space-y-3"><h3 className="text-xl font-bold text-slate-800">{j('summary')}</h3><p className="text-sm text-slate-600">{rest ? j('rest') : j('finished')}</p>{!rest && <p className="text-sm text-slate-500">{j('summaryHint')}</p>}{onViewRecords && <button type="button" onClick={onViewRecords} className="button-primary">{j('records')}<ArrowRight size={16} /></button>}{complete && <button type="button" onClick={() => updateJourney({ full: !currentJourney.full, started: true })} className="text-link">{j(full ? 'collapse' : 'full')}</button>}</section>}
    {editing && <ExercisePicker key={`${currentWeek}-${active.day}`} t={t} lang={lang} exercises={eligibleExercises} excludedIds={active.routine} selected={selected} setSelected={setSelected} onAdd={phase => onAdd(active.day, phase)} busy={saving} />}
    <div className="session-notes" hidden={isToday && !started}>
      {!editing && <details className="panel"><summary className="font-medium text-sm">{j('more')}</summary><div className="mt-4 mb-5"><WorkoutShare day={active} exercises={exercises} level={level} lang={lang} week={currentWeek} /></div><h3 className="font-semibold mb-2">{t('feedbackTitle')}</h3><p className="text-sm text-slate-500 mb-4">{t('feedbackSubtitle')}</p><div className="grid grid-cols-3 gap-2">{[[-1, 'feedbackHard'], [0, 'feedbackOk'], [1, 'feedbackEasy']].map(([value, label]) => <button key={value} disabled={busy} onClick={() => onFeedback(value)} aria-pressed={feedback === value} className={`rounded-xl p-3 text-sm border disabled:opacity-50 ${feedback === value ? 'bg-sky-50 border-sky-300 text-sky-700 font-semibold' : 'border-slate-200'}`}>{t(label)}<span className="block text-xs mt-1 text-slate-500">{t(`${label}Sub`)}</span></button>)}</div></details>}
      <details className="panel"><summary className="font-medium text-sm">{j('concept')}</summary><h3 className="font-semibold mt-4 mb-3 flex gap-2"><Feather size={17} />{active.theme}</h3><p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{active.concept}</p>{active.coachAdvice && <><h3 className="font-semibold mt-5 mb-2 flex items-center gap-2"><Brain size={17} />{j('advice')}</h3><p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{active.coachAdvice}</p></>}</details>
    </div>
  </div>;
}
