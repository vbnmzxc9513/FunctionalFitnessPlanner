import { Dumbbell, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EXERCISE_CATEGORIES } from '../domain/exerciseCatalog.js';

export default function ExerciseLibrary({ t, exercises, name, setName, adding, onAdd, onToggle, onDelete, busy }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const entries = Object.entries(exercises).filter(([, exercise]) => !exercise.deleted
    && (!category || exercise.category === category)
    && `${exercise.name} ${exercise.catalogCode || ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="bg-white p-5 rounded-2xl border border-sky-100">
    <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Dumbbell size={20} className="text-indigo-600" />{t('exercisesTitle')}</h2>
    <p className="text-sm text-slate-500 mb-4">{t('exercisesSubtitle')}</p>
    <form onSubmit={event => { event.preventDefault(); onAdd(); }} className="flex gap-2 mb-6">
      <input aria-label={t('exercisesPlaceholder')} value={name} onChange={event => setName(event.target.value)} placeholder={t('exercisesPlaceholder')} maxLength={150} className="flex-1 min-w-0 bg-slate-50 border border-sky-200 rounded-xl px-4 py-2 text-sm" />
      <button disabled={adding || !name.trim()} className="bg-indigo-600 text-white px-4 py-2 rounded-xl disabled:opacity-50">{adding ? <Loader2 size={16} className="animate-spin" /> : t('exercisesAddBtn')}</button>
    </form>
    <div className="flex flex-wrap gap-3 mb-4"><input aria-label={t('searchExercises')} placeholder={t('searchExercises')} value={query} onChange={event => setQuery(event.target.value)} className="flex-1 min-w-0 rounded-lg border border-sky-200 p-2 text-sm" /><select aria-label={t('filterCategory')} value={category} onChange={event => setCategory(event.target.value)} className="rounded-lg border border-sky-200 p-2 text-sm"><option value="">{t('allCategories')}</option>{EXERCISE_CATEGORIES.map(item => <option key={item} value={item}>{t(`category_${item}`)}</option>)}</select></div>
    <p className="text-xs text-slate-500 mb-4">{t('catalogEligibilityNotice')}</p>
    <div className="space-y-3">{entries.map(([id, exercise]) => <div key={id} className={`p-4 rounded-xl border border-sky-100 flex gap-3 ${exercise.active === false ? 'opacity-60' : ''}`}>
      <div className="flex-1"><h3 className="font-semibold text-sm">{exercise.name}</h3><span className="text-xs text-sky-600">{exercise.catalogCode && `${exercise.catalogCode} · `}{exercise.category ? t(`category_${exercise.category}`) : t(`type_${exercise.type}`)}{exercise.advanced && ` · ${t('advancedExercise')}`}</span><p className="text-xs mt-2 text-slate-500">{exercise.tip}</p>
        {exercise.prescription && <p className="text-xs text-slate-500 mt-2">{t('starterDoseLabel')} {exercise.prescription.sets} {t('setsUnit')} × {exercise.prescription.value} {t(exercise.prescription.unit)}{exercise.prescription.perSide && ` · ${t('eachSide')}`}{exercise.prescription.restSeconds > 0 && ` · ${t('restLabel')} ${exercise.prescription.restSeconds} ${t('seconds')}`}</p>}
        {exercise.equipmentOptions && <p className="text-xs text-slate-500 mt-2">{t('equipmentLabel')}: {exercise.equipmentOptions.map(option => option.length ? option.map(item => t(`equipment_${item}`)).join(' + ') : t('equipment_bodyweight')).join(' / ')}{exercise.requiresPartner && ` · ${t('partnerRequired')}`}</p>}
      </div>
      <div className="flex flex-col gap-3 items-end">
        <button disabled={busy} role="switch" aria-checked={exercise.active !== false} aria-label={exercise.name} onClick={() => onToggle(id)} className={`w-12 h-6 rounded-full relative ${exercise.active === false ? 'bg-slate-200' : 'bg-sky-500'}`}><span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white ${exercise.active === false ? '' : 'translate-x-6'}`} /></button>
        <button disabled={busy} aria-label={`${t('removeExercise')} ${exercise.name}`} onClick={() => onDelete(id)} className="text-red-500"><Trash2 size={18} /></button>
      </div>
    </div>)}</div>{!entries.length && <p className="text-sm text-slate-500">{t('noMatchingExercises')}</p>}
  </section>;
}
