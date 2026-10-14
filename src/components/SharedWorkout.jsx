import { catalogExercises } from '../domain/exerciseCatalog.js';
import { createSharePayload, shareDay } from '../domain/sharing.js';
import { sessionSections, estimateSessionMinutes } from '../domain/sessions.js';

const TEXT = {
  zh: {
    title: '分享的羽球體能課表', intro: '這是動作與組數的參考課表，不含原作者的個人狀況。請依自身能力、器材與專業建議調整。',
    invalid: '這個課表連結無法讀取，可能已損壞或格式不支援。', create: '建立我的課表', minutes: '分鐘',
    phases: { warmup: '暖身與準備組', skill: '協調與步伐', strength: '主要肌力', accessory: '輔助訓練', recovery: '恢復', cooldown: '收操' },
    sets: '組', units: { reps: '次', seconds: '秒', minutes: '分鐘', breaths: '次呼吸' }, perSide: '每側', rest: '休息',
    prep: '準備組', prepHint: '準備組不算另一個完成動作。', empty: '這份課表安排休息，無需額外暖身或收操。',
    noFinish: '這份分享沒有另外列出收操動作。',
  },
  en: {
    title: 'Shared badminton workout', intro: 'This is a reference workout with exercises and doses only. Adapt it to your ability, equipment and professional advice.',
    invalid: 'This workout link is damaged or uses an unsupported format.', create: 'Create my workout', minutes: 'minutes',
    phases: { warmup: 'Warm-up and preparation', skill: 'Coordination and footwork', strength: 'Main strength', accessory: 'Accessory work', recovery: 'Recovery', cooldown: 'Cool-down' },
    sets: 'sets', units: { reps: 'reps', seconds: 'seconds', minutes: 'minutes', breaths: 'breaths' }, perSide: 'each side', rest: 'Rest',
    prep: 'Preparation sets', prepHint: 'Preparation is not a separate completion item.', empty: 'This is a rest day. No extra warm-up or cool-down is planned.',
    noFinish: 'No separate cool-down exercises are listed in this shared workout.',
  },
};

export default function SharedWorkout({ payload, exercises: _exercises, lang = 'zh', onExit }) {
  const t = TEXT[lang] || TEXT.zh;
  const exercises = catalogExercises(lang);
  let day;
  try { if (!payload?.error && payload?.day) day = shareDay(createSharePayload(payload.day), lang); }
  catch { /* Render an invalid link instead of putting untrusted data in the app. */ }
  const sections = day ? sessionSections(day, exercises) : [];
  const doseText = dose => `${dose.sets} ${t.sets} × ${dose.value} ${t.units[dose.unit]}${dose.perSide ? ` · ${t.perSide}` : ''}${dose.restSeconds ? ` · ${t.rest} ${dose.restSeconds} ${t.units.seconds}` : ''}`;
  let number = 0;
  return <main className="max-w-2xl mx-auto px-4 py-8 space-y-5" aria-label={t.title}>
    <header className="bg-white rounded-2xl border border-sky-100 p-5 space-y-3">
      <p className="text-sky-600 font-semibold text-sm">Fitness Planner</p>
      <h1 className="font-bold text-xl text-slate-800">{t.title}</h1>
      <p className="text-sm text-slate-600">{day ? t.intro : t.invalid}</p>
      {day && day.routine.length > 0 && <p className="text-sm font-semibold text-sky-800">~ {estimateSessionMinutes(day, exercises)} {t.minutes}</p>}
      <button onClick={onExit} className="rounded-xl bg-sky-600 text-white px-5 py-3 font-semibold">{t.create}</button>
    </header>
    {day && !day.routine.length && <p className="bg-white rounded-xl p-5 text-slate-600">{t.empty}</p>}
    {sections.filter(section => section.items.length || section.preparation.length).map(section => <section key={section.phase} data-phase={section.phase} className="space-y-3" aria-label={t.phases[section.phase]}>
      <h2 className="font-bold text-sky-800">{t.phases[section.phase]}</h2>
      {section.items.map(({ id, dose }) => <article key={id} className="bg-white rounded-xl border border-sky-100 p-4 space-y-2">
        <h3 className="font-semibold text-slate-800">{++number}. {exercises[id].name}</h3>
        <p className="text-sm text-slate-600">{doseText(dose)}</p>
        <p className="text-xs text-slate-500">{exercises[id].tip}</p>
      </article>)}
      {section.preparation.map(({ id, dose }) => <article key={`prep_${id}`} className="rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-2">
        <h3 className="font-semibold text-amber-800">{t.prep} · {exercises[id].name}</h3>
        <p className="text-sm text-slate-600">{doseText(dose)}</p>
        <p className="text-xs text-slate-600">{dose.instruction} {t.prepHint}</p>
      </article>)}
    </section>)}
    {day?.routine.length > 0 && !sections.find(section => section.phase === 'cooldown')?.items.length && <p className="text-sm text-slate-500">{t.noFinish}</p>}
  </main>;
}
