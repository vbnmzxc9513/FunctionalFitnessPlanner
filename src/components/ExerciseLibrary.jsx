import { Loader2, Star, Trash2, Plus } from 'lucide-react';
import { useState } from 'react';
import { EXERCISE_CATEGORIES } from '../domain/exerciseCatalog.js';
import { LIBRARY_PURPOSES, libraryGroups, matchesLibraryPurpose, suggestedUses } from '../domain/library.js';
import { LIBRARY_TEXT } from '../libraryLocale.js';
import CreateExerciseDialog from './CreateExerciseDialog.jsx';
import ExerciseGuide from './ExerciseGuide.jsx';
import ExerciseTags, { BodyPartFilter } from './ExerciseTags.jsx';
import { matchesBodyPart, matchesExerciseQuery } from '../domain/exerciseTags.js';
import { weeklyChoiceBlockReason } from '../domain/weeklyChoices.js';
import { MAX_WEEKLY_CHOICES } from '../domain/trainingPreferences.js';

export default function ExerciseLibrary({ t, exercises, adding, onAdd, createScope = 'device', onToggle, onDelete, busy, canManage = true, lang = 'zh', onOrganize, onSignIn, weeklyExerciseIds = [], weeklyAvailable = {}, planningContext = {}, onToggleWeekly, onOpenWeeklySelection }) {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [bodyPart, setBodyPart] = useState('all');
  const [visibleCount, setVisibleCount] = useState(12);
  const [purpose, setPurpose] = useState('all');
  const [scope, setScope] = useState('all');
  const [managing, setManaging] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [organizeError, setOrganizeError] = useState('');
  const text = LIBRARY_TEXT[lang === 'en' ? 'en' : 'zh'];
  const showManagement = canManage && managing;
  const organizing = !!pendingId || busy;
  const entries = Object.entries(exercises).filter(([id, exercise]) => matchesLibraryPurpose(id, exercise, purpose, scope)
    && (!category || exercise.category === category) && matchesBodyPart(id, exercise, bodyPart)
    && matchesExerciseQuery(id, exercise, query, lang)).sort(([, left], [, right]) => Number(left.active === false) - Number(right.active === false));
  async function organize(id, groups) {
    if (!canManage) { onSignIn?.(); return; }
    if (!onOrganize || organizing) return;
    setPendingId(id); setOrganizeError('');
    try {
      const result = await onOrganize(id, groups);
      if (result === false) throw new Error('NOT_SAVED');
    } catch { setOrganizeError(text.savedFailure); }
    finally { setPendingId(null); }
  }
  return <section className="exercise-library" aria-label={t('exercisesTitle')}>
    {onOpenWeeklySelection && <button type="button" data-testid="library-auto-plan" onClick={onOpenWeeklySelection} className="text-link">{lang === 'zh' ? '用選取動作自動排課' : 'Plan with selected exercises'} · {weeklyExerciseIds.length}</button>}
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      {onAdd && <button type="button" data-testid="library-create-exercise" className="exercise-create-entry" disabled={adding} onClick={() => setCreating(true)}><Plus size={17} />{lang === 'en' ? 'Create exercise' : '新增自己的動作'}</button>}
      {canManage && <button type="button" aria-expanded={showManagement} aria-controls="exercise-management" onClick={() => setManaging(value => !value)} className="text-sm rounded-lg border border-sky-200 px-3 py-2 text-slate-600">{showManagement ? text.done : text.manage}</button>}
    </div>

    {!canManage && <p className="text-xs text-slate-500 mb-4">{text.loginHint} <button type="button" onClick={() => onSignIn?.()} className="text-indigo-700 underline">{text.login}</button></p>}
    {showManagement && <div id="exercise-management" className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 mb-5">
      <p className="text-sm text-slate-600 mb-3">{text.manageHint}</p>
      <p className="text-xs text-slate-500 mt-3">{t('catalogEligibilityNotice')}</p>
    </div>}
    <div className="flex gap-2 border-b border-sky-100 mb-4" role="group" aria-label={text.scope}>{['all', 'mine'].map(value => <button type="button" key={value} aria-pressed={scope === value} onClick={() => { setScope(value); setVisibleCount(12); }} className={`px-3 py-2 text-sm border-b-2 ${scope === value ? 'border-indigo-600 text-indigo-700 font-semibold' : 'border-transparent text-slate-500'}`}>{text[value]}</button>)}</div>
    <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label={text.purposes}>{['all', ...LIBRARY_PURPOSES].map(value => <button key={value} type="button" aria-pressed={purpose === value} onClick={() => { setPurpose(value); setVisibleCount(12); }} className={`rounded-full border px-3 py-1.5 text-sm ${purpose === value ? 'bg-sky-100 border-sky-300 text-sky-800' : 'border-slate-200 text-slate-600'}`}>{value === 'all' ? text.purposeAll : text[value]}</button>)}</div>
    <BodyPartFilter value={bodyPart} onChange={value => { setBodyPart(value); setVisibleCount(12); }} lang={lang} testId="library-body-part" />
    <input data-testid="library-search" aria-label={t('searchExercises')} placeholder={t('searchExercises')} value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(12); }} className="w-full rounded-lg border border-sky-200 p-2 text-sm" />
    <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer">{text.moreFilters}{category && ` · ${t(`category_${category}`)}`}</summary><select aria-label={t('filterCategory')} value={category} onChange={event => { setCategory(event.target.value); setVisibleCount(12); }} className="mt-2 max-w-full rounded-lg border border-sky-200 p-2 text-sm"><option value="">{t('allCategories')}</option>{EXERCISE_CATEGORIES.map(item => <option key={item} value={item}>{t(`category_${item}`)}</option>)}</select></details>
    <p className="text-xs text-slate-500 my-3" aria-live="polite">{text.count(entries.length)}</p>
    {organizeError && <p role="alert" className="text-sm text-red-600 my-3">{organizeError}</p>}
    <div className="library-grid">{entries.slice(0, visibleCount).map(([id, exercise]) => {
      const groups = libraryGroups(exercise);
      const selectedThisWeek = weeklyExerciseIds.includes(id);
      const weeklyBlock = weeklyChoiceBlockReason(id, exercises, planningContext, weeklyAvailable);
      return <article key={id} data-testid={`library-exercise-${id}`} className={`library-card ${exercise.active === false ? 'bg-slate-50' : ''}`}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0"><h3 className="font-semibold text-sm">{exercise.name}</h3><p className="text-xs text-sky-700 mt-1">{exercise.category ? t(`category_${exercise.category}`) : t(`type_${exercise.type}`)}{exercise.advanced && ` · ${t('advancedExercise')}`}{exercise.active === false && ` · ${text.disabled}`}</p><ExerciseTags id={id} exercise={exercise} lang={lang} compact /></div>
          {showManagement && <div className="flex flex-col gap-4 items-end shrink-0">
            <button type="button" disabled={busy} role="switch" aria-checked={exercise.active !== false} aria-label={exercise.name} onClick={() => onToggle(id)} className={`w-12 h-6 rounded-full relative ${exercise.active === false ? 'bg-slate-200' : 'bg-sky-500'}`}><span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white ${exercise.active === false ? '' : 'translate-x-6'}`} /></button>
            <button type="button" disabled={busy} aria-label={`${t('removeExercise')} ${exercise.name}`} onClick={() => onDelete(id)} className="text-red-500 p-1"><Trash2 size={18} /></button>
          </div>}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {onToggleWeekly && !id.startsWith('custom_') && <button type="button" data-testid={`library-weekly-${id}`} aria-pressed={selectedThisWeek} disabled={busy || !selectedThisWeek && (!!weeklyBlock || weeklyExerciseIds.length >= MAX_WEEKLY_CHOICES)} onClick={() => onToggleWeekly(id)} className={`rounded-lg border px-3 py-2 text-xs disabled:opacity-50 ${selectedThisWeek ? 'bg-sky-100 border-sky-300 text-sky-800' : 'border-slate-200 text-slate-600'}`}>{t(selectedThisWeek ? 'choiceRemove' : 'choiceSelect')}</button>}
          {(canManage || !id.startsWith('custom_')) && <button type="button" data-testid={`favorite-${id}`} disabled={!!organizing || (canManage && !onOrganize)} aria-label={`${!canManage ? text.favoriteLogin : groups.length ? text.removeFavorite : text.favorite} ${exercise.name}`} onClick={() => organize(id, groups.length ? [] : purpose === 'all' ? suggestedUses(id, exercise) : [purpose])} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-50 ${groups.length ? 'border-amber-200 text-amber-800 bg-amber-50' : 'border-slate-200 text-slate-600'}`}>
            {pendingId === id ? <Loader2 size={14} className="animate-spin" /> : <Star size={14} fill={groups.length ? 'currentColor' : 'none'} />}{!canManage ? text.favoriteLogin : groups.length ? text.removeFavorite : text.favorite}
          </button>}
          {groups.length > 0 && <p className="text-xs text-slate-500">{`${text.currentGroups}：${groups.map(group => text[group]).join(' · ')}`}</p>}
        </div>
        {onToggleWeekly && weeklyBlock && !id.startsWith('custom_') && <p className="text-xs text-slate-500 mt-2">{t(`choice_reason_${weeklyBlock}`)}</p>}
        {id.startsWith('custom_') && <p className="text-xs text-slate-500 mt-2">{lang === 'en' ? 'Custom · available in manual planning' : '自訂動作 · 可手動加入課表'}</p>}
        {!canManage && id.startsWith('custom_') && <button type="button" className="library-custom-delete" onClick={() => onDelete(id)}>{lang === 'en' ? 'Delete my exercise' : '刪除自訂動作'}</button>}
        {canManage && <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">{text.organize}</summary><p className="my-2">{text.groupHint}</p><div className="flex flex-wrap gap-3">{LIBRARY_PURPOSES.map(group => <label key={group} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={groups.includes(group)} disabled={!!organizing || !onOrganize} onChange={event => organize(id, event.target.checked ? [...groups, group] : groups.filter(item => item !== group))} />{text[group]}</label>)}</div></details>}
        <ExerciseGuide id={id} exercise={exercise} lang={lang} />
        {(exercise.prescription || exercise.equipmentOptions) && <details className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer text-slate-600">{text.details}</summary>
          <p className="mt-2">{text.doseHint}</p>
          {exercise.prescription && <p className="mt-2">{t('starterDoseLabel')} {exercise.prescription.sets} {t('setsUnit')} × {exercise.prescription.value} {t(exercise.prescription.unit)}{exercise.prescription.perSide && ` · ${t('eachSide')}`}{exercise.prescription.restSeconds > 0 && ` · ${t('restLabel')} ${exercise.prescription.restSeconds} ${t('seconds')}`}</p>}
          {exercise.equipmentOptions && <p className="mt-2">{t('equipmentLabel')}: {exercise.equipmentOptions.map(option => option.length ? option.map(item => t(`equipment_${item}`)).join(' + ') : t('equipment_bodyweight')).join(' / ')}{exercise.requiresPartner && ` · ${t('partnerRequired')}`}</p>}
        </details>}
      </article>;
    })}</div>{entries.length > visibleCount && <button type="button" data-testid="library-load-more" onClick={() => setVisibleCount(value => value + 12)} className="mt-4 w-full rounded-xl border border-sky-200 px-4 py-3 text-sm text-sky-700">{lang === 'en' ? `Show more (${Math.min(visibleCount, entries.length)} / ${entries.length})` : `顯示更多（${Math.min(visibleCount, entries.length)} / ${entries.length}）`}</button>}{!entries.length && <p className="text-sm text-slate-500">{scope === 'mine' ? text.emptyMine : t('noMatchingExercises')}</p>}
    {creating && <CreateExerciseDialog lang={lang} t={t} scope={createScope} initialPart={bodyPart} onSave={async form => { const saved = await onAdd(form); setQuery(saved.exercise.name); setScope('all'); setPurpose('all'); setBodyPart('all'); }} onClose={() => setCreating(false)} />}
  </section>;
}
