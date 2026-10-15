import { useState } from 'react';
import { journeyText } from '../journeyLocale.js';
import ExerciseGuide from './ExerciseGuide.jsx';
import ExercisePicker from './ExercisePicker.jsx';
import { ArrowDown, ArrowUp, Clock3, Brain, CheckCircle2, Circle, Edit2, Feather, Info, Loader2, Save, Trash2, X } from 'lucide-react';
import { dateForWeekDay, getDateForWeekDay, localDate } from '../domain/dates.js';
import { exerciseKey } from '../domain/training.js';
import { SESSION_PHASES } from '../domain/phases.js';
import { estimateSessionMinutes, sessionSections } from '../domain/sessions.js';
import WorkoutShare from './WorkoutShare.jsx';
import ExerciseLog from './ExerciseLog.jsx';
import DailyReadiness from './DailyReadiness.jsx';

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
  let sequence = 0;
  const exerciseCard = (entry, phase, section) => {
    const { id, index, dose: params } = entry;
    const exercise = exercises[id];
    const done = !!progress[exerciseKey(active.day, id)];
    const position = section.items.findIndex(item => item.id === id);
    sequence++;
    return <div key={id} hidden={isToday && (!started || !full && focused?.id !== id)} data-testid={isToday && started && focused?.id === id ? 'current-exercise' : undefined} className={`p-4 rounded-xl border ${done && !editing ? 'bg-sky-50 border-sky-200' : 'bg-white border-sky-100'}`}>
      <div className="flex items-center gap-3">
        {editing ? <button aria-label={`${t('removeExercise')} ${exercise.name}`} disabled={saving} onClick={() => onRemove(active.day, index)} className="p-2 text-red-500 disabled:opacity-30"><Trash2 size={20} /></button> :
          <button aria-label={exercise.name} aria-pressed={done} disabled={busy} onClick={() => onToggle(active.day, id)} className="flex items-center text-left gap-3 flex-1 disabled:opacity-50">
            {done ? <CheckCircle2 size={24} className="text-sky-600 shrink-0" /> : <Circle size={24} className="text-slate-400 shrink-0" />}
            <span className={done ? 'line-through text-slate-500' : 'text-slate-800'}>{sequence}. {exercise.name}</span>
          </button>}
        {editing && <span className="flex-1">{sequence}. {exercise.name}</span>}
      </div>
      {editing && <div className="flex flex-wrap items-center gap-2 mt-3 ml-11">
        <select aria-label={`${t('exercisePhaseLabel')} ${exercise.name}`} disabled={saving} value={phase} onChange={event => onPhase(active.day, id, event.target.value)} className="rounded-lg border border-sky-200 p-2 text-xs">{SESSION_PHASES.map(value => <option key={value} value={value}>{t(`phase_${value}`)}</option>)}</select>
        <button type="button" aria-label={`${t('moveUp')} ${exercise.name}`} disabled={saving || position === 0} onClick={() => onMove(active.day, id, -1)} className="p-2 rounded-lg bg-slate-50 disabled:opacity-30"><ArrowUp size={14} /></button>
        <button type="button" aria-label={`${t('moveDown')} ${exercise.name}`} disabled={saving || position === section.items.length - 1} onClick={() => onMove(active.day, id, 1)} className="p-2 rounded-lg bg-slate-50 disabled:opacity-30"><ArrowDown size={14} /></button>
      </div>}
      <p className="text-xs text-slate-500 mt-2 ml-11">{['strength', 'accessory'].includes(phase) && `${t('workingSetsLabel')} · `}{params.sets} {t('setsUnit')} × {params.value} {t(params.unit)}{params.perSide && ` · ${t('eachSide')}`}{params.restSeconds > 0 && ` · ${t('restLabel')} ${params.restSeconds} ${t('seconds')}`}</p>
      {isToday && !full && <p className="text-xs font-semibold text-sky-700 mb-2">{j('current')}</p>}
      {(!done || editing) && <div className="mt-3 ml-11 flex items-start text-xs text-slate-500 gap-2"><Info size={14} className="shrink-0 text-sky-500" /><span>{exercise.tip}</span></div>}
      {!editing && <ExerciseGuide id={id} exercise={exercise} lang={lang} />}
      {!editing && onSaveExerciseLog && ['strength', 'accessory', 'skill'].includes(phase) && <ExerciseLog key={`${currentWeek}-${active.day}-${id}-${today}`} completed={done} lang={lang} exercise={exercise} id={id} dose={params} phase={phase} date={date} week={currentWeek} day={active.day} logs={exerciseLogs} onSave={onSaveExerciseLog} busy={loggingBusy} disabled={loggingDisabled} context={{ ...coachingContext, readiness: Object.hasOwn(coachingContext, 'readiness') ? coachingContext.readiness : readiness, today }} />}
    </div>;
  };
  return <div>
    {!isToday && <div className="flex bg-white rounded-xl p-2 mb-6 gap-1 overflow-x-auto">
      {display.map(day => <button key={day.day} onClick={() => setActiveDay(day.day)} className={`flex-1 min-w-12 rounded-lg p-2 text-xs ${active.day === day.day ? 'bg-sky-600 text-white' : 'text-slate-500'}`}>
        <span className="block font-bold">{t('dayShort')[day.day - 1]}</span>
        <span className="block my-1">{getDateForWeekDay(currentWeek, day.day)}</span>
        {day.routine.length > 0 && day.routine.every(id => progress[exerciseKey(day.day, id)]) ? <CheckCircle2 size={14} className="mx-auto" /> : <Circle size={14} className="mx-auto" />}
      </button>)}
    </div>}
    <div className={`grid gap-6 ${isToday ? '' : 'lg:grid-cols-5'}`}>
      <div className={`${isToday ? '' : 'lg:col-span-3'} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-700">{j(isToday ? 'today' : 'week')} · {date}</h2>
          <div className={`${isToday ? 'hidden' : 'flex'} gap-2 text-xs`}>
            {!editing ? <button disabled={!canEdit || saving || busy} onClick={onEdit} className="flex items-center gap-1 text-sky-600 rounded-lg bg-sky-50 px-3 py-2 disabled:opacity-50"><Edit2 size={14} />{t('editSchedule')}</button> : <>
              <button disabled={saving} onClick={onCancel} className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2"><X size={14} />{t('cancelEdits')}</button>
              <button disabled={saving || !canEdit} onClick={onSave} className="flex items-center gap-1 bg-sky-600 text-white rounded-lg px-3 py-2 disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{t('saveEdits')}</button>
            </>}
            {canRestore && !editing && <button disabled={saving} onClick={onRestore} className="text-sky-600">{t('aiRestoreBtn')}</button>}
          </div>
        </div>
        <div className="rounded-xl bg-sky-50 border border-sky-100 p-4">
          <p className="font-semibold text-sm flex items-center gap-2"><Clock3 size={16} />{rest ? t('restSessionTitle') : `${t('estimatedSessionTime')} ${minutes} ${t('minutes')}`}</p>
          <p className="text-xs text-slate-500 mt-2">{rest ? t('restSessionNote') : t('sessionTimingHint')}</p>
          {!rest && <p className="text-xs text-sky-800 mt-2">{j('progress', { done: doneCount, total: active.routine.length })}</p>}
          {isToday && date !== today && <p className="text-xs text-amber-700 mt-2">{j('otherDate', { date })}</p>}
          {!rest && !active.routine.every(id => active.prescriptions?.some(dose => dose.id === id && dose.phase)) && <p className="text-xs text-amber-700 mt-2">{t('legacyPhaseNotice')}</p>}
        </div>
        {!editing && onSaveReadiness && <DailyReadiness key={date} lang={lang} value={readiness} date={date} onSave={onSaveReadiness} preview={readinessPreview} onPreview={onPreviewReadiness} onApply={onApplyReadiness} busy={readinessBusy} disabled={readinessDisabled} today={today} exercises={exercises} context={coachingContext} />}
        {isToday && !rest && !complete && <div className="rounded-xl border border-sky-100 bg-white p-4 space-y-3">
          <p className="text-sm text-slate-600">{j('startHint')}</p>
          {!currentJourney.started && <button type="button" data-testid="session-start" disabled={busy || !focused} onClick={() => updateJourney({ started: true, focus: firstPending?.id })} className="rounded-xl bg-sky-600 text-white px-5 py-3 font-semibold text-sm disabled:opacity-50">{j(doneCount ? 'resume' : 'start')}</button>}
          <button type="button" onClick={() => updateJourney({ full: !currentJourney.full, started: true })} className="block text-sm text-sky-700 underline underline-offset-4">{j(full ? 'collapse' : 'full')}</button>
        </div>}
        {isToday && rest && <p className="rounded-xl bg-white border border-slate-100 p-4 text-sm text-slate-600">{j('rest')}</p>}
        {entries.length < active.routine.length && <p role="status" className="text-sm text-amber-700">{j('unknown')}</p>}
        {!rest && sections.filter(section => section.items.length || section.preparation.length || ['warmup', 'cooldown'].includes(section.phase)).map(section => <section key={section.phase} aria-label={t(`phase_${section.phase}`)} data-phase={section.phase} hidden={isToday && (!started || !full && section.phase !== focused?.phase && !(section.phase === 'warmup' && preparingCurrent && !complete) && !(section.phase === 'cooldown' && !section.items.length && currentIndex === entries.length - 1))} className="space-y-3">
          <div className="flex items-center justify-between gap-3 pt-2"><h3 className="font-bold text-sky-800">{t(`phase_${section.phase}`)}</h3>{section.seconds > 0 && <span className="text-xs text-slate-500">{t('aboutTime')} {Math.ceil(section.seconds / 60)} {t('minutes')}</span>}</div>
          {section.phase === 'warmup' && (!isToday || full || focused?.phase === 'warmup') && <p className="text-sm text-slate-600">{active.warmupNote || t(active.sessionType === 'recovery' ? 'recoveryWarmupNote' : section.items.length || section.preparation.length ? 'warmupSequenceNote' : 'warmupNotPlanned')}</p>}
          {section.items.map(entry => exerciseCard(entry, section.phase, section))}
          {section.preparation.length > 0 && isToday && (full || preparingCurrent) && <div className="text-sm text-amber-800"><p className="font-semibold">{j('preparation')}</p><p className="text-xs mt-1">{j('preparationHint')}</p></div>}
          {section.preparation.filter(item => !isToday || full || item.id === focused?.id).map(({ id, dose }) => <div key={`prep_${id}`} className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm">
            <p className="font-semibold text-amber-800">{t('preparationSetsLabel')} · {exercises[id].name}</p>
            <p className="text-xs text-slate-600 mt-2">{dose.sets} {t('setsUnit')} × {dose.value} {t(dose.unit)}{dose.perSide && ` · ${t('eachSide')}`}{dose.restSeconds > 0 && ` · ${t('restLabel')} ${dose.restSeconds} ${t('seconds')}`}</p>
            <p className="text-xs text-slate-600 mt-2">{dose.instruction}</p><p className="text-xs text-amber-700 mt-2">{t('preparationTrackingHint')}</p>
          </div>)}
          {section.phase === 'cooldown' && <p className="text-sm text-slate-600">{active.cooldownNote || t(section.items.length ? 'cooldownSequenceNote' : 'cooldownNotPlanned')}</p>}
        </section>)}
        {isToday && started && !complete && <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {nextEntry && <button type="button" onClick={nextExercise} className="rounded-lg border border-sky-200 text-sky-700 bg-white px-4 py-2 text-sm">{j('next')}</button>}
            {focused?.id !== firstPending?.id && <button type="button" onClick={() => updateJourney({ focus: firstPending?.id })} className="rounded-lg border border-slate-200 text-slate-600 bg-white px-4 py-2 text-sm">{j('back')}</button>}
          </div>
          <p className="text-xs text-slate-500">{j('nextHint')}</p>
        </div>}
        {isToday && (complete || started || rest) && <section data-testid="session-summary" className="rounded-xl border border-sky-100 bg-white p-4 space-y-3">
          <h3 className="font-bold text-slate-800">{j('summary')}</h3>
          <p className="text-sm text-slate-600">{rest ? j('rest') : complete ? j('finished') : j('remaining', { count: active.routine.length - doneCount })}</p>
          {!rest && <p className="text-xs text-slate-500">{j('summaryHint')}</p>}
          {onViewRecords && <button type="button" onClick={onViewRecords} className={`rounded-lg px-4 py-2 text-sm ${complete || rest ? 'bg-sky-600 text-white' : 'border border-sky-200 text-sky-700'}`}>{j('records')}</button>}
          {complete && <button type="button" onClick={() => updateJourney({ full: !currentJourney.full, started: true })} className="block text-sm text-sky-700 underline underline-offset-4">{j(full ? 'collapse' : 'full')}</button>}
        </section>}
        {editing && <ExercisePicker key={`${currentWeek}-${active.day}`} t={t} lang={lang} exercises={eligibleExercises} excludedIds={active.routine} selected={selected} setSelected={setSelected} onAdd={phase => onAdd(active.day, phase)} busy={saving} />}
        {!editing && <details className="bg-white rounded-2xl p-5 border border-sky-100">
          <summary className="cursor-pointer font-semibold text-sm text-slate-700">{j('more')}</summary>
          <div className="mt-4 mb-5"><WorkoutShare day={active} exercises={exercises} level={level} lang={lang} week={currentWeek} /></div>
          <h3 className="font-bold mb-2">{t('feedbackTitle')}</h3>
          <p className="text-xs text-slate-500 mb-4">{t('feedbackSubtitle')}</p>
          <div className="grid grid-cols-3 gap-2">
            {[[-1, 'feedbackHard'], [0, 'feedbackOk'], [1, 'feedbackEasy']].map(([value, label]) => <button key={value} disabled={busy} onClick={() => onFeedback(value)} aria-pressed={feedback === value} className={`rounded-lg p-2 text-sm border disabled:opacity-50 ${feedback === value ? 'bg-sky-100 border-sky-300 text-sky-700 font-bold' : 'bg-slate-50 border-slate-100'}`}>
              {t(label)}<span className="block text-xs mt-1 text-slate-500">{t(`${label}Sub`)}</span>
            </button>)}
          </div>
        </details>}
      </div>
      <div className={`${isToday ? '' : 'lg:col-span-2'} space-y-4`}>
        <details className="bg-white rounded-2xl p-5 border border-sky-100">
          <summary className="cursor-pointer font-semibold text-sm text-slate-700">{j('concept')}</summary>
          <h2 className="font-bold text-slate-800 mt-4 mb-3 flex items-center gap-2"><Feather size={18} className="text-sky-600" />{active.theme}</h2>
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{active.concept}</p>
        </details>
        {active.coachAdvice && <details className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100">
          <summary className="cursor-pointer font-semibold text-sm text-indigo-700">{j('advice')}</summary>
          <h3 className="font-bold mt-4 text-indigo-700 mb-3 flex items-center gap-2"><Brain size={18} />{t('coachAdvice')}</h3>
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{active.coachAdvice}</p>
        </details>}
      </div>
    </div>
  </div>;
}
