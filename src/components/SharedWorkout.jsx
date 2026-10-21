import { useEffect, useState } from 'react';
import { ChevronRight, Zap } from 'lucide-react';
import './workout-sharing.css';
import { catalogExercises } from '../domain/exerciseCatalog.js';
import { createSharePayload, shareDay } from '../domain/sharing.js';
import { rebuildPlanDays, validatePlanPayload } from '../domain/sharedPlans.js';
import { sessionSections, estimateSessionMinutes } from '../domain/sessions.js';
import { localDate } from '../domain/dates.js';
import { DEFAULT_PLANNING_CONTEXT, normalizePlanningContext } from '../domain/planning.js';
import { manualPlanningExercises } from '../domain/templatePlanner.js';
import { loadSharedPlan } from '../services/sharedPlanRepository.js';
import { TRANSLATIONS } from '../locale.js';
import ApplyWorkoutPlan from './ApplyWorkoutPlan.jsx';
import ManualPlanner from './ManualPlanner.jsx';
import WorkoutPlanSummary from './WorkoutPlanSummary.jsx';

const TEXT = {
  zh: {
    title: '分享的羽球體能課表', intro: '這是動作與組數的參考課表，不含原作者的個人狀況。請依自身能力、器材與專業建議調整。',
    invalid: '這個課表連結無法讀取，可能已損壞或格式不支援。', create: '建立我的課表', minutes: '分鐘',
    phases: { warmup: '暖身與準備組', skill: '協調與步伐', strength: '主要肌力', accessory: '輔助訓練', recovery: '恢復', cooldown: '收操' },
    sets: '組', units: { reps: '次', seconds: '秒', minutes: '分鐘', breaths: '次呼吸' }, perSide: '每側', rest: '休息',
    prep: '準備組', prepHint: '準備組不算另一個完成動作。', empty: '這份課表安排休息，無需額外暖身或收操。',
    noFinish: '這份分享沒有另外列出收操動作。',
    import: '匯入我的課表', back: '返回我的課表', loading: '正在讀取分享課表…', retry: '重試讀取',
    loadFailed: '暫時無法讀取分享課表，請檢查連線後重試。', notFound: '找不到這份分享課表，請確認連結是否完整。',
    tooLong: '這個免登入連結超出長度限制，請向分享者索取短連結。',
    signingIn: '正在確認登入狀態，稍後即可匯入。', device: '未登入時可匯入這台裝置；選日期、檢查並確認後才會儲存。',
    account: '選日期、檢查並確認後，才會匯入目前登入帳號。', signIn: '登入帳號後匯入',
    done: '課表已匯入', doneHint: '已儲存到你確認的日期；分享來源與既有訓練紀錄保持完整。', view: '查看我的課表',
    day: '第', daySuffix: '天', offset: '距第 1 天',
  },
  en: {
    title: 'Shared badminton workout', intro: 'This is a reference workout with exercises and doses only. Adapt it to your ability, equipment and professional advice.',
    invalid: 'This workout link is damaged or uses an unsupported format.', create: 'Create my workout', minutes: 'minutes',
    phases: { warmup: 'Warm-up and preparation', skill: 'Coordination and footwork', strength: 'Main strength', accessory: 'Accessory work', recovery: 'Recovery', cooldown: 'Cool-down' },
    sets: 'sets', units: { reps: 'reps', seconds: 'seconds', minutes: 'minutes', breaths: 'breaths' }, perSide: 'each side', rest: 'Rest',
    prep: 'Preparation sets', prepHint: 'Preparation is not a separate completion item.', empty: 'This is a rest day. No extra warm-up or cool-down is planned.',
    noFinish: 'No separate cool-down exercises are listed in this shared workout.',
    import: 'Import into my plans', back: 'Back to my plans', loading: 'Loading shared plan…', retry: 'Retry loading',
    loadFailed: 'The shared plan could not be loaded. Check your connection and retry.', notFound: 'This shared plan could not be found. Check that the link is complete.',
    tooLong: 'This embedded link exceeds the length limit. Ask its author for a short link.',
    signingIn: 'Checking your sign-in status. Import will be available shortly.', device: 'While signed out, you can import on this device. Choose dates, review and confirm before anything is saved.',
    account: 'Choose dates, review and confirm before importing into your signed-in account.', signIn: 'Sign in before importing',
    done: 'Plan imported', doneHint: 'Saved to your confirmed dates. The shared source and existing training records are unchanged.', view: 'View my plans',
    day: 'Day', daySuffix: '', offset: 'Days after day 1:',
  },
};

export default function SharedWorkout(props) {
  // An account or link change cannot leave a previous local/account preview
  // available to confirm under the new identity.
  return <SharedWorkoutContent key={JSON.stringify([props.payload, props.lang, props.uid, props.authLoading])} {...props} />;
}

function SharedWorkoutContent({ payload, lang = 'zh', onExit, uid, today = localDate(), localPeriod, onLocalPeriod, authLoading = false, onSignIn }) {
  const t = TEXT[lang] || TEXT.zh;
  const exercises = catalogExercises(lang);
  const [remote, setRemote] = useState(null), [loadError, setLoadError] = useState(null), [attempt, setAttempt] = useState(0);
  const [applying, setApplying] = useState(false), [applied, setApplied] = useState(false);
  const [editing, setEditing] = useState(null), [editedDays, setEditedDays] = useState(null);
  const [editProfile, setEditProfile] = useState(() => ({ context: normalizePlanningContext(DEFAULT_PLANNING_CONTEXT), focus: 'balanced', time: 240 }));
  const id = payload?.id;
  useEffect(() => {
    if (!id) return;
    let current = true;
    loadSharedPlan(id).then(value => { if (current) setRemote(value); }).catch(error => { if (current) setLoadError(error.message); });
    return () => { current = false; };
  }, [id, attempt]);
  let days = [], name = t.title, invalid = !!payload?.error;
  const legacy = !!payload?.day && !id && !payload?.payload;
  try {
    if (!invalid && legacy) days = [{ ...shareDay(createSharePayload(payload.day), lang), offset: 0, theme: t.title }];
    else if (!invalid && (remote || payload?.payload)) {
      const clean = validatePlanPayload(remote || payload.payload);
      days = rebuildPlanDays(clean, lang); name = clean.name;
    }
  }
  catch { /* Render an invalid link instead of putting untrusted data in the app. */ }
  if (editedDays) days = editedDays;
  const loading = !!id && !remote && !loadError && !invalid;
  const day = legacy ? days[0] : null;
  const sections = day ? sessionSections(day, exercises) : [];
  const doseText = dose => `${dose.sets} ${t.sets} × ${dose.value} ${t.units[dose.unit]}${dose.perSide ? ` · ${t.perSide}` : ''}${dose.restSeconds ? ` · ${t.rest} ${dose.restSeconds} ${t.units.seconds}` : ''}`;
  let number = 0;
  if (editing) return <main className="max-w-3xl mx-auto px-4 py-8" aria-label={t.title}><ManualPlanner uid={uid} {...{ today, lang, exercises }} t={key => (TRANSLATIONS[lang] || TRANSLATIONS.zh)[key] || key} profile={editProfile} eligibleExercises={manualPlanningExercises(exercises, editProfile.context)} initialSessions={editing}
    onProfileChange={setEditProfile}
    onContextChange={context => setEditProfile(value => ({ ...value, context: normalizePlanningContext(context) }))}
    onPreview={sessions => { setEditedDays(sessions); setEditing(null); setApplying(true); }} onCancel={() => { setEditing(null); setApplying(true); }} /></main>;
  if (applying && days.length && !authLoading) return <main className="max-w-3xl mx-auto px-4 py-8" aria-label={t.title}><ApplyWorkoutPlan {...{ days, name, uid, today, exercises, lang, localPeriod, onLocalPeriod }} initialDates={editedDays?.map(day => day.date)} onEdit={sessions => { setApplying(false); setEditing(sessions); }} onApplied={() => { setApplying(false); setApplied(true); }} onCancel={() => setApplying(false)} /></main>;
  if (applied) return <main className="max-w-2xl mx-auto px-4 py-8 space-y-5" aria-label={t.title}><section className="panel space-y-4"><h1 className="screen-title">{t.done}</h1><p role="status">{t.doneHint}</p><button type="button" className="button-primary min-h-11" onClick={onExit}>{t.view}</button></section></main>;
  const en = lang === 'en';
  const duration = days.map(value => estimateSessionMinutes(value, exercises));
  const durationLabel = duration.length ? Math.min(...duration) === Math.max(...duration) ? String(duration[0]) : `${Math.min(...duration)}–${Math.max(...duration)}` : '—';
  // Catalog equipment alternatives are displayed as alternatives, not requirements from the author's profile.
  const equipment = [...new Set(days.flatMap(value => value.routine.flatMap(id => (exercises[id]?.equipmentOptions?.[0] || []))))];
  const labels = TRANSLATIONS[lang] || TRANSLATIONS.zh;
  const stages = value => [...new Set(value.prescriptions.map(dose => ['skill', 'strength', 'accessory'].includes(dose.phase) ? en ? 'Training' : '訓練' : { warmup: en ? 'Warm-up' : '暖身', recovery: en ? 'Recovery' : '恢復', cooldown: en ? 'Cool-down' : '收操' }[dose.phase]))].join(' → ');
  const legacyContents = <>{day && !day.routine.length && <p>{t.empty}</p>}{sections.filter(section => section.items.length || section.preparation.length).map(section => <section key={section.phase} data-phase={section.phase} className="shared-plan-phase" aria-label={t.phases[section.phase]}><h3>{t.phases[section.phase]}</h3>{section.items.map(({ id, dose }) => <article key={id}><h4>{++number}. {exercises[id].name}</h4><p>{doseText(dose)}</p><p className="workout-ui-muted">{exercises[id].tip}</p></article>)}{section.preparation.map(({ id, dose }) => <article key={`prep_${id}`}><h4>{t.prep} · {exercises[id].name}</h4><p>{doseText(dose)}</p><p className="workout-ui-muted">{dose.instruction} {t.prepHint}</p></article>)}</section>)}{day?.routine.length > 0 && !sections.find(section => section.phase === 'cooldown')?.items.length && <p className="workout-ui-muted">{t.noFinish}</p>}</>;
  return <div className="shared-plan-page workout-ui">
    <header className="shared-plan-brand"><span><Zap size={22} /></span><strong>{en ? 'Badminton Functional Fitness' : '羽球功能性健身'}</strong></header>
    <main className="shared-plan-ui" aria-label={t.title}>
      {days.length ? <>
        <header className="workout-ui-card shared-plan-hero"><p className="shared-plan-eyebrow">{en ? 'A workout shared with you' : '朋友分享的課表'}</p><h1>{name}</h1><p className="workout-ui-muted">{days.length} {en ? 'planned days' : '天安排'} · {en ? 'Exercises and planned doses' : '動作與計畫組次'}</p><div className="shared-plan-stats"><div><strong>{days.length}</strong><span>{en ? 'days' : '天課表'}</span></div><div><strong>{durationLabel}</strong><span>{en ? 'min / day' : '分鐘／天'}</span></div><div><strong>{equipment.length}</strong><span>{en ? 'equipment types' : '種器材'}</span></div></div></header>
        <section aria-labelledby="shared-plan-contents"><h2 id="shared-plan-contents">{en ? 'Preview the contents' : '先看看內容'}</h2><div className="workout-ui-card shared-plan-days">{days.map((value, index) => <details key={index} aria-label={`${t.day} ${index + 1} ${t.daySuffix}`} data-testid={`shared-plan-day-${index}`}><summary data-testid="shared-plan-day-toggle"><span className="workout-ui-number">{index + 1}</span><div><h3>{en ? `Day ${index + 1}` : `第 ${index + 1} 天`}{days.length === 1 ? ` · ${name}` : ''}</h3><p>{value.sessionType === 'training' ? en ? 'Training' : '訓練' : value.routine.length ? en ? 'Recovery' : '恢復' : en ? 'Rest' : '休息'} · {duration[index]} {t.minutes}{stages(value) ? ` · ${stages(value)}` : ''}</p></div><ChevronRight size={21} /></summary><div className="shared-plan-day-content"><p className="workout-ui-muted">{t.offset} {value.offset} {en ? 'days' : '天'}</p>{legacy ? legacyContents : <WorkoutPlanSummary day={value} exercises={exercises} lang={lang} />}</div></details>)}</div></section>
        <section className="workout-ui-card"><h2>{en ? 'What to prepare' : '需要準備'}</h2><div className="workout-ui-tags">{equipment.length ? equipment.map(key => <span key={key}>{labels[`equipment_${key}`] || key}</span>) : <span>{en ? 'Bodyweight' : '徒手'}</span>}</div><p className="workout-ui-muted">{en ? 'Listed using the catalog equipment option. Check alternatives and adapt the copy before importing.' : '依內建動作的基本器材列出。匯入前可編輯副本，確認替代器材或更換不適合的動作。'}</p></section>
        <section className="workout-ui-info"><h2>{en ? 'You choose the dates' : '日期由你決定'}</h2><p>{en ? 'This is a copy; it will not be added to your calendar automatically. Choose each date next. Your edits do not change the shared source.' : '這是課表副本，不會自動加入行事曆。下一步可逐天選日期；修改不影響分享者。'}</p></section>
        <p className="workout-ui-muted">{t.intro}</p><p role={authLoading ? 'status' : undefined} className="workout-ui-muted">{authLoading ? t.signingIn : uid ? t.account : t.device}</p>
        {!uid && onSignIn && <button type="button" disabled={authLoading} onClick={onSignIn} className="workout-ui-link">{t.signIn}</button>}
        <footer className="shared-plan-import"><button type="button" data-testid="shared-plan-import" disabled={authLoading} onClick={() => setApplying(true)} className="workout-ui-primary">{en ? 'Choose dates and import my copy' : '選日期，匯入我的課表'}</button></footer>
      </> : <section className="workout-ui-card"><h1>{name}</h1>{loading ? <p role="status">{t.loading}</p> : <p role="alert">{payload?.error === 'PLAN_SHARE_TOO_LONG' ? t.tooLong : loadError === 'SHARED_PLAN_NOT_FOUND' ? t.notFound : loadError ? t.loadFailed : t.invalid}</p>}{!!id && !!loadError && <button type="button" className="workout-ui-secondary" onClick={() => { setRemote(null); setLoadError(null); setAttempt(value => value + 1); }}>{t.retry}</button>}</section>}
      <button type="button" onClick={onExit} className="workout-ui-link">{t.back}</button>
    </main>
  </div>;
}
