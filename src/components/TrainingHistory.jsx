import { useState } from 'react';
import { coachText } from '../coachLocale.js';
import { localDate } from '../domain/dates.js';

export function LogSummary({ log, lang = 'zh' }) {
  const c = (key, parameters) => coachText(lang, key, parameters);
  return <div className="text-xs text-slate-600 space-y-1">
    <p>{c(log.variant)} · {c(log.loadBasis)}{log.loadKg !== null && log.loadKg !== undefined ? ` · ${log.loadKg} kg` : !['none', 'description'].includes(log.loadBasis) ? ` · ${c('missingWeight')}` : ''}{log.resistanceLabel && ` · ${log.resistanceLabel}`}</p>
    <p>{c('actualSets')}: {log.sets.map(set => log.perSide ? c('actualSide', { first: set.value, second: set.otherSide }) : set.value).join(' · ')} {c(`unit_${log.unit}`)}</p>
    {log.planned && <p>{c('target')}: {log.planned.sets} × {log.planned.value} {c(`unit_${log.planned.unit}`)}</p>}
    <p>{c('quality')}: {c(log.quality)} · {c('symptoms')}: {c(log.symptoms === 'none' ? 'noSymptoms' : log.symptoms)}{log.rir !== null && log.rir !== undefined && ` · ${c('rirSummary', { value: log.rir })}`}</p>
    <p>{c('nextDay')}: {c(log.nextDay === 'good' ? 'nextDayGood' : log.nextDay)}</p>
  </div>;
}

export default function TrainingHistory({ lang = 'zh', logs = [], exercises = {}, onUpdateNextDay, busy = false, today = localDate() }) {
  const [error, setError] = useState('');
  const c = key => coachText(lang, key);
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const pending = sorted.filter(log => log.nextDay === 'pending' && log.date < today);
  const dates = [...new Set(sorted.map(log => log.date))];
  const update = async (log, status) => {
    setError('');
    try { await onUpdateNextDay(log, status); } catch { setError(c('saveFailed')); }
  };
  const renderLog = log => <div key={`${log.week}-${log.day}-${log.exerciseId}`} className="border rounded-lg border-slate-100 p-3"><p className="font-medium text-sm mb-2">{exercises[log.exerciseId]?.name || log.exerciseId}</p><LogSummary lang={lang} log={log} />{onUpdateNextDay && log.date < today && <div className="flex flex-wrap gap-2 mt-2"><button type="button" disabled={busy} onClick={() => update(log, 'good')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs disabled:opacity-50">{c('followupGood')}</button><button type="button" disabled={busy} onClick={() => update(log, 'worse')} className="rounded-lg border border-amber-200 px-3 py-2 text-xs disabled:opacity-50">{c('followupWorse')}</button></div>}</div>;
  const renderFollowup = log => <div key={`${log.week}-${log.date}-${log.day}-${log.exerciseId}`} className="border-t border-amber-100 pt-3 space-y-2" data-testid={`followup-${log.date}-${log.exerciseId}`}><p className="text-sm">{log.date} · {exercises[log.exerciseId]?.name || log.exerciseId}</p><p className="text-xs text-slate-600">{c('actualSets')}: {log.sets.map(set => log.perSide ? coachText(lang, 'actualSide', { first: set.value, second: set.otherSide }) : set.value).join(' · ')} {c(`unit_${log.unit}`)}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => update(log, 'good')} className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs disabled:opacity-50">{c('followupGood')}</button><button type="button" disabled={busy} onClick={() => update(log, 'worse')} className="rounded-lg bg-white border border-amber-300 px-3 py-2 text-xs disabled:opacity-50">{c('followupWorse')}</button></div></div>;
  return <section className="bg-white rounded-2xl p-5 border border-sky-100 space-y-4" data-testid="training-history">
    <h2 className="font-bold">{c('historyTitle')}</h2>
    {onUpdateNextDay && <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 space-y-3">
      <h3 className="font-semibold text-sm">{c('followupTitle')}{pending.length > 0 && ` · ${pending.length}`}</h3><p className="text-xs text-slate-600">{c('followupHint')}</p>
      {pending.length === 0 ? <p className="text-xs text-slate-500">{c('noPending')}</p> : <>{pending.slice(0, 3).map(renderFollowup)}{pending.length > 3 && <details><summary className="cursor-pointer text-sm text-amber-800">{c('moreFollowups')} · {pending.length - 3}</summary><div className="mt-3 space-y-3">{pending.slice(3).map(renderFollowup)}</div></details>}</>}
    </div>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {dates.length === 0 ? <p className="text-sm text-slate-500">{c('noLogs')}</p> : <>
      <section className="space-y-3" data-testid="latest-training-logs"><h3 className="font-semibold text-sm">{c('recentLogs')} · {dates[0]}</h3>{sorted.filter(log => log.date === dates[0]).map(renderLog)}</section>
      {dates.length > 1 && <details><summary className="cursor-pointer text-sm text-sky-700">{c('pastLogs')} · {dates.length - 1}</summary><div className="space-y-4 mt-4">{dates.slice(1).map(date => <section key={date} className="space-y-3"><h3 className="font-semibold text-sm">{date}</h3>{sorted.filter(log => log.date === date).map(renderLog)}</section>)}</div></details>}
    </>}
    <p className="text-xs text-slate-500">{c('historyScope')}</p>
  </section>;
}
