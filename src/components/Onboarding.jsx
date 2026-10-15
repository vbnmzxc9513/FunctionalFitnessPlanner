import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import WeeklyPreferences from './WeeklyPreferences.jsx';
import { EQUIPMENT } from '../domain/exerciseCatalog.js';

export default function Onboarding({ t, context, setContext, time, setTime, focus, setFocus, goal, setGoal, message, setMessage, generating, onGenerate, mode = 'template', guided = false, advancedOptions }) {
  const [step, setStep] = useState(0);
  const stepTitles = useRef([]);
  const moveStep = next => { setStep(next); window.scrollTo({ top: 0 }); requestAnimationFrame(() => stepTitles.current[next]?.focus()); };
  const change = (key, value) => setContext(previous => ({ ...previous, [key]: value }));
  const toggle = (key, value) => change(key, context[key].includes(value) ? context[key].filter(item => item !== value) : [...context[key], value]);
  const submit = event => { event.preventDefault(); if (guided && step < 2) { moveStep(step + 1); } else onGenerate(); };
  const equipmentFields = <fieldset><legend className="text-sm font-medium mb-3">{t('equipmentLabel')}</legend><div className="grid grid-cols-2 gap-2">{EQUIPMENT.map(item => <label key={item} className="flex items-center gap-2 text-sm rounded-xl border border-slate-200 px-3 min-h-11"><input type="checkbox" checked={context.equipment.includes(item)} onChange={() => toggle('equipment', item)} />{t(`equipment_${item}`)}</label>)}</div><p className="text-xs text-slate-500 mt-3">{t('bodyweightAlwaysAvailable')}</p></fieldset>;
  return <form onSubmit={submit} data-testid="planner-form" data-guided={guided}>
    {guided && <ol className="setup-steps" aria-label={t('firstPlanTitle')}>{['setupGoals', 'setupSchedule', 'setupHealth'].map((key, index) => <li key={key} aria-current={step === index ? 'step' : undefined} data-done={step > index}>{index + 1}. {t(key)}</li>)}</ol>}
    <fieldset className="form-section space-y-5" hidden={guided && step !== 0} disabled={generating || guided && step !== 0}>
      <legend tabIndex={guided ? -1 : undefined} ref={node => { stepTitles.current[0] = node; }}>{t('setupGoalTitle')}</legend><p className="section-copy">{t('setupGoalsHint')}</p>
      <label className="block text-sm font-medium">{t('plannerFocus')}<select value={focus} onChange={event => setFocus(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{['balanced', 'coordination', 'stability', 'strength'].map(value => <option key={value} value={value}>{t(`focus_${value}`)}</option>)}</select></label>
      <WeeklyPreferences t={t} context={context} onChange={change} disabled={generating} />
    </fieldset>
    <fieldset className="form-section space-y-5" hidden={guided && step !== 1} disabled={generating || guided && step !== 1}>
      <legend tabIndex={guided ? -1 : undefined} ref={node => { stepTitles.current[1] = node; }}>{t('setupScheduleTitle')}</legend><p className="section-copy">{t('setupScheduleHint')}</p>
      <fieldset><legend className="text-sm font-medium mb-3">{t('badmintonDaysLabel')}</legend><div className="flex flex-wrap gap-2">{t('allDayNames').map((name, index) => <label key={name} className={`flex items-center gap-2 text-sm rounded-xl border px-3 min-h-11 ${context.badmintonDays.includes(index + 1) ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200'}`}><input type="checkbox" checked={context.badmintonDays.includes(index + 1)} onChange={() => toggle('badmintonDays', index + 1)} />{name}</label>)}</div></fieldset>
      <div className="grid sm:grid-cols-2 gap-5"><label className="block text-sm font-medium">{t('aiTimeLabel')}<input type="number" min={mode === 'trial' ? '10' : '5'} max={mode === 'trial' ? '60' : '240'} required value={time} onChange={event => setTime(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label><label className="block text-sm font-medium">{t('experienceLabel')}<select value={context.experience} onChange={event => change('experience', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{['beginner', 'intermediate', 'advanced'].map(value => <option key={value} value={value}>{t(`experience_${value}`)}</option>)}</select></label></div>
      {guided ? equipmentFields : <details className="rounded-xl border border-slate-200 p-4"><summary className="text-sm font-medium">{t('equipmentLabel')} · {context.equipment.length ? context.equipment.map(item => t(`equipment_${item}`)).join('、') : t('equipment_bodyweight')}</summary><div className="mt-4">{equipmentFields}</div></details>}
    </fieldset>
    <fieldset className="form-section space-y-5" hidden={guided && step !== 2} disabled={generating || guided && step !== 2}>
      <legend tabIndex={guided ? -1 : undefined} ref={node => { stepTitles.current[2] = node; }}>{t('setupHealthTitle')}</legend>
      <label className="block text-sm font-medium">{t('shoulderStatusLabel')}<select value={context.healthStatus} onChange={event => change('healthStatus', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{['unrestricted', 'restricted', 'unknown'].map(value => <option key={value} value={value}>{t(`health_${value}`)}</option>)}</select></label>
      <label className="block text-sm font-medium">{t('healthNotesLabel')}<textarea maxLength={2000} value={context.healthNotes} onChange={event => change('healthNotes', event.target.value)} placeholder={t('healthNotesPlaceholder')} className="mt-2 w-full rounded-xl border border-slate-200 p-3 h-24 font-normal" /></label>
      <p className="text-xs text-slate-500 leading-relaxed">{t('templateConstraints')}</p>
      <details data-testid="planner-optional" className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">{t('plannerDetails')}</summary><div className="space-y-4 mt-4">
        <div className="grid sm:grid-cols-2 gap-4"><label className="block text-sm">{t('badmintonMinutesLabel')}<input type="number" min="1" max="360" value={context.badmintonMinutes} onChange={event => change('badmintonMinutes', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label><label className="block text-sm">{t('badmintonIntensityLabel')}<select value={context.badmintonIntensity} onChange={event => change('badmintonIntensity', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{['unknown', 'light', 'mixed', 'hard'].map(value => <option key={value} value={value}>{t(`intensity_${value}`)}</option>)}</select></label><label className="block text-sm">{t('competitionDateLabel')}<input type="date" value={context.competitionDate} onChange={event => change('competitionDate', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label></div>
        <label className="flex items-center gap-2 text-sm min-h-11"><input type="checkbox" checked={context.partnerAvailable} onChange={event => change('partnerAvailable', event.target.checked)} />{t('partnerAvailableLabel')}</label>
        <label className="block text-sm">{t('recoveryNotesLabel')}<textarea maxLength={2000} value={context.recoveryNotes} onChange={event => change('recoveryNotes', event.target.value)} placeholder={t('recoveryNotesPlaceholder')} className="mt-2 w-full rounded-xl border border-slate-200 p-3 h-24" /></label>
        <label className="block text-sm">{t('aiGoalLabel')}<input maxLength={mode === 'trial' ? 300 : 2000} value={goal} onChange={event => setGoal(event.target.value)} placeholder={t('aiGoalPlaceholder')} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label>
        {mode !== 'template' && <label className="block text-sm">{t('aiMessageLabel')}<textarea maxLength={mode === 'trial' ? 500 : 2000} value={message} onChange={event => setMessage(event.target.value)} placeholder={t('aiMessagePlaceholder')} className="mt-2 w-full rounded-xl border border-slate-200 p-3 h-24" /></label>}
      </div></details>
    </fieldset>
    {advancedOptions}
    <p className="text-xs text-slate-500 leading-relaxed mt-4">{t(mode === 'template' ? 'templateDescription' : `${mode}Description`)}</p>
    <div className="setup-actions">{guided && step > 0 ? <button type="button" disabled={generating} onClick={() => moveStep(step - 1)} className="button-secondary"><ArrowLeft size={16} />{t('setupBack')}</button> : <span />}
      {guided && step < 2 ? <button type="submit" data-testid="setup-next" className="button-primary">{t('setupNext')}<ArrowRight size={16} /></button> : <button type="submit" disabled={generating} className="button-primary">{generating ? <><Loader2 className="animate-spin" size={16} />{t(mode === 'template' ? 'templateGenerating' : 'aiGenerating')}</> : <>{t(mode === 'template' ? 'templateGenerate' : 'aiGenerateBtn')}<ArrowRight size={16} /></>}</button>}
    </div><p className="text-xs text-slate-500 mt-4">{t('plannerStorageNotice')}</p>
  </form>;
}
