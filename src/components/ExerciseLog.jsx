import { useState } from 'react';
import { coachText } from '../coachLocale.js';
import { defaultLoadBasis, emptySet, trainingLogForm, trainingLogInput } from '../domain/logForms.js';
import { validateTrainingLog, recommendExercise, plannedSnapshot, VALUE_LIMITS } from '../domain/coaching.js';
import { localDate } from '../domain/dates.js';
import { LogSummary } from './TrainingHistory.jsx';

export default function ExerciseLog({ lang = 'zh', exercise, id, dose, phase: _phase, date: _plannedDate, week, day, logs = [], onSave, busy = false, disabled = false, context = {} }) {
  const c = (key, parameters) => coachText(lang, key, parameters);
  const saved = logs.find(log => log.exerciseId === id && log.week === week && log.day === day);
  const today = context.today || localDate();
  const date = saved?.date || today;
  const previous = [...logs].filter(log => log.exerciseId === id && log.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const [form, setForm] = useState(() => trainingLogForm(saved, dose.sets));
  const [dirty, setDirty] = useState(false);
  const [savedFingerprint, setSavedFingerprint] = useState(() => JSON.stringify(saved));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nextDayTouched, setNextDayTouched] = useState(false);
  const fingerprint = JSON.stringify(saved);
  if (fingerprint !== savedFingerprint && !dirty && !submitting) {
    setSavedFingerprint(fingerprint);
    setForm(trainingLogForm(saved, dose.sets));
    setNextDayTouched(false);
  }
  const nextDay = nextDayTouched ? form.nextDay : saved?.nextDay || form.nextDay;
  const blocked = busy || submitting || disabled || date > today;
  const currentSnapshot = plannedSnapshot(dose);
  const snapshot = saved?.planned || currentSnapshot;
  const logDose = saved ? { ...dose, unit: saved.unit, perSide: saved.perSide } : dose;
  const recommendation = recommendExercise(currentSnapshot, { ...exercise, id }, logs.filter(log => log.exerciseId === id), { ...context, today });
  const change = (key, value) => { setDirty(true); setSuccess(false); setForm(current => ({ ...current, [key]: value })); };
  const changeVariant = variant => { setDirty(true); setSuccess(false); setForm(current => ({ ...current, variant, loadBasis: defaultLoadBasis(variant), loadKg: '', resistanceLabel: '' })); };
  const updateSet = (index, key, value) => { setDirty(true); setSuccess(false); setForm(current => ({ ...current, sets: current.sets.map((set, i) => i === index ? { ...set, [key]: value } : set) })); };
  const save = async event => {
    event.preventDefault(); setError(''); setSuccess(false);
    let input;
    try { input = validateTrainingLog(trainingLogInput({ ...form, nextDay }, { week, day, exerciseId: id, date, unit: logDose.unit, perSide: !!logDose.perSide, planned: snapshot }), { today }); }
    catch { setError(c('invalidLog')); return; }
    setSubmitting(true);
    try { await onSave(input); setDirty(false); setNextDayTouched(false); setSuccess(true); } catch { setError(c('saveFailed')); } finally { setSubmitting(false); }
  };
  const number = (key, label, max, step = '1') => <label className="block text-xs text-slate-600">{label}<input type="number" inputMode="decimal" min="0" max={max} step={step} value={form[key]} onChange={event => change(key, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm bg-white" /></label>;
  return <div className="mt-3 border-t border-slate-100 pt-3" data-testid={`exercise-log-${id}`}>
    <details><summary className="cursor-pointer text-sm text-sky-700">{c('logTitle')}{saved && ` · ${c('saved')}`}</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-500">{c('logHint')}</p><p className="text-xs text-slate-600">{c('actualDate')}: {date}</p>
        {(saved || previous) && <div className="bg-slate-50 rounded-lg p-3"><p className="text-xs font-semibold mb-2">{c(saved ? 'todayLog' : 'lastLog')} · {(saved || previous).date}</p><LogSummary lang={lang} log={saved || previous} /></div>}
        <form onSubmit={save} className="space-y-3" aria-label={`${c('logTitle')} ${exercise.name}`}>
          <fieldset disabled={blocked} className="space-y-3 disabled:opacity-60">
            <legend className="text-sm font-semibold mb-2">{c('actual')} · {c(`unit_${logDose.unit}`)}{logDose.perSide && ` · ${c('actualSide', { first: c('leftSide'), second: c('rightSide') })}`}</legend>
            {form.sets.map((set, index) => <div key={index} className="grid grid-cols-2 gap-2 items-end">
              <label className={`text-xs text-slate-600 ${logDose.perSide ? '' : 'col-span-2'}`}>{c('set', { n: index + 1 })}{logDose.perSide && ` · ${c('leftSide')}`}<input required type="number" inputMode="decimal" min="0" max={VALUE_LIMITS[logDose.unit]} step={logDose.unit === 'reps' || logDose.unit === 'breaths' ? '1' : '0.1'} value={set.value} onChange={event => updateSet(index, 'value', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" /></label>
              {logDose.perSide && <label className="text-xs text-slate-600">{c('set', { n: index + 1 })} · {c('rightSide')}<input required type="number" inputMode="decimal" min="0" max={VALUE_LIMITS[logDose.unit]} step={logDose.unit === 'reps' || logDose.unit === 'breaths' ? '1' : '0.1'} value={set.otherSide} onChange={event => updateSet(index, 'otherSide', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" /></label>}
            </div>)}
            <div className="flex flex-wrap gap-2"><button type="button" disabled={form.sets.length >= 5} onClick={() => change('sets', [...form.sets, emptySet()])} className="border border-slate-200 rounded-lg px-3 py-2 text-xs disabled:opacity-40">{c('addSet')}</button><button type="button" disabled={form.sets.length <= 1} onClick={() => change('sets', form.sets.slice(0, -1))} className="border border-slate-200 rounded-lg px-3 py-2 text-xs disabled:opacity-40">{c('removeSet')}</button></div>
            <label className="block text-xs text-slate-600">{c('variant')}<select value={form.variant} onChange={event => changeVariant(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm">{['bodyweight', 'dumbbell', 'cable', 'band', 'other'].map(value => <option key={value} value={value}>{c(value)}</option>)}</select></label>
            {form.variant !== 'bodyweight' && <label className="block text-xs text-slate-600">{c('loadBasis')}<select value={form.loadBasis} onChange={event => { change('loadBasis', event.target.value); change('loadKg', ''); }} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm">{(form.variant === 'dumbbell' ? ['per_dumbbell', 'total', 'description'] : form.variant === 'cable' ? ['stack', 'description'] : form.variant === 'band' ? ['description'] : ['total', 'description']).map(value => <option key={value} value={value}>{c(value)}</option>)}</select></label>}
            {!['none', 'description'].includes(form.loadBasis) && number('loadKg', c('loadKg'), '500', '0.1')}
            {form.loadBasis === 'per_dumbbell' && <p className="text-xs text-slate-500">{c('perBellHint')}</p>}
            {form.variant === 'cable' && <p className="text-xs text-slate-500">{c('stackHint')}</p>}
            {<label className="block text-xs text-slate-600">{c('resistanceLabel')}<input required={form.loadBasis === 'description'} maxLength="120" value={form.resistanceLabel} placeholder={c(form.variant === 'bodyweight' ? 'bodyweightPlaceholder' : 'resistancePlaceholder')} onChange={event => change('resistanceLabel', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" /></label>}
            {form.variant === 'band' && <p className="text-xs text-slate-500">{c('bandHint')}</p>}
            {number('rir', c('rir'), '10')}
            <label className="block text-xs text-slate-600">{c('quality')}<select value={form.quality} onChange={event => change('quality', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm">{['unknown', 'good', 'unstable'].map(value => <option key={value} value={value}>{c(value)}</option>)}</select></label>
            <label className="block text-xs text-slate-600">{c('symptoms')}<select value={form.symptoms} onChange={event => change('symptoms', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm">{['unknown', 'none', 'worse'].map(value => <option key={value} value={value}>{c(value === 'none' ? 'noSymptoms' : value)}</option>)}</select></label>
            {date < today && <label className="block text-xs text-slate-600">{c('nextDay')}<select value={nextDay} onChange={event => { setNextDayTouched(true); change('nextDay', event.target.value); }} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm">{['pending', 'good', 'worse'].map(value => <option key={value} value={value}>{c(value === 'good' ? 'nextDayGood' : value)}</option>)}</select></label>}
            <button type="submit" className="rounded-lg bg-sky-600 text-white px-4 py-2 text-sm">{c('saveLog')}</button>
          </fieldset>
        </form>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{success && <p role="status" className="text-sm text-emerald-700">{c('saved')}</p>}
      </div>
    </details>
    <details className="mt-2"><summary className="cursor-pointer text-xs text-slate-600">{c('adviceTitle')}</summary><div className="rounded-lg bg-indigo-50 p-3 mt-2 space-y-2 text-xs">
      <p className="font-semibold">{c(`advice_${recommendation.code}`)}</p>
      {recommendation.reasonCodes?.map(reason => <p key={reason}>{c(`reason_${reason}`)}</p>)}
      {recommendation.code === 'progress_reps' && recommendation.parameters?.value && <p>{c('proposedReps', { value: recommendation.parameters.value })}</p>}
      {recommendation.code === 'consider_load' && recommendation.parameters?.incrementKg && <p>{c('proposedLoad', { value: recommendation.parameters.incrementKg })}</p>}
      {recommendation.evidenceDates?.length > 0 && <p>{c('evidence')}: {recommendation.evidenceDates.join(' · ')}</p>}
      <p className="text-slate-500">{c('adviceHint')}</p>
    </div></details>
  </div>;
}
