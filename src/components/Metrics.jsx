import { Activity, Loader2, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { METRIC_LIMITS } from '../domain/metrics.js';

const labels = { height: 'labelHeight', weight: 'labelWeight', age: 'labelAge', bodyFat: 'labelBodyFat', bmr: 'labelBMR', muscleLarm: 'labelLArm', muscleRarm: 'labelRArm', muscleLleg: 'labelLLeg', muscleRleg: 'labelRLeg', muscleTrunk: 'labelTrunk' };

export default function Metrics({ t, form, onChange, onSave, history, saving, onLoadMore, hasMore }) {
  return <div className="space-y-6">
    <section className="bg-white p-5 rounded-2xl border border-sky-100">
      <h2 className="text-lg font-bold mb-4 flex gap-2 items-center"><Activity size={20} className="text-sky-600" />{t('metricsTitle')}</h2>
      <p className="text-sm text-slate-500 mb-4">{t('metricsUpdateHint')}</p>
      <form onSubmit={onSave} className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <label className="text-xs text-slate-500">{t('labelDate')}<input type="date" name="date" value={form.date} onChange={onChange} required className="block w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 mt-1 text-slate-700 text-sm" /></label>
          {Object.entries(METRIC_LIMITS).map(([key, [min, max]]) => <label key={key} className="text-xs text-slate-500">{t(labels[key])}<input type="number" name={key} min={min} max={max} step={key === 'age' ? '1' : '0.1'} value={form[key]} onChange={onChange} className="block w-full bg-slate-50 border border-sky-200 rounded-lg px-3 py-2 mt-1 text-slate-700 text-sm" /></label>)}
        </div>
        <button disabled={saving} className="w-full bg-sky-600 text-white py-3 rounded-xl disabled:opacity-50">{saving ? <Loader2 size={18} className="animate-spin mx-auto" /> : t('metricsSaveBtn')}</button>
      </form>
    </section>
    {history.length > 0 && <section className="bg-white p-5 rounded-2xl border border-sky-100">
      <h2 className="text-lg font-bold mb-6 flex gap-2 items-center"><TrendingUp size={20} className="text-sky-600" />{t('metricsTrendTitle')}</h2>
      <div className="h-72 mb-10"><h3 className="text-xs text-slate-500 mb-2">{t('metricsChartWeight')}</h3><ResponsiveContainer width="100%" height="90%">
        <LineChart data={history}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={10} /><YAxis yAxisId="weight" domain={['auto', 'auto']} /><YAxis yAxisId="fat" orientation="right" domain={['auto', 'auto']} /><Tooltip /><Legend />
          <Line yAxisId="weight" dataKey="weight" name={t('chartWeightName')} stroke="#3b82f6" /><Line yAxisId="fat" dataKey="bodyFat" name={t('chartBodyFatName')} stroke="#f59e0b" />
        </LineChart>
      </ResponsiveContainer></div>
      <div className="h-72"><h3 className="text-xs text-slate-500 mb-2">{t('metricsChartMuscle')}</h3><ResponsiveContainer width="100%" height="90%">
        <LineChart data={history}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" fontSize={10} /><YAxis domain={['auto', 'auto']} /><Tooltip /><Legend />
          <Line dataKey="muscleRarm" name={t('chartRArm')} stroke="#ef4444" /><Line dataKey="muscleLarm" name={t('chartLArm')} stroke="#ef4444" strokeDasharray="5 5" /><Line dataKey="muscleRleg" name={t('chartRLeg')} stroke="#10b981" /><Line dataKey="muscleLleg" name={t('chartLLeg')} stroke="#10b981" strokeDasharray="5 5" />
        </LineChart>
      </ResponsiveContainer></div>
    </section>}
    {hasMore && <button onClick={onLoadMore} className="text-sm text-sky-600">{t('loadMore')}</button>}
  </div>;
}
