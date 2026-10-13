import { Brain, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { EQUIPMENT } from '../domain/exerciseCatalog.js';

export default function Coach({ t, plan, editing, setEditing, generating, apiKey, goal, setGoal, time, setTime, message, setMessage, context, setContext, onGenerate, onRestore }) {
  const change = (key, value) => setContext(previous => ({ ...previous, [key]: value }));
  const toggle = (key, value) => change(key, context[key].includes(value) ? context[key].filter(item => item !== value) : [...context[key], value]);
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
      <fieldset className="rounded-xl border border-sky-100 p-4 space-y-4">
        <legend className="text-sm font-semibold px-1">{t('planningInputsTitle')}</legend>
        <p className="text-xs text-slate-500">{t('planningLocalNotice')}</p>
        <fieldset><legend className="text-sm mb-2">{t('badmintonDaysLabel')}</legend><div className="flex flex-wrap gap-3">{t('allDayNames').map((name, index) => <label key={name} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={context.badmintonDays.includes(index + 1)} onChange={() => toggle('badmintonDays', index + 1)} />{name}</label>)}</div></fieldset>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm">{t('badmintonMinutesLabel')}<input type="number" min="1" max="360" value={context.badmintonMinutes} onChange={event => change('badmintonMinutes', event.target.value)} className="mt-2 w-full rounded-lg border border-sky-200 p-2" /></label>
          <label className="block text-sm">{t('badmintonIntensityLabel')}<select value={context.badmintonIntensity} onChange={event => change('badmintonIntensity', event.target.value)} className="mt-2 w-full rounded-lg border border-sky-200 p-2">{['unknown', 'light', 'mixed', 'hard'].map(value => <option key={value} value={value}>{t(`intensity_${value}`)}</option>)}</select></label>
          <label className="block text-sm">{t('experienceLabel')}<select value={context.experience} onChange={event => change('experience', event.target.value)} className="mt-2 w-full rounded-lg border border-sky-200 p-2">{['beginner', 'intermediate', 'advanced'].map(value => <option key={value} value={value}>{t(`experience_${value}`)}</option>)}</select></label>
          <label className="block text-sm">{t('competitionDateLabel')}<input type="date" value={context.competitionDate} onChange={event => change('competitionDate', event.target.value)} className="mt-2 w-full rounded-lg border border-sky-200 p-2" /></label>
        </div>
        <fieldset><legend className="text-sm mb-2">{t('equipmentLabel')}</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{EQUIPMENT.map(item => <label key={item} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={context.equipment.includes(item)} onChange={() => toggle('equipment', item)} />{t(`equipment_${item}`)}</label>)}</div><p className="text-xs text-slate-500 mt-2">{t('bodyweightAlwaysAvailable')}</p></fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={context.partnerAvailable} onChange={event => change('partnerAvailable', event.target.checked)} />{t('partnerAvailableLabel')}</label>
        <label className="block text-sm">{t('shoulderStatusLabel')}<select value={context.healthStatus} onChange={event => change('healthStatus', event.target.value)} className="mt-2 w-full rounded-lg border border-sky-200 p-2">{['unrestricted', 'restricted', 'unknown'].map(value => <option key={value} value={value}>{t(`health_${value}`)}</option>)}</select></label>
        <label className="block text-sm">{t('healthNotesLabel')}<textarea maxLength={2000} value={context.healthNotes} onChange={event => change('healthNotes', event.target.value)} placeholder={t('healthNotesPlaceholder')} className="mt-2 w-full rounded-lg border border-sky-200 p-2 h-20" /></label>
        <label className="block text-sm">{t('recoveryNotesLabel')}<textarea maxLength={2000} value={context.recoveryNotes} onChange={event => change('recoveryNotes', event.target.value)} placeholder={t('recoveryNotesPlaceholder')} className="mt-2 w-full rounded-lg border border-sky-200 p-2 h-20" /></label>
      </fieldset>
      <p className="text-xs text-slate-500">{t('aiTip')}</p>
      <label className="block text-sm">{t('aiMessageLabel')}<textarea value={message} onChange={event => setMessage(event.target.value)} placeholder={editing ? t('aiMessagePlaceholderEditing') : t('aiMessagePlaceholder')} className="mt-2 w-full rounded-xl border border-sky-200 p-3 h-24" /></label>
      <button disabled={generating} className="bg-indigo-600 text-white px-4 py-3 rounded-xl disabled:opacity-50">{generating ? <span className="flex gap-2"><Loader2 className="animate-spin" size={16} />{t('aiGenerating')}</span> : plan ? t('aiRegenerateBtn') : t('aiGenerateBtn')}</button>
      {editing && <button type="button" onClick={() => setEditing(false)} className="ml-3 text-sm">{t('aiCancelBtn')}</button>}
    </form>}
    {plan?.previous && <button disabled={generating} onClick={onRestore} className="text-sm text-indigo-600">{t('aiRestoreBtn')}</button>}
  </section>;
}
