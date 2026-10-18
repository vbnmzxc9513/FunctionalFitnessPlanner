import { useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Brain, CheckCircle2, Circle, Edit2, Feather, Loader2, Save, Trash2, X } from 'lucide-react';
import { journeyText } from '../journeyLocale.js';
import { dateForWeekDay, getDateForWeekDay, localDate } from '../domain/dates.js';
import { exerciseKey } from '../domain/training.js';
import { SESSION_PHASES } from '../domain/phases.js';
import { estimateSessionMinutes, sessionSections } from '../domain/sessions.js';
import ExerciseGuide from './ExerciseGuide.jsx';
import ExercisePicker from './ExercisePicker.jsx';
import ExerciseRow from './ExerciseRow.jsx';
import ExerciseDetails from './ExerciseDetails.jsx';
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
  const [details, setDetails] = useState({ scope: '', id: null, visited: [] });
  const display = editing ? draft : schedule;
  const active = display.find(day => day.day === activeDay) || display[0];
  const sections = sessionSections(active, exercises, level);
  const rest = active.routine.length === 0;
  const date = dateForWeekDay(currentWeek, active.day);
  const today = coachingContext.today || localDate();
  const minutes = estimateSessionMinutes(active, exercises, level);
  const scope = `${currentWeek}-${active.day}-${today}`;
  const currentDetails = details.scope === scope ? details : { id: null, visited: [] };
  const entries = sections.flatMap(section => section.items.map(entry => ({ ...entry, phase: section.phase })));
  const doneCount = active.routine.filter(id => progress[exerciseKey(active.day, id)]).length;
  const complete = !rest && doneCount === active.routine.length;
  const firstPending = entries.find(entry => !progress[exerciseKey(active.day, entry.id)]);
  const selectedEntry = entries.find(entry => entry.id === currentDetails.id);
  const currentIndex = entries.findIndex(entry => entry.id === selectedEntry?.id);
  const openDetails = (id, opener) => {
    opener?.focus({ preventScroll: true });
    setDetails(previous => ({ scope, id, visited: [...new Set([...(previous.scope === scope ? previous.visited : []), id])] }));
  };
  const closeDetails = () => setDetails(previous => ({ ...previous, id: null }));
  const description = params => `${params.sets} ${t('setsUnit')} × ${params.value} ${t(params.unit)}${params.perSide ? ` · ${t('eachSide')}` : ''}`;
  const doseGrid = (params, phase = params.phase) => <div className="dose-grid" role="group" aria-label={`${description(params)}${params.restSeconds > 0 ? ` · ${t('restLabel')} ${params.restSeconds} ${t('seconds')}` : ''}`}><div><strong>{params.sets}</strong>{t(['strength', 'accessory'].includes(phase) ? 'workingSetsLabel' : 'setsUnit')}</div><div><strong>{params.value}</strong>{t(params.unit)}{params.perSide && ` · ${t('eachSide')}`}</div><div><strong>{params.restSeconds || '—'}</strong>{t('restLabel')}{params.restSeconds > 0 && ` · ${t('seconds')}`}</div></div>;
  const preparation = (id, dose) => dose && <div data-preparation-for={id} className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm"><p className="font-semibold text-amber-800">{t('preparationSetsLabel')} · {exercises[id].name}</p><p className="text-sm text-slate-600 mt-2">{description(dose)}{dose.restSeconds > 0 && ` · ${t('restLabel')} ${dose.restSeconds} ${t('seconds')}`}</p><p className="text-sm text-slate-600 mt-2">{dose.instruction}</p><p className="text-xs text-amber-700 mt-2">{t('preparationTrackingHint')}</p></div>;
  let sequence = 0;
  return <div className="session-body">
    {!isToday && <div className="flex bg-white rounded-2xl p-2 mb-6 gap-1 border border-slate-200 overflow-x-auto">{display.map(day => <button key={day.day} onClick={() => { closeDetails(); setActiveDay(day.day); }} className={`flex-1 min-w-12 rounded-xl p-3 text-sm ${active.day === day.day ? 'bg-sky-700 text-white' : 'text-slate-500'}`}><span className="block font-semibold">{t('dayShort')[day.day - 1]}</span><span className="block mt-1 text-xs">{getDateForWeekDay(currentWeek, day.day)}</span></button>)}</div>}
    {isToday ? <section className="session-hero" data-running={doneCount > 0} data-testid="session-hero"><CourtMark /><p className="eyebrow">{date} · {rest ? t('restSessionTitle') : j('progress', { done: doneCount, total: active.routine.length })}</p><h2>{active.theme || j('today')}</h2><div className="hero-metadata"><span><strong>{minutes}</strong>{t('minutes')}</span><span><strong>{active.routine.length}</strong>{j('movementCount')}</span></div>
      {!rest && !complete && <button type="button" data-testid="session-start" disabled={busy || !firstPending} onClick={event => openDetails(firstPending.id, event.currentTarget)} className="button-primary">{j(doneCount ? 'resume' : 'start')}<ArrowRight size={18} /></button>}
      {rest && <p className="text-sm text-sky-700">{j('rest')}</p>}
    </section> : <div className="flex flex-wrap items-start justify-between gap-4 mb-5"><div><p className="eyebrow">{date} · {minutes} {t('minutes')}</p><h2 className="text-2xl font-bold text-slate-800">{active.theme || j('week')}</h2></div><div className="flex gap-2 text-sm">{!editing ? <button disabled={!canEdit || saving || busy} onClick={onEdit} className="button-secondary disabled:opacity-50"><Edit2 size={15} />{t('editSchedule')}</button> : <><button disabled={saving} onClick={onCancel} className="button-secondary"><X size={15} />{t('cancelEdits')}</button><button disabled={saving || !canEdit} onClick={onSave} className="button-primary">{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{t('saveEdits')}</button></>}{canRestore && !editing && <button disabled={saving} onClick={onRestore} className="text-link">{t('aiRestoreBtn')}</button>}</div></div>}
    {!rest && !active.routine.every(id => active.prescriptions?.some(dose => dose.id === id && dose.phase)) && <p className="text-sm text-amber-700 mb-4">{t('legacyPhaseNotice')}</p>}
    {!editing && onSaveReadiness && (isToday || date === today || readiness) && <DailyReadiness key={date} compact lang={lang} value={readiness} date={date} onSave={onSaveReadiness} preview={readinessPreview} onPreview={onPreviewReadiness} onApply={onApplyReadiness} busy={readinessBusy} disabled={readinessDisabled} today={today} exercises={exercises} context={coachingContext} />}
    {!editing && !rest && <p className="text-xs text-slate-500 mb-4" data-testid="exercise-browse-hint">{j('browseHint')}</p>}
    {entries.length < active.routine.length && <p role="status" className="text-sm text-amber-700">{j('unknown')}</p>}
    <div className="space-y-5" data-testid="daily-exercise-list">{!rest && sections.filter(section => section.items.length).map(section => <section key={section.phase} aria-label={t(`phase_${section.phase}`)} data-phase={section.phase} className="space-y-2">
      <div className="flex items-center justify-between gap-3 pt-2"><h3 className="font-semibold text-slate-700">{t(`phase_${section.phase}`)}</h3>{section.seconds > 0 && <span className="text-xs text-slate-500">{t('aboutTime')} {Math.ceil(section.seconds / 60)} {t('minutes')}</span>}</div>
      {section.items.map((entry, position) => {
        const { id, index, dose } = entry; const exercise = exercises[id]; const done = !!progress[exerciseKey(active.day, id)]; sequence++;
        if (!editing) return <ExerciseRow key={id} id={id} name={exercise.name} number={sequence} summary={description(dose)} preparation={dose.preparation ? j('hasPreparation') : null} actionLabel={j('detailsLog')} done={done} disabled={busy || date > today} onToggle={() => onToggle(active.day, id)} onOpen={opener => openDetails(id, opener)} />;
        return <div key={id} className="exercise-card"><div className="flex items-center gap-3"><button aria-label={`${t('removeExercise')} ${exercise.name}`} disabled={saving} onClick={() => onRemove(active.day, index)} className="p-2 text-red-500 disabled:opacity-30"><Trash2 size={20} /></button><span className="exercise-title flex-1">{sequence}. {exercise.name}</span></div><div className="flex flex-wrap items-center gap-2 mt-3"><select aria-label={`${t('exercisePhaseLabel')} ${exercise.name}`} disabled={saving} value={section.phase} onChange={event => onPhase(active.day, id, event.target.value)} className="rounded-xl border border-slate-200 p-2 text-sm">{SESSION_PHASES.map(value => <option key={value} value={value}>{t(`phase_${value}`)}</option>)}</select><button type="button" aria-label={`${t('moveUp')} ${exercise.name}`} disabled={saving || position === 0} onClick={() => onMove(active.day, id, -1)} className="p-3 rounded-lg bg-slate-50 disabled:opacity-30"><ArrowUp size={16} /></button><button type="button" aria-label={`${t('moveDown')} ${exercise.name}`} disabled={saving || position === section.items.length - 1} onClick={() => onMove(active.day, id, 1)} className="p-3 rounded-lg bg-slate-50 disabled:opacity-30"><ArrowDown size={16} /></button></div>{doseGrid(dose, section.phase)}<p className="text-sm text-slate-600 leading-relaxed">{exercise.tip}</p></div>;
      })}
    </section>)}</div>
    <ExerciseDetails open={!editing && !!selectedEntry} title={selectedEntry ? exercises[selectedEntry.id].name : ''} subtitle={selectedEntry ? `${date} · ${t(`phase_${selectedEntry.phase}`)} · ${currentIndex + 1} / ${entries.length}` : date} closeLabel={j('returnList')} onClose={closeDetails} footer={selectedEntry && <><button type="button" disabled={currentIndex <= 0} onClick={() => openDetails(entries[currentIndex - 1].id)} className="button-secondary disabled:opacity-40">{j('previous')}</button>{currentIndex < entries.length - 1 && <button type="button" onClick={() => openDetails(entries[currentIndex + 1].id)} className="button-secondary">{j('next')}<ArrowRight size={16} /></button>}</>}>
      {entries.filter(entry => currentDetails.visited.includes(entry.id)).map(entry => {
        const { id, dose, phase } = entry; const exercise = exercises[id]; const done = !!progress[exerciseKey(active.day, id)];
        return <section key={`${scope}-${id}`} hidden={currentDetails.id !== id} data-phase={phase} data-testid={currentDetails.id === id ? 'current-exercise' : undefined} className="exercise-card space-y-4">
          {preparation(id, dose.preparation)}
          <button type="button" aria-label={exercise.name} aria-pressed={done} disabled={busy || date > today} onClick={() => onToggle(active.day, id)} className="flex items-center gap-3 text-sm text-sky-700 disabled:opacity-40">{done ? <CheckCircle2 size={24} /> : <Circle size={24} />}{j(done ? 'markedDone' : 'markDone')}</button>
          {doseGrid(dose, phase)}<p className="text-sm text-slate-600 leading-relaxed">{exercise.tip}</p>
          {phase === 'warmup' && <p className="text-sm text-slate-500">{active.warmupNote || t(active.sessionType === 'recovery' ? 'recoveryWarmupNote' : 'warmupSequenceNote')}</p>}
          {phase === 'cooldown' && <p className="text-sm text-slate-500">{active.cooldownNote || t('cooldownSequenceNote')}</p>}
          {date > today && <p className="text-sm text-sky-700">{j('futureReadonly')}</p>}
          <ExerciseGuide id={id} exercise={exercise} lang={lang} />
          {onSaveExerciseLog && ['strength', 'accessory', 'skill'].includes(phase) && <ExerciseLog autoOpen completed={done} lang={lang} exercise={exercise} id={id} dose={dose} phase={phase} date={date} week={currentWeek} day={active.day} logs={exerciseLogs} onSave={onSaveExerciseLog} busy={loggingBusy} disabled={loggingDisabled || date > today} context={{ ...coachingContext, readiness: Object.hasOwn(coachingContext, 'readiness') ? coachingContext.readiness : readiness, today }} />}
        </section>;
      })}
    </ExerciseDetails>
    {isToday && (complete || rest) && <section data-testid="session-summary" className="panel mt-5 space-y-3"><h3 className="text-xl font-bold text-slate-800">{j('summary')}</h3><p className="text-sm text-slate-600">{rest ? j('rest') : j('finished')}</p>{!rest && <p className="text-sm text-slate-500">{j('summaryHint')}</p>}{onViewRecords && <button type="button" onClick={onViewRecords} className="button-primary">{j('records')}<ArrowRight size={16} /></button>}</section>}
    {editing && <ExercisePicker key={`${currentWeek}-${active.day}`} t={t} lang={lang} exercises={eligibleExercises} excludedIds={active.routine} selected={selected} setSelected={setSelected} onAdd={phase => onAdd(active.day, phase)} busy={saving} />}
    <div className="session-notes">
      {!editing && <details className="panel"><summary className="font-medium text-sm">{j('more')}</summary><div className="mt-4 mb-5"><WorkoutShare day={active} exercises={exercises} level={level} lang={lang} week={currentWeek} /></div><h3 className="font-semibold mb-2">{t('feedbackTitle')}</h3><p className="text-sm text-slate-500 mb-4">{t('feedbackSubtitle')}</p><div className="grid grid-cols-3 gap-2">{[[-1, 'feedbackHard'], [0, 'feedbackOk'], [1, 'feedbackEasy']].map(([value, label]) => <button key={value} disabled={busy} onClick={() => onFeedback(value)} aria-pressed={feedback === value} className={`rounded-xl p-3 text-sm border disabled:opacity-50 ${feedback === value ? 'bg-sky-50 border-sky-300 text-sky-700 font-semibold' : 'border-slate-200'}`}>{t(label)}<span className="block text-xs mt-1 text-slate-500">{t(`${label}Sub`)}</span></button>)}</div></details>}
      <details className="panel"><summary className="font-medium text-sm">{j('concept')}</summary><h3 className="font-semibold mt-4 mb-3 flex gap-2"><Feather size={17} />{active.theme}</h3><p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{active.concept}</p>{active.coachAdvice && <><h3 className="font-semibold mt-5 mb-2 flex items-center gap-2"><Brain size={17} />{j('advice')}</h3><p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{active.coachAdvice}</p></>}</details>
    </div>
  </div>;
}
