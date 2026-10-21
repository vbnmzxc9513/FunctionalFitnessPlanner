import { sessionSections, estimateSessionMinutes } from '../domain/sessions.js';

export default function WorkoutPlanSummary({ day, exercises, lang = 'zh' }) {
  const en = lang === 'en';
  const labels = en ? { warmup: 'Warm-up', skill: 'Skills', strength: 'Strength', accessory: 'Accessory', recovery: 'Recovery', cooldown: 'Cool-down' } : { warmup: '暖身', skill: '協調與步法', strength: '肌力', accessory: '輔助訓練', recovery: '恢復', cooldown: '收操' };
  const units = en ? { reps: 'reps', seconds: 'sec', minutes: 'min', breaths: 'breaths' } : { reps: '下', seconds: '秒', minutes: '分鐘', breaths: '次呼吸' };
  const text = dose => `${dose.sets} ${en ? 'sets' : '組'} × ${dose.value} ${units[dose.unit]}${dose.perSide ? en ? ' / side' : '／側' : ''}${dose.restSeconds ? ` · ${en ? 'Rest' : '休息'} ${dose.restSeconds} ${units.seconds}` : ''}`;
  return <div className="space-y-4" data-testid="workout-plan-summary"><p className="text-sm text-slate-500">{day.routine.length} {en ? 'exercises' : '個動作'} · {estimateSessionMinutes(day, exercises)} {en ? 'min' : '分鐘'}</p>{!day.routine.length && <p>{en ? 'Rest day' : '休息日'}</p>}{sessionSections(day, exercises).filter(section => section.items.length).map(section => <section key={section.phase} className="space-y-2"><h3 className="font-semibold text-sky-800">{labels[section.phase]}</h3>{section.items.map(({ id, dose }) => <div key={id} className="border-b border-slate-100 py-2"><p className="text-sm font-medium">{exercises[id]?.name || id}</p><p className="text-xs text-slate-500 mt-1">{text(dose)}</p>{dose.preparation && <p className="text-xs text-amber-800 mt-1">{en ? 'Preparation' : '準備組'} · {text(dose.preparation)}</p>}</div>)}</section>)}</div>;
}
