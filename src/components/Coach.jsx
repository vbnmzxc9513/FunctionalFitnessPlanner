import { Brain, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function Coach({ t, plan, editing, setEditing, generating, apiKey, goal, setGoal, time, setTime, message, setMessage, onGenerate, onRestore }) {
  return <section className="bg-white p-5 rounded-2xl border border-sky-100 space-y-5">
    <h2 className="text-lg font-bold text-indigo-600 flex items-center gap-2"><Brain size={24} />{t('aiCoachTitle')}</h2>
    {!apiKey && <p className="text-sm text-amber-700 bg-amber-50 rounded-xl p-4">{t('aiNoKey')}</p>}
    {plan && !editing ? <>
      <h3 className="font-bold">{t('aiConclusionTitle')}</h3>
      <div className="text-sm text-slate-700 leading-relaxed [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-indigo-700 [&_h3]:my-5 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"><ReactMarkdown>{plan.conclusion}</ReactMarkdown></div>
      <button onClick={() => setEditing(true)} className="text-sm text-indigo-600 rounded-lg bg-indigo-50 px-4 py-2">{t('aiTweakBtn')}</button>
    </> : <form onSubmit={event => { event.preventDefault(); onGenerate(); }} className="space-y-4">
      {editing && <p className="text-sm text-indigo-600">{t('aiEditingHint')}</p>}
      <label className="block text-sm">{t('aiGoalLabel')}<input value={goal} onChange={event => setGoal(event.target.value)} placeholder={t('aiGoalPlaceholder')} className="mt-2 w-full rounded-xl border border-sky-200 p-3" /></label>
      <label className="block text-sm">{t('aiTimeLabel')}<input type="number" min="5" max="240" required value={time} onChange={event => setTime(event.target.value)} className="mt-2 w-full rounded-xl border border-sky-200 p-3" /></label>
      <p className="text-xs text-slate-500">{t('aiTip')}</p>
      <label className="block text-sm">{t('aiMessageLabel')}<textarea value={message} onChange={event => setMessage(event.target.value)} placeholder={editing ? t('aiMessagePlaceholderEditing') : t('aiMessagePlaceholder')} className="mt-2 w-full rounded-xl border border-sky-200 p-3 h-24" /></label>
      <button disabled={generating} className="bg-indigo-600 text-white px-4 py-3 rounded-xl disabled:opacity-50">{generating ? <span className="flex gap-2"><Loader2 className="animate-spin" size={16} />{t('aiGenerating')}</span> : plan ? t('aiRegenerateBtn') : t('aiGenerateBtn')}</button>
      {editing && <button type="button" onClick={() => setEditing(false)} className="ml-3 text-sm">{t('aiCancelBtn')}</button>}
    </form>}
    {plan?.previous && <button disabled={generating} onClick={onRestore} className="text-sm text-indigo-600">{t('aiRestoreBtn')}</button>}
  </section>;
}
