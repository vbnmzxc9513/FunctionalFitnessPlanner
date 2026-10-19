import MobilityOverview from './MobilityOverview.jsx';
import { useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { sessionSections, estimateSessionMinutes } from '../domain/sessions.js';
import { enumeratePeriodDates } from '../domain/periodPlanning.js';
import { competitionDaysAway } from '../domain/planning.js';
import { getWeekString } from '../domain/dates.js';
import { periodText } from '../periodLocale.js';
import ExerciseGuide from './ExerciseGuide.jsx';
import ExerciseRow from './ExerciseRow.jsx';
import ExerciseDetails from './ExerciseDetails.jsx';
import { journeyText } from '../journeyLocale.js';

export default function PeriodPlanPreview({ preview, lang = 'zh', t = key => key, exercises = {}, today, onBack, onApply, busy = false, stale = false }) {
  const [selected, setSelected] = useState(null);
  const [opened, setOpened] = useState(null);
  const j = key => journeyText(lang, key);
  const detail = useRef(null);
  const p = periodText(lang);
  const { range, sessions = [], weeklySummaries = [], protectedDates = [] } = preview;
  let dates = [];
  try { dates = enumeratePeriodDates(range); } catch { /* Invalid persisted ranges are shown without inventing sessions. */ }
  const day = sessions.find(item => item.date === selected);
  const daySections = day ? sessionSections(day, exercises, 1) : [];
  const entries = daySections.flatMap(section => section.items.map(entry => ({ ...entry, phase: section.phase })));
  const openedEntry = opened?.date === selected ? entries.find(entry => entry.id === opened.id) : null;
  const groups = [...new Set(dates.map(date => getWeekString(new Date(`${date}T12:00:00`))))];
  const dateLabel = date => `${date} · ${new Intl.DateTimeFormat(lang === 'en' ? 'en' : 'zh-TW', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}`;
  const court = session => session?.badminton || session?.courtDay || preview.profile?.context?.badmintonDays?.includes(session?.day);
  const eventPhase = date => {
    const away = competitionDaysAway(preview.profile?.context?.competitionDate, date);
    return away === null ? null : away === 0 ? 'competitionDay' : away > 0 && away <= 10 ? 'taper' : away < 0 && away >= -5 ? 'postCompetition' : null;
  };
  const label = session => {
    if (!session) return p('missing');
    const type = session.sessionType || (session.routine?.length ? 'training' : 'rest');
    return `${p(type === 'rest' && (court(session) || eventPhase(session.date) === 'competitionDay') ? 'fitnessRest' : type)}${court(session) ? ` · ${p('court')}` : ''}`;
  };
  const eventSummary = summary => [...new Set(dates.filter(date => date >= summary.from && date <= summary.to).map(eventPhase).filter(Boolean))]
    .map(phase => phase === 'competitionDay' ? `${p(phase)} ${preview.profile.context.competitionDate}` : p(phase)).join(' · ');
  const dose = params => `${params.sets} ${p('sets')} × ${params.value} ${p(params.unit)}${params.perSide ? ` · ${p('eachSide')}` : ''}${params.restSeconds > 0 ? ` · ${p('restLabel')} ${params.restSeconds} ${p('seconds')}` : ''}`;
  const conditions = preview.profile?.context;
  const equipmentKnown = Array.isArray(conditions?.equipment);
  const noTraining = sessions.length > 0 && sessions.every(session => (session.sessionType || (session.routine?.length ? 'training' : 'rest')) !== 'training');
  const recoveryReason = sessions.find(session => !conditions?.badmintonDays?.includes(session.day) && session.coachAdvice)?.coachAdvice || sessions.find(session => session.coachAdvice)?.coachAdvice;
  const incomplete = dates.length === 0 || dates.some(date => !sessions.some(session => session.date === date));
  return <section data-testid="period-plan-preview" className="space-y-5">
    <div className="preview-notice"><h2 className="font-bold text-xl">{p(onApply ? 'title' : 'overview')}</h2><p className="text-sm mt-2">{range?.from} – {range?.to} · {dates.length} {p('days')}</p><p className="text-sm mt-2">{p(onApply ? 'previewHint' : 'savedHint')}</p>{onApply && <p className="text-sm mt-2">{p('scope')}</p>}</div>
    <p data-testid="period-equipment-summary" className="text-sm text-slate-600">{t('equipmentLabel')}：{equipmentKnown ? conditions.equipment.length ? conditions.equipment.map(item => t(`equipment_${item}`)).join('、') : t('equipment_bodyweight') : lang === 'en' ? 'Not preserved in this saved summary; check preferences before replanning.' : '這份儲存摘要未保留器材條件；重排前請確認問卷。'}</p>
    {noTraining && <section data-testid="period-recovery-explanation" role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2 text-sm text-amber-900"><h3 className="font-semibold">{lang === 'en' ? 'This range contains recovery / rest only' : '這段日期只有恢復／休息安排'}</h3>{recoveryReason && <p>{recoveryReason}</p>}<p>{lang === 'en' ? 'Recovery includes easy activity. If you expected strength work, review court intensity and duration, recovery information, available days and equipment before applying.' : '恢復日包含低負荷活動。如果你預期要有肌力訓練，請先核對球局強度／時間、恢復資訊、可用日及器材，再決定是否套用。'}</p></section>}
    {stale && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-4 rounded-xl">{p('stale')}</p>}
    {incomplete && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-4 rounded-xl">{p('missing')}</p>}
    <section className="panel space-y-3" aria-label={p('summary')}><h3 className="font-bold text-lg">{p('summary')}</h3><p data-testid="period-minutes-scope" className="text-xs text-slate-500">{p('minutesScope')}</p>{weeklySummaries.map(summary => <div key={summary.week} className="rounded-xl bg-sky-50 p-4 text-sm space-y-2"><p className="font-semibold text-indigo-800">{summary.from} – {summary.to}</p><p>{p('goal')} · {p(summary.focus || 'balanced')}</p>{eventSummary(summary) && <p className="text-amber-800" data-testid="period-event-summary">{eventSummary(summary)}</p>}<p>{summary.trainingSessions ?? 0} {p('count')} · {summary.recoverySessions ?? 0} {p('recovery')} · {summary.restDays ?? 0} {p('rest')} · {summary.minutes ?? 0} {p('minutes')}</p></div>)}</section>
    <MobilityOverview sessions={sessions} exercises={exercises} lang={lang} testId="period-mobility-overview" />
    {groups.map(week => {
      const weekDates = dates.filter(date => getWeekString(new Date(`${date}T12:00:00`)) === week);
      return <section className="panel space-y-3" key={week} data-week={week}><h3 className="font-semibold text-lg">{weekDates[0]} – {weekDates.at(-1)}</h3><div className="grid sm:grid-cols-2 gap-3">{weekDates.map(date => {
        const session = sessions.find(item => item.date === date);
        const protectedDate = protectedDates.includes(date);
        return <button type="button" key={date} data-testid={`period-day-${date}`} onClick={() => { setOpened(null); setSelected(date); requestAnimationFrame(() => detail.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })); }} aria-pressed={selected === date} className={`text-left rounded-xl border p-4 min-h-24 ${selected === date ? 'border-indigo-400 bg-indigo-50' : 'border-sky-100 bg-white'}`}><span className="block font-semibold text-slate-800">{dateLabel(date)}</span>{eventPhase(date) && <span data-testid={`period-event-${date}`} className="inline-block rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 mt-2">{p(eventPhase(date))}</span>}<span className="block text-sm text-indigo-700 mt-2">{label(session)}{session && ` · ${estimateSessionMinutes(session, exercises)} ${p('minutes')}`}</span>{session?.theme && <span className="block text-sm text-slate-600 mt-1">{session.theme}</span>}<span className="block text-xs text-slate-500 mt-2">{protectedDate ? p('protected') : p('planned')}{today === date ? ` · ${lang === 'en' ? 'Today' : '今天'}` : ''}</span></button>;
      })}</div></section>;
    })}
    {selected && <section ref={detail} data-testid="period-day-detail" className="panel space-y-5 scroll-mt-5"><h3 className="text-xl font-bold">{dateLabel(selected)}</h3>{eventPhase(selected) && <p className="text-sm text-amber-800">{p(eventPhase(selected))}</p>}<p className="text-sm text-indigo-700">{label(day)}</p><p className="text-xs text-slate-500">{p('readonly')}</p>{protectedDates.includes(selected) && <p className="text-sm text-amber-800">{p('protected')}</p>}{day && <><h4 className="font-semibold">{day.theme}</h4>{entries.length > 0 && <p className="text-xs text-slate-500">{j('previewBrowseHint')}</p>}{daySections.filter(section => section.items.length).map(section => <div key={section.phase} className="space-y-2" data-phase={section.phase}><h4 className="font-semibold text-indigo-700">{p(section.phase)}</h4>{section.items.map(entry => <ExerciseRow key={entry.id} id={entry.id} number={entries.findIndex(item => item.id === entry.id) + 1} name={exercises[entry.id]?.name || entry.id} summary={`${entry.dose.sets} ${p('sets')} × ${entry.dose.value} ${p(entry.dose.unit)}${entry.dose.perSide ? ` · ${p('eachSide')}` : ''}`} preparation={entry.dose.preparation ? j('hasPreparation') : null} actionLabel={j('details')} onOpen={opener => { opener?.focus({ preventScroll: true }); setOpened({ date: selected, id: entry.id }); }} />)}</div>)}</>}</section>}
    <ExerciseDetails open={!!openedEntry} title={openedEntry ? exercises[openedEntry.id]?.name || openedEntry.id : ''} subtitle={openedEntry ? `${selected} · ${p(openedEntry.phase)}` : ''} closeLabel={j('returnList')} onClose={() => setOpened(null)}>
      {openedEntry && <div className="space-y-4"><p className="text-xs text-slate-500">{p('readonly')}</p>{openedEntry.dose.preparation && <div className="text-sm bg-amber-50 rounded-xl p-4 space-y-2"><p className="font-medium">{p('preparation')}</p><p>{dose(openedEntry.dose.preparation)}</p><p>{openedEntry.dose.preparation.instruction}</p></div>}<p className="text-sm font-medium">{dose(openedEntry.dose)}</p>{openedEntry.phase === 'warmup' && day.warmupNote && <p className="text-sm text-slate-500">{day.warmupNote}</p>}{openedEntry.phase === 'cooldown' && day.cooldownNote && <p className="text-sm text-slate-500">{day.cooldownNote}</p>}<ExerciseGuide id={openedEntry.id} exercise={exercises[openedEntry.id]} lang={lang} /></div>}
    </ExerciseDetails>
    {preview.conclusion && <details className="panel"><summary className="font-medium text-sm">{p('conclusion')}</summary><p className="whitespace-pre-wrap text-sm text-slate-600 leading-relaxed mt-4">{preview.conclusion}</p></details>}
    {(onBack || onApply) && <div className="preview-actions">{onBack && <button type="button" onClick={onBack} disabled={busy} className="button-secondary"><ArrowLeft size={16} />{p('back')}</button>}{onApply && <button type="button" data-testid="period-plan-apply" onClick={onApply} disabled={busy || stale || incomplete} className="button-primary">{busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}{p(busy ? 'applying' : 'apply')}</button>}</div>}
  </section>;
}
