import { useState } from 'react';
import { CheckCircle2, Plus, Search } from 'lucide-react';
import { exercisePhase, SESSION_PHASES } from '../domain/phases.js';
import { matchesLibraryPurpose } from '../domain/library.js';

const messages = {
  zh: {
    title: '加入動作', phase: '先選加入階段', scope: '動作來源', all: '全部動作', mine: '我的常用',
    search: '搜尋動作名稱或關鍵字', count: n => `找到 ${n} 個可加入動作`,
    empty: '這個階段沒有符合的動作，請換個關鍵字或階段。',
    emptyMine: '這個階段還沒有可加入的常用動作。可先到動作庫整理，或切換全部動作。',
    switchAll: '查看全部動作', recommended: '建議階段', choose: '選擇', selected: '已選擇',
    add: phase => `加入到「${phase}」`, more: '載入更多動作',
    hint: '常用分類供你快速尋找；可加入項目依目前器材、搭檔、經驗、身體限制與啟用設定篩選。已在今天課表的動作不會重複顯示。',
    phaseHint: phase => `爆發、反應與步法動作請選「${phase}」階段。`,
  },
  en: {
    title: 'Add an exercise', phase: 'Choose the session phase', scope: 'Exercise source', all: 'All exercises', mine: 'My favorites',
    search: 'Search exercise names or keywords', count: n => `${n} exercises available`,
    empty: 'No exercises match this phase. Try another search or phase.',
    emptyMine: 'No available favorites for this phase. Organize them in the library, or browse all exercises.',
    switchAll: 'View all exercises', recommended: 'Suggested phase', choose: 'Choose', selected: 'Selected',
    add: phase => `Add to ${phase}`, more: 'Load more exercises',
    hint: 'Favorites help you find exercises. Available additions follow your current equipment, partner, experience, health restrictions and enabled settings. Exercises already in this session are excluded.',
    phaseHint: phase => `For power, reaction and footwork exercises, choose “${phase}”.`,
  },
};

export default function ExercisePicker({ t, lang = 'zh', exercises = {}, excludedIds = [], selected = '', setSelected, onAdd, busy = false }) {
  const copy = messages[lang === 'en' ? 'en' : 'zh'];
  const [phase, setPhase] = useState('warmup');
  const [scope, setScope] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const purpose = phase === 'warmup' ? 'warmup' : ['recovery', 'cooldown'].includes(phase) ? 'cooldown' : 'training';
  const excluded = new Set(excludedIds);
  const candidates = Object.entries(exercises).filter(([id, exercise]) => {
    if (exercise.active === false || exercise.deleted || excluded.has(id) || !matchesLibraryPurpose(id, exercise, purpose, scope)) return false;
    const recommended = exercisePhase({}, id, exercise);
    if (recommended === 'skill' && phase !== 'skill') return false;
    return [exercise.name, exercise.nameEn, exercise.catalogCode, ...(exercise.aliases || [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }).sort(([aId, a], [bId, b]) => Number(exercisePhase({}, bId, b) === phase) - Number(exercisePhase({}, aId, a) === phase));
  const chosen = candidates.find(([id]) => id === selected);
  const resetSelection = () => { setSelected(''); setLimit(12); };
  return <section data-testid="exercise-picker" className="p-4 rounded-xl border border-dashed border-sky-200 bg-white space-y-4">
    <h3 className="font-semibold text-slate-800">{copy.title}</h3>
    <div className="grid sm:grid-cols-2 gap-3">
      <label className="text-sm text-slate-600">{copy.phase}<select data-testid="picker-phase" value={phase} disabled={busy} onChange={event => { setPhase(event.target.value); resetSelection(); }} className="mt-1 block w-full rounded-lg border border-sky-200 bg-white p-2 text-sm">{SESSION_PHASES.map(value => <option key={value} value={value}>{t(`phase_${value}`)}</option>)}</select></label>
      <label className="text-sm text-slate-600">{copy.scope}<select data-testid="picker-scope" value={scope} disabled={busy} onChange={event => { setScope(event.target.value); resetSelection(); }} className="mt-1 block w-full rounded-lg border border-sky-200 bg-white p-2 text-sm"><option value="all">{copy.all}</option><option value="mine">{copy.mine}</option></select></label>
    </div>
    <p className="text-xs text-slate-500">{copy.phaseHint(t('phase_skill'))}</p>
    <label className="block text-sm text-slate-600">{copy.search}<div className="relative mt-1"><Search size={16} className="absolute left-3 top-3 text-slate-400" aria-hidden="true" /><input data-testid="picker-search" type="search" value={query} disabled={busy} onChange={event => { setQuery(event.target.value); resetSelection(); }} className="block w-full rounded-lg border border-sky-200 py-2 pl-9 pr-3 text-sm" /></div></label>
    <p className="text-xs text-slate-500" aria-live="polite">{copy.count(candidates.length)}</p>
    <div className="grid sm:grid-cols-2 gap-2" aria-label={copy.title}>{candidates.slice(0, limit).map(([id, exercise]) => <button key={id} type="button" data-testid={`picker-option-${id}`} aria-pressed={selected === id} disabled={busy} onClick={() => setSelected(selected === id ? '' : id)} className={`rounded-xl border p-3 text-left disabled:opacity-50 ${selected === id ? 'border-sky-500 bg-sky-50' : 'border-slate-200 bg-white'}`}>
      <span className="flex items-start gap-2"><span className="flex-1 font-semibold text-sm text-slate-800">{exercise.name}</span>{selected === id && <CheckCircle2 size={18} className="shrink-0 text-sky-600" />}</span>
      <span className="block text-xs mt-1 text-slate-500">{exercise.catalogCode && `${exercise.catalogCode} · `}{copy.recommended}: {t(`phase_${exercisePhase({}, id, exercise)}`)}</span>
      <span className="block mt-2 text-xs text-sky-700">{selected === id ? copy.selected : copy.choose}</span>
    </button>)}</div>
    {!candidates.length && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><p>{scope === 'mine' ? copy.emptyMine : copy.empty}</p>{scope === 'mine' && <button type="button" disabled={busy} onClick={() => { setScope('all'); resetSelection(); }} className="mt-2 text-sky-700 underline underline-offset-4">{copy.switchAll}</button>}</div>}
    {candidates.length > limit && <button type="button" disabled={busy} onClick={() => setLimit(value => value + 12)} className="text-sm rounded-lg border border-slate-200 px-3 py-2 text-slate-600">{copy.more}</button>}
    <p className="text-xs text-slate-500">{copy.hint}</p>
    <button type="button" data-testid="picker-add" disabled={busy || !chosen} onClick={() => onAdd(phase)} className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-40"><Plus size={16} />{copy.add(t(`phase_${phase}`))}</button>
  </section>;
}
