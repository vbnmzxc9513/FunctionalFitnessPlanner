import { planningGuidance } from '../domain/coachBrief.js';
import { coachPlanningText } from '../coachPlanningLocale.js';
import { CoachGuidance } from './CoachBrief.jsx';
import PlanningConditions from './PlanningConditions.jsx';
import { RECOVERY_STATES } from '../domain/recovery.js';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { RegionChoices } from './WeeklyPreferences.jsx';
import WeeklyExerciseChoices from './WeeklyExerciseChoices.jsx';
import { periodText } from '../periodLocale.js';
import { EQUIPMENT } from '../domain/exerciseCatalog.js';
import { TARGET_REGIONS, STIFFNESS_REGIONS, SORENESS_REGIONS } from '../domain/trainingPreferences.js';

export default function Onboarding({ t, lang = 'zh', context, setContext, time, setTime, focus, setFocus, goal, setGoal, message, setMessage, generating, onGenerate, mode = 'template', advancedOptions, exercises = {}, available = {}, onToggleWeekly, step: controlledStep, onStepChange, range }) {
  const [localStep, setLocalStep] = useState(0);
  const c = key => coachPlanningText(lang, key);
  const decision = planningGuidance(context, time, range);
  const response = decision.restriction !== 'normal' ? 'restricted' : decision.recovery !== 'normal' ? decision.recovery : context.recoveryState || 'unknown';
  const step = controlledStep ?? localStep;
  const stepTitles = useRef([]);
  useEffect(() => { stepTitles.current[step]?.focus({ preventScroll: true }); }, [step]);
  const moveStep = next => { (onStepChange || setLocalStep)(next); window.scrollTo({ top: 0 }); };
  const change = (key, value) => setContext(previous => ({ ...previous, [key]: value }));
  const toggle = (key, value) => change(key, context[key].includes(value) ? context[key].filter(item => item !== value) : [...context[key], value]);
  const submit = event => { event.preventDefault(); if (step < 2) moveStep(step + 1); else onGenerate(); };
  const regions = (name, items, label, prefix = name) => <RegionChoices {...{ t, context, name, regions: items, label, prefix }} onChange={change} disabled={generating} />;
  const p = periodText(lang);
  const trainingDays = Array.isArray(context.trainingDays) ? context.trainingDays : [1, 2, 3, 4, 5];
  const dayLabels = lang === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['一', '二', '三', '四', '五', '六', '日'];
  return <form onSubmit={submit} data-testid="planner-form" data-guided="true" className="coach-questionnaire">
    <ol className="setup-steps" aria-label={t('firstPlanTitle')}>{c('steps').map((key, index) => <li key={key} aria-current={step === index ? 'step' : undefined} data-done={step > index}>{index + 1}. {key}</li>)}</ol>
    <fieldset className="form-section space-y-5" hidden={step !== 0} disabled={generating || step !== 0}>
      <legend tabIndex={-1} ref={node => { stepTitles.current[0] = node; }}>{c('titles')[0]}</legend><p className="section-copy">{c('hints')[0]}</p>
      <label className="block text-sm font-medium">{c('focus')}<select value={focus} onChange={event => setFocus(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{['balanced', 'coordination', 'stability', 'strength'].map(value => <option key={value} value={value}>{t(`focus_${value}`)}</option>)}</select></label>
      <div className="coach-time"><label className="block text-sm font-medium">{c('time')}<input type="number" min={mode === 'trial' ? '10' : '5'} max={mode === 'trial' ? '60' : '240'} required value={time} onChange={event => setTime(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label><div className="coach-time-presets" role="group" aria-label={c('time')}>{[20, 30, 40].map(minutes => <button type="button" key={minutes} aria-pressed={Number(time) === minutes} data-testid={`coach-time-${minutes}`} onClick={() => setTime(String(minutes))}>{minutes} {t('minutes')}</button>)}</div></div>
      <fieldset data-testid="training-days"><legend className="text-sm font-medium mb-3">{p('trainingDays')}</legend><div className="flex flex-wrap gap-2">{dayLabels.map((name, index) => <label key={index} className={`weekday-choice ${trainingDays.includes(index + 1) ? 'border-indigo-300 bg-indigo-50 text-indigo-800 font-semibold' : 'border-slate-200 text-slate-500'}`}><input className="sr-only" aria-label={`${p('trainingDays')} ${name}`} type="checkbox" checked={trainingDays.includes(index + 1)} onChange={() => change('trainingDays', trainingDays.includes(index + 1) ? trainingDays.filter(day => day !== index + 1) : [...trainingDays, index + 1].sort((a, b) => a - b))} />{name}</label>)}</div><p className="text-xs text-slate-500 mt-3">{p('trainingHint')}</p></fieldset>
      <details data-testid="coach-targets" className="coach-disclosure"><summary>{c('targets')}<span>{context.targetRegions.length ? context.targetRegions.map(region => t(`targetRegions_${region}`)).join('、') : c('targetsNone')}</span></summary><div data-testid="weekly-preferences" className="mt-4">{regions('targetRegions', TARGET_REGIONS, 'weeklyTargetRegions')}</div></details>
      <details data-testid="quiz-schedule" className="rounded-xl border border-slate-200 p-4"><summary className="text-sm font-medium">{c('schedule')}<span className="coach-summary-line">{t('badmintonDaysLabel')}：{context.badmintonDays.length ? context.badmintonDays.map(day => dayLabels[day - 1]).join('、') : lang === 'en' ? 'None selected' : '未選'} · {context.equipment.length ? context.equipment.map(item => t(`equipment_${item}`)).join('、') : t('equipment_bodyweight')}</span></summary><div className="space-y-5 mt-4">
        <p className="text-xs text-slate-500">{c('scheduleHint')}</p>
        <fieldset><legend className="text-sm font-medium mb-3">{t('badmintonDaysLabel')}</legend><div className="flex flex-wrap gap-2">{t('allDayNames').map((name, index) => <label key={name} className={`weekday-choice ${context.badmintonDays.includes(index + 1) ? 'border-sky-300 bg-sky-50 text-sky-800 font-semibold' : 'border-slate-200 text-slate-500'}`}><input className="sr-only" aria-label={name} type="checkbox" checked={context.badmintonDays.includes(index + 1)} onChange={() => toggle('badmintonDays', index + 1)} />{dayLabels[index]}</label>)}</div></fieldset>
        <div data-testid="court-load-fields"><div className="grid sm:grid-cols-2 gap-4"><label className="block text-sm">{t('badmintonMinutesLabel')}<input type="number" min="1" max="360" value={context.badmintonMinutes} onChange={event => change('badmintonMinutes', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label><label className="block text-sm">{t('badmintonIntensityLabel')}<select value={context.badmintonIntensity} onChange={event => change('badmintonIntensity', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{['unknown', 'light', 'mixed', 'hard'].map(value => <option key={value} value={value}>{t(`intensity_${value}`)}</option>)}</select></label></div></div>
        <div className="grid sm:grid-cols-2 gap-5"><label className="block text-sm font-medium">{t('experienceLabel')}<select value={context.experience} onChange={event => change('experience', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{['beginner', 'intermediate', 'advanced'].map(value => <option key={value} value={value}>{t(`experience_${value}`)}</option>)}</select></label></div>
        <details data-testid="quiz-equipment" className="rounded-xl border border-slate-200 p-4"><summary className="text-sm font-medium">{t('equipmentLabel')} · {context.equipment.length ? context.equipment.map(item => t(`equipment_${item}`)).join('、') : t('equipment_bodyweight')}</summary><fieldset className="mt-3"><legend className="sr-only">{t('equipmentLabel')}</legend>{!context.equipment.length && <p className="text-sm text-sky-700 mb-3">{c('equipmentHint')}</p>}<div className="grid grid-cols-2 gap-2">{EQUIPMENT.map(item => <label key={item} className="flex items-center gap-2 text-sm rounded-xl border border-slate-200 px-3 min-h-11"><input type="checkbox" checked={context.equipment.includes(item)} onChange={() => toggle('equipment', item)} />{t(`equipment_${item}`)}</label>)}</div><p className="text-xs text-slate-500 mt-3">{t('bodyweightAlwaysAvailable')}</p></fieldset></details>
        <label className="flex items-center gap-2 text-sm min-h-11"><input type="checkbox" checked={context.partnerAvailable} onChange={event => change('partnerAvailable', event.target.checked)} />{t('partnerAvailableLabel')}</label>
      </div></details>
      <details data-testid="planner-optional" className="rounded-xl border border-slate-200 p-4"><summary className="text-sm font-medium">{t('competitionDateLabel')}{context.competitionDate && ` · ${context.competitionDate}`}</summary><div className="space-y-4 mt-4">
        <label className="block text-sm">{t('competitionDateLabel')}<input type="date" value={context.competitionDate} onChange={event => change('competitionDate', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label>

      </div></details>
    </fieldset>
    <fieldset className="form-section space-y-5" hidden={step !== 1} disabled={generating || step !== 1}>
      <legend tabIndex={-1} ref={node => { stepTitles.current[1] = node; }}>{c('titles')[1]}</legend><p className="section-copy">{c('hints')[1]}</p>
      <label className="block text-sm font-medium">{c('recovery')}<select data-testid="recovery-state" value={context.recoveryState || 'unknown'} onChange={event => change('recoveryState', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{RECOVERY_STATES.map(value => <option key={value} value={value}>{c(value)}</option>)}</select></label>
      <p className="coach-response" role="status">{c(`response_${response}`)}</p>
      {regions('stiffnessRegions', STIFFNESS_REGIONS, 'weeklyStiffnessRegions')}
      <label className="block text-sm font-medium">{c('health')}<select data-testid="health-status" value={context.healthStatus} onChange={event => change('healthStatus', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{['unrestricted', 'restricted', 'unknown'].map(value => <option key={value} value={value}>{t(`health_${value}`)}</option>)}</select></label>
      <details data-testid="coach-body-notes" className="coach-disclosure"><summary>{c('bodyNotes')}{(context.sorenessRegions.length > 0 || context.healthNotes || context.recoveryNotes) && <span>{lang === 'en' ? 'Contains previous entries · please confirm' : '含既有回報 · 請確認是否仍適用'}</span>}</summary><div className="space-y-4 mt-4">      {regions('sorenessRegions', SORENESS_REGIONS, 'quizSoreness')}
      <p className="text-xs text-slate-500">{t('quizSorenessHint')}</p>
      {context.sorenessRegions.length > 0 && <label className="block text-sm">{t('sorenessImpactLabel')}<select data-testid="soreness-impact" value={context.sorenessImpact || 'unknown'} onChange={event => change('sorenessImpact', event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3">{['unknown', 'mild', 'limited'].map(value => <option key={value} value={value}>{t(`sorenessImpact_${value}`)}</option>)}</select></label>}

      <label className="block text-sm font-medium">{t('healthNotesLabel')}<textarea maxLength={2000} value={context.healthNotes} onChange={event => change('healthNotes', event.target.value)} placeholder={t('healthNotesPlaceholder')} className="mt-2 w-full rounded-xl border border-slate-200 p-3 h-24 font-normal" /></label>
      <label className="block text-sm">{t('recoveryNotesLabel')}<textarea data-testid="recovery-notes" maxLength={2000} value={context.recoveryNotes} onChange={event => change('recoveryNotes', event.target.value)} placeholder={t('recoveryNotesPlaceholder')} className="mt-2 w-full rounded-xl border border-slate-200 p-3 h-24" /></label>
<p className="text-xs text-slate-500">{c('notesHint')}</p></div></details>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" data-testid="warmup-familiar" checked={context.warmupFamiliar === true} onChange={event => change('warmupFamiliar', event.target.checked)} />{t('warmupFamiliarLabel')}</label>
      <CoachGuidance {...{ context, time, range, lang }} />
    </fieldset>
    <fieldset className="form-section space-y-5" hidden={step !== 2} disabled={generating || step !== 2}>
      <legend tabIndex={-1} ref={node => { stepTitles.current[2] = node; }}>{c('titles')[2]}</legend><p className="section-copy">{c('hints')[2]}</p>
      <section className="coach-direction" data-testid="coach-direction"><h3>{c('summary')}</h3><p>{t(`focus_${focus}`)} · {time} {t('minutes')}</p>{context.targetRegions.length > 0 && <p>{context.targetRegions.map(region => t(`targetRegions_${region}`)).join('、')}</p>}<p>{c('approach')}</p></section>
      <CoachGuidance {...{ context, time, range, lang }} />
      <button type="button" data-testid="review-planning-conditions" onClick={() => moveStep(0)} className="text-left text-sm text-sky-800 rounded-xl border border-sky-100 bg-sky-50 p-3 w-full"><PlanningConditions {...{ context, time, lang, t }} /><span className="block mt-2 font-medium">{c('conditions')}</span></button>
      <details data-testid="coach-exercise-options" className="coach-disclosure"><summary>{c('choices')}<span>{context.weeklyExerciseIds.length ? `${context.weeklyExerciseIds.length} ${c('choicesSelected')}` : c('choicesNone')}</span></summary><p className="section-copy mt-3">{c('choicesHint')}</p><div className="mt-4"><WeeklyExerciseChoices {...{ t, lang, context, focus, exercises, available }} onToggle={onToggleWeekly} disabled={generating} /></div></details>
      <details className="coach-disclosure"><summary>{c('goalNote')}</summary><label className="block text-sm mt-3">{t('aiGoalLabel')}<input maxLength={mode === 'trial' ? 300 : 2000} value={goal} onChange={event => setGoal(event.target.value)} placeholder={t('aiGoalPlaceholder')} className="mt-2 w-full rounded-xl border border-slate-200 p-3" /></label>{mode === 'template' && <p className="text-xs text-slate-500 mt-2">{c('goalHint')}</p>}</details>
      {advancedOptions}
      {mode !== 'template' && <label className="block text-sm">{t('aiMessageLabel')}<textarea maxLength={mode === 'trial' ? 500 : 2000} value={message} onChange={event => setMessage(event.target.value)} placeholder={t('aiMessagePlaceholder')} className="mt-2 w-full rounded-xl border border-slate-200 p-3 h-24" /></label>}
      <p className="text-xs text-slate-500 leading-relaxed">{t(mode === 'template' ? 'templateDescription' : `${mode}Description`)}</p>
    </fieldset>
    <div className="setup-actions">{step > 0 ? <button type="button" disabled={generating} onClick={() => moveStep(step - 1)} className="button-secondary"><ArrowLeft size={16} />{t('setupBack')}</button> : <span />}
      <button type="submit" data-testid={step < 2 ? 'setup-next' : 'plan-preview-create'} disabled={generating} className="button-primary">{generating ? <><Loader2 className="animate-spin" size={16} />{t(mode === 'template' ? 'templateGenerating' : 'aiGenerating')}</> : <>{step < 2 ? t('setupNext') : mode === 'template' ? c('generate') : t('choicePreviewAI')}{step < 2 && <ArrowRight size={16} />}</>}</button>
    </div><p className="text-xs text-slate-500 mt-4">{t('plannerStorageNotice')}</p>
  </form>;
}
