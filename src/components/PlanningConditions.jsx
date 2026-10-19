import { recoveryDecision } from '../domain/recovery.js';

export default function PlanningConditions({ context = {}, time, lang = 'zh', t, equipment = true }) {
  const en = lang === 'en';
  const days = en ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['一', '二', '三', '四', '五', '六', '日'];
  const known = Array.isArray(context.equipment);
  const recovery = recoveryDecision(context);
  const recoveryLabel = known ? t(`recovery_${recovery.action !== 'normal' ? recovery.action : context.recoveryState === 'normal' ? 'normal' : 'unknown'}`) : en ? 'Not preserved' : '未保留';
  return <span data-testid="planning-conditions" className="block text-sm text-slate-600 space-y-1">
    <span className="block">{time && `${time} ${t('minutes')} · `}{en ? 'Court days: ' : '球日：'}{context.badmintonDays?.length ? context.badmintonDays.map(day => days[day - 1]).join('、') : en ? 'None recorded' : '未提供'}{context.badmintonMinutes ? ` · ${context.badmintonMinutes} ${t('minutes')}` : ''}{context.badmintonIntensity ? ` · ${t(`intensity_${context.badmintonIntensity}`)}` : ''}</span>
    <span className="block">{t('recoveryStateLabel')}：{recoveryLabel}{context.sorenessRegions?.length ? ` · ${context.sorenessRegions.map(region => t(`sorenessRegions_${region}`)).join('、')}` : ''}</span>
    {context.targetRegions?.length > 0 && <span className="block">{t('weeklyTargetRegions')}：{context.targetRegions.map(region => t(`targetRegions_${region}`)).join('、')}</span>}
    {context.healthStatus && context.healthStatus !== 'unrestricted' && <span className="block">{t('shoulderStatusLabel')}：{t(`health_${context.healthStatus}`)}</span>}
    {context.competitionDate && <span className="block">{t('competitionDateLabel')}：{context.competitionDate}</span>}
    {equipment && <span className="block">{t('equipmentLabel')}：{known ? context.equipment.length ? context.equipment.map(item => t(`equipment_${item}`)).join('、') : t('equipment_bodyweight') : en ? 'Not preserved' : '未保留'}</span>}
  </span>;
}
