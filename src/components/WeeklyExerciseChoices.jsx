import { useState } from 'react';
import { Check, Plus, RefreshCw, X } from 'lucide-react';
import { MAX_WEEKLY_CHOICES } from '../domain/trainingPreferences.js';
import { recommendWeeklyChoices, weeklyChoicePhase, weeklyChoiceCoverage, weeklyChoiceBlockReason } from '../domain/weeklyChoices.js';
import { classifyBalanceExercise } from '../domain/weeklyBalance.js';
import { libraryGroups, suggestedUses } from '../domain/library.js';
import { matchesTrainingTarget } from '../domain/trainingTargets.js';
import { weeklyBalanceText } from '../weeklyBalanceLocale.js';
import ExerciseGuide from './ExerciseGuide.jsx';

export default function WeeklyExerciseChoices({ t, lang, context, focus, exercises, available, onToggle, disabled }) {
  const [purpose, setPurpose] = useState('training');
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [limit, setLimit] = useState(12);
  const selected = context.weeklyExerciseIds || [];
  const all = recommendWeeklyChoices(exercises, context, focus, available);
  const matches = all.filter(id => {
    const phase = weeklyChoicePhase(id, exercises[id]);
    const group = ['strength', 'accessory', 'skill'].includes(phase) ? 'training' : phase;
    return (group === purpose || purpose === 'training' && suggestedUses(id, exercises[id]).includes('training')) && (!query.trim() || [exercises[id].name, ...(exercises[id].aliases || [])].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  });
  const rotated = matches.length ? [...matches.slice(offset % matches.length), ...matches.slice(0, offset % matches.length)] : [];
  const shown = searching ? matches.slice(0, limit) : rotated.slice(0, 4);
  const patterns = weeklyChoiceCoverage(selected, exercises);
  const priority = context.targetRegions || [];
  const reason = id => {
    const exercise = exercises[id]; const classification = classifyBalanceExercise(id, exercise);
    return libraryGroups(exercise).length ? 'choiceFavorite' : priority.some(region => matchesTrainingTarget(region, id, exercise)) ? 'choiceGoal'
      : classification.mobility.some(region => context.stiffnessRegions.includes(region)) ? 'choiceMobility'
        : focus === 'coordination' && ['footwork', 'reaction'].includes(exercise.category) ? 'choiceSkill' : 'choiceAvailable';
  };
  return <div data-testid="weekly-exercise-choices" className="space-y-5">
    <section className="rounded-2xl border border-sky-100 bg-sky-50 p-4" aria-label={t('choiceSelected')}>
      <h3 className="font-semibold text-sm">{t('choiceSelected')} · {selected.length} / {MAX_WEEKLY_CHOICES}</h3>
      {selected.length ? <div className="flex flex-wrap gap-2 mt-3">{selected.map(id => <button key={id} type="button" disabled={disabled} onClick={() => onToggle(id)} aria-label={`${t('choiceRemove')} ${exercises[id]?.name || id}`} className="button-secondary text-left"><span>{exercises[id]?.name || id}</span><X size={15} className="shrink-0" /></button>)}</div> : <p className="text-sm text-slate-500 mt-2">{t('choiceEmpty')}</p>}
      {selected.map(id => { const blocked = weeklyChoiceBlockReason(id, exercises, context, available); return blocked && <p key={id} className="text-sm text-amber-800 mt-2">{exercises[id]?.name || id}：{t(`choice_reason_${blocked}`)}</p>; })}
      {selected.length >= MAX_WEEKLY_CHOICES && <p role="status" className="text-sm text-slate-600 mt-3">{t('choiceLimit')}</p>}
      {patterns.length > 0 && <><p className="text-sm text-slate-600 mt-4">{t('choiceCoverage')}：{patterns.map(pattern => weeklyBalanceText(lang, pattern)).join(' · ')}</p><p className="text-xs text-slate-500 mt-2">{t('choiceCoverageHint')}</p></>}
      {patterns.length > 0 && patterns.every(pattern => ['squat_lunge', 'hinge'].includes(pattern)) && <p className="text-sm text-sky-800 mt-3" aria-live="polite">{t('choiceCoreHint')}</p>}
    </section>
    <div role="group" aria-label={t('choiceSelected')} className="flex flex-wrap gap-2">{['training', 'warmup', 'cooldown'].map(group => <button key={group} type="button" disabled={disabled} aria-pressed={purpose === group} onClick={() => { setPurpose(group); setOffset(0); setLimit(12); }} className={`rounded-full border px-4 py-2 text-sm ${purpose === group ? 'bg-sky-100 border-sky-300 text-sky-800 font-semibold' : 'border-slate-200'}`}>{t(`choice${group[0].toUpperCase()}${group.slice(1)}`)}</button>)}</div>
    <p className="text-sm text-slate-500">{t('choiceRecommendation')}</p>
    <details data-testid="weekly-choice-search" onToggle={event => { setSearching(event.currentTarget.open); setOffset(0); }}><summary className="text-sm text-sky-700">{t('choiceSearch')}</summary><input aria-label={t('choiceSearchHint')} placeholder={t('choiceSearchHint')} value={query} disabled={disabled} onChange={event => { setQuery(event.target.value); setLimit(12); }} className="w-full rounded-xl border border-slate-200 p-3 mt-3" /></details>
    <div className="choice-grid">{shown.map(id => {
      const exercise = exercises[id]; const chosen = selected.includes(id);
      return <article key={id} data-testid={`weekly-choice-${id}`} className="choice-card" data-selected={chosen}><div className="flex items-start gap-3"><span className="choice-symbol" aria-hidden="true">{chosen ? <Check size={19} /> : <Plus size={19} />}</span><div className="min-w-0"><h3 className="font-semibold">{exercise.name}</h3><p className="text-xs text-sky-700 mt-1">{t(reason(id))}</p></div></div><p className="text-sm text-slate-500 mt-3">{exercise.tip}</p><ExerciseGuide id={id} exercise={exercise} lang={lang} /><button type="button" data-testid={`weekly-choice-toggle-${id}`} aria-pressed={chosen} disabled={disabled || !chosen && selected.length >= MAX_WEEKLY_CHOICES} onClick={() => onToggle(id)} className={`button-secondary w-full mt-3 ${chosen ? 'bg-sky-100 border-sky-300 text-sky-800' : ''}`}>{chosen ? <Check size={16} /> : <Plus size={16} />}{t(chosen ? 'choiceRemove' : 'choiceSelect')}</button></article>;
    })}</div>
    {!shown.length && <p role="status" className="text-sm text-slate-500">{t(query.trim() ? 'noMatchingExercises' : 'choiceNoMatch')}</p>}
    {!searching && matches.length > 4 && <button type="button" disabled={disabled} onClick={() => setOffset(value => value + 4)} className="text-link"><RefreshCw size={16} />{t('choiceRotate')}</button>}
    {searching && matches.length > limit && <button type="button" onClick={() => setLimit(value => value + 12)} className="button-secondary">{t('choiceMore')}</button>}
    <p className="text-xs text-slate-500">{t('choiceDraftNotice')}</p>
  </div>;
}
