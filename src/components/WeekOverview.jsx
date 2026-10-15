import { buildWeekOverview } from '../domain/weekOverview.js';
import { createWeeklyIntent } from '../domain/trainingPreferences.js';
import { WEEK_PLAN_TEXT } from '../weekPlanLocale.js';

export default function WeekOverview({ schedule, exercises, week, plan, context, focus, time, level, lang, t, onEdit, onSelectDay }) {
  const text = WEEK_PLAN_TEXT[lang === 'en' ? 'en' : 'zh'];
  const overview = buildWeekOverview(schedule, exercises, week, plan?.weeklyIntent, level);
  const saved = overview.intent;
  const pending = saved && JSON.stringify(saved) !== JSON.stringify(createWeeklyIntent(context, focus, time));
  const roles = ['strength', 'skill'].map(key => ({ key, days: overview.days.filter(day => day[key].length).map(day => text.week[day.day - 1]).join('、') })).filter(role => role.days);
  const names = ids => ids.map(id => exercises[id]?.name || id).join('、') || text.absent;
  const preferences = (label, rows, key) => rows.length > 0 && <div><h4 className="text-xs font-semibold text-slate-600 mb-2">{label}</h4><div className="flex flex-wrap gap-2">{rows.map(row => <span key={row.region} className="rounded-lg border border-sky-100 bg-white p-2 text-xs text-slate-600">{t(`${key}_${row.region}`)} · {row.days.length ? `${row.days.length} ${text.dayUnit}` : text.absent}</span>)}</div>{rows.some(row => !row.days.length) && <p className="text-xs text-amber-800 mt-2">{text.notCovered}</p>}</div>;
  return <section data-testid="week-overview" className="rounded-2xl border border-sky-200 bg-white p-4 sm:p-5 mb-5 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-sky-900">{text.title}</h3><p className="text-xs text-slate-500 mt-1">{week} · {text.intro}</p></div><button type="button" onClick={onEdit} className="rounded-lg bg-indigo-50 text-indigo-700 text-sm px-3 py-2">{text.edit}</button></div>
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[['strength', overview.counts.strength], ['skill', overview.counts.skill], ['recovery', overview.counts.recovery], ['rest', overview.counts.rest]].map(([key, count]) => <div key={key} className="rounded-xl bg-sky-50 p-3"><p className="text-xs text-slate-600">{text[key]}</p><p className="text-lg font-bold text-sky-900">{count} <span className="text-xs font-normal">{text.sessions}</span></p></div>)}</div>
    <p className="text-sm leading-relaxed text-slate-700">{roles.length ? `${text.roles}：${roles.map(role => `${text[role.key]} · ${role.days}`).join('；')}` : text.noMainWeek}</p>
    <p className="text-xs text-slate-500">{text.total} {overview.minutes} {text.minutes} · {text.excludingCourt}</p>
    {saved ? <div className="space-y-3 rounded-xl bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-700">{text.intent}：{t(`focus_${saved.focus}`)}</p>
      {preferences(text.targets, overview.targetCoverage, 'targetRegions')}{preferences(text.stiffness, overview.stiffnessCoverage, 'stiffnessRegions')}
      {(saved.targetRegions.length > 0 || saved.stiffnessRegions.length > 0) && <p className="text-xs text-slate-500">{text.intentHint}</p>}
      {saved.badmintonDays.length === 0 && <p className="text-xs text-slate-500">{text.courtUnknown}</p>}
      {saved.competitionDate && <p className="text-xs text-indigo-700">{text[overview.competitionInWeek ? 'competition' : 'competitionDate']}{saved.competitionDate}</p>}
    </div> : <p className="text-xs text-slate-500">{text.unknown}</p>}
    {pending && <p data-testid="weekly-intent-pending" role="status" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{text.pending}</p>}
    <ol className="space-y-2">{overview.days.map(day => <li key={day.day} data-testid={`week-role-${day.day}`} className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-start gap-3"><div className="shrink-0 w-12"><p className="font-bold text-sm text-slate-700">{text.week[day.day - 1]}</p><p className="text-[11px] text-slate-500">{day.date?.slice(5).replace('-', '/')}</p></div>
        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-700">{text[day.type]}{day.minutes > 0 && ` · ${day.minutes} ${text.minutes}`}{day.court && <span className="ml-2 text-xs font-normal text-indigo-700">+ {text.court}</span>}</p>
          <p className="text-xs text-slate-500 mt-1">{day.main.length ? `${text.focus}：${names(day.main)}` : day.recovery.length ? `${text.easy}：${names(day.recovery)}` : day.entry ? text.noMain : text.weekend}</p>
          {day.entry && day.entry.routine.length > 0 && <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer text-sky-700">{text.details}</summary><div className="mt-2 space-y-2"><p>{text.warmup}：{names(day.warmup)}</p>{day.preparation.length > 0 && <p>{text.prep}：{names(day.preparation)}</p>}<p>{day.entry.warmupNote}</p><p>{text.cooldown}：{names(day.cooldown)}</p><p>{day.entry.cooldownNote}</p></div></details>}
        </div>{day.entry && <button type="button" aria-label={`${text.view} ${text.week[day.day - 1]}`} onClick={() => onSelectDay(day.day)} className="shrink-0 text-xs text-sky-700 rounded-lg border border-sky-100 px-2 py-2">{text.view}</button>}
      </div>
    </li>)}</ol>
    <details className="rounded-xl bg-sky-50 p-3 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-sky-800">{text.checkpoint}</summary>{saved && <p className="mt-2 leading-relaxed font-medium">{text[`track_${saved.focus}`]}</p>}<p className="mt-2 leading-relaxed">{text.checkpointText}</p></details>
  </section>;
}
