import { useId, useState } from 'react';
import ExerciseDetails from './ExerciseDetails.jsx';
import { createWorkoutSnapshot, workoutName } from '../domain/savedWorkouts.js';
import { SAVED_WORKOUTS_TEXT, savedWorkoutError } from '../savedWorkoutsLocale.js';
import './workout-sharing.css';

function SaveWorkoutForm({ store, day, exercises, level = 1, lang, onClose, onSaved, sourceItem }) {
  const t = SAVED_WORKOUTS_TEXT[lang] || SAVED_WORKOUTS_TEXT.zh, en = lang === 'en';
  const nameId = useId(), errorId = useId(), hintId = useId(), formId = useId();
  const [name, setName] = useState(sourceItem?.name || '');
  const [saveMode, setSaveMode] = useState('new');
  let baseSnapshot;
  try { baseSnapshot = createWorkoutSnapshot(day, exercises, level); } catch { /* Reported by the scoped snapshot validation below. */ }
  const sourceDoses = day.prescriptions || baseSnapshot?.prescriptions || [];
  const [scope, setScope] = useState(sourceItem?.scope || 'day');
  const [selectedIds, setSelectedIds] = useState(day.routine);
  const [tags, setTags] = useState(sourceItem?.tags || []);
  const scopePhases = { warmup: ['warmup'], training: ['skill', 'strength', 'accessory'], cooldown: ['recovery', 'cooldown'] };
  const prescriptions = sourceDoses.filter(dose => scope === 'day' || scope === 'selection' ? scope !== 'selection' || selectedIds.includes(dose.id) : scopePhases[scope].includes(dose.phase));
  const scopedDay = { ...day, prescriptions, routine: prescriptions.map(dose => dose.id), sessionType: prescriptions.some(dose => ['skill', 'strength', 'accessory'].includes(dose.phase)) ? 'training' : prescriptions.length ? 'recovery' : 'rest' };
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  let snapshot, invalid;
  try { snapshot = createWorkoutSnapshot(scopedDay, exercises, level); } catch (value) { invalid = value; }
  const submit = async event => {
    event.preventDefault();
    if (pending || store.busy || invalid) return;
    setError(null); setPending(true);
    let item;
    try { workoutName(name); item = saveMode === 'update' && sourceItem ? await store.update(sourceItem.id, { name, day: scopedDay, exercises, level, scope, tags, contentVersion: sourceItem.contentVersion || 1 }, sourceItem.revision) : await store.create({ name, day: scopedDay, exercises, level, scope, tags, contentVersion: 1 }); }
    catch (value) { setError(value); setPending(false); return; }
    setPending(false); onSaved?.(item); onClose();
  };
  const issue = invalid || error;
  const nameError = ['INVALID_WORKOUT_NAME', 'DUPLICATE_WORKOUT_NAME'].includes(error?.message);
  const counts = snapshot?.prescriptions.reduce((result, dose) => { const group = dose.phase === 'warmup' ? 'warmup' : dose.phase === 'cooldown' ? 'cooldown' : dose.phase === 'recovery' ? 'recovery' : 'training'; result[group] = (result[group] || 0) + 1; return result; }, {}) || {};
  return <div className="save-workout-ui workout-ui">
    <ExerciseDetails open title={en ? 'Save to my favorites' : '存入我的收藏'} closeLabel={t.close} onClose={() => { if (!pending) onClose(); }}
      footer={<><div className="save-workout-footer-copy"><strong>{en ? 'A reusable copy' : '建立可重複使用的副本'}</strong><p>{en ? 'Scheduled dates stay unchanged' : '不更動原日期安排'}</p></div><button type="submit" form={formId} data-testid="save-workout-confirm" className="workout-ui-primary" disabled={pending || store.busy || !store.loaded || !!store.error || !!invalid || !prescriptions.length}>{pending ? t.saving : en ? 'Save to my favorites' : '存入我的收藏'}</button></>}>
      <form id={formId} onSubmit={submit} className="workout-ui-form">
        {sourceItem && <fieldset className="save-workout-scopes"><legend>{en ? 'Save this edited copy' : '保存修改後的副本'}</legend><label><input type="radio" name={`${formId}-mode`} checked={saveMode === 'new'} onChange={() => setSaveMode('new')} />{en ? 'Save as a new favorite' : '另存新收藏'}</label><label><input type="radio" name={`${formId}-mode`} checked={saveMode === 'update'} onChange={() => setSaveMode('update')} />{en ? `Update ${sourceItem.name}` : `更新這份收藏：${sourceItem.name}`}</label><p className="workout-ui-muted">{en ? 'Scheduled dates and shared copies stay independent.' : '已安排日期與分享副本保持獨立，不會連動更新。'}</p></fieldset>}
        <fieldset className="save-workout-scopes"><legend>{en ? 'Save scope' : '保存範圍'}</legend>{[['day', en ? 'Full day' : '整天'], ['warmup', en ? 'Warm-up' : '暖身'], ['training', en ? 'Training' : '訓練'], ['cooldown', en ? 'Cooldown' : '收操'], ['selection', en ? 'Select exercises' : '勾選動作']].map(([value, label]) => <label key={value}><input type="radio" name={`${formId}-scope`} value={value} checked={scope === value} onChange={() => setScope(value)} />{label}</label>)}</fieldset>
        {scope === 'selection' && <fieldset><legend>{en ? 'Exercises to save' : '要保存的動作'}</legend>{sourceDoses.map(dose => <label key={dose.id} className="quick-check"><input type="checkbox" checked={selectedIds.includes(dose.id)} onChange={event => setSelectedIds(event.target.checked ? [...selectedIds, dose.id] : selectedIds.filter(id => id !== dose.id))} />{exercises[dose.id]?.name || dose.id}</label>)}</fieldset>}
        {!prescriptions.length && <p role="status" className="workout-ui-error">{en ? 'Choose at least one exercise to save.' : '請選擇至少一個動作保存。'}</p>}
        <p className="workout-ui-muted">{en ? 'For example: Full-body strength A, or pre-court warm-up.' : '例如：全身肌力 A、球日前動態暖身。'}</p>
        <div><label htmlFor={nameId}>{t.name}</label>
          <input id={nameId} value={name} onChange={event => { setName(event.target.value); setError(null); }} required maxLength={80} disabled={pending}
            aria-invalid={nameError || undefined} aria-describedby={`${hintId}${nameError ? ` ${errorId}` : ''}`} />
          <p id={hintId} className="save-workout-name-hint">{t.nameHint}<span>{Array.from(name).length}/40</span></p></div>
        <fieldset className="save-workout-tags"><legend>{en ? 'Purpose tags' : '目的標籤'}</legend>{['活動度', '控制', '肌力'].map(tag => <label key={tag}><input type="checkbox" checked={tags.includes(tag)} disabled={!tags.includes(tag) && tags.length >= 6} onChange={event => setTags(event.target.checked ? [...tags, tag] : tags.filter(value => value !== tag))} />{en ? { 活動度: 'Mobility', 控制: 'Control', 肌力: 'Strength' }[tag] : tag}</label>)}</fieldset>
        <p className="workout-ui-info">{store.scope === 'account' ? en ? 'Will save and sync to this account after success.' : '成功後儲存並同步到目前帳號。' : en ? 'Will save on this device.' : '將儲存在這台裝置。'}</p>
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
