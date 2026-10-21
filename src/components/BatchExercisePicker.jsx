import { useId, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, Search, Star, X } from 'lucide-react';
import { defaultManualPhaseType, filterManualExercises, manualExerciseRegions } from '../domain/manualPlanner.js';
import { libraryGroups, suggestedUses } from '../domain/library.js';
import './manual-planner.css';
const labels = {
  zh: {
    title: '加入動作', cancel: '回到排課', destination: '加入到', types: '先選動作類型', regions: '再選部位',
    search: '搜尋名稱、別名或部位', placeholder: '例如：腿拉伸、胸椎、前鋸肌、B01', matches: '符合條件的動作',
    selected: '檢查已選動作', existing: '已在這天課表', pending: '待加入', remove: '取消選取', count: n => `已選 ${n} 個`,
    remaining: n => `這天還可加入 ${n} 個（含暖身與收操，最多 8 個）`, add: n => `加入 ${n} 個動作`,
    empty: '沒有符合的可用動作。請切換類型、部位或清除搜尋。', clear: '清除搜尋與篩選', none: '還沒選動作。勾選後才會列在這裡。',
    full: '這天的動作名額已滿。先回排課移除動作，再加入新的項目。', over: '已選超過剩餘名額，請先取消部分選取。',
    unavailable: '目前條件已不能加入，請取消選取。', hint: '勾選只保留候選；按「加入」才會放進草稿。切換類型、部位與搜尋會保留已選項目。',
    eligibility: '可加入內容依目前器材、搭檔、經驗、治療限制與啟用設定篩選。動作類型不會更改加入階段。',
    type: { all: '全部', strength: '肌力', dynamic: '動態拉伸', static: '靜態／放鬆', skill: '步法／爆發／反應', other: '其他訓練' },
    region: { all: '全部', legs: '腿', chest: '胸', back: '背', serratus: '前鋸肌', thoracic: '胸椎', hip: '髖', leg_stretch: '腿拉伸', shoulder: '肩胛', core: '核心' },
  },
  en: {
    title: 'Add exercises', cancel: 'Back to planner', destination: 'Add to', types: 'Exercise type', regions: 'Body region',
    search: 'Search names, aliases or regions', placeholder: 'For example: leg stretch, thoracic, serratus, B01', matches: 'Matching exercises',
    selected: 'Review selected exercises', existing: 'Already in this day', pending: 'To add', remove: 'Deselect', count: n => `${n} selected`,
    remaining: n => `Room for ${n} more (8 per day, including warm-up and cooldown)`, add: n => `Add ${n} exercises`,
    empty: 'No available exercises match. Change a type or region, or clear the search.', clear: 'Clear search and filters', none: 'Nothing selected yet. Check exercises to list them here.',
    full: 'This day is full. Return to the planner and remove an exercise before adding more.', over: 'Your selection exceeds the remaining capacity. Deselect some exercises.',
    unavailable: 'No longer available under your current conditions. Deselect it.', hint: 'Checking an exercise only selects it. Add it to put it in the draft. Selections stay when you change filters or search.',
    eligibility: 'Choices follow current equipment, partner, experience, treatment restrictions and enabled settings. Exercise types do not change the destination phase.',
    type: { all: 'All', strength: 'Strength', dynamic: 'Dynamic mobility', static: 'Static / release', skill: 'Footwork / power / reaction', other: 'Other training' },
    region: { all: 'All', legs: 'Legs', chest: 'Chest', back: 'Back', serratus: 'Serratus', thoracic: 'Thoracic spine', hip: 'Hips', leg_stretch: 'Leg stretches', shoulder: 'Shoulder blades', core: 'Core' },
  },
};

export default function BatchExercisePicker({ exercises = {}, eligibleExercises = {}, selectedIds = [], onSelectionChange,
  existingIds = [], remainingCapacity = 8, phase = 'strength', date = '', lang = 'zh', t, onAdd, onCancel, onOrganize, canManage = false, onSignIn }) {
  const en = lang === 'en';
  const copy = labels[en ? 'en' : 'zh'];
  const id = useId();
  const heading = useRef(null);
  const favoriteFilter = useRef(null);
  const [type, setType] = useState(() => defaultManualPhaseType(phase));
  const [region, setRegion] = useState('all');
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [limit, setLimit] = useState(24);
  const [pendingId, setPendingId] = useState(null);
  const [organizeError, setOrganizeError] = useState('');
  const existing = new Set(existingIds);
  const chosen = new Set(selectedIds);
  const candidates = filterManualExercises(exercises, eligibleExercises, query.trim() ? { query } : { type, region: region === 'ankle' ? 'all' : region })
    .filter(([, exercise]) => (!favoritesOnly || libraryGroups(exercise).length > 0)
      && (query.trim() || region !== 'ankle' || /小腿|腳踝|踝|calf|calves|ankle/i.test([exercise.name, exercise.nameEn, ...(exercise.aliases || [])].join(' '))));
  const invalid = selectedIds.some(value => !eligibleExercises[value] || eligibleExercises[value].deleted || eligibleExercises[value].active === false || existing.has(value));
  const over = selectedIds.length > remainingCapacity;
  const destination = phase === 'strength' ? en ? 'Training' : '訓練' : t?.(`phase_${phase}`) || phase;
  const shortDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : date;
  const regions = ['strength', 'skill', 'other', 'all'].includes(type) ? ['all', 'legs', 'chest', 'back', 'shoulder', 'core', 'serratus'] : ['all', 'thoracic', 'shoulder', 'hip', 'leg_stretch', 'ankle'];
  const regionLabel = value => value === 'ankle' ? en ? 'Ankles / calves' : '踝小腿' : value === 'shoulder' && ['dynamic', 'static'].includes(type) ? en ? 'Shoulders / chest' : '肩胸' : value === 'leg_stretch' ? en ? 'Legs' : '腿部' : copy.region[value];
  const toggle = value => onSelectionChange?.(chosen.has(value) ? selectedIds.filter(item => item !== value) : [...selectedIds, value]);
  const organize = async (value, exercise, opener) => {
    if (!canManage) { onSignIn?.(); return; }
    if (!onOrganize || pendingId) return;
    setPendingId(value); setOrganizeError('');
    try {
      const groups = libraryGroups(exercise);
      const result = await onOrganize(value, groups.length ? [] : suggestedUses(value, exercise));
      if (result === false) throw new Error('NOT_SAVED');
      requestAnimationFrame(() => { if (!opener.isConnected || favoritesOnly && groups.length) favoriteFilter.current?.focus(); });
    } catch { setOrganizeError(en ? 'Could not save your favorite. Please try again.' : '收藏未儲存，請稍後再試。'); }
    finally { setPendingId(null); }
  };
  const chooseType = value => { setType(value); setRegion('all'); setQuery(''); setLimit(24); };
  const switchView = value => { setReviewing(value); requestAnimationFrame(() => { heading.current?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); }); };
  const clear = () => { setQuery(''); setType('all'); setRegion('all'); setFavoritesOnly(false); setLimit(24); };
  const phaseTitle = en ? `Add ${destination.toLowerCase()} exercises` : `加入${destination}動作`;
  const regionSummary = exercise => manualExerciseRegions(exercise.id, exercise).map(value => copy.region[value]).filter(Boolean).slice(0, 2).join(' · ');
  const sequence = exercises.bf_A13;
  const canSelectSequence = !!eligibleExercises.bf_A13 && !existing.has('bf_A13') && (chosen.has('bf_A13') || selectedIds.length < remainingCapacity);
  return <section data-testid="batch-exercise-picker" className="manual-picker">
    <button type="button" data-testid="batch-picker-cancel" onClick={() => reviewing ? switchView(false) : onCancel?.()} className="manual-back"><ArrowLeft size={20} aria-hidden="true" />{reviewing ? en ? 'Continue choosing' : '繼續選動作' : en ? 'Cancel selection' : '取消選擇'}</button>
    <header className="manual-picker-heading"><h2 ref={heading} tabIndex="-1">{reviewing ? en ? 'Review selected exercises' : '確認已選動作' : phaseTitle}</h2><p>{shortDate} · {reviewing ? destination : en ? 'Choose, then add together' : '選好後一次加入'}</p></header>
    {!reviewing ? <>
      <label className="sr-only" htmlFor={`${id}-search`}>{copy.search}</label>
      <div className="manual-search"><Search size={20} aria-hidden="true" /><input id={`${id}-search`} data-testid="batch-picker-search" type="search" autoFocus value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} placeholder={en ? 'Search exercises, leg stretches, serratus…' : '搜尋動作、腿拉伸、前鋸肌…'} />{query && <button type="button" aria-label={en ? 'Clear search' : '清除搜尋'} onClick={() => setQuery('')}><X size={19} aria-hidden="true" /></button>}</div>
      <div className="manual-picker-types" role="group" aria-label={copy.types}>{['strength', 'dynamic', 'static'].map(value => <button type="button" key={value} aria-pressed={type === value && !query.trim()} onClick={() => chooseType(value)}>{copy.type[value]}</button>)}</div>
      <fieldset className="manual-picker-regions"><legend className="sr-only">{copy.regions}</legend>{regions.map(value => <button type="button" key={value} aria-pressed={region === value && !query.trim()} onClick={() => { setRegion(value); setQuery(''); setLimit(24); }}>{region === value && !query.trim() && <Check size={16} aria-hidden="true" />}{regionLabel(value)}</button>)}<button type="button" ref={favoriteFilter} aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly(value => !value); setLimit(24); }}><Star size={16} aria-hidden="true" fill={favoritesOnly ? 'currentColor' : 'none'} />{en ? 'Saved' : '收藏'}</button>
      <details className="manual-picker-more"><summary>{en ? 'More types' : '更多類型'}{['skill', 'other', 'all'].includes(type) && ` · ${copy.type[type]}`}</summary><div className="flex flex-wrap gap-2">{['skill', 'other', 'all'].map(value => <button type="button" key={value} aria-pressed={type === value && !query.trim()} onClick={() => chooseType(value)} className="manual-filter-button">{copy.type[value]}</button>)}</div><p className="mt-2 text-xs text-slate-500">{copy.eligibility}</p></details></fieldset>
      {query.trim() && <p className="manual-search-hint">{en ? 'Searching all available exercise types and regions.' : '正在跨類型與部位搜尋所有可用動作。'}</p>}
      {phase === 'warmup' && type === 'dynamic' && !query.trim() && sequence && <div className="manual-eight-shortcut"><div><h3>{en ? 'My daily eight-part warm-up' : '我的每日八段暖身'}</h3><p>{en ? 'One complete 10-minute sequence · both sides included' : '完整 10 分鐘流程 · 包含八段與左右側'}</p></div><button type="button" data-testid="batch-eight-stretch" disabled={!canSelectSequence} onClick={() => toggle('bf_A13')}>{existing.has('bf_A13') ? copy.existing : chosen.has('bf_A13') ? en ? 'Deselect sequence' : '取消整套' : en ? 'Select sequence' : '整套選取'}</button></div>}
      {organizeError && <p role="alert" className="text-sm text-red-700">{organizeError}</p>}
      <section aria-labelledby={`${id}-matches`} className="manual-picker-results"><header><h3 id={`${id}-matches`}>{en ? 'Available exercises' : '可選動作'}</h3><p>{candidates.length} {en ? 'exercises' : '個'}</p></header>
        <div className="manual-picker-list">{candidates.slice(0, limit).map(([value, exercise]) => {
          const added = existing.has(value), checked = added || chosen.has(value);
          const blocked = added || !chosen.has(value) && selectedIds.length >= remainingCapacity;
          const favorite = libraryGroups(exercise).length > 0;
          return <div key={value} className="manual-picker-row" data-selected={checked} data-existing={added}>
            <label className="manual-picker-choice"><input type="checkbox" data-testid={`batch-option-${value}`} checked={checked} disabled={blocked} onChange={() => toggle(value)} aria-describedby={`${id}-capacity`} />
              <span className="manual-picker-row-main"><strong>{exercise.name}</strong><span>{regionSummary({ ...exercise, id: value })}{exercise.equipment && ` · ${exercise.equipment}`}</span>{added && <small>{copy.existing}</small>}{chosen.has(value) && !added && <small>{copy.pending}</small>}</span><span className="manual-picker-row-mark">{checked ? <Check size={19} aria-hidden="true" /> : <span aria-hidden="true">＋</span>}</span>
            </label>
            <button type="button" data-testid={`batch-favorite-${value}`} className="manual-picker-favorite" aria-pressed={favorite} aria-label={`${!canManage ? en ? 'Sign in to save' : '登入後收藏' : favorite ? en ? 'Remove favorite' : '取消收藏' : en ? 'Save favorite' : '收藏'} ${exercise.name}`} disabled={!!pendingId || canManage && !onOrganize} onClick={event => organize(value, exercise, event.currentTarget)}>{pendingId === value ? <Loader2 size={21} className="animate-spin" aria-hidden="true" /> : <Star size={23} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />}</button>
          </div>;
        })}</div>
        {!candidates.length && <div className="manual-picker-empty"><p>{favoritesOnly ? en ? 'No saved exercises match. Save exercises in your library, or clear the filters.' : '沒有符合的收藏動作。可先到動作庫收藏，或清除篩選。' : copy.empty}</p><button type="button" onClick={clear} className="manual-text-action">{copy.clear}</button></div>}
        {candidates.length > limit && <button type="button" onClick={() => setLimit(value => value + 24)} className="manual-filter-button mt-4">{en ? 'Show more' : '顯示更多動作'}</button>}
      </section>
    </> : <>
      <p className="manual-selection-hint">{en ? 'Selections stay across filters and searches. They are not in the draft yet; you can remove items before adding.' : '切換分類或搜尋，都不會清掉這份選擇。以下尚未加入課表，可移除後再確認。'}</p>
      <div className="manual-picker-list">{selectedIds.length ? selectedIds.map((value, index) => <div key={value} className="manual-picker-row"><span className="manual-row-number">{index + 1}</span><div className="manual-picker-row-main"><strong>{exercises[value]?.name || value}</strong><span>{regionSummary({ ...exercises[value], id: value })} · {exercises[value]?.equipment}</span>{(!eligibleExercises[value] || eligibleExercises[value].active === false || eligibleExercises[value].deleted || existing.has(value)) && <small className="text-red-700">{copy.unavailable}</small>}</div><button type="button" aria-label={`${copy.remove} ${exercises[value]?.name || value}`} onClick={() => toggle(value)} className="manual-edit-action">{en ? 'Remove' : '移除'}</button></div>) : <p className="p-5 text-sm text-slate-500">{copy.none}</p>}</div><p className="manual-search-hint">{en ? 'After adding, adjust doses and order in this day’s draft.' : '加入後可在這天調整組次與順序。'}</p>
    </>}
    {over && <p role="alert" className="text-sm text-red-700">{copy.over}</p>}
    {!remainingCapacity && <p role="status" className="text-sm text-amber-800">{copy.full}</p>}
    <p id={`${id}-capacity`} className="manual-search-hint">{copy.remaining(remainingCapacity)}</p>
    <footer data-testid="batch-picker-actions" className="manual-fixed-actions"><div className="manual-fixed-inner"><div className="min-w-0"><button type="button" onClick={() => switchView(!reviewing)} className="manual-selection-count"><span role="status">{copy.count(selectedIds.length)}</span> · {reviewing ? en ? 'Keep choosing' : '繼續選擇' : en ? 'Review' : '查看'}</button><p>{shortDate} · {destination}</p></div><button type="button" data-testid="batch-picker-add" disabled={!selectedIds.length || over || invalid} onClick={() => onAdd?.([...selectedIds])} className="manual-primary">{copy.add(selectedIds.length)}</button></div></footer>
  </section>;
}
