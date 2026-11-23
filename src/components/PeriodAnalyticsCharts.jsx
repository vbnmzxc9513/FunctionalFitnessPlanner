import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildPeriodAnalytics } from '../domain/periodAnalytics.js';
import './period-analytics.css';

const KIND_COLORS = {
  strength: '#0369a1',
  control: '#0284c7',
  training: '#0ea5e9',
  recovery: '#7dd3fc',
  rest: '#cbd5e1',
  unplanned: '#e2e8f0',
};

export default function PeriodAnalyticsCharts({
  sessions = [],
  exercises = {},
  context = {},
  range,
  protectedDates = [],
  recentSummary = null,
  lang = 'zh',
}) {
  const en = lang === 'en';
  const analytics = useMemo(
    () => buildPeriodAnalytics({ sessions, exercises, context, range, protectedDates, recentSummary, lang }),
    [sessions, exercises, context, range, protectedDates, recentSummary, lang],
  );

  if (!analytics.dailySeries.length) return null;

  const { totals, dailySeries, patternDistribution, mobilityCoverage } = analytics;
  const maxMobility = Math.max(2, ...mobilityCoverage.map(item => item.count));
  const courtDates = dailySeries.filter(day => day.isCourtDay).map(day => day.label);

  return (
    <section className="period-analytics" data-testid="period-analytics-charts" aria-label={en ? 'Plan statistics and charts' : '課表統計與視覺分析'}>
      <header className="period-analytics-title">
        <h3>{en ? 'Plan Coverage & Statistics' : '課表涵蓋與統計分析'}</h3>
        <span>
          {en
            ? `${totals.totalDays} days · ${totals.totalMinutes} min total conditioning`
            : `共 ${totals.totalDays} 天 · 額外體能約 ${totals.totalMinutes} 分鐘`}
        </span>
      </header>

      <dl className="period-analytics-kpis">
        <div className="period-analytics-kpi">
          <dt>{en ? 'Strength / Control' : '肌力／協調日'}</dt>
          <dd data-testid="analytics-training-days">{totals.trainingDays} {en ? 'd' : '天'}</dd>
        </div>
        <div className="period-analytics-kpi">
          <dt>{en ? 'Recovery / Rest' : '恢復／休息日'}</dt>
          <dd>{totals.recoveryDays} / {totals.restDays}</dd>
        </div>
        <div className="period-analytics-kpi">
          <dt>{en ? 'Avg active session' : '單日平均時長'}</dt>
          <dd>{totals.avgActiveMinutes} {en ? 'min' : '分'}</dd>
        </div>
        <div className="period-analytics-kpi">
          <dt>{en ? 'Mobility regions' : '活動度覆蓋'}</dt>
          <dd data-testid="analytics-mobility-score">{totals.coveredMobilityRegions} / 8</dd>
        </div>
        {recentSummary?.hasHistory && (
          <div className="period-analytics-kpi">
            <dt>{en ? `Last ${recentSummary.lookbackDays}d active` : `近 ${recentSummary.lookbackDays} 天實做`}</dt>
            <dd>{recentSummary.trainingDays} {en ? 'd' : '天'}</dd>
          </div>
        )}
      </dl>

      <div className="period-chart-grid">
        <div className="period-chart-box" data-testid="analytics-daily-chart">
          <h4>{en ? 'Daily Rhythm & Estimated Minutes' : '每日負荷節奏與預估分鐘數'}</h4>
          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailySeries} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} interval={dailySeries.length > 14 ? 2 : 0} />
                <YAxis tick={{ fontSize: 11, fill: '#475569' }} unit={en ? 'm' : '分'} allowDecimals={false} />
                <Tooltip
                  formatter={value => [`${value} ${en ? 'min' : '分鐘'}`, en ? 'Estimated time' : '預估時長']}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload;
                    return row ? `${row.label} (${row.weekday})${row.isCourtDay ? (en ? ' · Court' : ' · 羽球日') : ''}` : label;
                  }}
                />
                <Bar dataKey="minutes" radius={[6, 6, 0, 0]} maxBarSize={28}>
                  {dailySeries.map(entry => (
                    <Cell key={entry.date} fill={KIND_COLORS[entry.kind] || KIND_COLORS.training} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="period-chart-legend">
            <span><i className="period-chart-dot" style={{ background: KIND_COLORS.strength }} />{en ? 'Strength' : '肌力'}</span>
            <span><i className="period-chart-dot" style={{ background: KIND_COLORS.control }} />{en ? 'Coordination' : '協調控制'}</span>
            <span><i className="period-chart-dot" style={{ background: KIND_COLORS.recovery }} />{en ? 'Recovery' : '動態恢復'}</span>
            {courtDates.length > 0 && (
              <span>{en ? `Court days: ${courtDates.join(', ')}` : `羽球日：${courtDates.join('、')}`}</span>
            )}
          </div>
        </div>

        <div className="period-chart-box" data-testid="analytics-pattern-chart">
          <h4>{en ? 'Badminton Strength & Capability Coverage' : '羽球肌力與能力分佈（安排天數）'}</h4>
          <div style={{ width: '100%', height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={patternDistribution} layout="vertical" margin={{ top: 4, right: 16, left: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis type="category" dataKey="label" width={104} tick={{ fontSize: 11, fill: '#18304b' }} />
                <Tooltip
                  formatter={(value, _name, item) => [
                    en ? `${value} days (${item.payload.slots} moves)` : `${value} 天（${item.payload.slots} 項動作）`,
                    en ? 'Planned' : '計畫安排',
                  ]}
                />
                <Bar dataKey="days" radius={[0, 6, 6, 0]} maxBarSize={20}>
                  {patternDistribution.map(entry => (
                    <Cell key={entry.key} fill={entry.targeted ? '#0369a1' : entry.days > 0 ? '#0284c7' : '#cbd5e1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="period-chart-legend">
            <span><i className="period-chart-dot" style={{ background: '#0369a1' }} />{en ? 'Priority target' : '本次優先加強'}</span>
            <span><i className="period-chart-dot" style={{ background: '#0284c7' }} />{en ? 'Scheduled' : '已涵蓋'}</span>
          </div>
        </div>
      </div>

      <div className="period-chart-box" data-testid="analytics-mobility-chart">
        <h4>{en ? '8-Region Mobility Coverage' : '八大關節活動度覆蓋分佈'}</h4>
        <div className="period-mobility-bars">
          {mobilityCoverage.map(item => (
            <div key={item.area} className="period-mobility-item">
              <div className="period-mobility-label">
                <strong>{item.label}</strong>
                <span>{item.count} {en ? 'days' : '天'}</span>
              </div>
              <div className="period-mobility-track" aria-hidden="true">
                <div
                  className="period-mobility-fill"
                  style={{ width: `${Math.min(100, Math.round((item.count / maxMobility) * 100))}%` }}
                />
              </div>
              <div className="period-mobility-dates">
                {item.dates.length
                  ? item.dates.map(date => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`).join(' · ')
                  : (en ? 'Not scheduled in this range' : '本段未安排（依時間／限制調整）')}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="period-analytics-footnote">
        {en
          ? 'Charts summarize planned sessions from your actual exercise list; they do not represent completed workouts or medical clearance.'
          : '圖表依實際排入動作即時統計，代表計畫安排分佈，並非已完成訓練量或醫療評估。'}
      </p>
    </section>
  );
}
