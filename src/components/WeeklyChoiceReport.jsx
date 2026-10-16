import { CheckCircle2, Info } from 'lucide-react';

export default function WeeklyChoiceReport({ report, exercises, t }) {
  if (!report?.length) return null;
  const planned = report.filter(item => item.days.length).length;
  return <section data-testid="weekly-choice-report" className="panel"><h3 className="aside-title">{t('choiceReport')}</h3><p className="text-sm text-slate-600 mt-3">{t('choicePlanned')} {planned} / {report.length}</p><p className="text-xs text-slate-500 mt-2">{t('choiceReportHint')}</p><ul className="space-y-4 mt-4">{report.map(item => <li key={item.id} data-choice-status={item.reason}><div className="flex items-start gap-2 text-sm font-medium">{item.days.length ? <CheckCircle2 size={17} className="shrink-0 text-sky-700" /> : <Info size={17} className="shrink-0 text-slate-400" />}<span>{exercises[item.id]?.name || item.id}</span></div><p className="text-xs text-slate-500 mt-1">{item.days.length ? `${t('choicePlanned')} · ${item.days.map(day => t('dayShort')[day - 1]).join('、')}` : `${t('choiceNotPlanned')} · ${t(`choice_reason_${item.reason}`)}`}</p></li>)}</ul></section>;
}
