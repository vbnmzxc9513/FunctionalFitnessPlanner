import { useEffect, useId, useRef, useState } from 'react';
import ExerciseDetails from './ExerciseDetails.jsx';
import { createWorkoutSnapshot, workoutName } from '../domain/savedWorkouts.js';
import { SAVED_WORKOUTS_TEXT, savedWorkoutError } from '../savedWorkoutsLocale.js';
import './workout-sharing.css';
import './combo-save-workout.css';

const scopePhases = { warmup: ['warmup'], training: ['skill', 'strength', 'accessory'], cooldown: ['recovery', 'cooldown'] };
const doseText = (dose, en) => `${dose.sets}${en ? ' × ' : '組 × '}${dose.value} ${{ reps: en ? 'reps' : '下', seconds: en ? 'sec' : '秒', minutes: en ? 'min' : '分', breaths: en ? 'breaths' : '次呼吸' }[dose.unit]}${dose.perSide ? en ? ' / side' : '／側' : ''}`;

function SaveWorkoutForm({ store, day, exercises, level = 1, lang, onClose, onSaved, sourceItem }) {
  const t = SAVED_WORKOUTS_TEXT[lang] || SAVED_WORKOUTS_TEXT.zh, en = lang === 'en';
  const nameId = useId(), errorId = useId(), hintId = useId(), formId = useId();
  const [name, setName] = useState(sourceItem?.name || '');
  const [saveMode, setSaveMode] = useState('new');
  let baseSnapshot;
  try { baseSnapshot = createWorkoutSnapshot(day, exercises, level); } catch { /* Scoped validation below retains the error. */ }
  const sourceDoses = day.prescriptions || baseSnapshot?.prescriptions || [];
  const [scope, setScope] = useState(sourceItem?.scope || 'selection');
  const [selectedIds, setSelectedIds] = useState(day.routine);
  const [tags, setTags] = useState(sourceItem?.tags || []);
  const prescriptions = sourceDoses.filter(dose => scope === 'day' || scope === 'selection' ? scope !== 'selection' || selectedIds.includes(dose.id) : scopePhases[scope]?.includes(dose.phase));
  const scopedDay = { ...day, prescriptions, routine: prescriptions.map(dose => dose.id), sessionType: prescriptions.some(dose => ['skill', 'strength', 'accessory'].includes(dose.phase)) ? 'training' : prescriptions.length ? 'recovery' : 'rest' };
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const live = useRef(false), running = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  let snapshot, invalid;
  try { snapshot = createWorkoutSnapshot(scopedDay, exercises, level); } catch (value) { invalid = value; }
  const submit = async event => {
    event.preventDefault();
    if (running.current || invalid || !prescriptions.length || !store.loaded || store.error) return;
    running.current = true; setError(null); setPending(true);
    try {
      workoutName(name);
      const input = { name, day: scopedDay, exercises, level, scope, tags, pinned: true, contentVersion: sourceItem?.contentVersion || 1 };
      const item = saveMode === 'update' && sourceItem ? await store.update(sourceItem.id, input, sourceItem.revision) : await store.create(input);
      if (!live.current) return;
      setPending(false); running.current = false;
      onSaved?.(item); onClose();
    } catch (value) {
      if (!live.current) return;
      setError(value); setPending(false); running.current = false;
    }
  };
  const toggle = (id, checked) => {
    setSelectedIds(checked ? [...prescriptions.map(dose => dose.id), id] : prescriptions.filter(dose => dose.id !== id).map(dose => dose.id));
    setScope('selection'); setError(null);
  };
  const issue = invalid || error;
  const nameError = ['INVALID_WORKOUT_NAME', 'DUPLICATE_WORKOUT_NAME'].includes(error?.message);
  const selected = new Set(prescriptions.map(dose => dose.id));
  return <div className="save-workout-ui workout-ui combo-save-workout">
    <ExerciseDetails open title={en ? 'Save combo' : '收藏成組合'} closeLabel={t.close} onClose={() => { if (!running.current) onClose(); }}
      footer={<><div className="save-workout-footer-copy"><strong>{en ? `${prescriptions.length} exercises` : `${prescriptions.length} 個動作`}</strong><p>{en ? 'Dates stay unchanged' : '不更動日期課表'}</p></div><button type="submit" form={formId} data-testid="save-workout-confirm" className="workout-ui-primary" disabled={pending || !store.loaded || !!store.error || !!invalid || !prescriptions.length}>{pending ? t.saving : saveMode === 'update' ? en ? 'Update and pin' : '更新並釘選' : en ? 'Save and pin' : '收藏並釘選'}</button></>}>
      <form id={formId} onSubmit={submit} className="workout-ui-form">
        <div><label htmlFor={nameId}>{en ? 'Combo name' : '組合名稱'}</label>
          <input id={nameId} data-testid="save-workout-name" value={name} onChange={event => { setName(event.target.value); setError(null); }} required maxLength={80} disabled={pending} placeholder={en ? 'My lower-body strength' : '我的下肢肌力'}
            aria-invalid={nameError || undefined} aria-describedby={`${hintId}${nameError ? ` ${errorId}` : ''}`} />
          <p id={hintId} className="save-workout-name-hint"><span>{Array.from(name).length}/40</span></p></div>
        <fieldset className="combo-save-selection" disabled={pending}><legend>{en ? 'Exercises' : '動作'}<span>{prescriptions.length}/{sourceDoses.length}</span></legend>
          <div className="combo-save-select-actions"><button type="button" className="workout-ui-link" onClick={() => { setScope('selection'); setSelectedIds(sourceDoses.map(dose => dose.id)); }}>{en ? 'Select all' : '全選'}</button><button type="button" className="workout-ui-link" onClick={() => { setScope('selection'); setSelectedIds([]); }}>{en ? 'Clear' : '清除'}</button></div>
          {sourceDoses.map(dose => <label key={dose.id} className="combo-save-exercise"><input type="checkbox" data-testid={`save-workout-exercise-${dose.id}`} checked={selected.has(dose.id)} onChange={event => toggle(dose.id, event.target.checked)} /><span><strong>{exercises[dose.id]?.name || dose.id}</strong><small>{doseText(dose, en)}</small></span></label>)}
        </fieldset>
        {!prescriptions.length && <p role="status" className="workout-ui-error">{en ? 'Choose at least one exercise.' : '請至少勾選一個動作。'}</p>}
        <details className="workout-ui-fineprint combo-save-advanced"><summary>{en ? 'More options' : '更多選項'}</summary>
          <fieldset disabled={pending} className="combo-save-options"><label>{en ? 'Save scope' : '保存範圍'}<select value={scope} onChange={event => setScope(event.target.value)}>{[['selection', en ? 'Selected exercises' : '勾選的動作'], ['day', en ? 'Full day' : '整天'], ['warmup', en ? 'Warm-up' : '暖身'], ['training', en ? 'Training' : '訓練'], ['cooldown', en ? 'Cooldown' : '收操']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></fieldset>
          {sourceItem && <fieldset disabled={pending} className="save-workout-scopes"><legend>{en ? 'Edited favorite' : '修改後的收藏'}</legend><label><input type="radio" name={`${formId}-mode`} checked={saveMode === 'new'} onChange={() => setSaveMode('new')} />{en ? 'Save as new' : '另存新收藏'}</label><label><input type="radio" name={`${formId}-mode`} checked={saveMode === 'update'} onChange={() => setSaveMode('update')} />{en ? `Update ${sourceItem.name}` : `更新：${sourceItem.name}`}</label></fieldset>}
          <fieldset disabled={pending} className="save-workout-tags"><legend>{en ? 'Purpose tags' : '目的標籤'}</legend>{[...new Set(['活動度', '控制', '肌力', ...tags])].map(tag => <label key={tag}><input type="checkbox" checked={tags.includes(tag)} disabled={!tags.includes(tag) && tags.length >= 6} onChange={event => setTags(event.target.checked ? [...tags, tag] : tags.filter(value => value !== tag))} />{en ? { 活動度: 'Mobility', 控制: 'Control', 肌力: 'Strength' }[tag] || tag : tag}</label>)}</fieldset>
          <p className="workout-ui-muted">{store.scope === 'account' ? en ? 'Saved to this account. Scheduled dates stay unchanged.' : '存入目前帳號，不更動已安排日期。' : en ? 'Saved on this device. Scheduled dates stay unchanged.' : '保存在此裝置，不更動已安排日期。'}</p>
          {snapshot?.exercises.some(exercise => exercise.custom) && <p className="workout-ui-muted">{t.custom}</p>}
        </details>
        {!store.loaded && <p role="status">{t.loading}</p>}
        {(issue || store.error) && <p id={errorId} role="alert" className="workout-ui-error">{savedWorkoutError(issue || store.error, lang)}</p>}
        {store.error && <button type="button" onClick={store.reload} disabled={pending} className="workout-ui-link">{t.retry}</button>}
      </form>
    </ExerciseDetails>
  </div>;
}

export default function SaveWorkoutDialog(props) {
  if (!props.day) return null;
  const identity = JSON.stringify([props.store.scopeKey || props.store.uid || 'device', props.day, props.sourceItem?.id]);
  return <SaveWorkoutForm key={identity} {...props} />;
}
