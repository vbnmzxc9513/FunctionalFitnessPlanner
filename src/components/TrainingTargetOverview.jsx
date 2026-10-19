import { trainingTargetReport } from '../domain/trainingTargets.js';

export default function TrainingTargetOverview({ sessions, exercises, regions = [], lang = 'zh', t }) {
  if (!regions.length) return null;
  const en = lang === 'en';
  const dates = values => values.map(value => typeof value === 'string' ? value.slice(5).replace('-', '/') : value).join(' · ');
  return <details className="panel" data-testid="training-target-overview"><summary className="font-semibold text-sky-800">{en ? 'Your priority areas · actual plan' : '加強部位 · 查看實際安排'}</summary><div className="mt-3 space-y-3">{trainingTargetReport(sessions, exercises, regions).map(row => <div key={row.region} data-target={row.region} className="text-sm"><p className="font-medium text-slate-700">{t(`targetRegions_${row.region}`)}</p><p className={row.dates.length ? 'text-sky-700' : 'text-slate-500'}>{row.dates.length ? `${en ? 'Targeted work' : '主項／專項控制'} · ${dates(row.dates)}` : en ? 'No dedicated work scheduled; time, equipment, compatible slots or recovery limits take priority.' : '未排專項 · 時間、器材、可用動作槽或恢復限制優先。'}</p>{row.activationDates.length > 0 && <p className="text-xs text-slate-500">{en ? 'Flow / warm-up activation (separate from dedicated work)' : '流程／暖身含啟動（與專項訓練分開）'} · {dates(row.activationDates)}</p>}</div>)}</div><p className="text-xs text-slate-500 mt-3">{en ? 'These dates show planned contributing movements, not completed work, isolated muscle loading or measured improvement. More selections do not add work.' : '依實際列出的相關動作計算，不代表已完成、孤立肌群負荷或已改善；多選不額外加量。'}</p></details>;
}
