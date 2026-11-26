import ExerciseTags from './ExerciseTags.jsx';
import { useBackNavigation } from '../hooks/useBackNavigation.js';
import { useId, useState } from 'react';
import { ArrowLeft, Bookmark, CalendarPlus, ChevronRight, Clock, Layers, Pencil, Pin, Share2, Trash2 } from 'lucide-react';
import ExerciseDetails from './ExerciseDetails.jsx';
import { workoutName, savedWorkoutDay } from '../domain/savedWorkouts.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { SAVED_WORKOUTS_TEXT, savedWorkoutError } from '../i18n/savedWorkouts.js';
import './workout-sharing.css';

function PhaseTags({ item, en }) {
  const phases = item.snapshot.prescriptions.map(dose => dose.phase);
  const items = [
    ['warmup', en ? 'Warm-up' : '暖身', phases.includes('warmup')],
    ['training', en ? 'Training' : '訓練', phases.some(phase => ['skill', 'strength', 'accessory'].includes(phase))],
    ['recovery', en ? 'Recovery' : '恢復', phases.includes('recovery')],
    ['cooldown', en ? 'Cool-down' : '收操', phases.includes('cooldown')],
  ].filter(([, , present]) => present);
  if (!items.length) return null;
  return <div className="saved-phase-pills">{items.map(([key, label]) => <span key={key}>{label}</span>)}</div>;
}

function WorkoutContents({ item, t, exercises, en }) {
  const [detail, setDetail] = useState(null);
  const doseText = dose => `${dose.sets} ${t.sets} × ${dose.value} ${t.units[dose.unit]}${dose.perSide ? ` · ${t.side}` : ''}${dose.restSeconds ? ` · ${t.rest} ${dose.restSeconds} ${t.units.seconds}` : ''}`;
  const groups = [
    { name: en ? 'Warm-up' : '暖身', phases: ['warmup'] },
    { name: en ? 'Training' : '訓練', phases: ['skill', 'strength', 'accessory'] },
    { name: en ? 'Cool-down' : '收操', phases: ['recovery', 'cooldown'] },
  ].map(group => ({
    ...group,
    doses: item.snapshot.prescriptions.filter(dose => group.phases.includes(dose.phase)),
  })).filter(group => group.doses.length > 0);
  return <>
    <div className="saved-contents-card">
      {groups.map(group => (
        <section key={group.name} className="saved-contents-section">
          <div className="saved-contents-section-head">
            <h3>{group.name}</h3>
            <span>{group.doses.length} {en ? 'moves' : '項'}</span>
          </div>
          <ol className="saved-contents-list">
            {group.doses.map((dose, index) => {
              const stored = item.snapshot.exercises.find(exercise => exercise.id === dose.id);
              const exercise = stored.custom ? stored : exercises?.[dose.id] || stored;
              return (
                <li key={dose.id}>
                  <span className="saved-item-num">{index + 1}</span>
                  <div className="saved-item-body">
                    <h4>{exercise.name}</h4>
                    <ExerciseTags id={dose.id} exercise={exercise} lang={en ? 'en' : 'zh'} compact />
                    <p>{dose.sets} {t.sets} × {dose.value} {t.units[dose.unit]}{dose.perSide ? ` / ${t.side}` : ''}</p>
                  </div>
                  <button type="button" className="saved-item-detail-btn" aria-label={`${en ? 'Details' : '詳情'} ${exercise.name}`} onClick={() => setDetail({ exercise, dose })}>
                    {en ? 'Details' : '詳情'}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {!groups.length && <p className="saved-empty-inline">{t.restDay}</p>}
    </div>
    <ExerciseDetails open={!!detail} title={detail?.exercise.name || ''} closeLabel={t.close} onClose={() => setDetail(null)}>
      {detail && <div className="workout-ui-copy"><p>{doseText(detail.dose)}</p><p>{detail.exercise.tip || detail.exercise.cue || (en ? 'Follow your own instructions for this custom exercise.' : '自訂動作請依自己的動作說明執行。')}</p>{detail.dose.preparation && <p>{t.preparation} · {doseText(detail.dose.preparation)}</p>}</div>}
    </ExerciseDetails>
  </>;
}

function SavedWorkoutList({ store, exercises, lang = 'zh', onUse, onShare, onClose, onEdit }) {
  const t = SAVED_WORKOUTS_TEXT[lang] || SAVED_WORKOUTS_TEXT.zh, en = lang === 'en';
  const titleId = useId(), nameId = useId(), nameHintId = useId(), errorId = useId();
  const [selectedId, setSelectedId] = useState(null), [renaming, setRenaming] = useState(null);
  const [name, setName] = useState(''), [deleting, setDeleting] = useState(null);
  const [pending, setPending] = useState(false), [error, setError] = useState(null), [status, setStatus] = useState('');
  const sortedItems = [...store.items].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
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
  const pin = async item => { if (busy) return; setPending(true); try { await store.setPinned(item.id, !item.pinned, item.revision); setError(null); } catch (value) { setError(value); } finally { setPending(false); } };
  const externalAction = async (handler, item) => {
    if (busy) return;
    setError(null); setStatus(''); setPending(true);
    try { await handler(structuredClone(item)); } catch (value) { setError(value); } finally { setPending(false); }
  };
  const scopeLabel = item => (item.scope || 'day') === 'day'
    ? (en ? 'Daily workout' : '單日課表')
    : (en ? 'Quick combo' : '快速組合');

  return <section aria-labelledby={titleId} className="saved-workouts-shell workout-ui" data-testid="saved-workouts">
    {selected ? (
      <article data-testid="saved-workout-detail" className="saved-detail-view">
        <button type="button" className="saved-back-btn" disabled={busy} onClick={() => { setSelectedId(null); setRenaming(null); setError(null); }}>
          <ArrowLeft size={16} />
          {en ? 'Back to favorites' : '返回我的收藏'}
        </button>

        {error && <p id={errorId} role="alert" className="workout-ui-error">{savedWorkoutError(error, lang)}</p>}
        {status && <p role="status" className="workout-ui-notice">{status}</p>}

        <header className="saved-detail-hero">
          <div className="saved-detail-hero-top">
            <div className="saved-detail-badges">
              <span className="saved-scope-pill">{scopeLabel(selected)}</span>
              {selected.pinned && <span className="saved-pin-pill"><Pin size={11} />{en ? 'Pinned' : '已釘選'}</span>}
              {selected.tags?.map(tag => <span key={tag} className="saved-tag-pill">{tag}</span>)}
            </div>
            <div className="saved-detail-hero-icons">
              {store.setPinned && (
                <button
                  type="button"
                  className={`saved-icon-pill ${selected.pinned ? 'is-active' : ''}`}
                  aria-pressed={!!selected.pinned}
                  disabled={busy}
                  onClick={() => pin(selected)}
                  aria-label={selected.pinned ? (en ? 'Unpin' : '取消釘選') : (en ? 'Pin' : '釘選')}
                  title={selected.pinned ? (en ? 'Unpin' : '取消釘選') : (en ? 'Pin' : '釘選')}
                >
                  <Pin size={15} />
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                className="saved-icon-pill"
                aria-label={`${t.rename} ${selected.name}`}
                title={t.rename}
                onClick={() => { setName(selected.name); setRenaming(selected.id); setError(null); setStatus(''); }}
              >
                <Pencil size={15} />
              </button>
            </div>
          </div>

          <h2 id={titleId} className="saved-detail-title">{selected.name}</h2>

          <div className="saved-detail-meta">
            <span><Layers size={14} aria-hidden="true" />{selected.snapshot.routine.length} {t.motions}</span>
            <span><Clock size={14} aria-hidden="true" />{en ? `~${minutes(selected)} min` : `約 ${minutes(selected)} 分鐘`}</span>
          </div>
          <PhaseTags item={selected} en={en} />

          {renaming === selected.id && (
            <form onSubmit={event => rename(event, selected)} className="saved-rename-form">
              <label htmlFor={nameId}>{t.name}</label>
              <input id={nameId} value={name} onChange={event => { setName(event.target.value); setError(null); }} maxLength={80} required disabled={busy} autoFocus aria-describedby={`${nameHintId}${error ? ` ${errorId}` : ''}`} aria-invalid={['INVALID_WORKOUT_NAME', 'DUPLICATE_WORKOUT_NAME'].includes(error?.message) || undefined} />
              <p id={nameHintId} className="saved-rename-hint">{t.nameHint}</p>
              <div className="saved-rename-actions">
                <button type="submit" className="saved-btn-primary" disabled={busy}>{t.renameSave}</button>
                <button type="button" className="saved-btn-ghost" disabled={busy} onClick={() => { setRenaming(null); setError(null); }}>{t.cancel}</button>
              </div>
            </form>
          )}

          <div className="saved-detail-actions">
            {onUse && (
              <button type="button" data-testid="saved-workout-use" disabled={busy} onClick={() => externalAction(onUse, selected)} className="saved-btn-primary saved-btn-full">
                <CalendarPlus size={16} aria-hidden="true" />
                {t.use}
              </button>
            )}
            {(onEdit || onShare) && (
              <div className="saved-detail-secondary-row">
                {onEdit && (
                  <button type="button" className="saved-btn-secondary" onClick={() => onEdit(selected)} disabled={busy}>
                    <Pencil size={15} aria-hidden="true" />
                    {en ? 'Edit copy' : '修改副本'}
                  </button>
                )}
                {onShare && (
                  <button type="button" data-testid="saved-workout-share" disabled={busy} onClick={() => externalAction(onShare, selected)} className="saved-btn-secondary" aria-label={`${t.share} ${selected.name}`}>
                    <Share2 size={15} aria-hidden="true" />
                    {en ? 'Share' : '分享收藏'}
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        <WorkoutContents key={selected.id} item={selected} {...{ t, exercises, en }} />

        <div className="saved-detail-footer">
          <details className="workout-ui-fineprint">
            <summary>{en ? 'Copy & storage info' : '副本說明與儲存位置'}</summary>
            <p>{en ? 'Each scheduled date gets its own copy. Later edits will not change this saved workout or any shared copy.' : '套用後，每個日期都有自己的副本；修改某一天，不會改到這份收藏或朋友收到的分享。'}</p>
            <p>{t.privacy}</p>
            <p>{store.scope === 'account' ? t.account : t.device}</p>
            {selected.snapshot.exercises.some(exercise => exercise.custom) && <p>{t.custom}</p>}
          </details>
          <button type="button" disabled={busy} onClick={() => { setDeleting(selected.id); setError(null); setStatus(''); }} className="saved-delete-btn" aria-label={`${t.delete} ${selected.name}`}>
            <Trash2 size={15} aria-hidden="true" />
            {t.delete}
          </button>
        </div>
      </article>
    ) : (
      <div className="saved-list-view">
        {onClose ? (
          <>
            <button type="button" className="saved-back-btn" disabled={busy} onClick={onClose}>
              <ArrowLeft size={16} />
              {en ? 'Back to plans' : '返回課表'}
            </button>
            <header className="saved-standalone-head">
              <h2 id={titleId}>{t.title}</h2>
              <p>{en ? 'Save reusable routines and apply them to any date.' : '保存常用課表或動作組合，下次一鍵套用到任何日期。'}</p>
            </header>
          </>
        ) : (
          <h2 id={titleId} className="sr-only">{t.title}</h2>
        )}

        <div className="saved-list-meta-bar">
          <span>
            {en
              ? `${store.items.length} saved · ${store.scope === 'account' ? 'Synced to account' : 'Saved on this device'}`
              : `共 ${store.items.length} 份收藏 · ${store.scope === 'account' ? '帳號同步中' : '保存在這台裝置'}`}
          </span>
        </div>

        {!store.loaded && <p role="status" className="saved-status-muted">{t.loading}</p>}
        {store.error && <div role="alert" className="workout-ui-notice"><p>{savedWorkoutError(store.error, lang)}</p><button type="button" className="workout-ui-link" onClick={store.reload}>{t.retry}</button></div>}
        {error && <p id={errorId} role="alert" className="workout-ui-error">{savedWorkoutError(error, lang)}</p>}
        {status && <p role="status" className="workout-ui-notice">{status}</p>}

        {store.loaded && !store.error && !store.items.length ? (
          <div className="saved-empty-card">
            <span className="saved-empty-icon" aria-hidden="true"><Bookmark size={22} /></span>
            <h3>{en ? 'No saved workouts yet' : '還沒有收藏的課表'}</h3>
            <p>{t.empty}</p>
          </div>
        ) : (
          <div className="saved-card-list">
            {sortedItems.map(item => (
              <article key={item.id} className={`saved-card ${item.pinned ? 'is-pinned' : ''}`}>
                <button
                  type="button"
                  data-testid="saved-workout-open"
                  data-workout-id={item.id}
                  onClick={() => { setSelectedId(item.id); setError(null); setStatus(''); }}
                  className="saved-card-main"
                >
                  <span className="saved-card-avatar" aria-hidden="true">
                    {(item.scope || 'day') === 'day' ? <Bookmark size={18} /> : <Layers size={18} />}
                  </span>
                  <div className="saved-card-content">
                    <div className="saved-card-title-row">
                      <h3>{item.name}</h3>
                      {item.pinned && <span className="saved-pin-pill"><Pin size={10} />{en ? 'Pinned' : '釘選'}</span>}
                    </div>
                    <p className="saved-card-sub">
                      <span>{scopeLabel(item)}</span>
                      <span>·</span>
                      <span>{item.snapshot.routine.length ? `${item.snapshot.routine.length} ${t.motions} · ${en ? `~${minutes(item)} min` : `約 ${minutes(item)} 分鐘`}` : t.restDay}</span>
                    </p>
                    <PhaseTags item={item} en={en} />
                  </div>
                  <ChevronRight size={18} className="saved-card-chevron" aria-hidden="true" />
                </button>

                {(store.setPinned || onUse || onShare) && (
                  <div className="saved-card-footer">
                    {store.setPinned && (
                      <button
                        type="button"
                        className={`saved-footer-btn ${item.pinned ? 'is-pinned' : ''}`}
                        aria-pressed={!!item.pinned}
                        disabled={busy}
                        onClick={() => pin(item)}
                      >
                        <Pin size={14} aria-hidden="true" />
                        {item.pinned ? (en ? 'Pinned' : '已釘選') : (en ? 'Pin' : '釘選')}
                      </button>
                    )}
                    <div className="saved-card-footer-right">
                      {onShare && (
                        <button
                          type="button"
                          className="saved-footer-btn"
                          disabled={busy}
                          onClick={() => externalAction(onShare, item)}
                        >
                          <Share2 size={14} aria-hidden="true" />
                          {en ? 'Share' : '分享'}
                        </button>
                      )}
                      {onUse && (
                        <button
                          type="button"
                          className="saved-footer-btn is-apply"
                          disabled={busy}
                          onClick={() => externalAction(onUse, item)}
                        >
                          <CalendarPlus size={14} aria-hidden="true" />
                          {en ? 'Apply' : '套用日期'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <p className="saved-storage-note">{store.scope === 'account' ? t.account : t.device}</p>
      </div>
    )}

    <ExerciseDetails open={!!selectedDelete} title={t.deleteTitle} subtitle={selectedDelete?.name || ''} closeLabel={t.cancel} onClose={() => { if (!busy) setDeleting(null); }} footer={<><button type="button" disabled={busy} onClick={() => setDeleting(null)} className="button-secondary">{t.cancel}</button><button type="button" disabled={busy} onClick={remove} className="button-primary bg-rose-700">{t.deleteConfirm}</button></>}><p>{t.deleteHint}</p>{error && selectedDelete && <p role="alert" className="workout-ui-error">{savedWorkoutError(error, lang)}</p>}</ExerciseDetails>
  </section>;
}

export default function SavedWorkouts({ store, ...props }) {
  return <SavedWorkoutList key={store.scopeKey || `${store.scope}:${store.uid || 'device'}`} store={store} {...props} />;
}
