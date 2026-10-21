import { useBackNavigation } from '../hooks/useBackNavigation.js';
import { useId, useState } from 'react';
import { ArrowLeft, ChevronRight, Share2, Trash2 } from 'lucide-react';
import ExerciseDetails from './ExerciseDetails.jsx';
import { workoutName, savedWorkoutDay } from '../domain/savedWorkouts.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { SAVED_WORKOUTS_TEXT, savedWorkoutError } from '../savedWorkoutsLocale.js';
import './workout-sharing.css';

function PhaseTags({ item, en }) {
  const phases = item.snapshot.prescriptions.map(dose => dose.phase);
  return <div className="workout-ui-tags">{[
    ['warmup', en ? 'Warm-up' : '暖身', phases.includes('warmup')],
    ['training', en ? 'Training' : '訓練', phases.some(phase => ['skill', 'strength', 'accessory'].includes(phase))],
    ['recovery', en ? 'Recovery' : '恢復', phases.includes('recovery')],
    ['cooldown', en ? 'Cool-down' : '收操', phases.includes('cooldown')],
  ].filter(([, , present]) => present).map(([key, label]) => <span key={key}>{label}</span>)}</div>;
}

function WorkoutContents({ item, t, exercises, en }) {
  const [detail, setDetail] = useState(null);
  const doseText = dose => `${dose.sets} ${t.sets} × ${dose.value} ${t.units[dose.unit]}${dose.perSide ? ` · ${t.side}` : ''}${dose.restSeconds ? ` · ${t.rest} ${dose.restSeconds} ${t.units.seconds}` : ''}`;
  const groups = [
    { name: en ? 'Warm-up' : '暖身', phases: ['warmup'] },
    { name: en ? 'Training' : '訓練', phases: ['skill', 'strength', 'accessory'] },
    { name: en ? 'Cool-down' : '收操', phases: ['recovery', 'cooldown'] },
  ].filter(group => item.snapshot.prescriptions.some(dose => group.phases.includes(dose.phase)));
  return <><div className="workout-ui-card workout-library-contents">{groups.map(group => <section key={group.name}>
    <h3>{group.name}</h3><ol>{item.snapshot.prescriptions.filter(dose => group.phases.includes(dose.phase)).map((dose, index) => {
      const stored = item.snapshot.exercises.find(exercise => exercise.id === dose.id);
      const exercise = stored.custom ? stored : exercises?.[dose.id] || stored;
      return <li key={dose.id}><span className="workout-ui-number">{index + 1}</span><div><h4>{exercise.name}</h4><p>{dose.sets} {t.sets} × {dose.value} {t.units[dose.unit]}{dose.perSide ? ` / ${t.side}` : ''}</p></div><button type="button" className="workout-ui-link" aria-label={`${en ? 'Details' : '詳情'} ${exercise.name}`} onClick={() => setDetail({ exercise, dose })}>{en ? 'Details' : '詳情'}</button></li>;
    })}</ol>
  </section>)}{!groups.length && <p>{t.restDay}</p>}</div>
    <ExerciseDetails open={!!detail} title={detail?.exercise.name || ''} closeLabel={t.close} onClose={() => setDetail(null)}>
      {detail && <div className="workout-ui-copy"><p>{doseText(detail.dose)}</p><p>{detail.exercise.tip || detail.exercise.cue || (en ? 'Follow your own instructions for this custom exercise.' : '自訂動作請依自己的動作說明執行。')}</p>{detail.dose.preparation && <p>{t.preparation} · {doseText(detail.dose.preparation)}</p>}</div>}
    </ExerciseDetails></>;
}

function SavedWorkoutList({ store, exercises, lang = 'zh', onUse, onShare, onClose }) {
  const t = SAVED_WORKOUTS_TEXT[lang] || SAVED_WORKOUTS_TEXT.zh, en = lang === 'en';
  const titleId = useId(), nameId = useId(), nameHintId = useId(), errorId = useId();
  const [selectedId, setSelectedId] = useState(null), [renaming, setRenaming] = useState(null);
  const [name, setName] = useState(''), [deleting, setDeleting] = useState(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(null), [status, setStatus] = useState('');
  const selected = store.items.find(item => item.id === selectedId);
  const selectedDelete = store.items.find(item => item.id === deleting);
  const busy = pending || store.busy;
  useBackNavigation(!!selected, () => { if (!busy) { setSelectedId(null); setError(null); } }, 40);
  useBackNavigation(!!renaming, () => { if (!busy) { setRenaming(null); setError(null); } }, 50);
  useBackNavigation(!!deleting, () => { if (!busy) { setDeleting(null); setError(null); } }, 100);
  const minutes = item => estimateSessionMinutes(savedWorkoutDay(item, lang), { ...Object.fromEntries(item.snapshot.exercises.map(exercise => [exercise.id, exercise])), ...exercises });
  const rename = async (event, item) => {
    event.preventDefault(); if (busy) return;
    setError(null); setStatus(''); setPending(true);
    try { workoutName(name); await store.rename(item.id, name, item.revision); setRenaming(null); setStatus(t.renamed); }
    catch (value) { setError(value); } finally { setPending(false); }
  };
  const remove = async () => {
    if (busy || !selectedDelete) return;
    setError(null); setStatus(''); setPending(true);
    try { await store.remove(selectedDelete.id, selectedDelete.revision); setDeleting(null); setSelectedId(null); setStatus(t.deleted); }
    catch (value) { setError(value); } finally { setPending(false); }
  };
  const externalAction = async (handler, item) => {
    if (busy) return;
    setError(null); setStatus(''); setPending(true);
    try { await handler(structuredClone(item)); } catch (value) { setError(value); } finally { setPending(false); }
  };
  return <section aria-labelledby={titleId} className="workout-library workout-ui" data-testid="saved-workouts">
    {(selected || onClose) && <button type="button" className="workout-ui-back" disabled={busy} onClick={selected ? () => { setSelectedId(null); setRenaming(null); setError(null); } : onClose}><ArrowLeft size={18} />{selected ? en ? 'My saved workouts' : '我的課表' : en ? 'Back to plans' : '返回課表'}</button>}
    <header className="workout-ui-heading"><h2 id={titleId}>{selected?.name || (en ? t.title : '我的課表')}</h2><p>{selected ? `${selected.snapshot.routine.length} ${t.motions} · ${minutes(selected)} ${en ? 'min' : '分鐘'}` : en ? 'Save a routine, then choose dates next time.' : '收藏好的安排，下次直接選日期使用。'}</p></header>
    {!store.loaded && <p role="status">{t.loading}</p>}
    {store.error && <div role="alert" className="workout-ui-notice"><p>{savedWorkoutError(store.error, lang)}</p><button type="button" className="workout-ui-link" onClick={store.reload}>{t.retry}</button></div>}
    {error && <p id={errorId} role="alert" className="workout-ui-error">{savedWorkoutError(error, lang)}</p>}
    {status && <p role="status" className="workout-ui-notice">{status}</p>}
    {selected ? <article data-testid="saved-workout-detail" className="workout-library-detail">
      <div className="workout-library-status"><span className="workout-ui-badge">{en ? 'Saved copy · no date assigned' : '已收藏・尚未指定日期'}</span><button type="button" disabled={busy} className="workout-ui-link" aria-label={`${t.rename} ${selected.name}`} onClick={() => { setName(selected.name); setRenaming(selected.id); setError(null); setStatus(''); }}>{t.rename}</button></div>
      {renaming === selected.id && <form onSubmit={event => rename(event, selected)} className="workout-ui-card workout-ui-form">
        <label htmlFor={nameId}>{t.name}</label><input id={nameId} value={name} onChange={event => { setName(event.target.value); setError(null); }} maxLength={80} required disabled={busy} autoFocus aria-describedby={`${nameHintId}${error ? ` ${errorId}` : ''}`} aria-invalid={['INVALID_WORKOUT_NAME', 'DUPLICATE_WORKOUT_NAME'].includes(error?.message) || undefined} />
        <p id={nameHintId} className="workout-ui-muted">{t.nameHint}</p><div className="workout-ui-inline"><button type="submit" className="workout-ui-primary" disabled={busy}>{t.renameSave}</button><button type="button" className="workout-ui-link" disabled={busy} onClick={() => { setRenaming(null); setError(null); }}>{t.cancel}</button></div>
      </form>}
      {onShare && <button type="button" data-testid="saved-workout-share" disabled={busy} onClick={() => externalAction(onShare, selected)} className="workout-ui-secondary workout-library-share" aria-label={`${t.share} ${selected.name}`}><Share2 size={19} />{en ? 'Share this workout' : '分享這份課表'}</button>}
      <WorkoutContents key={selected.id} item={selected} {...{ t, exercises, en }} />
      <p className="workout-ui-muted">{en ? 'Each scheduled date gets its own copy. Later edits will not change this saved workout or any shared copy.' : '套用後，每個日期都有自己的副本；修改某一天，不會改到這份收藏或朋友收到的分享。'}</p>
      <details className="workout-ui-fineprint"><summary>{en ? 'What is saved' : '收藏內容與儲存位置'}</summary><p>{t.privacy}</p><p>{store.scope === 'account' ? t.account : t.device}</p>{selected.snapshot.exercises.some(exercise => exercise.custom) && <p>{t.custom}</p>}</details>
      <button type="button" disabled={busy} onClick={() => { setDeleting(selected.id); setError(null); setStatus(''); }} className="workout-ui-link workout-ui-danger" aria-label={`${t.delete} ${selected.name}`}><Trash2 size={16} />{t.delete}</button>
      {onUse && <footer className="workout-ui-actionbar"><div><strong>{en ? 'A copy of this day' : '單日課表副本'}</strong><p>{en ? 'Choose dates next; nothing is saved yet.' : '下一步先選日期，不會立刻寫入'}</p></div><button type="button" data-testid="saved-workout-use" disabled={busy} onClick={() => externalAction(onUse, selected)} className="workout-ui-primary">{t.use}</button></footer>}
    </article> : <>
      <p className="workout-ui-muted">{store.items.length} {en ? 'saved workouts' : '份課表'} · {store.scope === 'account' ? en ? 'Saved to this account' : '目前帳號已保存' : en ? 'Saved on this device' : '這台裝置已保存'}</p>
      {store.loaded && !store.error && !store.items.length && <p className="workout-ui-card workout-ui-muted">{t.empty}</p>}
      <div className="workout-library-cards">{store.items.map(item => <article key={item.id} className="workout-ui-card"><button type="button" data-testid="saved-workout-open" data-workout-id={item.id} onClick={() => { setSelectedId(item.id); setError(null); setStatus(''); }} className="workout-library-open"><div><h3>{item.name}</h3><p>{item.snapshot.routine.length ? `${item.snapshot.routine.length} ${t.motions} · ${minutes(item)} ${en ? 'min' : '分鐘'}` : t.restDay}</p><PhaseTags item={item} en={en} /></div><ChevronRight size={23} aria-hidden="true" /></button></article>)}</div>
      <p className="workout-ui-muted">{store.scope === 'account' ? t.account : t.device}</p>
    </>}
    <ExerciseDetails open={!!selectedDelete} title={t.deleteTitle} subtitle={selectedDelete?.name || ''} closeLabel={t.cancel} onClose={() => { if (!busy) setDeleting(null); }} footer={<><button type="button" disabled={busy} onClick={() => setDeleting(null)} className="button-secondary">{t.cancel}</button><button type="button" disabled={busy} onClick={remove} className="button-primary bg-rose-700">{t.deleteConfirm}</button></>}><p>{t.deleteHint}</p>{error && selectedDelete && <p role="alert" className="workout-ui-error">{savedWorkoutError(error, lang)}</p>}</ExerciseDetails>
  </section>;
}

export default function SavedWorkouts({ store, ...props }) {
  return <SavedWorkoutList key={store.scopeKey || `${store.scope}:${store.uid || 'device'}`} store={store} {...props} />;
}
