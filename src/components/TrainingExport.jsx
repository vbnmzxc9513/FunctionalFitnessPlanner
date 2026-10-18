import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Loader2, Share2 } from 'lucide-react';
import { exportText } from '../exportLocale.js';
import { buildTrainingReport, exportPreset, reportNotes, trainingReportCsv, trainingReportText, validateExportRange } from '../domain/trainingExport.js';
import { loadTrainingExport } from '../services/trainingExport.js';
import { copyExportText, downloadExportCsv } from '../services/exportFiles.js';

export default function TrainingExport({ lang = 'zh', today, uid, publicDraft, exercises = {}, sourceVersion, disabled = false }) {
  const t = exportText(lang);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(() => exportPreset('seven', today));
  const [options, setOptions] = useState({ includeCompletions: true, includeDescriptions: false, includeResponses: false });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const request = useRef(0);
  useEffect(() => () => { ++request.current; }, []);
  const localRecords = publicDraft?.periodDraft || publicDraft;
  const fingerprint = JSON.stringify({ range, options, lang, today, sourceVersion, exercises,
    previewRecords: uid ? null : { logs: localRecords?.logs, completed: localRecords?.completed, completedAt: localRecords?.completedAt,
      progressByWeek: localRecords?.progressByWeek, range: localRecords?.range } });
  const stale = !!preview && preview.fingerprint !== fingerprint;
  let rangeError = false;
  try { validateExportRange(range.from, range.to, today); } catch { rangeError = true; }
  const createPreview = async event => {
    event.preventDefault();
    if (busy || disabled || rangeError) return;
    const ticket = ++request.current;
    setBusy(true); setStatus(''); setPreview(null);
    try {
      const data = uid ? await loadTrainingExport(uid, { ...range, today, ...options }) : {
        logs: localRecords?.logs || [],
        progress: localRecords?.progressByWeek || (publicDraft ? { [publicDraft.week]: { completed: publicDraft.completed, completedAt: publicDraft.completedAt } } : {}),
      };
      const report = buildTrainingReport({ ...data, ...range, ...options, today, exercises, source: uid ? 'cloud' : 'preview' });
      if (request.current === ticket) setPreview({ report, fingerprint });
    } catch (error) {
      if (request.current === ticket) setStatus(error.message === 'EXPORT_TOO_LARGE' ? t.tooLarge : error.message === 'INVALID_EXPORT_RANGE' ? t.invalidRange : t.loadFailed);
    } finally { if (request.current === ticket) setBusy(false); }
  };
  const text = preview ? trainingReportText(preview.report, lang) : '';
  const action = async kind => {
    if (!preview || stale || busy || disabled || !preview.report.entries.length) return;
    const ticket = ++request.current;
    setBusy(true); setStatus('');
    try {
      if (kind === 'download') {
        downloadExportCsv(trainingReportCsv(preview.report, lang), `fitness-training-${preview.report.from}-to-${preview.report.to}.csv`);
        if (ticket === request.current) setStatus(t.downloaded);
      } else if (kind === 'share') await navigator.share({ title: t.report, text });
      else { await copyExportText(text); if (ticket === request.current) setStatus(t.copied); }
    } catch (error) { if (ticket === request.current && error.name !== 'AbortError') setStatus(t.failed); }
    finally { if (ticket === request.current) setBusy(false); }
  };
  return <section data-testid="training-export" className="panel space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-800">{t.title}</h2><p className="text-sm text-slate-500 mt-1">{t.intro}</p></div><button type="button" aria-expanded={open} aria-controls="training-export-form" onClick={() => setOpen(value => !value)} className="button-secondary"><Share2 size={16} />{open ? t.close : t.open}</button></div>
    {open && <div id="training-export-form" className="space-y-4">
      <form onSubmit={createPreview} className="space-y-4">
        <div className="flex flex-wrap gap-2">{['seven', 'thirty', 'week'].map(preset => <button type="button" key={preset} disabled={busy} onClick={() => { setRange(exportPreset(preset, today)); setStatus(''); }} className="button-secondary text-sm">{t[preset]}</button>)}</div>
        <div className="grid sm:grid-cols-2 gap-3">{['from', 'to'].map(field => <label key={field} className="text-sm text-slate-600 min-w-0">{t[field]}<input data-testid={`export-${field}`} required type="date" max={today} value={range[field]} disabled={busy} onChange={event => { setRange(previous => ({ ...previous, [field]: event.target.value })); setStatus(''); }} className="block w-full min-w-0 rounded-xl border border-slate-200 p-3 mt-1" /></label>)}</div>
        <p className="text-xs text-slate-500">{t.rangeHint}</p>
        <fieldset className="space-y-3"><legend className="text-sm font-semibold text-slate-700 mb-3">{t.options}</legend>{[['includeCompletions', 'completions'], ['includeDescriptions', 'descriptions'], ['includeResponses', 'responses']].map(([key, label]) => <label key={key} className="flex items-start gap-3 text-sm text-slate-600"><input data-testid={`export-${key}`} type="checkbox" checked={options[key]} disabled={busy} onChange={event => { setOptions(previous => ({ ...previous, [key]: event.target.checked })); setStatus(''); }} className="mt-1 shrink-0" />{t[label]}</label>)}</fieldset>
        <p className="text-xs text-slate-500 leading-relaxed">{t.privacy}</p>
        {rangeError && <p role="alert" className="text-sm text-amber-800">{t.invalidRange}</p>}
        <button type="submit" data-testid="export-preview" disabled={busy || disabled || rangeError} className="button-primary disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}{busy ? t.loading : t.preview}</button>
      </form>
      {status && <p role="status" className="text-sm text-sky-800">{status}</p>}
      {preview && <section data-testid="export-result" className="space-y-4 border-t border-slate-100 pt-4" aria-label={t.previewTitle}>
        <h3 className="font-semibold text-slate-800">{t.previewTitle}</h3>
        {stale && <p role="status" className="text-sm text-amber-800">{t.stale}</p>}
        <p className="text-sm text-slate-700" data-testid="export-counts">{t.actual}: {preview.report.counts.actual} · {t.days}: {preview.report.counts.actualDays} · {t.completion}: {preview.report.counts.completion}</p>
        {reportNotes(preview.report, lang).map(note => <p key={note} className="text-xs text-slate-500 leading-relaxed">{note}</p>)}
        {!stale && (preview.report.entries.length ? <>
          <textarea data-testid="export-text" aria-label={t.previewTitle} value={text} readOnly rows={12} className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed" />
          <div className="flex flex-wrap gap-2"><button type="button" data-testid="export-copy" disabled={stale || busy || disabled} onClick={() => action('copy')} className="button-primary disabled:opacity-50"><Copy size={16} />{t.copy}</button><button type="button" data-testid="export-download" disabled={stale || busy || disabled} onClick={() => action('download')} className="button-secondary disabled:opacity-50"><Download size={16} />{t.download}</button>{typeof navigator.share === 'function' && <button type="button" data-testid="export-share" disabled={stale || busy || disabled} onClick={() => action('share')} className="button-secondary disabled:opacity-50"><Share2 size={16} />{t.share}</button>}</div>
        </> : <p className="text-sm text-slate-500">{t.empty}</p>)}
      </section>}
    </div>}
  </section>;
}
