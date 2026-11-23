import { AlertTriangle, Compass, HeartHandshake, Sparkles, Target } from 'lucide-react';
import { parseCoachReportMarkdown } from '../domain/aiPeriodPlanning.js';
import './period-analytics.css';

export default function PeriodCoachReport({ report, conclusion = '', recentSummary = null, lang = 'zh' }) {
  const parsed = report || parseCoachReportMarkdown(conclusion);
  if (!parsed) return null;
  const en = lang === 'en';

  return (
    <section className="coach-report-card" data-testid="period-coach-report" aria-label={en ? 'AI Coach Summary' : 'AI 教練總結報告'}>
      <header className="coach-report-header">
        <h3>
          <Sparkles size={18} className="text-sky-600 shrink-0" />
          {en ? 'Personal Coach Summary' : 'AI 教練個人化總結'}
        </h3>
        {recentSummary?.hasHistory && (
          <div className="coach-report-kpis">
            <span className="coach-report-chip">
              {en
                ? `Last ${recentSummary.lookbackDays}d · ${recentSummary.trainingDays} active days`
                : `近 ${recentSummary.lookbackDays} 天 · 訓練 ${recentSummary.trainingDays} 天`}
            </span>
            {recentSummary.completedCount > 0 && (
              <span className="coach-report-chip">
                {en ? `${recentSummary.completedCount} completed` : `完成 ${recentSummary.completedCount} 項`}
              </span>
            )}
            {recentSummary.loggedSetsCount > 0 && (
              <span className="coach-report-chip">
                {en ? `${recentSummary.loggedSetsCount} logged sets` : `實做 ${recentSummary.loggedSetsCount} 組`}
              </span>
            )}
          </div>
        )}
      </header>

      <div className="coach-report-grid">
        {parsed.reviewAndPraise && (
          <article className="coach-report-section" data-testid="coach-report-review">
            <h4>
              <HeartHandshake size={16} />
              {en ? 'Recent Progress & Encouragement' : '前期表現回顧與鼓勵'}
            </h4>
            <p>{parsed.reviewAndPraise}</p>
          </article>
        )}

        {parsed.reminders?.length > 0 && (
          <article className="coach-report-section coach-report-section-reminder" data-testid="coach-report-reminders">
            <h4>
              <AlertTriangle size={16} />
              {en ? 'Key Reminders' : '本期重點提醒'}
            </h4>
            <ul>
              {parsed.reminders.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </article>
        )}

        {parsed.planOverview && (
          <article className="coach-report-section" data-testid="coach-report-overview">
            <h4>
              <Compass size={16} />
              {en ? 'Period Training Blueprint' : '本段訓練藍圖'}
            </h4>
            <p>{parsed.planOverview}</p>
          </article>
        )}

        {parsed.checkpoints && (
          <article className="coach-report-section" data-testid="coach-report-checkpoints">
            <h4>
              <Target size={16} />
              {en ? 'Checkpoints & Next Steps' : '執行檢核與調整建議'}
            </h4>
            <p>{parsed.checkpoints}</p>
          </article>
        )}
      </div>
    </section>
  );
}
