import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { buildPeriodAnalytics } from '../domain/periodAnalytics.js';
import BodyMuscleFigure from './BodyMuscleFigure.jsx';
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

  const [selectedMuscle, setSelectedMuscle] = useState(null);

  if (!analytics.dailySeries.length) return null;

  const { totals, dailySeries, patternDistribution, muscleCoverage = [], mobilityCoverage } = analytics;
  const muscleByKey = Object.fromEntries(muscleCoverage.map(item => [item.key, item]));
  const defaultMuscle = [...muscleCoverage].sort((a, b) => b.days - a.days || b.slots - a.slots)[0]?.key || 'quads';
  const activeMuscleKey = selectedMuscle && muscleByKey[selectedMuscle] ? selectedMuscle : defaultMuscle;
  const activeMuscle = muscleByKey[activeMuscleKey] || muscleCoverage[0];

  const maxMinutes = Math.max(20, ...dailySeries.map(day => day.minutes));
  const movementPatterns = patternDistribution.filter(item => item.key !== 'mobility');
  const maxPatternDays = Math.max(2, ...movementPatterns.map(item => item.days));
  const shortDate = date => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

  return (
    <section className="period-analytics" data-testid="period-analytics-charts" aria-label={en ? 'Plan statistics and charts' : '課表統計與視覺分析'}>
      <header className="period-analytics-title">
        <h3>{en ? 'Weekly Coverage & Load' : '本週訓練涵蓋總覽'}</h3>
        <span>
          {en
            ? `${totals.totalDays} days · ~${totals.totalMinutes} min`
            : `${totals.totalDays} 天 · 約 ${totals.totalMinutes} 分`}
        </span>
      </header>

      <dl className="period-analytics-kpis">
        <div className="period-analytics-kpi">
          <dt>{en ? 'Strength / Control' : '肌力／協調'}</dt>
          <dd data-testid="analytics-training-days">{totals.trainingDays} {en ? 'd' : '天'}</dd>
        </div>
        <div className="period-analytics-kpi">
          <dt>{en ? 'Recovery / Rest' : '恢復／休息'}</dt>
          <dd>{totals.recoveryDays} / {totals.restDays}</dd>
        </div>
        <div className="period-analytics-kpi">
          <dt>{en ? 'Mobility' : '活動度覆蓋'}</dt>
          <dd data-testid="analytics-mobility-score">{totals.coveredMobilityRegions} / 8</dd>
        </div>
      </dl>

      {/* 1. Interactive Front & Back Human Body Muscle Heatmap */}
      <div className="period-chart-box" data-testid="analytics-muscle-map">
        <div className="analytics-section-head">
          <h4>{en ? 'Trained Muscle Map' : '訓練肌群分布圖'}</h4>
          <span className="analytics-section-note">{en ? 'Main & support moves' : '依主訓練／輔助動作'}</span>
        </div>

        <div className="muscle-map-stage">
          <BodyMuscleFigure
            side="front"
            muscleByKey={muscleByKey}
            selectedKey={activeMuscleKey}
            onSelect={setSelectedMuscle}
            label={en ? 'Front' : '正面'}
          />
          <BodyMuscleFigure
            side="back"
            muscleByKey={muscleByKey}
            selectedKey={activeMuscleKey}
            onSelect={setSelectedMuscle}
            label={en ? 'Back' : '背面'}
          />
        </div>

        <div className="muscle-map-legend" aria-hidden="true">
          <span><i style={{ background: '#edf2f7', border: '1px solid #cbd5e1' }} />{en ? '0d' : '未排'}</span>
          <span><i style={{ background: '#7dd3fc' }} />{en ? '1d' : '1天'}</span>
          <span><i style={{ background: '#0284c7' }} />{en ? '2d' : '2天'}</span>
          <span><i style={{ background: '#0369a1' }} />{en ? '3d+' : '3天+'}</span>
        </div>

        {activeMuscle && (
          <div className="muscle-detail-bar" data-testid="analytics-muscle-detail">
            <div className="muscle-detail-head">
              <strong>{activeMuscle.label}</strong>
              <span className={`muscle-detail-count ${activeMuscle.days > 0 ? 'is-active' : ''}`}>
                {activeMuscle.days > 0
                  ? (en ? `${activeMuscle.days}d (${activeMuscle.dates.map(shortDate).join(', ')})` : `${activeMuscle.days} 天（${activeMuscle.dates.map(shortDate).join('、')}）`)
                  : (en ? 'Not scheduled' : '本段未安排')}
              </span>
            </div>
            {activeMuscle.exercises.length > 0 && (
              <p className="muscle-detail-moves">{activeMuscle.exercises.join('、')}</p>
            )}
          </div>
        )}

        <div className="muscle-chip-row" role="group" aria-label={en ? 'Muscle groups' : '各肌群天數'}>
          {muscleCoverage.map(item => {
            const active = item.key === activeMuscleKey;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedMuscle(item.key)}
                className={`muscle-chip ${item.days > 0 ? 'has-load' : ''} ${active ? 'is-selected' : ''}`}
              >
                <span>{item.label}</span>
                <b>{item.days}</b>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Compact Daily Load Rhythm Bars */}
      <div className="period-chart-box" data-testid="analytics-daily-chart">
        <div className="analytics-section-head">
          <h4>{en ? 'Daily Load Rhythm' : '每日負荷節奏'}</h4>
          <span className="analytics-section-note">
            {en ? `Avg ${totals.avgActiveMinutes}m / active day` : `訓練日均 ${totals.avgActiveMinutes} 分`}
          </span>
        </div>
        <div className={`daily-rhythm-bars ${dailySeries.length > 7 ? 'is-scroll' : ''}`}>
          {dailySeries.map(day => {
            const pct = day.minutes > 0 ? Math.max(14, Math.round((day.minutes / maxMinutes) * 100)) : 6;
            const color = KIND_COLORS[day.kind] || KIND_COLORS.training;
            return (
              <div key={day.date} className="daily-rhythm-col" title={`${day.label} ${day.weekday} · ${day.minutes}${en ? 'm' : '分'}`}>
                <span className="daily-rhythm-min">{day.minutes > 0 ? day.minutes : ''}</span>
                <div className="daily-rhythm-track">
                  <span
                    className={`daily-rhythm-fill ${day.minutes === 0 ? 'is-empty' : ''}`}
                    style={{ height: `${pct}%`, background: day.minutes > 0 ? color : undefined }}
                  />
                </div>
                <span className="daily-rhythm-day">{day.weekday.replace('週', '')}</span>
                <span className="daily-rhythm-date">{day.label.split('/')[1]}</span>
                {day.isCourtDay && <span className="daily-rhythm-court" title={en ? 'Court day' : '羽球日'} aria-label={en ? 'Court day' : '羽球日'} />}
              </div>
            );
          })}
        </div>
        <div className="period-chart-legend">
          <span><i className="period-chart-dot" style={{ background: KIND_COLORS.strength }} />{en ? 'Strength' : '肌力'}</span>
          <span><i className="period-chart-dot" style={{ background: KIND_COLORS.control }} />{en ? 'Control' : '協調'}</span>
          <span><i className="period-chart-dot" style={{ background: KIND_COLORS.recovery }} />{en ? 'Recovery' : '恢復'}</span>
          {totals.courtDays > 0 && (
            <span><i className="period-chart-dot" style={{ background: '#0d9488' }} />{en ? 'Court' : '羽球日'}</span>
          )}
        </div>
      </div>

      {/* 3. Compact Movement Pattern Balance Matrix */}
      <div className="period-chart-box" data-testid="analytics-pattern-chart">
        <div className="analytics-section-head">
          <h4>{en ? 'Movement Balance' : '動作模式平衡'}</h4>
          <span className="analytics-section-note">{en ? 'Planned days' : '安排天數'}</span>
        </div>
        <div className="pattern-matrix">
          {movementPatterns.map(item => (
            <div key={item.key} className="pattern-row">
              <div className="pattern-row-top">
                <span className={`pattern-row-label ${item.targeted ? 'is-targeted' : ''}`}>
                  {item.label}
                  {item.targeted && <i className="pattern-target-dot" title={en ? 'Priority target' : '優先加強'} />}
                </span>
                <span className="pattern-row-val">{item.days}{en ? 'd' : '天'}</span>
              </div>
              <div className="pattern-track" aria-hidden="true">
                <span
                  className={`pattern-fill ${item.targeted ? 'is-targeted' : ''}`}
                  style={{ width: `${item.days > 0 ? Math.max(12, Math.min(100, Math.round((item.days / maxPatternDays) * 100))) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Compact 8-Region Mobility Pill Grid */}
      <div className="period-chart-box" data-testid="analytics-mobility-chart">
        <div className="analytics-section-head">
          <h4>{en ? '8-Joint Mobility' : '八大關節活動度'}</h4>
          <span className="analytics-section-note">{totals.coveredMobilityRegions} / 8</span>
        </div>
        <div className="mobility-pill-grid">
          {mobilityCoverage.map(item => {
            const covered = item.count > 0;
            return (
              <div key={item.area} className={`mobility-pill-item ${covered ? 'is-covered' : ''}`}>
                <span className="mobility-pill-name">
                  {covered && <Check size={12} aria-hidden="true" />}
                  {item.label}
                </span>
                <span className="mobility-pill-days">{item.count}{en ? 'd' : '天'}</span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="period-analytics-footnote">
        {en
          ? 'Summarizes scheduled movements in this range; actual completion is tracked in Records.'
          : '依實際排入動作即時統計，代表課表涵蓋分布，實際完成度以紀錄頁為準。'}
      </p>
    </section>
  );
}
