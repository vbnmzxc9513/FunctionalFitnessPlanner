import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Search, Pin, X, Sparkles, Dumbbell, Plus, Check, ChevronRight } from 'lucide-react';
import { useBackNavigation } from '../hooks/useBackNavigation.js';
import { getQuickWorkouts, expandLegacyWarmup } from '../domain/quickWorkouts.js';
import { savedWorkoutDay } from '../domain/savedWorkouts.js';
import { previewQuickWorkout, applyQuickWorkout } from '../domain/quickWorkoutDraft.js';
import { addManualExercises, createManualSession, manualPlannerErrorMessage } from '../domain/manualPlanner.js';
import { exercisePhase } from '../domain/phases.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { exerciseSelection, selectionReason } from '../domain/exerciseSelection.js';
import { manualPlanningExercises } from '../domain/templatePlanner.js';
import CreateExerciseDialog from './CreateExerciseDialog.jsx';
import ExerciseDetails from './ExerciseDetails.jsx';
import ExerciseGuide from './ExerciseGuide.jsx';
import './manual-planner.css';
import ExerciseTags, { BodyPartFilter } from './ExerciseTags.jsx';
import { matchesBodyPart, exerciseTags } from '../domain/exerciseTags.js';

const phaseLabel = (phase, en) => ({ warmup: en ? 'Warm-up' : '暖身', skill: en ? 'Skill' : '技能', strength: en ? 'Training' : '訓練', accessory: en ? 'Accessory' : '輔助', recovery: en ? 'Recovery' : '恢復', cooldown: en ? 'Cooldown' : '收操' }[phase]);
const doseText = (dose, en) => `${dose.sets} ${en ? 'sets' : '組'} × ${dose.value} ${{ reps: en ? 'reps' : '下', seconds: en ? 'sec' : '秒', minutes: en ? 'min' : '分鐘', breaths: en ? 'breaths' : '次呼吸' }[dose.unit]}${dose.perSide ? en ? ' / side' : '／側' : ''}`;
export default function QuickWorkoutPicker({ session, exercises, eligibleExercises, store, lang = 'zh', dailyTime = 240, context = {}, phase, onApply, onCancel, compact = false, onOpen, initialSelected = null, onConfigure, onUndo, canUndo, initialTab = 'combos', onCreateExercise, createScope = 'device', t }) {
  const en = lang === 'en', id = useId(), heading = useRef(null), panel = useRef(null);
  const [tab, setTab] = useState(initialTab), [query, setQuery] = useState(''), [region, setRegion] = useState('all');
  const [creating, setCreating] = useState(false), [visibleCount, setVisibleCount] = useState(12);
  const [storeError, setStoreError] = useState('');
  const [selected, setSelected] = useState(initialSelected), [duplicates, setDuplicates] = useState({}), [mode, setMode] = useState('append'), [replaceScope, setReplaceScope] = useState(phase || 'day');
  const [confirmed, setConfirmed] = useState(false), [excluded, setExcluded] = useState([]), [partial, setPartial] = useState(false), [detail, setDetail] = useState(null), [legacyConfirmed, setLegacyConfirmed] = useState(false);
  useEffect(() => {
    if (compact) return;
    const opener = document.activeElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; panel.current?.showModal(); heading.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = previous; if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [compact]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [feedback, setFeedback] = useState('');
  const [initialOrder] = useState(() => [...(store?.items || [])].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0)).map(item => item.id));
  const [expandedCards, setExpandedCards] = useState({});
  const back = () => { if (selected) setSelected(null); else onCancel(); };
  useBackNavigation(!compact, back, 65);
  const mine = (store?.items || []).map(item => ({ ...savedWorkoutDay(item, lang), id: item.id, name: item.name, tags: item.tags || [], scope: item.scope || 'day', version: item.contentVersion || 1, saved: true, revision: item.revision, pinned: item.pinned, lastUsedAt: item.lastUsedAt })).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  const builtins = getQuickWorkouts(lang).sort((a, b) => Number(b.id === 'daily-warmup') - Number(a.id === 'daily-warmup'));
  const matches = workout => (region === 'all' || workout.routine.some(value => matchesBodyPart(value, exercises[value], region))) && [workout.name, workout.description, ...(workout.tags || []), ...workout.routine.flatMap(value => [exercises[value]?.name || '', ...exerciseTags(value, exercises[value], lang)])].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase());
  const orderedMine = compact ? mine : [...mine].sort((a, b) => { const rank = item => initialOrder.includes(item.id) ? initialOrder.indexOf(item.id) : initialOrder.length; return rank(a) - rank(b); });
  const cards = [...orderedMine, ...builtins].filter(matches);
  const singleCandidates = exerciseSelection(exercises, eligibleExercises, { query, region, context, lang });
  const changeRegion = value => { setRegion(value); setVisibleCount(12); };
  const emptyResults = <div className="combo-first-no-results" role="status"><p>{en ? 'No matching items' : '沒有符合項目'}</p><button type="button" className="manual-text-action" data-testid="combo-clear-filters" onClick={() => { setQuery(''); changeRegion('all'); }}>{en ? 'Clear filters' : '清除篩選'}</button></div>;
  const preview = selected ? previewQuickWorkout(session, selected, { exercises, eligibleExercises, duplicateChoices: duplicates, mode, replaceScope, excludedIds: excluded, dailyTime, context, lang }) : null;
  const shortDate = `${Number(session.date.slice(5, 7))}/${Number(session.date.slice(8))}`;
  const destinationLabel = new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${session.date}T12:00:00Z`)).replace(/[（）()]/g, '').replace(/週([一二三四五六日])/, '（$1）');
  const select = workout => { setSelected(workout); setDuplicates({}); setMode('append'); setConfirmed(false); setExcluded([]); setPartial(false); setLegacyConfirmed(false); };
  const count = preview?.changedCount || 0;
  const recordUse = workout => {
    if (workout.saved && store?.markUsed) Promise.resolve().then(() => store.markUsed(workout.id, workout.revision)).catch(() => {
      if (mounted.current) setStoreError(en ? 'Added to draft. Recent-use sync failed; your favorite is unchanged.' : '已加入草稿；最近使用紀錄同步失敗，收藏內容未變更。');
    });
  };
  const commit = (result, workout) => {
    onApply(result);
    setFeedback(en ? `Added ${result.addedCount}${result.keptCount ? ` · ${result.keptCount} duplicates kept` : ''}` : `新增 ${result.addedCount}${result.keptCount ? `，${result.keptCount} 個重複保留原設定` : ''}`);
    setSelected(null); setStoreError(''); recordUse(workout);
  };
  const directAdd = workout => {
    try {
      const next = previewQuickWorkout(session, workout, { exercises, eligibleExercises, dailyTime, context, lang });
      if (!next.canApply || workout.routine.some(value => ['bf_A12', 'bf_A13'].includes(value))) { if (compact) onOpen(workout); else select(workout); return; }
      if (!next.changedCount) { setFeedback(en ? 'Already in this draft; existing doses kept.' : '已在課表，保留原劑量。'); return; }
      commit(applyQuickWorkout(next), workout);
    } catch (problem) { setStoreError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const apply = () => { try { commit(applyQuickWorkout(preview, { confirmReplacement: confirmed, confirmPartial: partial }), selected); } catch (problem) { setStoreError(manualPlannerErrorMessage(problem, lang, exercises)); } };
  const addSingle = (value, exercise) => {
    try {
      const inferredPhase = exercisePhase({ sessionType: 'training' }, value, exercise);
      const workout = addManualExercises(createManualSession(session.date, lang), [value], { exercises, eligibleExercises, phase: inferredPhase, lang });
      directAdd({ ...workout, id: value, name: exercise.name });
    } catch (problem) { setStoreError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const createAndAdd = async input => {
    const saved = await onCreateExercise(input);
    if (!mounted.current) return;
    const nextExercises = { ...exercises, [saved.id]:saved.exercise };
    const nextEligible = manualPlanningExercises(nextExercises,context);
    setTab('exercises'); setQuery(saved.exercise.name); changeRegion('all');
    if (!nextEligible[saved.id]) { setStoreError(en ? 'Saved to your library. Review equipment and restrictions before adding.' : '已儲存到動作庫；請確認器材與限制後再加入。'); return; }
    const workout = addManualExercises(createManualSession(session.date,lang),[saved.id],{ exercises:nextExercises, eligibleExercises:nextEligible, phase:exercisePhase({},saved.id,saved.exercise), lang });
    const preview = previewQuickWorkout(session,workout,{ exercises:nextExercises, eligibleExercises:nextEligible, dailyTime, context, lang });
    if (!preview.canApply) { select({ ...workout, id:saved.id, name:saved.exercise.name }); return; }
    commit(applyQuickWorkout(preview),workout);
  };
  const pin = async workout => { try { await store.setPinned(workout.id, !workout.pinned, workout.revision); setStoreError(''); } catch { setStoreError(en ? 'Could not save pin. Retry.' : '無法儲存釘選，請重試。'); } };
  const conflictReason = conflict => { const reasons = conflict.reasons?.length ? conflict.reasons : [{ code: 'manual_unavailable' }]; return reasons.map(issue => ({ missing: en ? 'Exercise not found' : '找不到這個動作', deleted: en ? 'Exercise was deleted' : '動作已刪除', disabled: en ? 'Exercise is disabled' : '動作已停用', advanced: en ? 'Requires more experience than beginner' : '此動作不適用目前初學者設定', partner: en ? 'A partner is required' : '需要搭檔，目前未設定有搭檔', health: en ? 'Shoulder loading is excluded by your current treatment restriction' : '目前治療／健康限制不允許此肩部負荷', unknown_treatment: en ? 'Custom movement has no treatment eligibility classification' : '自訂動作缺少治療限制分類', treatment_equipment: en ? 'Required loaded equipment is excluded by your treatment restriction' : '目前治療限制不允許此動作所需的負重器材', equipment: en ? `Missing equipment: ${(issue.missingOptions || []).map(option => option.join(' + ')).join(' / ')}` : `缺少器材：${(issue.missingOptions || []).map(option => option.join('＋')).join(' 或 ')}`, manual_unavailable: en ? 'Not available under current clinical or planning conditions; adjust preferences or choose another exercise' : '目前臨床或排課條件不允許此動作；請調整條件或選其他動作' }[issue.code] || issue.code)).join('；'); };
  const minutes = workout => estimateSessionMinutes(workout, exercises);
  const rows = (compact ? cards.slice(0, session.routine.length ? 2 : 3) : cards).map(workout => {
    const existing = workout.routine.filter(value => session.routine.includes(value)).length;
    const actual = workout.routine.length - existing;
    const blocked = workout.routine.filter(value => !eligibleExercises[value]);
    if (compact) return <article key={workout.id} className="combo-first-card" data-combo-id={workout.id}><button type="button" className="combo-first-shortcut" data-testid={`combo-add-${workout.id}`} aria-label={actual ? en ? `Add ${workout.name}, ${actual} new exercises` : `加入${workout.name}，新增 ${actual} 個動作` : en ? `${workout.name} already in draft; inspect doses` : `${workout.name}已在課表；查看劑量`} onClick={() => actual ? directAdd(workout) : onOpen(workout)}><span className="combo-first-quick-mark">{workout.saved ? <Dumbbell size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}</span><span className="combo-first-card-name"><strong>{workout.name}</strong><small>{workout.routine.length} {en ? 'exercises' : '個動作'}</small></span><span className="combo-first-plus" aria-hidden="true">{actual ? '＋' : '✓'}</span></button>{!!blocked.length && <p className="combo-first-warning">{blocked.map(value => exercises[value]?.name || value).join('、')} · {en ? 'Check restrictions' : '需檢查可用條件'}</p>}</article>;
    return <article key={workout.id} className="combo-first-card" data-combo-id={workout.id} data-source={workout.saved ? 'saved' : 'builtin'}>
      <details onToggle={event => { const open = event.currentTarget.open; setExpandedCards(current => current[workout.id] === open ? current : { ...current, [workout.id]: open }); }}><summary data-testid={`combo-detail-${workout.id}`}><span className="combo-first-card-name"><strong>{workout.pinned && <Pin size={14} aria-label={en ? 'Pinned' : '已釘選'} />}{workout.name}</strong><small>{workout.routine.length} {en ? 'exercises' : '個動作'}{workout.scope === 'day' && ` · ${en ? 'Full day' : '整天'}`}{!actual && ` · ${en ? 'Already in draft' : '已在課表'}`}</small></span><span aria-hidden="true">⌄</span></summary>
      {expandedCards[workout.id] && <><ul>{workout.prescriptions.map(dose => <li key={dose.id}>{exercises[dose.id]?.name || dose.id}<small>{doseText(dose, en)} · {phaseLabel(dose.phase, en)}</small></li>)}</ul>
      <small>{minutes(workout)} {en ? 'min' : '分鐘'}</small>
      {!!existing && <p className="manual-secondary-copy">{en ? `${existing} duplicates retain their existing doses and phases.` : `${existing} 個重複保留原劑量與階段。`}</p>}
      <button type="button" className="manual-text-action" onClick={() => compact ? onOpen(workout) : select(workout)}>{en ? 'Review doses / replace' : '檢查劑量／取代'}</button>
      {workout.saved && store?.setPinned && <button type="button" className="manual-text-action" aria-pressed={!!workout.pinned} onClick={() => pin(workout)}>{workout.pinned ? en ? 'Unpin' : '取消釘選' : en ? 'Pin' : '釘選'}</button>}
      </>}</details><button type="button" className="combo-first-plus" data-testid={`combo-add-${workout.id}`} aria-label={actual ? en ? `Add ${workout.name}, ${actual} new exercises` : `加入${workout.name}，新增 ${actual} 個動作` : en ? `${workout.name} already in draft; inspect doses` : `${workout.name}已在課表；查看劑量`} onClick={() => actual ? directAdd(workout) : compact ? onOpen(workout) : select(workout)}>{actual ? '＋' : '✓'}</button>
      {!!blocked.length && <p className="combo-first-warning">{blocked.map(value => exercises[value]?.name || value).join('、')} · {en ? 'Check restrictions before adding' : '需檢查器材／可用條件'}</p>}
    </article>;
  });
  if (compact) return <section className={`combo-first-common ${session.routine.length ? 'combo-first-common-filled' : ''}`} aria-label={en ? 'Frequent combos' : '常用組合'}><header><h2>{en ? 'Frequent combos' : '常用組合'}</h2><button type="button" className="manual-text-action" onClick={() => onOpen(null)}>{en ? 'All' : '全部'} ›</button></header>{rows}{storeError && <p role="status">{storeError}</p>}</section>;
  return <dialog ref={panel} onCancel={event => { event.preventDefault(); back(); }} className="quick-workout-picker combo-first-picker" data-testid="quick-workout-picker" aria-label={en ? 'Choose exercises' : '選擇動作'}>
    <header className="combo-first-panel-heading"><div><h2 tabIndex={-1} ref={heading}>{en ? 'Choose exercises' : '選擇動作'}</h2><p>{destinationLabel}</p></div><button type="button" className="manual-text-action" onClick={back} aria-label={en ? 'Close add panel' : '關閉加入面板'}>{selected ? <ArrowLeft size={20} /> : <X size={20} />}<span className="sr-only">{selected ? en ? 'Combos' : '組合' : en ? 'Close' : '關閉'}</span></button></header>
    {storeError && <p role="alert" className="quick-conflict">{storeError}</p>}
    <div className="combo-first-panel-body exercise-browser-body">
    {!selected ? <>
      <div className="exercise-browser-tools">
      <div className="quick-tabs" role="group" aria-label={en ? 'Content type' : '內容種類'}>{[['exercises', en ? 'Single exercises' : '單一動作'], ['combos', en ? 'Combos' : '組合']].map(([value,label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{value === 'exercises' ? <Dumbbell size={16} /> : <Sparkles size={16} />}{label}</button>)}</div>
      <label className="manual-search"><Search size={20} /><span className="sr-only">{en ? 'Search names or regions' : '搜尋名稱或部位'}</span><input data-testid="combo-search" type="search" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(12); }} placeholder={en ? 'Search chest press, shoulder press…' : '搜尋胸推、肩推、動作名稱…'} /></label>
      <div className="exercise-part-shortcuts" role="group" aria-label={en ? 'Quick body parts' : '常用部位'}>{[['all',en?'All':'全部'],['chest',en?'Chest':'胸'],['back',en?'Back':'背'],['shoulder',en?'Shoulders':'肩'],['legs',en?'Legs':'腿'],['core',en?'Core':'核心']].map(([value,label]) => <button type="button" key={value} aria-pressed={region === value} onClick={() => changeRegion(value)}>{label}</button>)}</div>
      <div className="exercise-browser-filter-row"><BodyPartFilter lang={lang} value={region} onChange={changeRegion} testId="combo-body-part" />{onCreateExercise && <button type="button" className="exercise-create-entry" data-testid="picker-create-exercise" onClick={() => setCreating(true)}><Plus size={16} />{en ? 'Create exercise' : '自訂動作'}</button>}</div>
      </div>
      {store?.error && <p role="alert">{en ? 'Favorites unavailable.' : '無法讀取收藏。'}<button type="button" className="manual-text-action" onClick={store.reload}>{en ? 'Retry' : '重試'}</button></p>}
      {tab === 'combos' ? <div className="combo-first-cards">{rows}{!cards.length && emptyResults}</div> : <section className="exercise-browser-results"><div className="exercise-results-heading"><h3>{query ? en ? 'Search results' : '搜尋結果' : region === 'all' ? en ? 'Exercise library' : '動作清單' : en ? 'Matching exercises' : '符合部位的動作'}</h3><span>{singleCandidates.length} {en ? 'movements' : '個動作'}</span></div>{!singleCandidates.length && emptyResults}<div className="exercise-choice-list">{singleCandidates.slice(0,visibleCount).map(row => {
        const {id:value,exercise,available} = row, added = session.routine.includes(value);
        const equipment = exercise.equipment || (exercise.equipmentOptions?.[0]?.length ? exercise.equipmentOptions[0].map(key => t?.(`equipment_${key}`) || key).join(' · ') : en ? 'Bodyweight' : '徒手');
        return <article key={value} className="exercise-choice-card" data-available={available} data-added={added}>
          <span className="exercise-choice-icon" aria-hidden="true"><Dumbbell size={23} strokeWidth={1.6} /></span>
          <div className="exercise-choice-content"><button type="button" className="exercise-choice-name" aria-haspopup="dialog" onClick={() => setDetail({id:value,...(exercise.prescription || {sets:1,value:'8',unit:'reps'})})}>{exercise.name}<ChevronRight size={13} /></button><p className="exercise-choice-equipment">{value.startsWith('custom_') && <span>{en ? 'Custom' : '自訂'} · </span>}{equipment}</p><ExerciseTags id={value} exercise={exercise} lang={lang} compact />{!available && <p className="exercise-choice-reason" data-testid={`exercise-unavailable-${value}`}>{selectionReason(row,lang)}</p>}</div>
          <button type="button" className="exercise-choice-add" data-testid={`single-add-${value}`} disabled={added || !available} aria-label={`${added ? en ? 'Added' : '已加入' : en ? 'Add' : '加入'} ${exercise.name}`} onClick={() => addSingle(value,exercise)}>{added ? <Check size={21} /> : <Plus size={21} />}</button>
        </article>;
      })}</div>{singleCandidates.length > visibleCount && <button type="button" className="exercise-show-more" data-testid="picker-show-more" onClick={() => setVisibleCount(value => value+12)}>{en ? 'Show more exercises' : '顯示更多動作'}</button>}</section>}

    </> : <>
      {selected.routine.some(id => ['bf_A12', 'bf_A13'].includes(id)) && <div className="quick-conflict"><h3>{en ? 'Legacy complete sequence' : '舊版完整暖身流程'}</h3><p>{en ? 'Historical completion stays attached to the original sequence. You can preview a new independent copy for this draft.' : '舊完成紀錄仍指向原流程；可先預覽八個獨立動作的新版副本，再決定加入目前草稿。'}</p><button type="button" className="manual-text-action" onClick={() => { const converted = expandLegacyWarmup(selected); setSelected({ ...converted, legacyOriginal: selected }); setLegacyConfirmed(false); }}>{en ? 'Preview eight independent movements' : '預覽轉成八個獨立動作'}</button></div>}{selected.legacyOriginal && <div className="quick-conflict"><h3>{en ? 'Preview a new copy' : '新版副本預覽'}</h3><p>{en ? 'Before' : '轉換前'}：{selected.legacyOriginal.routine.length} {en ? 'exercises' : '個動作'} · {minutes(selected.legacyOriginal)} {en ? 'min' : '分鐘'}</p><p>{en ? 'After' : '轉換後'}：{selected.routine.length} {en ? 'independent exercises' : '個獨立動作'} · {minutes(selected)} {en ? 'min' : '分鐘'}</p><label className="quick-check"><input type="checkbox" checked={legacyConfirmed} onChange={event => setLegacyConfirmed(event.target.checked)} />{en ? 'Confirm this new copy; keep original records unchanged' : '確認採用新版副本，原收藏、分享與歷史紀錄保持不變'}</label></div>}<p className="quick-scope">{selected.scope === 'day' ? en ? 'Daily workout copy' : '當日課表副本' : en ? 'Quick combo · part of a day' : '快速組合 · 當日的一部分'} · {minutes(selected)} {en ? 'min' : '分鐘'}</p>
      <ol className="quick-preview-list">{selected.prescriptions.map((dose, index) => <li key={dose.id} data-exercise-id={dose.id}><span className="manual-row-number">{index + 1}</span><div><strong>{exercises[dose.id]?.name || dose.id}</strong><ExerciseTags id={dose.id} exercise={exercises[dose.id]} lang={lang} compact /><p>{phaseLabel(dose.phase, en)} · {doseText(dose, en)}</p><p>{exercises[dose.id]?.equipment || (en ? 'Bodyweight' : '徒手')}</p></div><button type="button" className="manual-text-action" onClick={() => setDetail(dose)} aria-label={`${en ? 'Details' : '詳情'} ${exercises[dose.id]?.name || dose.id}`}>{en ? 'Details' : '詳情'}</button></li>)}</ol>
      {preview.duplicates.map(duplicate => <fieldset key={duplicate.id} className="quick-conflict"><legend>{exercises[duplicate.id]?.name || duplicate.id}{en ? ' already exists' : ' 已在草稿'}</legend><p>{phaseLabel(duplicate.existing.phase, en)} · {doseText(duplicate.existing, en)}</p>{[['keep', en ? 'Keep existing dose' : '保留原本內容'], ['replace', en ? 'Use new dose' : '改用新劑量']].map(([value, label]) => <label key={value}><input type="radio" name={`${id}-${duplicate.id}`} checked={duplicate.choice === value} onChange={() => setDuplicates({ ...duplicates, [duplicate.id]: value })} />{label}{value === 'replace' && ` · ${phaseLabel(duplicate.incoming.phase, en)} · ${doseText(duplicate.incoming, en)}`}</label>)}</fieldset>)}
      <details className="manual-secondary-details"><summary>{en ? 'Replace a phase or day instead' : '取代某階段／整天'}</summary><label className="quick-select-label">{en ? 'How to add' : '加入方式'}<select value={mode} onChange={event => { setMode(event.target.value); setConfirmed(false); }}><option value="append">{en ? 'Append (default)' : '追加（預設）'}</option><option value="replace">{en ? 'Replace' : '取代'}</option></select></label>{mode === 'replace' && <><label className="quick-select-label">{en ? 'Replace scope' : '取代範圍'}<select value={replaceScope} onChange={event => { setReplaceScope(event.target.value); setConfirmed(false); }}>{[['day', en ? 'Full day' : '整天'], ['warmup', en ? 'Warm-up' : '暖身'], ['training', en ? 'Training' : '訓練'], ['cooldown', en ? 'Cooldown' : '收操']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className="quick-before-after"><div><h3>{en ? 'Before' : '取代前'}</h3>{preview.removed.map(dose => <p key={dose.id}>{exercises[dose.id]?.name || dose.id} · {doseText(dose, en)}</p>)}</div><div><h3>{en ? 'After' : '取代後（整天完整清單）'}</h3>{preview.next.prescriptions.map(dose => <p key={dose.id}>{exercises[dose.id]?.name || dose.id} · {doseText(dose, en)}</p>)}</div></div><label className="quick-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{en ? 'I reviewed and confirm replacing this draft content' : '已檢查前後內容，確認取代這份草稿內容'}</label></>}</details>
      {!!preview.conflicts.length && <div role="alert" className="quick-conflict"><h3>{en ? 'Resolve before adding' : '加入前需處理'}</h3>{preview.conflicts.map((conflict, index) => <div key={`${conflict.type}-${index}`}>{conflict.type === 'ineligible' ? <><p>{exercises[conflict.id]?.name || conflict.id}：{conflictReason(conflict)}</p>{selected.routine.includes(conflict.id) && <label className="quick-check"><input type="checkbox" checked={excluded.includes(conflict.id)} onChange={event => { setExcluded(event.target.checked ? [...excluded, conflict.id] : excluded.filter(value => value !== conflict.id)); setPartial(false); }} />{en ? 'Exclude this item from this addition' : '這次不加入這項（保留其他項目）'}</label>}</> : <p>{conflict.type === 'time' ? en ? `Exceeds available time by ${conflict.excess} min (${conflict.minutes}/${conflict.dailyTime}). Adjust the draft or time first; no exercises were removed.` : `超出可用時間 ${conflict.excess} 分鐘（${conflict.minutes}／${conflict.dailyTime} 分鐘）。請先調整草稿或時間，沒有自動刪減動作。` : conflict.type === 'capacity' ? en ? `Exceeds ${conflict.max} exercises per day.` : `超過每日 ${conflict.max} 個動作。` : en ? 'Invalid dose.' : '劑量無效。'}</p>}</div>)}</div>}
      {!!preview.conflicts.length && <details className="manual-secondary-details"><summary>{en ? 'Choose only part of this combo' : '只加入部分動作'}</summary>{selected.prescriptions.map(dose => <label key={dose.id} className="quick-check"><input type="checkbox" checked={!excluded.includes(dose.id)} onChange={event => { setExcluded(event.target.checked ? excluded.filter(value => value !== dose.id) : [...excluded, dose.id]); setPartial(false); }} />{exercises[dose.id]?.name || dose.id}</label>)}</details>}
      {!!excluded.length && <div className="quick-conflict"><h3>{en ? 'Actual retained list' : '這次實際保留清單'}</h3><p>{en ? 'Excluded: ' : '不加入：'}{excluded.map(value => exercises[value]?.name || value).join('、')}</p>{selected.prescriptions.filter(dose => !excluded.includes(dose.id)).map(dose => <p key={dose.id}>{exercises[dose.id]?.name || dose.id}</p>)}<label className="quick-check"><input type="checkbox" checked={partial} onChange={event => setPartial(event.target.checked)} />{en ? 'Confirm adding only the retained items' : '確認只採用上述保留項目'}</label><button type="button" className="manual-text-action" onClick={() => { setExcluded([]); setPartial(false); }}>{en ? 'Restore excluded items' : '還原未加入項目'}</button></div>}
      <p className="manual-secondary-copy">{en ? `After adding: ${preview.next.routine.length} exercises · ${preview.minutes} min. ${preview.keptCount} existing doses kept.` : `加入後：${preview.next.routine.length} 個動作 · ${preview.minutes} 分鐘。保留 ${preview.keptCount} 項原本內容，不重複加入。`}</p>
      <footer className="combo-first-exception-actions"><div className="manual-fixed-inner"><div><strong>{en ? 'Draft · not applied to dates' : '草稿 · 尚未套用到日期'}</strong></div><button type="button" data-testid="quick-workout-add" className="manual-primary" disabled={!!selected.legacyOriginal && !legacyConfirmed || !preview.canApply || !count && !preview.removed.length || mode === 'replace' && !confirmed || excluded.length > 0 && !partial} onClick={apply}>{mode === 'replace' ? en ? 'Confirm replacement' : '確認取代草稿內容' : en ? `Add ${preview.addedIds.length} exercises to ${shortDate} draft${preview.replacedIds.length ? ` and update ${preview.replacedIds.length} doses` : ''}` : `加入 ${preview.addedIds.length} 個動作到 ${shortDate} 草稿${preview.replacedIds.length ? `，更新 ${preview.replacedIds.length} 項劑量` : ''}`}</button></div></footer>
    </>}
    </div><footer className="combo-first-panel-footer"><div role="status">{feedback}{canUndo && <button type="button" className="manual-text-action" onClick={() => { onUndo(); setFeedback(en ? 'Last draft change undone.' : '已撤銷最近一次草稿變更。'); }}>{en ? 'Undo' : '撤銷'}</button>}</div><div className="flex gap-2">{onConfigure && <button type="button" className="manual-text-action" onClick={onConfigure}>{en ? 'Time / equipment' : '時間／器材'}</button>}<button type="button" className="manual-primary" data-testid="combo-panel-done" onClick={onCancel}>{en ? 'Done' : '完成'} · {session.routine.length}</button></div></footer>
    {creating && <CreateExerciseDialog lang={lang} t={t} scope={createScope} initialPart={region} addToDay onSave={createAndAdd} onClose={() => setCreating(false)} />}
    <ExerciseDetails open={!!detail} title={exercises[detail?.id]?.name || ''} subtitle={detail ? doseText(detail, en) : ''} closeLabel={en ? 'Close' : '關閉'} onClose={() => setDetail(null)}>{detail && <ExerciseGuide id={detail.id} exercise={exercises[detail.id]} lang={lang} expanded />}</ExerciseDetails>
  </dialog>;
}
