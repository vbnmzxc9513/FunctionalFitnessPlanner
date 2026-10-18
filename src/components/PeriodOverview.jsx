import PeriodPlanPreview from './PeriodPlanPreview.jsx';
import { periodText } from '../periodLocale.js';

export default function PeriodOverview({ period, preview, lang = 'zh', exercises, today, onReplan, onToday }) {
  const p = periodText(lang);
  return <div className="space-y-5"><div className="flex flex-wrap gap-3">{onReplan && <button type="button" className="button-secondary" onClick={onReplan}>{p('replan')}</button>}{onToday && <button type="button" className="button-primary" onClick={onToday}>{p('today')}</button>}</div><PeriodPlanPreview preview={preview || period} {...{ lang, exercises, today }} /></div>;
}
