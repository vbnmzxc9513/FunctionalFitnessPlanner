import { Brain, CheckCircle2, Circle, Edit2, Feather, Info, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { getDateForWeekDay } from '../domain/dates.js';
import { exerciseKey, prescription } from '../domain/training.js';

export default function Training({ t, schedule, draft, activeDay, setActiveDay, currentWeek, exercises, progress, level,
  editing, selected, setSelected, onEdit, onCancel, onSave, onAdd, onRemove, onToggle, onFeedback, feedback, busy, saving, canEdit, canRestore, onRestore }) {
  const display = editing ? draft : schedule;
  const active = display.find(day => day.day === activeDay) || display[0];
  const ids = Object.keys(exercises).filter(id => exercises[id].active !== false && !exercises[id].deleted && !active.routine.includes(id));
  return <div>
    <div className="flex bg-white rounded-xl p-2 mb-6 gap-1 overflow-x-auto">
      {display.map(day => <button key={day.day} onClick={() => setActiveDay(day.day)} className={`flex-1 min-w-12 rounded-lg p-2 text-xs ${active.day === day.day ? 'bg-sky-600 text-white' : 'text-slate-500'}`}>
        <span className="block font-bold">{t('dayShort')[day.day - 1]}</span>
        <span className="block my-1">{getDateForWeekDay(currentWeek, day.day)}</span>
        {day.routine.length > 0 && day.routine.every(id => progress[exerciseKey(day.day, id)]) ? <CheckCircle2 size={14} className="mx-auto" /> : <Circle size={14} className="mx-auto" />}
      </button>)}
    </div>
    <div className="grid lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-700">{t('todaySchedule')}</h2>
          <div className="flex gap-2 text-xs">
            {!editing ? <button disabled={!canEdit || saving || busy} onClick={onEdit} className="flex items-center gap-1 text-sky-600 rounded-lg bg-sky-50 px-3 py-2 disabled:opacity-50"><Edit2 size={14} />{t('editSchedule')}</button> : <>
              <button disabled={saving} onClick={onCancel} className="flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2"><X size={14} />{t('cancelEdits')}</button>
              <button disabled={saving || !canEdit} onClick={onSave} className="flex items-center gap-1 bg-sky-600 text-white rounded-lg px-3 py-2 disabled:opacity-50">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{t('saveEdits')}</button>
            </>}
            {canRestore && !editing && <button disabled={saving} onClick={onRestore} className="text-sky-600">{t('aiRestoreBtn')}</button>}
          </div>
        </div>
        {active.routine.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-slate-500">{t('restDay')}</p>}
        {active.routine.map((id, index) => {
          const exercise = exercises[id];
          if (!exercise) return null;
          const done = !!progress[exerciseKey(active.day, id)];
          const params = prescription(id, exercise.type, level, exercise, active);
          return <div key={id} className={`p-4 rounded-xl border ${done && !editing ? 'bg-sky-50 border-sky-200' : 'bg-white border-sky-100'}`}>
            <div className="flex items-center gap-3">
              {editing ? <button aria-label={`${t('removeExercise')} ${exercise.name}`} onClick={() => onRemove(active.day, index)} className="p-2 text-red-500"><Trash2 size={20} /></button> :
                <button aria-label={exercise.name} aria-pressed={done} disabled={busy} onClick={() => onToggle(active.day, id)} className="flex items-center text-left gap-3 flex-1 disabled:opacity-50">
                  {done ? <CheckCircle2 size={24} className="text-sky-600 shrink-0" /> : <Circle size={24} className="text-slate-400 shrink-0" />}
                  <span className={done ? 'line-through text-slate-500' : 'text-slate-800'}>{index + 1}. {exercise.name}</span>
                </button>}
              {editing && <span>{index + 1}. {exercise.name}</span>}
            </div>
            <p className="text-xs text-slate-500 mt-2 ml-11">{params.sets} {t('setsUnit')} × {params.value} {t(params.unit)}{params.perSide && ` · ${t('eachSide')}`}{params.restSeconds > 0 && ` · ${t('restLabel')} ${params.restSeconds} ${t('seconds')}`}</p>
            {(!done || editing) && <div className="mt-3 ml-11 flex items-start text-xs text-slate-500 gap-2"><Info size={14} className="shrink-0 text-sky-500" /><span>{exercise.tip}</span></div>}
          </div>;
        })}
        {editing && <div className="p-4 rounded-xl border border-dashed border-slate-300 flex flex-wrap gap-3">
          <select aria-label={t('addExercise')} value={selected} onChange={event => setSelected(event.target.value)} className="flex-1 min-w-0 p-2 rounded-lg border border-slate-200 text-sm">
            <option value="">{t('addExercise')}</option>
            {ids.map(id => <option key={id} value={id}>{exercises[id].name}</option>)}
          </select>
          <button disabled={!selected} onClick={() => onAdd(active.day)} className="flex items-center gap-1 rounded-lg bg-sky-100 text-sky-700 px-3 py-2 disabled:opacity-50"><Plus size={16} />{t('exercisesAddBtn')}</button>
        </div>}
        <div className="bg-white rounded-2xl p-5 border border-sky-100">
          <h3 className="font-bold mb-2">{t('feedbackTitle')}</h3>
          <p className="text-xs text-slate-500 mb-4">{t('feedbackSubtitle')}</p>
          <div className="grid grid-cols-3 gap-2">
            {[[-1, 'feedbackHard'], [0, 'feedbackOk'], [1, 'feedbackEasy']].map(([value, label]) => <button key={value} disabled={busy} onClick={() => onFeedback(value)} aria-pressed={feedback === value} className={`rounded-lg p-2 text-sm border disabled:opacity-50 ${feedback === value ? 'bg-sky-100 border-sky-300 text-sky-700 font-bold' : 'bg-slate-50 border-slate-100'}`}>
              {t(label)}<span className="block text-xs mt-1 text-slate-500">{t(`${label}Sub`)}</span>
            </button>)}
          </div>
        </div>
      </div>
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-white rounded-2xl p-5 border border-sky-100">
          <h2 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Feather size={18} className="text-sky-600" />{active.theme}</h2>
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{active.concept}</p>
        </div>
        {active.coachAdvice && <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100">
          <h3 className="font-bold text-indigo-700 mb-3 flex items-center gap-2"><Brain size={18} />{t('coachAdvice')}</h3>
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{active.coachAdvice}</p>
        </div>}
      </div>
    </div>
  </div>;
}
