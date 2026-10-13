import { Dumbbell, Loader2, Trash2 } from 'lucide-react';

export default function ExerciseLibrary({ t, exercises, name, setName, adding, onAdd, onToggle, onDelete, busy }) {
  return <section className="bg-white p-5 rounded-2xl border border-sky-100">
    <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Dumbbell size={20} className="text-indigo-600" />{t('exercisesTitle')}</h2>
    <p className="text-sm text-slate-500 mb-4">{t('exercisesSubtitle')}</p>
    <form onSubmit={event => { event.preventDefault(); onAdd(); }} className="flex gap-2 mb-6">
      <input aria-label={t('exercisesPlaceholder')} value={name} onChange={event => setName(event.target.value)} placeholder={t('exercisesPlaceholder')} maxLength={150} className="flex-1 min-w-0 bg-slate-50 border border-sky-200 rounded-xl px-4 py-2 text-sm" />
      <button disabled={adding || !name.trim()} className="bg-indigo-600 text-white px-4 py-2 rounded-xl disabled:opacity-50">{adding ? <Loader2 size={16} className="animate-spin" /> : t('exercisesAddBtn')}</button>
    </form>
    <div className="space-y-3">{Object.entries(exercises).filter(([, exercise]) => !exercise.deleted).map(([id, exercise]) => <div key={id} className={`p-4 rounded-xl border border-sky-100 flex gap-3 ${exercise.active === false ? 'opacity-60' : ''}`}>
      <div className="flex-1"><h3 className="font-semibold text-sm">{exercise.name}</h3><span className="text-xs text-sky-600">{t(`type_${exercise.type}`)}</span><p className="text-xs mt-2 text-slate-500">{exercise.tip}</p></div>
      <div className="flex flex-col gap-3 items-end">
        <button disabled={busy} role="switch" aria-checked={exercise.active !== false} aria-label={exercise.name} onClick={() => onToggle(id)} className={`w-12 h-6 rounded-full relative ${exercise.active === false ? 'bg-slate-200' : 'bg-sky-500'}`}><span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white ${exercise.active === false ? '' : 'translate-x-6'}`} /></button>
        <button disabled={busy} aria-label={`${t('removeExercise')} ${exercise.name}`} onClick={() => onDelete(id)} className="text-red-500"><Trash2 size={18} /></button>
      </div>
    </div>)}</div>
  </section>;
}
