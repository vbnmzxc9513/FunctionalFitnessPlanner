import { useBackNavigation } from '../hooks/useBackNavigation.js';
import SessionTimeSummary from './SessionTimeSummary.jsx';
import TrainingTargetOverview from './TrainingTargetOverview.jsx';
import PlanningConditions from './PlanningConditions.jsx';
import MobilityOverview from './MobilityOverview.jsx';
import { useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, ChevronRight, Loader2, Pencil, Share2 } from 'lucide-react';
import { sessionSections, estimateSessionMinutes } from '../domain/sessions.js';
import { enumeratePeriodDates } from '../domain/periodPlanning.js';
import { competitionDaysAway } from '../domain/planning.js';
import { getWeekString } from '../domain/dates.js';
import { periodText } from '../periodLocale.js';
import ExerciseGuide from './ExerciseGuide.jsx';
import ExerciseRow from './ExerciseRow.jsx';
import ExerciseDetails from './ExerciseDetails.jsx';
import { journeyText } from '../journeyLocale.js';
import './PeriodPlanPreview.css';

export default function PeriodPlanPreview({ preview, lang = 'zh', t = key => key, exercises = {}, today, onBack, onApply, busy = false, stale = false, onSaveWorkout, onShare, onEditWorkout, choiceReport, choiceSummary }) {
  const [selected, setSelected] = useState(null);
  const [opened, setOpened] = useState(null);
  useBackNavigation(!!opened, () => setOpened(null), 100);
  useBackNavigation(!!selected, () => setSelected(null), 40);
  const heading = useRef(null);
  const container = useRef(null);
  const listOpener = useRef(null);
  const j = key => journeyText(lang, key);
  const p = periodText(lang);
  const en = lang === 'en';
  const { range, sessions = [], weeklySummaries = [], protectedDates = [] } = preview;
  let dates = [];
  try {
    const bounds = enumeratePeriodDates(range);
    dates = onApply && Array.isArray(preview.dates) ? preview.dates.filter(date => bounds.includes(date)) : bounds;
  } catch { /* Invalid persisted ranges are shown without inventing sessions. */ }
  const selectedDate = dates.includes(selected) ? selected : null;
  const day = sessions.find(item => item.date === selectedDate);
  const daySections = day ? sessionSections(day, exercises, 1) : [];
  const entries = daySections.flatMap(section => section.items.map(entry => ({ ...entry, phase: section.phase })));
  const openedEntry = opened?.date === selectedDate ? entries.find(entry => entry.id === opened.id && entry.phase === opened.phase) : null;
  const groups = [...new Set(dates.map(date => getWeekString(new Date(`${date}T12:00:00`))))];
  const weekday = date => new Intl.DateTimeFormat(en ? 'en' : 'zh-TW', { weekday: en ? 'short' : 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  const shortDate = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
  const dateLabel = date => `${shortDate(date)} ${weekday(date)}`;
  const court = session => session?.badminton || session?.courtDay || preview.profile?.context?.badmintonDays?.includes(session?.day);
  const eventPhase = date => {
    const away = competitionDaysAway(preview.profile?.context?.competitionDate, date);
    return away === null ? null : away === 0 ? 'competitionDay' : away > 0 && away <= 10 ? 'taper' : away < 0 && away >= -5 ? 'postCompetition' : null;
  };
  const sessionType = session => session.sessionType || (session.routine?.length ? 'training' : 'rest');
  const label = session => {
    if (!session) return en ? 'Unscheduled' : '未安排';
    const type = sessionType(session);
    return `${type === 'training' ? en ? 'Strength' : '肌力' : p(type === 'rest' && (court(session) || eventPhase(session.date) === 'competitionDay') ? 'fitnessRest' : type)}${court(session) ? ` · ${p('court')}` : ''}`;
  };
  const eventSummary = summary => [...new Set(dates.filter(date => date >= summary.from && date <= summary.to).map(eventPhase).filter(Boolean))]
    .map(phase => phase === 'competitionDay' ? `${p(phase)} ${preview.profile.context.competitionDate}` : p(phase)).join(' · ');
  const dose = params => `${params.sets} ${p('sets')} × ${params.value} ${p(params.unit)}${params.perSide ? ` · ${p('eachSide')}` : ''}${params.restSeconds > 0 ? ` · ${p('restLabel')} ${params.restSeconds} ${p('seconds')}` : ''}`;
  const conditions = preview.profile?.context;
  const equipmentKnown = Array.isArray(conditions?.equipment);
  const noTraining = sessions.length > 0 && sessions.every(session => sessionType(session) !== 'training');
  const recoveryReason = sessions.find(session => !conditions?.badmintonDays?.includes(session.day) && session.coachAdvice)?.coachAdvice || sessions.find(session => session.coachAdvice)?.coachAdvice;
  const incomplete = dates.length === 0 || dates.some(date => !sessions.some(session => session.date === date));
  const statusLabel = date => protectedDates.includes(date) ? p('protected') : onApply ? en ? 'Draft preview' : '草稿預覽' : en ? 'Scheduled' : '已安排';
  const openDay = date => {
    listOpener.current = date;
    setOpened(null); setSelected(date);
    requestAnimationFrame(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'start' }); });
  };
  const returnToList = () => {
    setOpened(null); setSelected(null);
    requestAnimationFrame(() => container.current?.querySelector(`[data-testid="period-day-${listOpener.current}"]`)?.focus());
  };
  const visualSections = [
    { id: 'warmup', title: en ? 'Warm-up' : '暖身', phases: ['warmup'] },
    { id: 'training', title: en ? 'Training' : '訓練', phases: ['skill', 'strength', 'accessory'] },
    { id: 'cooldown', title: en ? 'Cool-down' : '收操', phases: ['recovery', 'cooldown'] },
  ];
  const trainingCount = sessions.filter(session => sessionType(session) === 'training').length;
  const recoveryCount = sessions.filter(session => sessionType(session) === 'recovery').length;

  return <section ref={container} data-testid="period-plan-preview" className="period-preview">
    {selectedDate ? <section data-testid="period-day-detail" className="period-day-view">
      <button type="button" onClick={returnToList} className="period-text-action"><ArrowLeft size={19} />{en ? 'Back to plan' : '返回課表'}</button>
      <header className="period-day-heading">
        <h2 ref={heading} tabIndex={-1}>{dateLabel(selectedDate)} · {day?.theme || label(day)}</h2>
        {day ? <p>{estimateSessionMinutes(day, exercises)} {p('minutes')} · {en ? 'Warm-up → Training → Cool-down' : '暖身 → 訓練 → 收操'}</p> : <p>{en ? 'No workout has been scheduled for this date.' : '這天還沒有安排課表。'}</p>}
      </header>
      {eventPhase(selectedDate) && <p className="text-sm text-amber-800">{p(eventPhase(selectedDate))}</p>}
      {day && <>
        <div className="period-day-status"><span className="period-status">{statusLabel(selectedDate)}</span>{onEditWorkout && <button type="button" className="period-text-action" disabled={!!today && day.date < today} onClick={() => onEditWorkout(day)}><Pencil size={17} />{en ? 'Edit this day' : '手動調整這天'}</button>}</div>
        <div className="period-day-tools">{onSaveWorkout && <button type="button" data-testid="save-period-day" className="period-text-action" onClick={() => onSaveWorkout(day)}><BookOpen size={20} />{en ? 'Save as workout' : '儲存為課表'}</button>}{onShare && <button type="button" className="period-text-action" onClick={() => onShare(day)}><Share2 size={20} />{en ? 'Share this day' : '分享這天'}</button>}</div>
        <div className="period-phase-cards">{visualSections.map(group => {
          const sections = daySections.filter(section => group.phases.includes(section.phase));
          const groupEntries = sections.flatMap(section => section.items);
          return <section key={group.id} className="period-phase-card" data-visual-phase={group.id}><h3>{group.title}</h3>{groupEntries.length ? sections.filter(section => section.items.length).map(section => <div key={section.phase} data-phase={section.phase}>{section.items.map((entry, index) => <ExerciseRow key={entry.id} id={entry.id} number={sections.slice(0, sections.indexOf(section)).reduce((sum, previous) => sum + previous.items.length, 0) + index + 1} name={exercises[entry.id]?.name || entry.id} summary={`${entry.dose.sets} ${p('sets')} × ${entry.dose.value} ${p(entry.dose.unit)}${entry.dose.perSide ? ` · ${p('eachSide')}` : ''}`} preparation={entry.dose.preparation ? j('hasPreparation') : null} actionLabel={j('details')} onOpen={opener => { opener?.focus({ preventScroll: true }); setOpened({ date: selectedDate, id: entry.id, phase: section.phase }); }} />)}</div>) : <p className="period-empty-phase">{en ? 'No movements scheduled in this phase.' : '這個階段未安排動作。'}</p>}</section>;
        })}</div>
        <p className="period-readonly-hint">{entries.length > 0 ? j('previewBrowseHint') : p('readonly')}</p>
        <details className="period-secondary"><summary>{en ? 'Time and planning notes' : '查看時間與安排說明'}</summary><div className="period-secondary-content"><SessionTimeSummary day={day} exercises={exercises} availableTime={preview.profile?.time} context={conditions} lang={lang} />{day.coachAdvice && <p data-testid="period-day-reason" className="text-sm text-slate-600">{day.coachAdvice.split(/(?<=[。.!])\s*/)[0]}</p>}<p className="text-xs text-slate-500">{p('readonly')}</p></div></details>
      </>}
    </section> : <>
      {onApply && <header className="period-preview-heading"><h2>{en ? 'Review, then apply' : '先檢查，再套用'}</h2><p>{shortDate(range.from)} — {shortDate(range.to)} · {dates.length} {p('days')}</p><div className="period-preview-meta"><span className="period-status period-status-draft">{en ? 'Draft preview' : '草稿預覽'}</span>{onShare && <button type="button" disabled={!sessions.length || busy} className="period-text-action" onClick={() => onShare(sessions)}><Share2 size={18} />{en ? 'Share preview' : '分享預覽'}</button>}</div></header>}
      {((onApply && (stale || incomplete || choiceSummary)) || noTraining) && <div className="period-preview-issues">
        {onApply && stale && <p role="alert">{p('stale')}</p>}
        {onApply && incomplete && <p role="alert">{p('missing')}</p>}
        {noTraining && <section data-testid="period-recovery-explanation" role="status"><h3>{en ? 'Recovery / rest only in this plan' : '這段日期只有恢復／休息安排'}</h3>{recoveryReason && <p>{recoveryReason}</p>}<p>{en ? 'If you expected strength work, review court load, recovery, available days and equipment before applying.' : '如果你預期要有肌力訓練，套用前請核對球局負荷、恢復資訊、可用日與器材。'}</p></section>}
        {choiceSummary}
      </div>}
      {groups.map(week => {
        const weekDates = dates.filter(date => getWeekString(new Date(`${date}T12:00:00`)) === week);
        return <section className="period-agenda-week" key={week} data-week={week}><div className="period-agenda-heading"><h3>{groups.length > 1 ? `${shortDate(weekDates[0])} — ${shortDate(weekDates.at(-1))}` : en ? 'This week’s plan' : '這週的安排'}</h3>{groups.length === 1 && <span>{en ? `${trainingCount} strength · ${recoveryCount} recovery` : `${trainingCount} 肌力 · ${recoveryCount} 恢復`}</span>}</div><div className="period-agenda-card">{weekDates.map(date => {
          const session = sessions.find(item => item.date === date);
          return <button type="button" key={date} data-testid={`period-day-${date}`} onClick={() => openDay(date)} className="period-agenda-row" aria-label={`${dateLabel(date)} · ${session?.theme || label(session)} · ${session ? statusLabel(date) : label(session)}`}>
            <span className="period-agenda-date"><span>{en ? weekday(date) : weekday(date).slice(-1)}</span><strong>{Number(date.slice(8))}</strong></span>
            <span className="period-agenda-content"><strong>{session?.theme || label(session)}</strong><span>{session ? `${label(session)} · ${statusLabel(date)}` : en ? 'Choose manual or automatic planning' : '可手動或自動排課'}{today === date ? ` · ${en ? 'Today' : '今天'}` : ''}</span>{eventPhase(date) && <span data-testid={`period-event-${date}`} className="period-agenda-event">{p(eventPhase(date))}</span>}</span>
            <span className="period-agenda-minutes">{session && `${estimateSessionMinutes(session, exercises)} ${en ? 'min' : '分'}`}</span><ChevronRight className="period-agenda-arrow" size={20} aria-hidden="true" />
          </button>;
        })}</div></section>;
      })}
      {!onApply && onShare && sessions.length > 0 && <button type="button" data-testid="share-week-plan" className="period-text-action period-share-plan" onClick={() => onShare(sessions)}><Share2 size={18} />{en ? 'Share selected days' : '選擇日期分享課表'}</button>}
      <div className="period-plan-extras">
        <details data-testid="period-plan-conditions" className="period-secondary"><summary>{en ? 'Goals, conditions and weekly balance' : '查看規劃重點、條件與部位平衡'}</summary><div className="period-secondary-content">
          <p data-testid="period-equipment-summary" className="text-sm text-slate-600">{t('equipmentLabel')}：{equipmentKnown ? conditions.equipment.length ? conditions.equipment.map(item => t(`equipment_${item}`)).join('、') : t('equipment_bodyweight') : en ? 'Not preserved in this saved summary; check preferences before replanning.' : '這份儲存摘要未保留器材條件；重排前請確認問卷。'}</p>
          <PlanningConditions context={conditions} time={preview.profile?.time} {...{ lang, t }} equipment={false} />
          <section className="space-y-3" aria-label={p('summary')}><h3 className="font-bold">{p('summary')}</h3><p data-testid="period-minutes-scope" className="text-xs text-slate-500">{p('minutesScope')}</p>{weeklySummaries.map(summary => <div key={summary.week} className="rounded-xl bg-sky-50 p-4 text-sm space-y-2"><p className="font-semibold">{summary.from} – {summary.to}</p><p>{p('goal')} · {p(summary.focus || 'balanced')}</p>{eventSummary(summary) && <p className="text-amber-800" data-testid="period-event-summary">{eventSummary(summary)}</p>}<p>{summary.trainingSessions ?? 0} {p('count')} · {summary.recoverySessions ?? 0} {p('recovery')} · {summary.restDays ?? 0} {p('rest')} · {summary.minutes ?? 0} {p('minutes')}</p></div>)}</section>
          <TrainingTargetOverview {...{ sessions, exercises, lang, t }} regions={conditions?.targetRegions} />
          <MobilityOverview sessions={sessions} exercises={exercises} context={conditions} lang={lang} testId="period-mobility-overview" />
        </div></details>
        {choiceReport}
        {preview.conclusion && <details className="period-secondary"><summary>{p('conclusion')}</summary><p className="period-secondary-content whitespace-pre-wrap text-sm text-slate-600 leading-relaxed">{preview.conclusion}</p></details>}
      </div>
      {onApply && <p className="period-readonly-hint">{p('previewHint')} {p('scope')}</p>}
      {(onBack || onApply) && <div className="preview-actions period-preview-actions">{onBack && <button type="button" onClick={onBack} disabled={busy} className="button-secondary"><ArrowLeft size={16} />{p('back')}</button>}{onApply && <button type="button" data-testid="period-plan-apply" onClick={onApply} disabled={busy || stale || incomplete} className="button-primary">{busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}{en ? busy ? 'Applying…' : 'Apply to plan' : busy ? '套用中…' : '套用到課表'}</button>}</div>}
    </>}
    <ExerciseDetails open={!!openedEntry} title={openedEntry ? exercises[openedEntry.id]?.name || openedEntry.id : ''} subtitle={openedEntry ? `${selectedDate} · ${p(openedEntry.phase)}` : ''} closeLabel={j('returnList')} onClose={() => setOpened(null)}>
      {openedEntry && <div className="space-y-4"><p className="text-xs text-slate-500">{p('readonly')}</p>{openedEntry.dose.preparation && <div className="text-sm bg-amber-50 rounded-xl p-4 space-y-2"><p className="font-medium">{p('preparation')}</p><p>{dose(openedEntry.dose.preparation)}</p><p>{openedEntry.dose.preparation.instruction}</p></div>}<p className="text-sm font-medium">{dose(openedEntry.dose)}</p>{openedEntry.phase === 'warmup' && day.warmupNote && <p className="text-sm text-slate-500">{day.warmupNote}</p>}{openedEntry.phase === 'cooldown' && day.cooldownNote && <p className="text-sm text-slate-500">{day.cooldownNote}</p>}<ExerciseGuide id={openedEntry.id} exercise={exercises[openedEntry.id]} lang={lang} /></div>}
    </ExerciseDetails>
  </section>;
}
