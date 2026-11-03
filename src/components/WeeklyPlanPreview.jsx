import { useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import WeekOverview from './WeekOverview.jsx';
import WeeklyBalance from './WeeklyBalance.jsx';
import WeeklyChoiceReport from './WeeklyChoiceReport.jsx';
import { sessionSections } from '../domain/sessions.js';
import { buildWeeklyChoiceReport } from '../domain/weeklyChoices.js';
import { dateForWeekDay } from '../domain/dates.js';

export default function WeeklyPlanPreview({ preview, t, lang, exercises, available, today, onBack, onApply, busy, stale }) {
  const [dayNumber, setDayNumber] = useState(null);
  const detail = useRef(null);
  const reportDetail = useRef(null);
  const { plan, profile, week, mode, application } = preview;
  const displayPlan = application?.sessions ? { ...plan, schedule: application.sessions } : plan;
  const day = displayPlan.schedule.find(item => item.day === dayNumber);
  const report = buildWeeklyChoiceReport(displayPlan, exercises, profile.context, available, week, mode);
  const viewDay = number => { setDayNumber(number); requestAnimationFrame(() => detail.current?.scrollIntoView({ block: 'start' })); };
  const dose = params => `${params.sets} ${t('setsUnit')} × ${params.value} ${t(params.unit)}${params.perSide ? ` · ${t('eachSide')}` : ''}${params.restSeconds > 0 ? ` · ${t('restLabel')} ${params.restSeconds} ${t('seconds')}` : ''}`;
  return <section data-testid="weekly-plan-preview" aria-label={t('choicePreviewTitle')}>
    <div className="preview-notice"><h2 className="font-bold text-xl">{t('choicePreviewTitle')}</h2><p className="text-sm mt-2">{t('choicePreviewHint')}</p>{report.length > 0 && <div className="flex flex-wrap items-center gap-x-4 mt-3 text-sm"><p>{t('choicePlanned')} {report.filter(item => item.days.length).length} / {report.length} · {report.filter(item => !item.days.length).length} {t('choiceNotPlanned')}</p><button type="button" onClick={() => reportDetail.current?.scrollIntoView({ block: 'center' })} className="text-link">{t('choiceReport')}</button></div>}</div>
    {application && <section className="panel mb-5 text-sm space-y-2"><p className="font-semibold">{lang === 'en' ? 'This week, Monday–Friday' : '本週週一至週五'} · {application.range.from} — {application.range.to}</p><p>{lang === 'en' ? 'Dates stay in this week; no past day is moved into the future.' : '日期保持本週，不會把過去日期移到未來。'}</p>{application.protectedDates?.length > 0 && <p className="text-amber-800">{lang === 'en' ? 'Training records protected; these dates stay unchanged' : '已有實做／完成紀錄，以下日期唯讀並保持原安排'}：{application.protectedDates.join('、')}</p>}</section>}
    {stale && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-4 rounded-xl mb-5">{t('choiceStale')}</p>}
    <WeekOverview schedule={displayPlan.schedule} exercises={exercises} week={week} plan={displayPlan} context={profile.context} focus={profile.focus} time={profile.time} level={1} {...{ lang, t }} currentDate={today} onEdit={onBack} editLabel={false} onSelectDay={viewDay}>
      {report.length > 0 && <div ref={reportDetail}><WeeklyChoiceReport {...{ report, exercises, t }} /></div>}
      <WeeklyBalance schedule={displayPlan.schedule} exercises={exercises} context={profile.context} week={week} currentDate={today} lang={lang} />
    </WeekOverview>
    {day && <section ref={detail} data-testid="preview-day-detail" className="panel space-y-5 mt-6"><p className="eyebrow">{dateForWeekDay(week, day.day)}</p><h3 className="text-xl font-bold">{day.name} · {day.theme}</h3>{sessionSections(day, exercises, 1).map(section => <div key={section.phase} className="space-y-2"><h4 className="font-semibold text-sm">{t(`phase_${section.phase}`)}</h4>{section.items.map(entry => <p key={entry.id} className="text-sm text-slate-600">{exercises[entry.id]?.name || entry.id}<span className="block text-xs text-slate-500 mt-1">{dose(entry.dose)}</span></p>)}{section.preparation.map(entry => <p key={entry.id} className="text-sm text-slate-600">{t('preparationSetsLabel')} · {exercises[entry.id]?.name || entry.id}<span className="block text-xs text-slate-500 mt-1">{dose(entry.dose)} · {entry.dose.instruction}</span></p>)}</div>)}<p className="text-sm text-slate-500">{day.warmupNote}</p><p className="text-sm text-slate-500">{day.cooldownNote}</p><p className="text-sm text-slate-600">{day.coachAdvice}</p></section>}
    <details className="panel mt-6"><summary className="font-medium text-sm">{t('aiConclusionTitle')}</summary><p className="whitespace-pre-wrap text-sm text-slate-600 leading-relaxed mt-4">{plan.conclusion}</p></details>
    <div className="preview-actions"><button type="button" onClick={onBack} disabled={busy} className="button-secondary"><ArrowLeft size={16} />{t('choiceBack')}</button><button type="button" data-testid="plan-preview-apply" onClick={onApply} disabled={busy || stale} className="button-primary">{busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}{busy ? t('choiceApplying') : application ? lang === 'en' ? `Confirm apply to ${application.dates.filter(date => !application.protectedDates?.includes(date)).length} days` : `確認套用到 ${application.dates.filter(date => !application.protectedDates?.includes(date)).length} 天` : t('choiceConfirm')}</button></div>
  </section>;
}
