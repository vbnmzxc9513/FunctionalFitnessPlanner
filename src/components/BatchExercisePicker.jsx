import { useId, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { defaultManualPhaseType, filterManualExercises, MANUAL_REGIONS, MANUAL_TYPES } from '../domain/manualPlanner.js';

const labels = {
  zh: {
    title: '加入動作', cancel: '回到排課', destination: '加入到', types: '先選動作類型', regions: '再選部位',
    search: '搜尋名稱、別名或部位', placeholder: '例如：腿拉伸、胸椎、前鋸肌、B01', matches: '符合條件的動作',
    selected: '檢查已選動作', existing: '已在這天課表', pending: '待加入', remove: '取消選取', count: n => `已選 ${n} 個`,
    remaining: n => `這天還可加入 ${n} 個（含暖身與收操，最多 8 個）`, add: n => `加入 ${n} 個動作到草稿`,
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
    remaining: n => `Room for ${n} more (8 per day, including warm-up and cooldown)`, add: n => `Add ${n} exercises to draft`,
    empty: 'No available exercises match. Change a type or region, or clear the search.', clear: 'Clear search and filters', none: 'Nothing selected yet. Check exercises to list them here.',
    full: 'This day is full. Return to the planner and remove an exercise before adding more.', over: 'Your selection exceeds the remaining capacity. Deselect some exercises.',
    unavailable: 'No longer available under your current conditions. Deselect it.', hint: 'Checking an exercise only selects it. Add it to put it in the draft. Selections stay when you change filters or search.',
    eligibility: 'Choices follow current equipment, partner, experience, treatment restrictions and enabled settings. Exercise types do not change the destination phase.',
    type: { all: 'All', strength: 'Strength', dynamic: 'Dynamic mobility', static: 'Static / release', skill: 'Footwork / power / reaction', other: 'Other training' },
    region: { all: 'All', legs: 'Legs', chest: 'Chest', back: 'Back', serratus: 'Serratus', thoracic: 'Thoracic spine', hip: 'Hips', leg_stretch: 'Leg stretches', shoulder: 'Shoulder blades', core: 'Core' },
  },
};

export default function BatchExercisePicker({ exercises = {}, eligibleExercises = {}, selectedIds = [], onSelectionChange,
  existingIds = [], remainingCapacity = 8, phase = 'strength', date = '', lang = 'zh', t, onAdd, onCancel }) {
  const copy = labels[lang === 'en' ? 'en' : 'zh'];
  const id = useId();
  const [type, setType] = useState(() => defaultManualPhaseType(phase));
  const [region, setRegion] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(24);
  const existing = new Set(existingIds);
  const chosen = new Set(selectedIds);
  // Search spans the whole eligible library; type/region filters stay explicit when no query is entered.
  const candidates = filterManualExercises(exercises, eligibleExercises, query.trim() ? { query } : { type, region });
  const invalid = selectedIds.some(value => !eligibleExercises[value] || eligibleExercises[value].deleted || eligibleExercises[value].active === false || existing.has(value));
  const over = selectedIds.length > remainingCapacity;
  const phaseName = t?.(`phase_${phase}`) || phase;
  const toggle = value => onSelectionChange?.(chosen.has(value) ? selectedIds.filter(item => item !== value) : [...selectedIds, value]);
  const pill = 'min-h-11 rounded-xl border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600';
  return <section data-testid="batch-exercise-picker" className="space-y-5 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5">
    <button type="button" data-testid="batch-picker-cancel" onClick={onCancel} className={`${pill} border-slate-200 text-sky-700`}>← {copy.cancel}</button>
    <header><h2 className="text-xl font-bold text-slate-800">{copy.title}</h2><p className="mt-2 font-medium text-sky-700">{copy.destination} {date} · {phaseName}</p></header>
    <p id={`${id}-capacity`} className="text-sm text-slate-600">{copy.remaining(remainingCapacity)}</p>
    <label className="block text-sm font-medium text-slate-700" htmlFor={`${id}-search`}>{copy.search}</label>
    <div className="relative"><Search size={18} className="pointer-events-none absolute left-3 top-3 text-slate-400" aria-hidden="true" /><input id={`${id}-search`} data-testid="batch-picker-search" type="search" autoFocus value={query} onChange={event => { setQuery(event.target.value); setLimit(24); }} placeholder={copy.placeholder} className="min-h-11 w-full rounded-xl border border-slate-300 py-2 pl-10 pr-3 text-base focus-visible:outline-2 focus-visible:outline-sky-600" /></div>
    <fieldset><legend className="mb-2 text-sm font-semibold text-slate-600">{copy.types}</legend><div className="flex flex-wrap gap-2">{MANUAL_TYPES.map(value => <button type="button" key={value} aria-pressed={type === value && !query.trim()} onClick={() => { setType(value); setQuery(''); setLimit(24); }} className={`${pill} ${type === value && !query.trim() ? 'border-sky-500 bg-sky-50 font-semibold text-sky-800' : 'border-slate-200 text-slate-600'}`}>{type === value && !query.trim() && '✓ '}{copy.type[value]}</button>)}</div></fieldset>
    <fieldset><legend className="mb-2 text-sm font-semibold text-slate-600">{copy.regions}</legend><div className="flex flex-wrap gap-2">{MANUAL_REGIONS.map(value => <button type="button" key={value} aria-pressed={region === value && !query.trim()} onClick={() => { setRegion(value); setQuery(''); setLimit(24); }} className={`${pill} ${region === value && !query.trim() ? 'border-sky-500 bg-sky-50 font-semibold text-sky-800' : 'border-slate-200 text-slate-600'}`}>{region === value && !query.trim() && '✓ '}{copy.region[value]}</button>)}</div></fieldset>
    <p className="text-xs leading-relaxed text-slate-500">{copy.eligibility}</p>
    <details aria-labelledby={`${id}-chosen`} className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3"><summary id={`${id}-chosen`} className="min-h-11 cursor-pointer font-semibold text-slate-800">{copy.selected} · {selectedIds.length}</summary>{selectedIds.length ? <ul className="mt-2 space-y-1">{selectedIds.map(value => <li key={value} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words">{exercises[value]?.name || value}{(!eligibleExercises[value] || eligibleExercises[value].active === false || eligibleExercises[value].deleted || existing.has(value)) && <span className="block text-red-700">{copy.unavailable}</span>}</span><button type="button" aria-label={`${copy.remove} ${exercises[value]?.name || value}`} onClick={() => toggle(value)} className={`${pill} shrink-0 border-indigo-100 bg-white text-indigo-700`}>{copy.remove}</button></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">{copy.none}</p>}</details>
    {over && <p role="alert" className="text-sm text-red-700">{copy.over}</p>}
    {!remainingCapacity && <p role="status" className="text-sm text-amber-800">{copy.full}</p>}
    <section aria-labelledby={`${id}-matches`} className="pb-6"><h3 id={`${id}-matches`} className="font-semibold text-slate-800">{copy.matches} · {candidates.length}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{candidates.slice(0, limit).map(([value, exercise]) => {
      const added = existing.has(value), checked = added || chosen.has(value);
      const blocked = added || !chosen.has(value) && selectedIds.length >= remainingCapacity;
      return <label key={value} className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 ${added ? 'border-slate-100 bg-slate-50 text-slate-500' : checked ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}>
        <input type="checkbox" data-testid={`batch-option-${value}`} checked={checked} disabled={blocked} onChange={() => toggle(value)} aria-describedby={`${id}-capacity`} className="mt-1 h-5 w-5 shrink-0 accent-sky-600" />
        <span className="min-w-0 flex-1"><span className="block font-semibold">{exercise.name}</span><span className="mt-1 block text-xs text-slate-500">{exercise.catalogCode ? `${exercise.catalogCode} · ` : ''}{exercise.equipment || ''}</span><span className="mt-2 block text-xs text-sky-800">{added ? copy.existing : chosen.has(value) ? copy.pending : ''}</span></span>{added && <Check size={18} aria-hidden="true" className="shrink-0" />}
      </label>;
    })}</div>{!candidates.length && <div className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><p>{copy.empty}</p><button type="button" onClick={() => { setQuery(''); setType('all'); setRegion('all'); }} className={`${pill} mt-3 border-slate-200 bg-white text-sky-700`}>{copy.clear}</button></div>}
      {candidates.length > limit && <button type="button" onClick={() => setLimit(value => value + 24)} className={`${pill} mt-3 border-slate-200 text-sky-700`}>{lang === 'en' ? 'Show more' : '顯示更多動作'}</button>}
    </section>
    <p className="text-sm leading-relaxed text-slate-500">{copy.hint}</p>
    <footer data-testid="batch-picker-actions" className="sticky bottom-24 z-20 rounded-xl border border-indigo-200 bg-white p-3 shadow-lg lg:bottom-3"><div className="flex flex-wrap items-center gap-3"><p role="status" className="min-w-0 flex-1 text-sm font-semibold text-indigo-800">{copy.count(selectedIds.length)}<span className="mt-1 block text-xs font-normal text-slate-600">{lang === 'en' ? `${remainingCapacity} places available` : `剩餘 ${remainingCapacity} 個名額`}</span></p><button type="button" data-testid="batch-picker-add" disabled={!selectedIds.length || over || invalid} onClick={() => onAdd?.([...selectedIds])} className="min-h-11 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">{copy.add(selectedIds.length)}</button></div></footer>
    <div className="h-20" aria-hidden="true" />
  </section>;
}
