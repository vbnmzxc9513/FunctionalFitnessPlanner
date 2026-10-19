import { MOBILITY_LABELS, scheduledMobility } from '../domain/mobility.js';
import { planningExercises, normalizePlanningContext } from '../domain/planning.js';
import { mobilityAreas } from '../domain/mobility.js';
import { recoveryDecision } from '../domain/recovery.js';

export default function MobilityOverview({ sessions, exercises, lang, context, testId = 'mobility-overview' }) {
  const en = lang === 'en';
  const labels = MOBILITY_LABELS[en ? 'en' : 'zh'];
  const rows = scheduledMobility(sessions, exercises);
  const profile = normalizePlanningContext(context);
  const available = planningExercises(exercises, profile);
  const missing = area => !context ? en ? 'Not scheduled; conditions are not preserved here.' : '尚未安排；此摘要未保留完整條件。'
    : profile.healthStatus !== 'unrestricted' ? en ? 'Not scheduled: health / treatment conditions need confirmation.' : '未安排：健康或治療條件需先確認。'
      : recoveryDecision(profile).limited ? en ? 'Not scheduled: movement-limiting soreness takes priority.' : '未安排：先避開影響活動的痠痛區域。'
        : !Object.keys(available).some(id => mobilityAreas(id, available).includes(area)) ? en ? 'Not scheduled: no enabled, eligible movement for this region.' : '未安排：此區域沒有啟用且符合條件的動作。'
          : en ? 'Not scheduled within these dates and time limits; review available days and daily reasons.' : '本段日期與時限內未排入；請查看可用日與每日原因。';
  return <details className="panel" data-testid={testId}>
    <summary className="cursor-pointer font-semibold text-sky-800">{en ? 'Mobility plan · view eight regions' : '活動度安排 · 查看八個區域'}</summary>
    <p className="text-xs text-slate-500 mt-3">{en ? 'Review scheduled dates, including regions without strength work. Daily details explain the focus and its relation to recent training and court days. The flow includes active shoulder movement and control; this is not a passive stretching dose.' : '查看各區域安排在哪幾天，沒有練肌力的部位也會納入輪替；每日詳情會說明與近期訓練、球日的關係；流程中的肩部活動含主動控制，不等同被動拉伸劑量。'}</p>
    <dl className="mt-3 divide-y divide-sky-100">{rows.map(row => <div key={row.area} data-mobility-area={row.area} className="py-2 flex flex-wrap items-start gap-x-4 gap-y-1 text-sm"><dt className="w-24 shrink-0 font-medium text-slate-700">{labels[row.area]}</dt><dd className={`min-w-0 flex-1 ${row.dates.length ? 'text-sky-700' : 'text-slate-500'}`}>{row.dates.length ? row.dates.map(date => date.slice(5).replace('-', '/')).join(' · ') : missing(row.area)}</dd></div>)}</dl>
    <p className="mt-3 text-xs text-slate-500">{en ? 'These are scheduled activities, not confirmed completion, measured range, or injury-risk scores. Pain, treatment, fatigue and time limits take priority; missing dates do not require catch-up stretching.' : '這是安排紀錄，並非實際完成、實測活動範圍或受傷風險評分。疼痛、治療、疲勞與時間限制優先；未排入不代表必須補拉伸。'}</p>
  </details>;
}
