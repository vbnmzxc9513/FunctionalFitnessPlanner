import { Loader2 } from 'lucide-react';
import { EQUIPMENT } from '../domain/exerciseCatalog.js';

export default function Onboarding({ t, context, setContext, time, setTime, focus, setFocus, goal, setGoal, message, setMessage, generating, onGenerate, mode = 'template' }) {
  const change = (key, value) => setContext(previous => ({ ...previous, [key]: value }));
  const toggle = (key, value) => change(key, context[key].includes(value) ? context[key].filter(item => item !== value) : [...context[key], value]);
  return <form onSubmit={event => { event.preventDefault(); onGenerate(); }} className="space-y-5">
    <label className="block text-sm">{t('plannerFocus')}<select value={focus} onChange={event => setFocus(event.target.value)} className="mt-2 w-full rounded-xl border border-sky-200 p-3">{['balanced', 'coordination', 'stability', 'strength'].map(value => <option key={value} value={value}>{t(`focus_${value}`)}</option>)}</select></label>
    <fieldset><legend className="text-sm mb-2">{t('badmintonDaysLabel')}</legend><div className="flex flex-wrap gap-3">{t('allDayNames').map((name, index) => <label key={name} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={context.badmintonDays.includes(index + 1)} onChange={() => toggle('badmintonDays', index + 1)} />{name}</label>)}</div></fieldset>
    <label className="block text-sm">{t('aiTimeLabel')}<input type="number" min={mode === 'trial' ? '10' : '5'} max={mode === 'trial' ? '60' : '240'} required value={time} onChange={event => setTime(event.target.value)} className="mt-2 w-full rounded-xl border border-sky-200 p-3" /></label>
    <fieldset><legend className="text-sm mb-2">{t('equipmentLabel')}</legend><div className="flex flex-wrap gap-x-4 gap-y-2">{EQUIPMENT.map(item => <label key={item} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={context.equipment.includes(item)} onChange={() => toggle('equipment', item)} />{t(`equipment_${item}`)}</label>)}</div><p className="text-xs text-slate-500 mt-2">{t('bodyweightAlwaysAvailable')}</p></fieldset>
    <details className="rounded-xl border border-sky-100 p-4"><summary className="cursor-pointer text-sm font-semibold">{t('plannerDetails')}</summary><div className="space-y-4 mt-4">
      <p className="text-xs text-slate-500">{t('planningLocalNotice')}</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm">{t('badmintonMinutesLabel')}<input type="number" min="1" max="360" value={context.badmintonMinutes} onChange={event => change('badmintonMinutes', event.target.value)} className="mt-2 w-full rounded-lg border border-sky-200 p-2" /></label>
        <label className="block text-sm">{t('badmintonIntensityLabel')}<select value={context.badmintonIntensity} onChange={event => change('badmintonIntensity', event.target.value)} className="mt-2 w-full rounded-lg border border-sky-200 p-2">{['unknown', 'light', 'mixed', 'hard'].map(value => <option key={value} value={value}>{t(`intensity_${value}`)}</option>)}</select></label>
        <label className="block text-sm">{t('experienceLabel')}<select value={context.experience} onChange={event => change('experience', event.target.value)} className="mt-2 w-full rounded-lg border border-sky-200 p-2">{['beginner', 'intermediate', 'advanced'].map(value => <option key={value} value={value}>{t(`experience_${value}`)}</option>)}</select></label>
        <label className="block text-sm">{t('competitionDateLabel')}<input type="date" value={context.competitionDate} onChange={event => change('competitionDate', event.target.value)} className="mt-2 w-full rounded-lg border border-sky-200 p-2" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={context.partnerAvailable} onChange={event => change('partnerAvailable', event.target.checked)} />{t('partnerAvailableLabel')}</label>
      <label className="block text-sm">{t('shoulderStatusLabel')}<select value={context.healthStatus} onChange={event => change('healthStatus', event.target.value)} className="mt-2 w-full rounded-lg border border-sky-200 p-2">{['unrestricted', 'restricted', 'unknown'].map(value => <option key={value} value={value}>{t(`health_${value}`)}</option>)}</select></label>
      <label className="block text-sm">{t('healthNotesLabel')}<textarea maxLength={2000} value={context.healthNotes} onChange={event => change('healthNotes', event.target.value)} placeholder={t('healthNotesPlaceholder')} className="mt-2 w-full rounded-lg border border-sky-200 p-2 h-20" /></label>
      <label className="block text-sm">{t('recoveryNotesLabel')}<textarea maxLength={2000} value={context.recoveryNotes} onChange={event => change('recoveryNotes', event.target.value)} placeholder={t('recoveryNotesPlaceholder')} className="mt-2 w-full rounded-lg border border-sky-200 p-2 h-20" /></label>
      <label className="block text-sm">{t('aiGoalLabel')}<input maxLength={mode === 'trial' ? 300 : 2000} value={goal} onChange={event => setGoal(event.target.value)} placeholder={t('aiGoalPlaceholder')} className="mt-2 w-full rounded-xl border border-sky-200 p-3" /></label>
      {mode !== 'template' && <label className="block text-sm">{t('aiMessageLabel')}<textarea maxLength={mode === 'trial' ? 500 : 2000} value={message} onChange={event => setMessage(event.target.value)} placeholder={t('aiMessagePlaceholder')} className="mt-2 w-full rounded-xl border border-sky-200 p-3 h-24" /></label>}
    </div></details>
    {mode === 'template' && <p className="text-xs text-slate-500">{t('templateConstraints')}</p>}
    <button disabled={generating} className="bg-indigo-600 text-white px-4 py-3 rounded-xl disabled:opacity-50">{generating ? <span className="flex gap-2"><Loader2 className="animate-spin" size={16} />{t(mode === 'template' ? 'templateGenerating' : 'aiGenerating')}</span> : t(mode === 'template' ? 'templateGenerate' : 'aiGenerateBtn')}</button>
  </form>;
}
