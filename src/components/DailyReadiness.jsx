import { useState } from 'react';
import { coachText } from '../coachLocale.js';
import { readinessForm, readinessInput, readinessMissing, readinessChanges } from '../domain/logForms.js';
import { evaluateReadiness, validateReadiness } from '../domain/coaching.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { localDate } from '../domain/dates.js';

export default function DailyReadiness({ lang = 'zh', value = null, date, onSave, preview = null, onPreview, onApply, busy = false, disabled = false, today = localDate(), exercises = {}, context = {} }) {
  const c = (key, parameters) => coachText(lang, key, parameters);
  const [form, setForm] = useState(() => readinessForm(value));
  const [dirty, setDirty] = useState(false);
  const [savedFingerprint, setSavedFingerprint] = useState(() => JSON.stringify(value));
  const fingerprint = JSON.stringify(value);
  if (fingerprint !== savedFingerprint) {
    setSavedFingerprint(fingerprint);
    if (!dirty) setForm(readinessForm(value));
  }
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewInput, setPreviewInput] = useState(null);
  const input = readinessInput(form, date);
  const decision = evaluateReadiness(input, { ...context, today });
  const blocked = disabled || busy || submitting || date > today;
  const missing = readinessMissing(input);
  const changes = preview ? readinessChanges(preview.original, preview.adapted) : [];
  const matchesPreview = preview && preview.date === date && previewInput === JSON.stringify(input);
  const change = (key, next) => { setDirty(true); setSuccess(false); setPreviewInput(null); setForm(current => ({ ...current, [key]: next })); };
  const act = async action => {
    setError(''); setSuccess(false);
    let record;
    try { record = validateReadiness(input, { today }); } catch { setError(c('invalidReadiness')); return; }
    setSubmitting(true);
    try {
      if (action === 'save') { await onSave(record); setSuccess(true); }
      else if (action === 'preview') { await onPreview(record); setPreviewInput(JSON.stringify(input)); }
      else { await onApply(record); setPreviewInput(null); setSuccess(true); }
    } catch (cause) { setError(c(cause.message === 'READINESS_PLAN_CHANGED' ? 'applyConflict' : 'saveFailed')); } finally { setSubmitting(false); }
  };
  const numeric = (key, max, step = '1') => <label className="block text-xs text-slate-600">{c(key)}<input type="number" inputMode="decimal" min="0" max={max} step={step} value={form[key]} onChange={event => change(key, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm" /></label>;
  const score = key => <label className="block text-xs text-slate-600">{c(key)} · {c('scoreHint')}<select value={form[key]} onChange={event => change(key, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm"><option value="">{c('unknown')}</option>{[0, 1, 2, 3, 4].map(value => <option key={value} value={value}>{value}</option>)}</select></label>;
  return <section className="bg-white rounded-2xl p-4 border border-sky-100 space-y-3" data-testid="daily-readiness" aria-label={c('readinessTitle')}>
    <h3 className="font-semibold">{c('readinessTitle')} · {date}</h3><p className="text-xs text-slate-500">{c('readinessHint')}</p>{date !== today && <p className="text-xs text-amber-700">{c('onlyToday')}</p>}
    <details><summary className="cursor-pointer text-sm text-sky-700">{value ? c('saved') : c('optional')} · {c(`readiness_${decision.action}`)}</summary>
      <fieldset disabled={blocked} className="mt-3 space-y-3 disabled:opacity-60">
        <div className="grid sm:grid-cols-2 gap-3">{numeric('sleepHours', '24', '0.5')}{score('fatigue')}{score('soreness')}
          <label className="block text-xs text-slate-800 font-semibold">{c('currentSymptoms')}<select value={form.symptoms} onChange={event => change('symptoms', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm">{[['unknown', 'unknown'], ['none', 'noSymptoms'], ['stable', 'stableSymptoms'], ['worse', 'worse'], ['red_flags', 'redFlags']].map(([value, label]) => <option key={value} value={value}>{c(label)}</option>)}</select></label>
        </div>
        <label className="block text-xs text-slate-700">{c('todayCourtIntensity')}<select value={form.todayCourtIntensity} onChange={event => change('todayCourtIntensity', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm">{[['unknown', 'unknown'], ['none', 'courtNone'], ['light', 'courtLight'], ['hard', 'courtHard']].map(([value, label]) => <option key={value} value={value}>{c(label)}</option>)}</select></label>
        <label className="block text-xs text-slate-700">{c('yesterdayCourt')}<select value={form.yesterdayCourt} onChange={event => { const next = event.target.value; setDirty(true); setSuccess(false); setPreviewInput(null); setForm(current => ({ ...current, yesterdayCourt: next, yesterdayCourtMinutes: '', yesterdayCourtRpe: '' })); }} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm">{[['unknown', 'unknown'], ['none', 'yesterdayNone'], ['yes', 'yesterdayYes']].map(([value, label]) => <option key={value} value={value}>{c(label)}</option>)}</select></label>
        {form.yesterdayCourt === 'yes' && <div className="rounded-lg bg-slate-50 p-3 space-y-3">{numeric('yesterdayCourtMinutes', '360')}{numeric('yesterdayCourtRpe', '10')}<p className="text-xs text-slate-500">{input.yesterdayCourtMinutes !== null && input.yesterdayCourtRpe !== null ? c('loadTrend', { value: input.yesterdayCourtMinutes * input.yesterdayCourtRpe }) : c('loadTrendMissing')}</p></div>}
        {missing.length > 0 && <p className="text-xs text-amber-800">{c('missingFields')}: {missing.map(key => c(key === 'symptoms' ? 'currentSymptoms' : key)).join('、')}</p>}
        <p className="text-sm font-medium">{c(`readiness_${decision.action}`)}</p>{decision.reasonCodes?.map(reason => <p key={reason} className="text-xs text-slate-600">{c(`reason_${reason}`)}</p>)}
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => act('save')} className="rounded-lg border border-sky-200 text-sky-700 px-3 py-2 text-sm">{c('saveReadiness')}</button>{onPreview && <button type="button" disabled={date !== today} onClick={() => act('preview')} className="rounded-lg bg-sky-600 text-white px-3 py-2 text-sm disabled:opacity-40">{c('previewReadiness')}</button>}</div>
      </fieldset>
      {matchesPreview && <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3 space-y-2" data-testid="readiness-preview">
        <h4 className="font-semibold text-sm">{c('previewTitle')}</h4><p className="text-sm">{c(`readiness_${preview.decision?.action || decision.action}`)}</p>
        {preview.changed ? <>
          <p className="text-sm font-semibold">{c('estimatedChange', { before: estimateSessionMinutes(preview.original, exercises, context.level || 1), after: estimateSessionMinutes(preview.adapted, exercises, context.level || 1) })}</p>
          <ul className="space-y-2 text-sm">{changes.map(change => <li key={change.id}><span className="font-medium">{exercises[change.id]?.name || change.id}</span>{change.removed ? ` · ${c('removedToday')}` : <><span className="block text-slate-600">{change.before.sets} × {change.before.value} {c(`unit_${change.before.unit}`)} → {change.after.sets} × {change.after.value} {c(`unit_${change.after.unit}`)}</span>{change.before.restSeconds !== change.after.restSeconds && <span className="block text-xs">{c('restChange', { before: change.before.restSeconds || 0, after: change.after.restSeconds || 0 })}</span>}{JSON.stringify(change.before.preparation) !== JSON.stringify(change.after.preparation) && <span className="block text-xs">{c('preparationChanged')}</span>}</>}</li>)}</ul>
          {changes.length === 0 && <p className="text-xs">{c('sessionChanged')}</p>}
          <details className="pt-2"><summary className="cursor-pointer text-xs text-slate-600">{c('fullComparison')}</summary><div className="grid sm:grid-cols-2 gap-3 mt-3">{[['original', preview.original], ['adapted', preview.adapted]].map(([key, day]) => day && <div key={key}><h5 className="text-xs font-semibold mb-1">{c(key)}</h5>{!day.routine.length && <p className="text-xs">{c('restDay')}</p>}<ul className="text-xs text-slate-600 list-disc pl-4">{day.routine.map(id => { const dose = day.prescriptions?.find(item => item.id === id); return <li key={id}>{exercises[id]?.name || id}{dose && ` · ${dose.sets} × ${dose.value} ${c(`unit_${dose.unit}`)}`}</li>; })}</ul></div>)}</div></details>
          <p className="text-xs text-slate-500">{c('previewHint')}</p>
          {onApply && <button type="button" disabled={blocked || date !== today} onClick={() => act('apply')} className="rounded-lg bg-indigo-600 text-white px-3 py-2 text-sm disabled:opacity-40">{c('applyReadiness')}</button>}
        </> : <p className="text-sm">{c('noAdjustment')}</p>}
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}{success && <p role="status" className="mt-3 text-sm text-emerald-700">{c('saved')}</p>}
    </details>
  </section>;
}
