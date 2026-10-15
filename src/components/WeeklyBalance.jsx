import { analyzeWeeklyBalance } from '../domain/weeklyBalance.js';
import { weeklyBalanceText } from '../weeklyBalanceLocale.js';

export default function WeeklyBalance({ schedule = [], exercises = {}, context = {}, week, lang = 'zh', currentDate }) {
  const balance = analyzeWeeklyBalance(schedule, exercises, context, { week, currentDate });
  const t = (key, parameters) => weeklyBalanceText(lang, key, parameters);
  const dayNames = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  const table = (kind, rows) => <div className="space-y-2">
    <h4 className="font-semibold text-sm">{t(kind)}</h4>
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[380px] text-xs text-left" aria-label={t(kind)}>
        <thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="p-2">{t('region')}</th>{balance.days.map(day => <th key={day.day} scope="col" className="p-2 text-center">{t(dayNames[day.day - 1])}{day.court && <span className="block text-[10px] font-normal">{t('court')}</span>}{day.protected && <span className="block text-[10px] font-normal">{t('protected')}</span>}</th>)}<th scope="col" className="p-2 text-right">{t('coverage')}</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.key} className="border-t border-slate-100 align-top">
          <th scope="row" className="p-2 font-normal max-w-44"><span className="font-medium">{t(row.key)}</span>{row.status !== 'scheduled' && <span className={`block mt-1 text-[11px] font-normal ${row.status === 'check_conditions' ? 'text-amber-700' : 'text-slate-500'}`}>{t(row.status)}</span>}</th>
          {balance.days.map(day => <td key={day.day} className="p-2 text-center"><span className={row.days.includes(day.day) ? 'text-sky-700 font-bold' : 'text-slate-300'} title={row.byDay[day.day].map(id => exercises[id]?.name || id).join('、') || t('empty')} aria-label={`${day.day}: ${row.days.includes(day.day) ? t('planned') : t('empty')}${row.byDay[day.day].length ? `: ${row.byDay[day.day].map(id => exercises[id]?.name || id).join('、')}` : ''}`}>{row.days.includes(day.day) ? '●' : '—'}</span></td>)}
          <td className="p-2 text-right tabular-nums">{row.count}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
  return <details className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="weekly-balance">
    <summary className="cursor-pointer"><span className="font-semibold text-sm">{t('title')}</span><span className="block mt-1 text-xs text-slate-500">{balance.mobility.map(row => `${t(row.key)} ${t('dayCount', { count: row.count })}`).join(' · ')}</span></summary>
    <div className="mt-4 space-y-4"><p className="text-xs text-slate-600">{t('hint')}</p>{table('mobility', balance.mobility)}{table('patterns', balance.patterns)}
      <p className="text-xs text-slate-500">{t('explanation')}</p><p className="text-xs text-slate-500">{t('purpose')}</p>
      <p className="text-xs text-slate-500">{balance.context.courtDays.length ? t('courtDays', { days: balance.context.courtDays.join('、') }) : t('noCourt')}</p>
      {balance.unclassified.length > 0 && <div className="rounded-lg bg-slate-50 p-3"><h4 className="font-semibold text-xs">{t('unclassified')}</h4><p className="text-xs text-slate-500 mt-1">{t('unknownHint')}</p><ul className="mt-2 text-xs text-slate-600 list-disc pl-4">{balance.unclassified.map(item => <li key={`${item.day}-${item.id}`}>{t(dayNames[item.day - 1])} · {exercises[item.id]?.name || item.id}</li>)}</ul></div>}
    </div>
  </details>;
}
