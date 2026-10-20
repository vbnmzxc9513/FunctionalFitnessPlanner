import { useId, useState } from 'react';
import { Bookmark, ChevronDown, Pencil, Share2, Trash2, X } from 'lucide-react';
import ExerciseDetails from './ExerciseDetails.jsx';
import { workoutName } from '../domain/savedWorkouts.js';
import { SAVED_WORKOUTS_TEXT, savedWorkoutError } from '../savedWorkoutsLocale.js';

function WorkoutContents({ item, t, exercises }) {
  const { snapshot } = item;
  const doseText = dose => `${dose.sets} ${t.sets} × ${dose.value} ${t.units[dose.unit]}${dose.perSide ? ` · ${t.side}` : ''}${dose.restSeconds ? ` · ${t.rest} ${dose.restSeconds} ${t.units.seconds}` : ''}`;
  return <ol className="space-y-3 mt-4 border-t border-sky-100 pt-4">{snapshot.prescriptions.map((dose, index) => <li key={dose.id} className="text-sm">
    <p className="text-xs font-semibold text-indigo-700">{t.phases[dose.phase]}</p>
    <p className="font-semibold text-slate-800 mt-1">{index + 1}. {snapshot.exercises[index].custom ? snapshot.exercises[index].name : exercises?.[dose.id]?.name || snapshot.exercises[index].name}</p>
    <p className="text-slate-600">{doseText(dose)}</p>
    {dose.preparation && <p className="text-xs text-amber-800 mt-1">{t.preparation} · {doseText(dose.preparation)}</p>}
  </li>)}</ol>;
}

function SavedWorkoutList({ store, exercises, lang = 'zh', onUse, onShare, onClose }) {
  const t = SAVED_WORKOUTS_TEXT[lang] || SAVED_WORKOUTS_TEXT.zh;
  const titleId = useId(), nameId = useId(), nameHintId = useId(), errorId = useId();
  const [expanded, setExpanded] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const selectedDelete = store.items.find(item => item.id === deleting);
  const busy = pending || store.busy;
  const rename = async (event, item) => {
    event.preventDefault(); if (busy) return;
    setError(null); setStatus(''); setPending(true);
    try { workoutName(name); await store.rename(item.id, name, item.revision); setRenaming(null); setStatus(t.renamed); }
    catch (value) { setError(value); }
    finally { setPending(false); }
  };
  const remove = async () => {
    if (busy || !selectedDelete) return;
    setError(null); setStatus(''); setPending(true);
    try { await store.remove(selectedDelete.id, selectedDelete.revision); setDeleting(null); setStatus(t.deleted); }
    catch (value) { setError(value); }
    finally { setPending(false); }
  };
  const externalAction = async (handler, item) => {
    if (busy) return;
    setError(null); setStatus(''); setPending(true);
    try { await handler(structuredClone(item)); }
    catch (value) { setError(value); }
    finally { setPending(false); }
  };
  return <section aria-labelledby={titleId} className="space-y-5">
    <header className="flex items-start justify-between gap-3"><div><h2 id={titleId} className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Bookmark size={23} aria-hidden="true" />{t.title}</h2><p className="text-sm text-slate-500 mt-2">{store.scope === 'account' ? t.account : t.device}</p></div>
      {onClose && <button type="button" onClick={onClose} className="button-secondary shrink-0" aria-label={t.close}><X size={18} aria-hidden="true" /><span>{t.close}</span></button>}</header>
    <p className="text-sm text-slate-600">{t.privacy}</p>
    {!store.loaded && <p role="status">{t.loading}</p>}
    {store.error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800"><p>{savedWorkoutError(store.error, lang)}</p><button type="button" className="button-secondary mt-3" onClick={store.reload}>{t.retry}</button></div>}
    {error && <p id={errorId} role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{savedWorkoutError(error, lang)}</p>}
    {status && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{status}</p>}
    {store.loaded && !store.error && !store.items.length && <p className="panel text-slate-500 text-sm">{t.empty}</p>}
    <div className="space-y-4">{store.items.map(item => <article key={item.id} className="panel">
      {renaming === item.id ? <form onSubmit={event => rename(event, item)} className="space-y-3 mb-4">
        <label htmlFor={nameId} className="font-semibold text-sm block">{t.name}</label>
        <input id={nameId} value={name} onChange={event => { setName(event.target.value); setError(null); }} maxLength={80} required disabled={busy} autoFocus
          aria-describedby={`${nameHintId}${error ? ` ${errorId}` : ''}`} aria-invalid={['INVALID_WORKOUT_NAME', 'DUPLICATE_WORKOUT_NAME'].includes(error?.message) || undefined}
          className="w-full rounded-xl border border-slate-300 p-3" />
        <p id={nameHintId} className="text-xs text-slate-500">{t.nameHint}</p>
        <div className="flex gap-2 flex-wrap"><button type="submit" className="button-primary" disabled={busy}>{t.renameSave}</button><button type="button" className="button-secondary" disabled={busy} onClick={() => { setRenaming(null); setError(null); }}>{t.cancel}</button></div>
      </form> : <h3 className="font-bold text-lg text-slate-800 break-words">{item.name}</h3>}
      <p className="text-sm text-slate-500 mt-1">{item.snapshot.routine.length ? `${item.snapshot.routine.length} ${t.motions}` : t.restDay}</p>
      {item.snapshot.exercises.some(exercise => exercise.custom) && <p className="text-xs text-amber-800 mt-2">{t.custom}</p>}
      <div className="flex gap-2 flex-wrap mt-4">
        {onUse && <button type="button" disabled={busy} onClick={() => externalAction(onUse, item)} className="button-primary">{t.use}</button>}
        <button type="button" onClick={() => setExpanded(expanded === item.id ? null : item.id)} aria-expanded={expanded === item.id} className="button-secondary"><ChevronDown size={16} aria-hidden="true" />{expanded === item.id ? t.hide : t.preview}</button>
        <button type="button" disabled={busy} onClick={() => { setName(item.name); setRenaming(item.id); setError(null); setStatus(''); }} className="button-secondary" aria-label={`${t.rename} ${item.name}`}><Pencil size={16} aria-hidden="true" />{t.rename}</button>
        {onShare && <button type="button" disabled={busy} onClick={() => externalAction(onShare, item)} className="button-secondary" aria-label={`${t.share} ${item.name}`}><Share2 size={16} aria-hidden="true" />{t.share}</button>}
        <button type="button" disabled={busy} onClick={() => { setDeleting(item.id); setError(null); setStatus(''); }} className="button-secondary text-rose-700" aria-label={`${t.delete} ${item.name}`}><Trash2 size={16} aria-hidden="true" />{t.delete}</button>
      </div>
      {expanded === item.id && <WorkoutContents item={item} t={t} exercises={exercises} />}
    </article>)}</div>
    <div className="[&_.exercise-details-close]:min-h-11 [&_.exercise-details-close]:min-w-11"><ExerciseDetails open={!!selectedDelete} title={t.deleteTitle} subtitle={selectedDelete?.name || ''} closeLabel={t.cancel} onClose={() => { if (!busy) setDeleting(null); }}
      footer={<><button type="button" disabled={busy} onClick={() => setDeleting(null)} className="button-secondary">{t.cancel}</button><button type="button" disabled={busy} onClick={remove} className="button-primary bg-rose-700">{t.deleteConfirm}</button></>}>
      <p className="text-sm text-slate-600">{t.deleteHint}</p>
      {error && selectedDelete && <p role="alert" className="text-sm text-rose-800 mt-3">{savedWorkoutError(error, lang)}</p>}
    </ExerciseDetails></div>
  </section>;
}

export default function SavedWorkouts({ store, ...props }) {
  return <SavedWorkoutList key={store.scopeKey || `${store.scope}:${store.uid || 'device'}`} store={store} {...props} />;
}
