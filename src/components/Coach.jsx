import { SlidersHorizontal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Onboarding from './Onboarding.jsx';

export default function Coach({ t, plan, editing, setEditing, generating, apiKey, goal, setGoal, time, setTime, message, setMessage, context, setContext, onGenerate, onRestore, mode = 'template', setMode, trialAvailable, focus, setFocus, standalone = false, onClose }) {
  const showForm = standalone || !plan || editing;
  const advancedOptions = <details data-testid="planner-advanced" open={mode !== 'template' || undefined} onToggle={event => { if (!event.currentTarget.open && mode !== 'template') { if (generating) event.currentTarget.open = true; else setMode('template'); } }} className="rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600">{t('plannerAdvancedAI')}</summary>
        <div className="space-y-3 mt-4">
          <p className="text-xs text-slate-500">{t('plannerAdvancedHint')}</p>
          <fieldset disabled={generating}><legend className="text-sm mb-2">{t('plannerMode')}</legend><div className="flex flex-wrap gap-2">{['template', 'byok', 'trial'].map(value => <button type="button" key={value} aria-pressed={mode === value} disabled={generating || (value === 'trial' && !trialAvailable)} onClick={() => setMode(value)} className={`rounded-lg px-3 py-2 text-sm disabled:opacity-50 ${mode === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{t(`mode_${value}`)}</button>)}</div></fieldset>
          {!trialAvailable && <p className="text-xs text-slate-500">{t('trialUnavailable')}</p>}
          {mode === 'byok' && !apiKey && <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-4">{t('aiNoKey')}</p>}
        </div>
      </details>;
  return <section className={standalone ? "panel space-y-5" : "bg-white p-5 rounded-2xl border border-sky-100 space-y-5"} data-testid="planner-conditions">
    {standalone && <h2 className="text-2xl font-bold text-slate-800">{t('plannerConditionsTitle')}</h2>}
    <details open={showForm} onToggle={event => { const open = event.currentTarget.open; if (!open && generating) { event.currentTarget.open = true; return; } if (plan && open !== editing) setEditing(open); if (!open && mode !== 'template') setMode('template'); }}>
      <summary tabIndex={standalone ? -1 : undefined} aria-hidden={standalone || undefined} data-testid="planner-edit-conditions" className={standalone ? "sr-only" : "cursor-pointer text-lg font-bold text-indigo-600"}><SlidersHorizontal size={20} className="inline mr-2" />{t('plannerConditionsTitle')}</summary>
      <div className="space-y-5 mt-5">
      <p className="text-sm text-slate-600">{t('plannerConditionsHint')}</p>
      {editing && !standalone && <p className="text-sm text-slate-600">{t('aiEditingHint')}</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-slate-600">{t('plannerMode')}：</span><span className="rounded-lg bg-sky-50 px-3 py-2 text-indigo-700 font-semibold" data-testid="planner-current-mode">{t(`mode_${mode}`)}</span>{mode !== 'template' && <button type="button" disabled={generating} onClick={() => setMode('template')} className="underline text-indigo-600">{t('plannerUseFree')}</button>}</div>

      <Onboarding advancedOptions={advancedOptions} t={t} context={context} setContext={setContext} time={time} setTime={setTime} goal={goal} setGoal={setGoal} message={message} setMessage={setMessage} generating={generating} onGenerate={onGenerate} mode={mode} focus={focus} setFocus={setFocus} />
      {editing && <button type="button" disabled={generating} onClick={() => { setEditing(false); setMode('template'); onClose?.(); }} className="text-sm text-slate-600 underline">{t('aiCancelBtn')}</button>}
      </div>
    </details>
    {plan && <details className="rounded-xl bg-slate-50 p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-600">{t('aiConclusionTitle')}</summary><div className="mt-4 text-sm text-slate-700 leading-relaxed [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-indigo-700 [&_h3]:my-4 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"><ReactMarkdown>{plan.conclusion}</ReactMarkdown></div></details>}
    {plan?.previous && <button type="button" disabled={generating} onClick={onRestore} className="text-sm text-indigo-600 underline">{t('aiRestoreBtn')}</button>}
  </section>;
}
