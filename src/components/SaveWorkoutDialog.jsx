import { useId, useState } from 'react';
import ExerciseDetails from './ExerciseDetails.jsx';
import { createWorkoutSnapshot, workoutName } from '../domain/savedWorkouts.js';
import { SAVED_WORKOUTS_TEXT, savedWorkoutError } from '../savedWorkoutsLocale.js';

function SaveWorkoutForm({ store, day, exercises, level = 1, lang, onClose, onSaved }) {
  const t = SAVED_WORKOUTS_TEXT[lang] || SAVED_WORKOUTS_TEXT.zh;
  const nameId = useId(), errorId = useId(), hintId = useId(), formId = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  let snapshot, invalid;
  try { snapshot = createWorkoutSnapshot(day, exercises, level); } catch (value) { invalid = value; }
  const submit = async event => {
    event.preventDefault();
    if (pending || store.busy || invalid) return;
    setError(null); setPending(true);
    let item;
    try { workoutName(name); item = await store.create({ name, day, exercises, level }); }
    catch (value) { setError(value); setPending(false); return; }
    setPending(false); onSaved?.(item); onClose();
  };
  const issue = invalid || error;
  const nameError = ['INVALID_WORKOUT_NAME', 'DUPLICATE_WORKOUT_NAME'].includes(error?.message);
  return <div className="[&_.exercise-details-close]:min-h-11 [&_.exercise-details-close]:min-w-11">
    <ExerciseDetails open title={t.saveTitle} subtitle={store.scope === 'account' ? t.account : t.device} closeLabel={t.close} onClose={() => { if (!pending) onClose(); }}
      footer={<><button type="button" className="button-secondary" disabled={pending} onClick={onClose}>{t.cancel}</button><button type="submit" form={formId} className="button-primary" disabled={pending || store.busy || !store.loaded || !!store.error || !!invalid}>{pending ? t.saving : t.save}</button></>}>
      <form id={formId} onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-600">{t.privacy}</p>
        {snapshot?.exercises.some(exercise => exercise.custom) && <p className="text-sm rounded-xl bg-amber-50 p-3 text-amber-800">{t.custom}</p>}
        <div><label htmlFor={nameId} className="block font-semibold text-sm mb-2">{t.name}</label>
          <input id={nameId} value={name} onChange={event => { setName(event.target.value); setError(null); }} required maxLength={80} disabled={pending}
            aria-invalid={nameError || undefined} aria-describedby={`${hintId}${nameError ? ` ${errorId}` : ''}`} className="w-full rounded-xl border border-slate-300 px-3 py-3" />
          <p id={hintId} className="text-xs text-slate-500 mt-2">{t.nameHint} ({Array.from(name).length}/40)</p></div>
        {!store.loaded && <p role="status">{t.loading}</p>}
        {(issue || store.error) && <p id={errorId} role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{savedWorkoutError(issue || store.error, lang)}</p>}
        {store.error && <button type="button" onClick={store.reload} disabled={pending} className="button-secondary">{t.retry}</button>}
      </form>
    </ExerciseDetails>
  </div>;
}

export default function SaveWorkoutDialog(props) {
  if (!props.day) return null;
  return <SaveWorkoutForm key={`${props.store.scopeKey || props.store.uid || 'device'}:${props.day.date || props.day.day || ''}`} {...props} />;
}
