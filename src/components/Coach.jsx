import { Brain } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import Onboarding from './Onboarding.jsx';

export default function Coach({ t, plan, editing, setEditing, generating, apiKey, goal, setGoal, time, setTime, message, setMessage, context, setContext, onGenerate, onRestore, mode, setMode, trialAvailable, focus, setFocus }) {
  return <section className="bg-white p-5 rounded-2xl border border-sky-100 space-y-5">
    <h2 className="text-lg font-bold text-indigo-600 flex items-center gap-2"><Brain size={24} />{t('plannerTitle')}</h2>
    <fieldset><legend className="text-sm mb-2">{t('plannerMode')}</legend><div className="flex flex-wrap gap-2">{['template', 'byok', 'trial'].map(value => <button type="button" key={value} aria-pressed={mode === value} disabled={generating || (value === 'trial' && !trialAvailable)} onClick={() => setMode(value)} className={`rounded-lg px-3 py-2 text-sm disabled:opacity-50 ${mode === value ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>{t(`mode_${value}`)}</button>)}</div></fieldset>
    <p className="text-sm text-slate-500">{t(`${mode}Description`)}</p>
    {!trialAvailable && <p className="text-xs text-slate-500">{t('trialUnavailable')}</p>}
    {mode === 'byok' && !apiKey && <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-4">{t('aiNoKey')}</p>}
    {plan && !editing ? <>
      <h3 className="font-bold">{t('aiConclusionTitle')}</h3>
      <div className="text-sm text-slate-700 leading-relaxed [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-indigo-700 [&_h3]:my-5 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"><ReactMarkdown>{plan.conclusion}</ReactMarkdown></div>
      <button onClick={() => setEditing(true)} className="text-sm text-indigo-600 rounded-lg bg-indigo-50 px-4 py-2">{t('aiTweakBtn')}</button>
    </> : <>
      {editing && <p className="text-sm text-indigo-600">{t('aiEditingHint')}</p>}
      <Onboarding t={t} context={context} setContext={setContext} time={time} setTime={setTime} goal={goal} setGoal={setGoal} message={message} setMessage={setMessage} generating={generating} onGenerate={onGenerate} mode={mode} focus={focus} setFocus={setFocus} />
      {editing && <button type="button" onClick={() => setEditing(false)} className="text-sm">{t('aiCancelBtn')}</button>}
    </>}
    {plan?.previous && <button disabled={generating} onClick={onRestore} className="text-sm text-indigo-600">{t('aiRestoreBtn')}</button>}
  </section>;
}
