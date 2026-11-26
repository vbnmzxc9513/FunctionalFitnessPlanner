import { useMemo, useState } from 'react';
import { Activity, CalendarDays, CheckCircle2, Flame, Shield, Sparkles, TrendingUp } from 'lucide-react';
import { formatMonth, localDate } from '../domain/dates.js';
import { buildRecordsAnalytics, RECORDS_RANGES } from '../domain/recordsAnalytics.js';
import BodyMuscleFigure from './BodyMuscleFigure.jsx';
import TrainingExport from './TrainingExport.jsx';
import './records-analytics.css';

function RadarChart({ items, lang }) {
  const cx = 140;
  const cy = 114;
  const radius = 68;
  const angle = index => (-Math.PI / 2) + (index * 2 * Math.PI) / items.length;
  const point = (index, r) => [cx + Math.cos(angle(index)) * r, cy + Math.sin(angle(index)) * r];
  const polygon = frac => items.map((_, i) => point(i, radius * frac).map(n => n.toFixed(1)).join(',')).join(' ');
  const dataPolygon = items.map((item, i) => point(i, radius * (item.score / 100)).map(n => n.toFixed(1)).join(',')).join(' ');
  const unit = lang === 'en' ? '' : '次';

  return (
    <div className="records-radar-wrap">
      <svg viewBox="0 0 280 236" className="records-radar-svg" role="img" aria-label={lang === 'en' ? '5-axis badminton training balance radar' : '羽球五維訓練能力雷達圖'}>
        {[0.25, 0.5, 0.75, 1].map(frac => (
          <polygon key={frac} points={polygon(frac)} fill="none" stroke="#cbd5e1" strokeWidth="1" />
        ))}
        {items.map((item, i) => {
          const [x, y] = point(i, radius);
          return <line key={item.key} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="#cbd5e1" strokeWidth="1" />;
        })}
        <polygon points={polygon(0.75)} fill="none" stroke="#0284c7" strokeOpacity="0.45" strokeDasharray="4 3" strokeWidth="1.2" />
        <polygon points={dataPolygon} fill="rgba(14, 165, 233, 0.22)" stroke="#0284c7" strokeWidth="2.2" strokeLinejoin="round" />
        {items.map((item, i) => {
          const [x, y] = point(i, radius * (item.score / 100));
          const [lx, ly] = point(i, radius + 23);
          const anchor = Math.abs(lx - cx) < 12 ? 'middle' : lx > cx ? 'start' : 'end';
          const yShift = i === 0 ? -4 : ly > cy ? 6 : 2;
          return (
            <g key={item.key}>
              {item.score > 0 && <circle cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.8" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />}
              <text x={lx.toFixed(1)} y={(ly + yShift).toFixed(1)} textAnchor={anchor} fill="#1e293b" fontSize="11.5" fontWeight="600">
                {item.label}
              </text>
              <text x={lx.toFixed(1)} y={(ly + yShift + 14).toFixed(1)} textAnchor={anchor} fill="#0284c7" fontSize="10.5" fontWeight="600">
                {item.count}{unit}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function WeeklyComboChart({ series, selectedIndex, onSelect, lang }) {
  const en = lang === 'en';
  const count = series.length;
  const width = 320;
  const height = 136;
  const padX = 18;
  const baseY = 104;
  const maxBarH = 74;
  const step = (width - padX * 2) / Math.max(1, count);
  const barW = Math.min(26, Math.max(16, step * 0.54));
  const maxActions = Math.max(1, ...series.map(item => item.actions));
  const maxDays = Math.max(5, ...series.map(item => item.days));

  const linePoints = series.map((item, i) => {
    const cx = padX + i * step + step / 2;
    const cy = baseY - (item.days / maxDays) * 66;
    return `${cx.toFixed(1)},${cy.toFixed(1)}`;
  }).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="records-weekly-svg" role="img" aria-label={en ? 'Weekly completed actions and active days trend' : '每週完成動作數與活躍天數趨勢'}>
      <line x1={padX} y1={baseY} x2={width - padX} y2={baseY} stroke="#e2e8f0" strokeWidth="1" />
      {series.map((item, i) => {
        const cx = padX + i * step + step / 2;
        const x = cx - barW / 2;
        const h = item.actions > 0 ? Math.max(8, Math.round((item.actions / maxActions) * maxBarH)) : 4;
        const y = baseY - h;
        const active = i === selectedIndex;
        return (
          <g
            key={item.week}
            role="button"
            tabIndex={0}
            aria-label={`${item.label} ${item.rangeLabel}: ${item.days} ${en ? 'days' : '天'}, ${item.actions} ${en ? 'actions' : '動作'}`}
            aria-pressed={active}
            className="records-weekly-bar"
            onClick={() => onSelect(i)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(i);
              }
            }}
          >
            <rect
              x={x.toFixed(1)}
              y={y}
              width={barW.toFixed(1)}
              height={h}
              rx="6"
              fill={item.actions === 0 ? '#e2e8f0' : active ? '#0284c7' : '#bae6fd'}
            />
            <text
              x={cx.toFixed(1)}
              y="123"
              textAnchor="middle"
              fontSize="10.5"
              fill={active ? '#0369a1' : '#64748b'}
              fontWeight={active ? '700' : '500'}
            >
              {item.label}
            </text>
          </g>
        );
      })}
      <polyline fill="none" stroke="#0369a1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={linePoints} />
      {series.map((item, i) => {
        const cx = padX + i * step + step / 2;
        const cy = baseY - (item.days / maxDays) * 66;
        const active = i === selectedIndex;
        return (
          <circle
            key={`${item.week}-dot`}
            cx={cx.toFixed(1)}
            cy={cy.toFixed(1)}
            r={active ? '4.5' : '3.3'}
            fill="#ffffff"
            stroke="#0369a1"
            strokeWidth={active ? '2.6' : '2'}
          />
        );
      })}
    </svg>
  );
}

function recencyLabel(daysSince, lang) {
  const en = lang === 'en';
  if (daysSince === null || daysSince === undefined) return en ? 'Not trained in range' : '此區間未訓練';
  if (daysSince === 0) return en ? 'Today' : '今天練過';
  if (daysSince === 1) return en ? 'Yesterday' : '昨天練過';
  return en ? `${daysSince}d ago` : `${daysSince} 天前`;
}

export default function History({
  t,
  lang = 'zh',
  months = [],
  hasMore = false,
  onLoadMore,
  logs = [],
  today = localDate(),
  exercises = {},
  exportUid,
  publicDraft,
  exportProgress,
  exportDisabled = false,
}) {
  const en = lang === 'en';
  const [range, setRange] = useState('4w');
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(null);

  const effectiveProgress = useMemo(() => {
    if (exportProgress && Object.keys(exportProgress).length > 0) return exportProgress;
    if (publicDraft?.periodDraft?.progressByWeek) return publicDraft.periodDraft.progressByWeek;
    if (publicDraft?.week && publicDraft?.completed) {
      return { [publicDraft.week]: { completed: publicDraft.completed, completedAt: publicDraft.completedAt || {} } };
    }
    return {};
  }, [exportProgress, publicDraft]);

  const analytics = useMemo(
    () => buildRecordsAnalytics({ allProgress: effectiveProgress, exercises, today, range, lang }),
    [effectiveProgress, exercises, today, range, lang],
  );

  const { totals, radar, balanceTip, muscleCoverage, weeklySeries } = analytics;
  const muscleByKey = useMemo(() => Object.fromEntries(muscleCoverage.map(item => [item.key, item])), [muscleCoverage]);
  const defaultMuscle = useMemo(
    () => [...muscleCoverage].sort((a, b) => b.count - a.count || b.days - a.days)[0]?.key || 'quads',
    [muscleCoverage],
  );
  const activeMuscleKey = selectedMuscle && muscleByKey[selectedMuscle] ? selectedMuscle : defaultMuscle;
  const activeMuscle = muscleByKey[activeMuscleKey] || muscleCoverage[0];

  const activeWeekIdx = selectedWeekIndex !== null && selectedWeekIndex < weeklySeries.length
    ? selectedWeekIndex
    : Math.max(0, weeklySeries.length - 1);
  const activeWeek = weeklySeries[activeWeekIdx];

  const rangeLabels = {
    '4w': en ? '4W' : '近 4 週',
    '12w': en ? '12W' : '近 12 週',
    all: en ? 'All' : '全部',
  };

  return (
    <div className="space-y-6">
      <section className="records-dashboard" data-testid="records-trends-dashboard" aria-label={en ? 'Training trends and summaries' : '訓練趨勢與統計'}>
        <header className="records-dashboard-header">
          <h2 className="records-dashboard-title">
            <TrendingUp size={18} className="text-sky-600" aria-hidden="true" />
            {en ? 'Training trends & stats' : '訓練趨勢與統計'}
          </h2>
          <div className="records-range-switch" role="group" aria-label={en ? 'Statistics range' : '統計區間'}>
            {RECORDS_RANGES.map(value => (
              <button
                key={value}
                type="button"
                data-testid={`records-range-${value}`}
                aria-pressed={range === value}
                onClick={() => {
                  setRange(value);
                  setSelectedWeekIndex(null);
                }}
              >
                {rangeLabels[value]}
              </button>
            ))}
          </div>
        </header>

        {/* 1. Hero KPI Strip */}
        <dl className="records-kpi-grid" data-testid="records-kpi-grid">
          <div className="records-kpi-card is-highlight">
            <dt><Flame size={13} className="text-sky-600" aria-hidden="true" />{en ? 'Streak' : '目前連續'}</dt>
            <dd data-testid="records-kpi-streak">
              {totals.currentStreak}
              <span className="records-kpi-unit">{en ? 'd' : '天'}</span>
            </dd>
            {totals.longestStreak > 0 && (
              <span className="records-kpi-sub">{en ? `Best ${totals.longestStreak}d` : `最長 ${totals.longestStreak} 天`}</span>
            )}
          </div>
          <div className="records-kpi-card">
            <dt><CalendarDays size={13} className="text-sky-600" aria-hidden="true" />{en ? 'Active days' : '活躍天數'}</dt>
            <dd data-testid="records-kpi-active-days">
              {totals.activeDays}
              <span className="records-kpi-unit">{en ? 'd' : '天'}</span>
            </dd>
            <span className="records-kpi-sub">{en ? `All ${totals.allTimeActiveDays}d` : `累計 ${totals.allTimeActiveDays} 天`}</span>
          </div>
          <div className="records-kpi-card">
            <dt><CheckCircle2 size={13} className="text-sky-600" aria-hidden="true" />{en ? 'Completed' : '完成動作'}</dt>
            <dd data-testid="records-kpi-completed">{totals.completedCount}</dd>
            {totals.previousDeltaPct !== null ? (
              <span className={`records-kpi-delta ${totals.previousDeltaPct < 0 ? 'is-down' : ''}`}>
                {totals.previousDeltaPct >= 0 ? `+${totals.previousDeltaPct}%` : `${totals.previousDeltaPct}%`}
              </span>
            ) : (
              <span className="records-kpi-sub">{en ? `All ${totals.allTimeCompleted}` : `累計 ${totals.allTimeCompleted} 項`}</span>
            )}
          </div>
        </dl>

        {/* 2. 5-Axis Badminton Balance Radar */}
        <section className="records-card" data-testid="records-radar-chart">
          <div className="records-card-head">
            <h3><Shield size={16} className="text-sky-600" aria-hidden="true" />{en ? '5-Axis Badminton Radar' : '羽球五維能力雷達'}</h3>
            <span className="records-card-meta">{en ? 'Dashed = balanced guide' : '虛線為均衡參考'}</span>
          </div>
          <RadarChart items={radar} lang={lang} />
          <p className="records-tip-banner" data-testid="records-balance-tip">
            <Sparkles size={15} aria-hidden="true" />
            <span>{balanceTip}</span>
          </p>
        </section>

        {/* 3. Actual Trained Muscle Heatmap (Option B) */}
        <section className="records-card" data-testid="records-muscle-map">
          <div className="records-card-head">
            <h3><Activity size={16} className="text-sky-600" aria-hidden="true" />{en ? 'Actual Trained Muscle Map' : '實際訓練肌群熱圖'}</h3>
            <span className="records-card-meta">
              {en
                ? `${totals.trainedMuscleGroups} / ${muscleCoverage.length} groups`
                : `已涵蓋 ${totals.trainedMuscleGroups} / ${muscleCoverage.length} 肌群`}
            </span>
          </div>

          <div className="muscle-map-stage">
            <BodyMuscleFigure
              side="front"
              muscleByKey={muscleByKey}
              selectedKey={activeMuscleKey}
              onSelect={setSelectedMuscle}
              label={en ? 'Front' : '正面'}
              getLevel={item => item?.intensity || 0}
              getAriaLabel={item => `${item.label} ${item.count}`}
            />
            <BodyMuscleFigure
              side="back"
              muscleByKey={muscleByKey}
              selectedKey={activeMuscleKey}
              onSelect={setSelectedMuscle}
              label={en ? 'Back' : '背面'}
              getLevel={item => item?.intensity || 0}
              getAriaLabel={item => `${item.label} ${item.count}`}
            />
          </div>

          <div className="muscle-map-legend" aria-hidden="true">
            <span><i style={{ background: '#edf2f7', border: '1px solid #cbd5e1' }} />{en ? 'None' : '未練'}</span>
            <span><i style={{ background: '#7dd3fc' }} />{en ? 'Light' : '輕度'}</span>
            <span><i style={{ background: '#0284c7' }} />{en ? 'Moderate' : '中度'}</span>
            <span><i style={{ background: '#0369a1' }} />{en ? 'High' : '高頻'}</span>
          </div>

          {activeMuscle && (
            <div className="muscle-detail-bar" data-testid="records-muscle-detail">
              <div className="muscle-detail-head">
                <strong>{activeMuscle.label}</strong>
                <span className={`muscle-detail-count ${activeMuscle.count > 0 ? 'is-active' : ''}`}>
                  {activeMuscle.count > 0
                    ? (en
                      ? `${activeMuscle.count}x (${activeMuscle.days}d) · ${recencyLabel(activeMuscle.daysSince, lang)}`
                      : `完成 ${activeMuscle.count} 次（${activeMuscle.days} 天）· ${recencyLabel(activeMuscle.daysSince, lang)}`)
                    : recencyLabel(null, lang)}
                </span>
              </div>
              {activeMuscle.exercises.length > 0 && (
                <p className="muscle-detail-moves">
                  {en ? `Top moves: ${activeMuscle.exercises.join(', ')}` : `主要完成動作：${activeMuscle.exercises.join('、')}`}
                </p>
              )}
            </div>
          )}

          <div className="muscle-chip-row" role="group" aria-label={en ? 'Muscle groups' : '各肌群完成次數'}>
            {muscleCoverage.map(item => {
              const active = item.key === activeMuscleKey;
              return (
                <button
                  key={item.key}
                  type="button"
                  data-testid={`records-muscle-chip-${item.key}`}
                  aria-pressed={active}
                  onClick={() => setSelectedMuscle(item.key)}
                  className={`muscle-chip ${item.count > 0 ? 'has-load' : ''} ${active ? 'is-selected' : ''}`}
                >
                  <span>{item.label}</span>
                  <b>{item.count}</b>
                </button>
              );
            })}
          </div>
        </section>

        {/* 4. Weekly Volume + Active Days Combo Trend */}
        <section className="records-card" data-testid="records-weekly-chart">
          <div className="records-card-head">
            <h3><TrendingUp size={16} className="text-sky-600" aria-hidden="true" />{en ? 'Weekly Volume & Days' : '每週訓練量與天數趨勢'}</h3>
            {activeWeek && (
              <span className="records-card-meta is-accent" data-testid="records-weekly-readout">
                {en
                  ? `${activeWeek.label} (${activeWeek.rangeLabel}): ${activeWeek.days}d · ${activeWeek.actions} moves`
                  : `${activeWeek.label}（${activeWeek.rangeLabel}）：${activeWeek.days} 天 · ${activeWeek.actions} 動作`}
              </span>
            )}
          </div>
          <WeeklyComboChart
            series={weeklySeries}
            selectedIndex={activeWeekIdx}
            onSelect={setSelectedWeekIndex}
            lang={lang}
          />
          <div className="records-chart-legend" aria-hidden="true">
            <span><i className="records-legend-bar" />{en ? 'Completed actions (tap bar)' : '完成動作數（點擊週柱檢視）'}</span>
            <span><i className="records-legend-dot" />{en ? 'Active training days' : '活躍訓練天數'}</span>
          </div>
        </section>

        {/* 5. Monthly Completion Donut Rings */}
        <section className="records-card" data-testid="records-monthly-rings">
          <div className="records-card-head">
            <h3><CalendarDays size={16} className="text-sky-600" aria-hidden="true" />{t('monthlyTitle')}</h3>
            <span className="records-card-meta">{en ? 'Scheduled vs done' : '排定課表完成率'}</span>
          </div>
          {months.length === 0 ? (
            <p className="text-sm text-slate-500 m-0">{t('historyEmpty')}</p>
          ) : (
            <div className="records-monthly-grid">
              {months.map(month => {
                const percent = month.total ? Math.round((month.completed / month.total) * 100) : 0;
                const radius = 21;
                const circumference = 2 * Math.PI * radius;
                const offset = circumference * (1 - percent / 100);
                return (
                  <div key={month.monthKey} className="records-month-card">
                    <svg viewBox="0 0 56 56" className="records-month-ring" aria-hidden="true">
                      <circle cx="28" cy="28" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="5" />
                      <circle
                        cx="28"
                        cy="28"
                        r={radius}
                        fill="none"
                        stroke="#0284c7"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={circumference.toFixed(1)}
                        strokeDashoffset={offset.toFixed(1)}
                        transform="rotate(-90 28 28)"
                      />
                      <text x="28" y="32" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#0f172a">
                        {percent}%
                      </text>
                    </svg>
                    <div className="records-month-info">
                      <strong>{formatMonth(month.monthKey, lang)}</strong>
                      <span>{month.completed} / {month.total} {t('historyActionsUnit')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="records-scope-note">{t('historyScope')}</p>
        {hasMore && (
          <button type="button" onClick={onLoadMore} className="records-load-more">
            {t('loadMore')}
          </button>
        )}
      </section>

      {/* Bottom: Export training records */}
      <TrainingExport
        lang={lang}
        today={today}
        uid={exportUid}
        publicDraft={publicDraft}
        exercises={exercises}
        sourceVersion={{ logs, progress: effectiveProgress }}
        disabled={exportDisabled}
      />
    </div>
  );
}
