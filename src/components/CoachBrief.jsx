import { MOBILITY_LABELS } from '../domain/mobility.js';
import { coachPlanningText } from '../coachPlanningLocale.js';
import { coachPlanFacts, planningGuidance } from '../domain/coachBrief.js';
import './coach-guided.css';

export function CoachGuidance({ context, time, range, lang }) {
  const c = key => coachPlanningText(lang, key);
  const { issues } = planningGuidance(context, time, range);
  if (!issues.length) return null;
  return <aside data-testid="coach-guidance" className="coach-guidance" aria-live="polite">{issues.map(issue => <p key={issue}>{c(issue === 'reduce' ? 'reduceNotice' : issue === 'recover' ? 'recoverNotice' : issue)}</p>)}</aside>;
}

export default function CoachBrief({ preview, exercises, lang, t, onAdjust, busy }) {
  const c = key => coachPlanningText(lang, key);
  const facts = coachPlanFacts(preview, exercises);
  return <section className="coach-brief" data-testid="coach-plan-brief">
    <h3>{c('result')}</h3>
    <p>{t(`focus_${preview.profile?.focus || 'balanced'}`)}{preview.profile?.time && ` · ${c('minutesLimit')} ${preview.profile.time} ${t('minutes')}`}</p>
    <dl className="coach-plan-counts">{Object.entries(facts.count).map(([key, count]) => <div key={key}><dt>{c(key === 'recovery' ? 'recoveryCount' : key)}</dt><dd data-testid={`coach-count-${key}`}>{count}</dd></div>)}</dl>
    {facts.maxMinutes > 0 && <p>{c('minuteRange')} · {facts.minMinutes === facts.maxMinutes ? facts.maxMinutes : `${facts.minMinutes}–${facts.maxMinutes}`} {t('minutes')}</p>}
    <p>{c('mobility')} · {facts.mobilityCount} / 8 {c('regions')}</p>
    {facts.missingMobility.length > 0 && <p className="coach-unmet">{c('missingMobility')}：{facts.missingMobility.map(area => MOBILITY_LABELS[lang === 'en' ? 'en' : 'zh'][area]).join('、')}</p>}
    {facts.targeted.length > 0 && <p>{c('targetDone')}：{facts.targeted.map(region => t(`targetRegions_${region}`)).join('、')}</p>}
    {facts.missingTargets.length > 0 && <p className="coach-unmet" data-testid="coach-missing-targets">{c('targetMissing')}：{facts.missingTargets.map(region => t(`targetRegions_${region}`)).join('、')}</p>}
    {facts.selectedCount > 0 && <p>{c('choicesDone')} · {facts.scheduledChoices} / {facts.selectedCount}</p>}
    {onAdjust && <div className="coach-refine"><button type="button" disabled={busy} data-testid="coach-adjust-rhythm" onClick={() => onAdjust(0)}>{c('editRhythm')}</button><button type="button" disabled={busy} data-testid="coach-adjust-body" onClick={() => onAdjust(1)}>{c('editBody')}</button></div>}
  </section>;
}
