import { CalendarDays, CheckCircle2, Flame, Shield, Zap } from 'lucide-react';
import { formatMonth } from '../domain/dates.js';
import TrainingHistory from './TrainingHistory.jsx';

export default function History({ t, lang, stats, months, weeks, hasMore, onLoadMore, logs = [], onUpdateNextDay, loggingBusy = false, today, exercises = {}, previewOnly = false }) {
  if (previewOnly) return <TrainingHistory lang={lang} logs={logs} exercises={exercises} onUpdateNextDay={onUpdateNextDay} busy={loggingBusy} today={today} />;
  const rows = [
    ['radarLower', stats.typeStats.lower, 'bg-indigo-500'], ['radarCore', stats.typeStats.core, 'bg-blue-500'],
    ['radarUpper', stats.typeStats.upper_push + stats.typeStats.upper_pull, 'bg-sky-500'],
    ['radarMobility', stats.typeStats.mobility, 'bg-teal-500'], ['radarPower', stats.typeStats.power + stats.typeStats.full, 'bg-orange-500'],
  ];
  return <div className="space-y-6">
    <TrainingHistory lang={lang} logs={logs} exercises={exercises} onUpdateNextDay={onUpdateNextDay} busy={loggingBusy} today={today} />
    <details className="rounded-2xl border border-sky-100 bg-white p-5"><summary className="cursor-pointer font-semibold text-sm text-slate-700">{lang === 'en' ? 'Training trends and summaries' : '訓練趨勢與統計'}</summary><div className="mt-4 space-y-6">
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl p-5 text-center"><Flame className="text-orange-500 mx-auto mb-2" /><strong className="text-3xl">{stats.totalActiveDays}</strong><p className="text-xs text-slate-500 mt-2">{t('historyActiveDays')}</p></div>
      <div className="bg-white rounded-2xl p-5 text-center"><CheckCircle2 className="text-sky-600 mx-auto mb-2" /><strong className="text-3xl">{stats.totalCompleted}</strong><p className="text-xs text-slate-500 mt-2">{t('historyCompleted')}</p></div>
    </div>
    <p className="text-xs text-slate-500">{t('historyScope')}</p>
    <section className="bg-white rounded-2xl p-5 border border-sky-100">
      <h2 className="font-bold mb-4 flex gap-2 items-center"><Zap size={18} className="text-yellow-500" />{t('heatmapTitle')}</h2>
      {weeks.length === 0 ? <p className="text-sm text-slate-500">{t('heatmapEmpty')}</p> : <div className="overflow-x-auto"><div className="flex gap-1.5 min-w-max">
        {weeks.map(week => <div key={week} className="space-y-1.5">{[1, 2, 3, 4, 5, 6, 7].map(day => {
          const count = stats.dailyMap[`${week}-${day}`] || 0;
          return <div key={day} className={`w-5 h-5 rounded-sm ${count >= 5 ? 'bg-sky-700' : count > 2 ? 'bg-sky-500' : count > 0 ? 'bg-sky-200' : 'bg-slate-100'}`} title={`${week} ${t('allDayNames')[day - 1]}: ${count} ${t('heatmapActions')}`} />;
        })}</div>)}
      </div></div>}
    </section>
    <section className="bg-white rounded-2xl p-5 border border-sky-100">
      <h2 className="font-bold mb-4 flex gap-2 items-center"><Shield size={18} className="text-indigo-600" />{t('radarTitle')}</h2>
      <div className="space-y-3">{rows.map(([label, count, color]) => <div key={label} className="flex text-xs items-center gap-3">
        <span className="w-24 text-slate-500">{t(label)}</span><div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${color}`} style={{ width: `${count / Math.max(1, stats.totalCompleted) * 100}%` }} /></div><span className="w-8 text-right">{count}</span>
      </div>)}</div>
    </section>
    <h2 className="font-bold flex gap-2 items-center"><CalendarDays size={20} className="text-sky-600" />{t('monthlyTitle')}</h2>
    {months.length === 0 ? <p className="text-sm text-slate-500">{t('historyEmpty')}</p> : <div className="grid sm:grid-cols-2 gap-4">{months.map(month => {
      const percent = month.total ? Math.round(month.completed / month.total * 100) : 0;
      return <div key={month.monthKey} className="bg-white rounded-2xl p-5 border border-sky-100"><h3 className="font-bold">{formatMonth(month.monthKey, lang)}</h3><strong className="text-2xl text-sky-600">{percent}%</strong><p className="text-sm text-slate-500 mt-2">{month.completed} / {month.total} {t('historyActionsUnit')}</p></div>;
    })}</div>}
    </div></details>
    {hasMore && <button onClick={onLoadMore} className="text-sky-600 text-sm">{t('loadMore')}</button>}
  </div>;
}
