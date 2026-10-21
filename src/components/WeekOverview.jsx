import MobilityOverview from './MobilityOverview.jsx';
import { ArrowRight, CalendarDays, Dumbbell, Footprints, Moon, MoveUpRight, Target } from 'lucide-react';
import { buildWeekOverview } from '../domain/weekOverview.js';
import { createWeeklyIntent } from '../domain/trainingPreferences.js';
import { WEEK_PLAN_TEXT } from '../weekPlanLocale.js';

const icons = { strength: Dumbbell, skill: MoveUpRight, training: Dumbbell, recovery: Footprints, rest: Moon, unplanned: Moon };
export default function WeekOverview({ schedule, exercises, week, plan, context, focus, time, level, lang, t, onEdit, onSelectDay, currentDate, children, editLabel, compact = false }) {
  const text = WEEK_PLAN_TEXT[lang === 'en' ? 'en' : 'zh'];
  const overview = buildWeekOverview(schedule, exercises, week, plan?.weeklyIntent, level);
  const saved = overview.intent;
  const pending = saved && JSON.stringify(saved) !== JSON.stringify(createWeeklyIntent(context, focus, time));
  const names = ids => ids.map(id => exercises[id]?.name || id).join('、');
  const preferences = (label, rows, key) => rows.length > 0 && <div className="preference-row"><p>{label}</p>{rows.map(row => <span key={row.region} className="preference-chip">{t(`${key}_${row.region}`)} · {row.days.length ? `${row.days.length} ${text.dayUnit}` : text.absent}</span>)}{rows.some(row => !row.days.length) && <p className="text-xs text-amber-800 mt-2">{text.notCovered}</p>}</div>;
  return <section data-testid="week-overview" data-week={week} data-compact={compact}>
    {!compact && <div className="week-hero"><div><p className="eyebrow">{week} · {overview.days[0].date?.slice(5).replace('-', '/')} — {overview.days[6].date?.slice(5).replace('-', '/')}</p><h2>{saved ? t(`focus_${saved.focus}`) : text.title}</h2><p className="screen-description">{text.intro}</p><div className="week-metrics"><span><strong>{overview.counts.strength}</strong>{text.sessions} · {text.strength}</span><span><strong>{overview.counts.skill}</strong>{text.sessions} · {text.skill}</span><span><strong>{overview.minutes}</strong>{text.minutes}</span></div></div>{editLabel !== false && <button type="button" onClick={onEdit} className="button-primary"><Target size={17} />{editLabel || text.edit}</button>}</div>}
    {pending && <p data-testid="weekly-intent-pending" role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 mb-5">{text.pending}</p>}
    <div className="week-layout"><div>
      {!compact && <div className="week-strip" aria-label={text.roles}>{overview.days.map(day => day.entry ? <button key={day.day} type="button" data-testid={`week-day-select-${day.day}`} data-today={day.date === currentDate} onClick={() => onSelectDay(day.day)} aria-label={`${text.view} ${text.week[day.day - 1]}`}><small>{text.week[day.day - 1]}</small><b>{Number(day.date?.slice(-2))}</b><span className="day-dot" /><span className="sr-only">{text[day.type]}</span></button> : <div className="weekend-date" key={day.day}><small>{text.week[day.day - 1]}</small><b>{Number(day.date?.slice(-2))}</b><span className="day-dot" /></div>)}</div>}
      <div className="agenda-heading"><h4>{lang === 'en' ? 'Your week, day by day' : '一週安排'}</h4><span className="text-xs text-slate-500">{lang === 'en' ? 'Tap a day for details' : '點選查看每日內容'}</span></div>
      <div className="agenda-list">{overview.days.map(day => {
        const Icon = icons[day.type]; const Tag = day.entry ? 'button' : 'div'; const ids = day.strength.length ? day.strength : day.main.length ? day.main : day.recovery;
        return <Tag key={day.day} data-testid={`week-role-${day.day}`} data-kind={day.type} className="agenda-row" {...(day.entry ? { type: 'button', onClick: () => onSelectDay(day.day), 'aria-label': `${text.view} ${text.week[day.day - 1]}` } : {})}>
          <span className="agenda-date">{text.week[day.day - 1]}<b>{Number(day.date?.slice(-2))}</b></span>{!compact && <span className="agenda-icon"><Icon size={19} /></span>}<span className="agenda-main"><h5>{compact ? day.entry?.theme || text[day.type] : text[day.type]}{day.court && <span className="text-xs font-normal text-sky-700 ml-2">+ {text.court}</span>}</h5><p>{compact ? `${text[day.type]} · ${day.entry ? (lang === 'en' ? 'Scheduled' : '已安排') : (lang === 'en' ? 'Unscheduled' : '未安排')}` : ids.length ? `${names(ids.slice(0, 2))}${ids.length > 2 ? ` +${ids.length - 2}` : ''}` : day.entry ? text.noMain : text.weekend}</p></span><span className="agenda-time">{day.minutes > 0 ? `${day.minutes} ${text.minutes}` : '—'}</span>{day.entry && <ArrowRight size={15} className="text-slate-400 shrink-0" />}
        </Tag>;
      })}</div><p className="text-xs text-slate-500 mt-3">{text.excludingCourt}</p>
    </div><details className="week-context" data-testid="week-context" open={!compact ? true : undefined}><summary>{lang === 'en' ? 'Goals and weekly balance' : '規劃重點與部位平衡'}</summary><aside className="week-aside">
      <section className="panel"><h4 className="aside-title flex items-center gap-2"><Target size={17} />{lang === 'en' ? 'This week’s intention' : '本週目標'}</h4>{saved ? <><p className="text-sm text-slate-600 mt-3">{text.intent}：{t(`focus_${saved.focus}`)}</p>{preferences(text.targets, overview.targetCoverage, 'targetRegions')}{preferences(text.stiffness, overview.stiffnessCoverage, 'stiffnessRegions')}{saved.badmintonDays.length === 0 && <p className="text-xs text-slate-500 mt-4">{text.courtUnknown}</p>}{saved.competitionDate && <p className="text-sm text-sky-700 mt-4 flex gap-2"><CalendarDays size={16} />{saved.competitionDate}</p>}</> : <p className="text-sm text-slate-500 mt-3">{text.unknown}</p>}</section>
      <MobilityOverview sessions={overview.days.filter(day => day.entry).map(day => ({ ...day.entry, date: day.date }))} exercises={exercises} lang={lang} />
      {children}
      <details className="panel"><summary className="aside-title">{text.checkpoint}</summary>{saved && <p className="mt-3 text-sm text-slate-600 leading-relaxed">{text[`track_${saved.focus}`]}</p>}<p className="text-sm text-slate-500 leading-relaxed mt-3">{text.checkpointText}</p></details>
    </aside></details></div>
  </section>;
}
