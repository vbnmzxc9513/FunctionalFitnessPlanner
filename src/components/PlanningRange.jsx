import { ArrowRight } from 'lucide-react';
import { defaultPlanningRange, enumeratePeriodDates, normalizePlanningRange } from '../domain/periodPlanning.js';
import { isCalendarDate, localDate } from '../domain/dates.js';
import { periodText } from '../periodLocale.js';

export default function PlanningRange({ range, onChange, today = localDate(), disabled = false, onContinue, lang = 'zh' }) {
  const p = periodText(lang);
  const value = range || defaultPlanningRange(today);
  let valid = true; let count = 0;
  try { count = enumeratePeriodDates(normalizePlanningRange(value, today)).length; } catch { valid = false; }
  const preset = days => {
    const from = isCalendarDate(value.from) && value.from >= today ? value.from : today;
    const end = new Date(`${from}T12:00:00Z`);
    end.setUTCDate(end.getUTCDate() + days - 1);
    onChange({ from, to: end.toISOString().slice(0, 10) });
  };
  return <form className="panel space-y-5" data-testid="planning-range" onSubmit={event => { event.preventDefault(); if (valid) onContinue?.(); }}>
    <h2 className="text-2xl font-bold text-slate-800">{p('rangeTitle')}</h2><p className="section-copy">{p('rangeHint')}</p>
    <fieldset disabled={disabled} className="space-y-4"><div className="grid sm:grid-cols-2 gap-4">{['from', 'to'].map(key => <label key={key} className="block text-sm font-medium">{p(key)}<input required type="date" min={key === 'to' ? value.from || today : today} value={value[key] || ''} onChange={event => onChange({ ...value, [key]: event.target.value })} aria-invalid={!valid} aria-describedby="planning-range-rules" className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label>)}</div>
      <div className="flex flex-wrap gap-2">{[7, 14, 28].map(days => <button key={days} type="button" aria-pressed={valid && count === days} onClick={() => preset(days)} className={`rounded-xl px-4 py-3 text-sm ${valid && count === days ? 'bg-indigo-600 text-white' : 'bg-sky-50 text-indigo-700'}`}>{days} {p('days')}</button>)}</div>
    </fieldset>
    <p id="planning-range-rules" className={`text-sm ${valid ? 'text-indigo-700' : 'text-amber-800'}`} role={valid ? 'status' : 'alert'}>{valid ? `${value.from} – ${value.to} · ${count} ${p('days')}` : p('invalid')}</p>
    <div className="setup-actions"><span /><button type="submit" disabled={disabled || !valid} className="button-primary" data-testid="planning-range-continue">{p('next')}<ArrowRight size={16} /></button></div>
  </form>;
}
