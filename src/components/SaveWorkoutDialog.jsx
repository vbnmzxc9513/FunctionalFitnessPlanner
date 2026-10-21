import { useId, useState } from 'react';
import ExerciseDetails from './ExerciseDetails.jsx';
import { createWorkoutSnapshot, workoutName } from '../domain/savedWorkouts.js';
import { SAVED_WORKOUTS_TEXT, savedWorkoutError } from '../savedWorkoutsLocale.js';
import './workout-sharing.css';

function SaveWorkoutForm({ store, day, exercises, level = 1, lang, onClose, onSaved }) {
  const t = SAVED_WORKOUTS_TEXT[lang] || SAVED_WORKOUTS_TEXT.zh, en = lang === 'en';
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
  const counts = snapshot?.prescriptions.reduce((result, dose) => { const group = dose.phase === 'warmup' ? 'warmup' : dose.phase === 'cooldown' ? 'cooldown' : dose.phase === 'recovery' ? 'recovery' : 'training'; result[group] = (result[group] || 0) + 1; return result; }, {}) || {};
  return <div className="save-workout-ui workout-ui">
    <ExerciseDetails open title={en ? 'Save this day as a workout' : '把這天收藏成課表'} closeLabel={t.close} onClose={() => { if (!pending) onClose(); }}
      footer={<><div className="save-workout-footer-copy"><strong>{en ? 'A reusable copy' : '建立可重複使用的副本'}</strong><p>{en ? 'Scheduled dates stay unchanged' : '不更動原日期安排'}</p></div><button type="submit" form={formId} data-testid="save-workout-confirm" className="workout-ui-primary" disabled={pending || store.busy || !store.loaded || !!store.error || !!invalid}>{pending ? t.saving : en ? 'Save to my workouts' : '儲存到我的課表'}</button></>}>
      <form id={formId} onSubmit={submit} className="workout-ui-form">
        <p className="workout-ui-muted">{en ? 'For example: Full-body strength A, or pre-court warm-up.' : '例如：全身肌力 A、球日前動態暖身。'}</p>
        <div><label htmlFor={nameId}>{t.name}</label>
          <input id={nameId} value={name} onChange={event => { setName(event.target.value); setError(null); }} required maxLength={80} disabled={pending}
            aria-invalid={nameError || undefined} aria-describedby={`${hintId}${nameError ? ` ${errorId}` : ''}`} />
          <p id={hintId} className="save-workout-name-hint">{t.nameHint}<span>{Array.from(name).length}/40</span></p></div>
        <section className="workout-ui-card"><h4>{en ? 'Saved together' : '會一起保存'}</h4><div className="workout-ui-tags">{Object.entries(counts).map(([key, count]) => <span key={key}>{{ warmup: en ? 'Warm-up' : '暖身', training: en ? 'Training' : '訓練', recovery: en ? 'Recovery' : '恢復', cooldown: en ? 'Cool-down' : '收操' }[key]} {count} {en ? '' : '項'}</span>)}</div><p className="workout-ui-muted">{t.privacy}</p></section>
        <p className="workout-ui-info">{en ? 'This is an independent copy. Later changes to the scheduled day will not change it, and saving does not mark it complete.' : '收藏是一份獨立副本。這天之後改課表，不會連動修改收藏；收藏也不會被標成已完成。'}</p>
        <details className="workout-ui-fineprint"><summary>{en ? 'Storage location' : '儲存位置'}</summary><p>{store.scope === 'account' ? t.account : t.device}</p>{snapshot?.exercises.some(exercise => exercise.custom) && <p>{t.custom}</p>}</details>
        {!store.loaded && <p role="status">{t.loading}</p>}
        {(issue || store.error) && <p id={errorId} role="alert" className="workout-ui-error">{savedWorkoutError(issue || store.error, lang)}</p>}
        {store.error && <button type="button" onClick={store.reload} disabled={pending} className="workout-ui-link">{t.retry}</button>}
      </form>
    </ExerciseDetails>
  </div>;
}

export default function SaveWorkoutDialog(props) {
  if (!props.day) return null;
  return <SaveWorkoutForm key={`${props.store.scopeKey || props.store.uid || 'device'}:${props.day.date || props.day.day || ''}`} {...props} />;
}
