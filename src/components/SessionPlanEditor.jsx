import { useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, MoreHorizontal, Trash2 } from 'lucide-react';
import { SESSION_PHASES } from '../domain/phases.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { manualPlannerErrorMessage, removeManualExercise, reorderManualExercise, updateManualPrescription } from '../domain/manualPlanner.js';
import ExerciseDetails from './ExerciseDetails.jsx';
import ExerciseGuide from './ExerciseGuide.jsx';
import ExerciseTags from './ExerciseTags.jsx';
import './manual-planner.css';

const PHASES = {
  zh: { warmup: '暖身', skill: '技能', strength: '肌力', accessory: '輔助', recovery: '恢復', cooldown: '收操' },
  en: { warmup: 'Warm-up', skill: 'Skill', strength: 'Strength', accessory: 'Accessory', recovery: 'Recovery', cooldown: 'Cooldown' },
};
const UNIT = { zh: { reps: '下', seconds: '秒', minutes: '分鐘', breaths: '次呼吸' }, en: { reps: 'reps', seconds: 'sec', minutes: 'min', breaths: 'breaths' } };
const control = 'min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600';
const action = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-sky-700 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600';

export default function SessionPlanEditor({ session, exercises = {}, eligibleExercises = {}, lang = 'zh', t, onChange, timeControls, moreControls, dailyTime = 240 }) {
  const en = lang === 'en';
  const unit = UNIT[en ? 'en' : 'zh'];
  const phaseName = phase => t?.(`phase_${phase}`) || PHASES[en ? 'en' : 'zh'][phase];
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const id = useId();
  const heading = useRef(null), workspace = useRef(null);
  let minutes = 0;
  try { minutes = estimateSessionMinutes(session, exercises); } catch { /* Invalid restored content is retained and flagged below. */ }
  const run = (operation, message) => {
    try { const next = operation(); onChange(next); setError(''); setNotice(message || ''); }
    catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const begin = dose => { setEditId(dose.id); setForm(structuredClone(dose)); setError(''); };
  const close = () => { const value = editId; setEditId(null); setForm(null); setError(''); requestAnimationFrame(() => { const target = workspace.current?.querySelector(`[data-exercise-id="${CSS.escape(value || '')}"] button`) || heading.current; target?.focus({ preventScroll: true }); }); };
  const submitDose = event => {
    event.preventDefault();
    const changes = { ...form, sets: Number(form.sets), value: String(form.value).trim(), restSeconds: Number(form.restSeconds) };
    if (!['strength', 'accessory'].includes(changes.phase)) delete changes.preparation;
    try { onChange(updateManualPrescription(session, editId, changes, { exercises, lang })); close(); setNotice(en ? 'Draft dose updated.' : '已更新草稿組次與階段。'); }
    catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const remove = value => {
    try {
      const next = removeManualExercise(session, value, { exercises, lang }); onChange(next, { session: next, undo: structuredClone(session), kind: 'remove' }); close(); setNotice('');
      requestAnimationFrame(() => heading.current?.focus());
    } catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const groups = [
    { phase: 'warmup', label: en ? 'Warm-up' : '暖身', phases: ['warmup'] },
    { phase: 'strength', label: en ? 'Training' : '訓練', phases: ['skill', 'strength', 'accessory'] },
    { phase: 'cooldown', label: en ? 'Cooldown' : '收操', phases: ['recovery', 'cooldown'] },
  ];
  const editingDose = session.prescriptions.find(dose => dose.id === editId);
  const exercise = exercises[editId];
  const name = exercise?.name || editId;
  const fixed = !!exercise?.sequenceMinutes;
  const skillOnly = ['power', 'footwork', 'reaction'].includes(exercise?.category);
  const samePhase = editingDose ? session.prescriptions.filter(dose => dose.phase === editingDose.phase) : [];
  const position = samePhase.findIndex(dose => dose.id === editId);
  return <section ref={workspace} data-testid="session-plan-editor" aria-label={`${session.date} ${en ? 'draft editor' : '草稿編輯'}`} className="manual-session">
    <header className="combo-first-content-heading"><h2 ref={heading} tabIndex={-1}>{en ? 'Daily workout' : '當天內容'}<small>{session.routine.length ? `${session.routine.length} ${en ? 'exercises' : '動作'}` : ''}</small></h2><div className="manual-session-heading"><details className="manual-more"><summary aria-label={en ? 'More workout actions' : '課表更多選項'}><MoreHorizontal size={20} aria-hidden="true" /></summary><div className="combo-first-day-menu"><label>{en ? 'Workout name' : '課表名稱'}<input aria-label={en ? 'Daily workout name' : '當日課表名稱'} data-testid="manual-session-name" value={session.theme} maxLength={160} onChange={event => onChange({ ...session, theme: event.target.value })} className="manual-session-name" /></label>{timeControls}{moreControls}</div></details></div></header>
    {minutes > dailyTime && <p role="alert" className="quick-conflict">{en ? `${minutes - dailyTime} min over your available time. No exercises were removed.` : `超出可用時間 ${minutes - dailyTime} 分鐘，沒有自動刪減動作。`}</p>}
    {error && !editId && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-sky-800">{notice}</p>}
    {!session.routine.length && <div className="combo-first-empty">{session.explicitRest ? en ? 'Rest day' : '休息日' : en ? 'No exercises yet' : '尚未加入動作'}</div>}
    {groups.map(group => {
      const doses = session.prescriptions.filter(dose => group.phases.includes(dose.phase));
      if (!doses.length) return null;
      const phaseMinutes = doses.length ? estimateSessionMinutes({ ...session, prescriptions: doses, routine: doses.map(dose => dose.id) }, exercises) : 0;
      return <section key={group.phase} data-phase={group.phase} aria-labelledby={`${id}-${group.phase}`} className="manual-phase-card">
        <header><h3 id={`${id}-${group.phase}`} tabIndex={-1}>{group.label}<span className="manual-phase-count"> · {doses.length} {en ? 'exercises' : '個動作'} · {phaseMinutes} {en ? 'min' : '分'}</span></h3></header>
        <ol>{doses.map((dose, index) => {
          const rowExercise = exercises[dose.id], rowName = rowExercise?.name || dose.id;
          return <li key={dose.id} data-exercise-id={dose.id} className="manual-exercise-row"><button type="button" className="manual-exercise-open" aria-label={`${en ? 'Edit' : '編輯'} ${rowName}`} onClick={() => begin(dose)}>
            <span className="manual-row-number">{String(index + 1).padStart(2, '0')}</span><span className="manual-exercise-info"><strong>{rowName}</strong><small>{dose.sets}{en ? ' sets' : '組'} × {dose.value} {unit[dose.unit] || dose.unit}{dose.perSide ? en ? ' / side' : '／側' : ''}</small><ExerciseTags id={dose.id} exercise={rowExercise} lang={lang} compact />{!eligibleExercises[dose.id] && <span className="text-sm text-red-700">{en ? 'Unavailable. Remove or replace before reviewing.' : '目前無法加入；請移除或更換。'}</span>}</span><ChevronRight size={15} aria-hidden="true" />
          </button></li>;

        })}</ol>
      </section>;
    })}
    <ExerciseDetails open={!!editingDose && !!form} title={name || ''} subtitle={en ? 'Edit draft exercise' : '編輯草稿動作'} closeLabel={en ? 'Close' : '關閉'} onClose={close}>
      {editingDose && form && <form onSubmit={submitDose} aria-label={`${en ? 'Edit dose' : '編輯組次'} ${name}`} className="space-y-4">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <ExerciseGuide id={editId} exercise={exercise} lang={lang} />
        {fixed && <p className="text-sm text-indigo-800">{en ? `Complete ${exercise.sequenceMinutes}-minute flow; its dose includes every part and both sides.` : `整套 ${exercise.sequenceMinutes} 分鐘流程包含全部段落及左右側，劑量固定。`}</p>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-700">{en ? 'Sets' : '組數'}<input type="number" min="1" max="5" step="1" required disabled={fixed} value={form.sets} onChange={event => setForm({ ...form, sets: event.target.value })} className={`${control} mt-1 w-full disabled:bg-slate-100`} /></label><label className="text-sm text-slate-700">{en ? 'Amount per set (number or range)' : '每組數值（可填 6–8 範圍）'}<input required inputMode="decimal" disabled={fixed} value={form.value} onChange={event => setForm({ ...form, value: event.target.value })} className={`${control} mt-1 w-full disabled:bg-slate-100`} /></label><label className="text-sm text-slate-700">{en ? 'Unit' : '單位'}<select disabled={fixed} value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })} className={`${control} mt-1 w-full disabled:bg-slate-100`}>{Object.entries(unit).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="text-sm text-slate-700">{en ? 'Rest between sets (seconds)' : '組間休息（秒）'}<input type="number" min="0" max="300" step="1" required disabled={fixed} value={form.restSeconds} onChange={event => setForm({ ...form, restSeconds: event.target.value })} className={`${control} mt-1 w-full disabled:bg-slate-100`} /></label></div>
        <details className="manual-secondary-details"><summary>{en ? `Phase · ${phaseName(form.phase)}` : `安排階段 · ${phaseName(form.phase)}`}</summary><label className="block text-sm text-slate-700">{en ? 'Session phase' : '安排階段'}<select value={form.phase} onChange={event => setForm({ ...form, phase: event.target.value })} className={`${control} mt-1 w-full`}>{SESSION_PHASES.map(value => <option value={value} key={value} disabled={skillOnly && value !== 'skill' || fixed && !['warmup', 'recovery', 'cooldown'].includes(value)}>{phaseName(value)}</option>)}</select></label><label className="flex min-h-11 items-center gap-3 text-sm text-slate-700"><input type="checkbox" disabled={fixed} checked={form.perSide} onChange={event => setForm({ ...form, perSide: event.target.checked })} className="h-5 w-5 accent-sky-600" />{en ? 'Amount is per side' : '數值為每側'}</label></details>
        {editingDose.preparation && !['strength', 'accessory'].includes(form.phase) && <p className="text-xs text-amber-800">{en ? 'This phase does not include a separate preparation set. The preparation set will be removed when saved.' : '這個階段不另列主項準備組；儲存時會移除原本準備組。'}</p>}
        <div className="flex flex-wrap gap-2"><button type="submit" className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">{en ? 'Save draft changes' : '儲存草稿修改'}</button><button type="button" onClick={close} className={action}>{en ? 'Cancel changes' : '取消修改'}</button></div>
        <div className="manual-dialog-tools"><p className="text-xs text-slate-500 mb-2">{en ? 'Move within the same phase or remove from this draft.' : '在相同階段內調整順序，或從這天草稿移除。'}</p><div className="flex flex-wrap gap-2"><button type="button" className={action} aria-label={`${en ? 'Move up' : '往前'} ${name}`} disabled={position === 0} onClick={() => run(() => reorderManualExercise(session, editId, -1, exercises, lang), en ? 'Draft order updated.' : '已調整草稿順序。')}><ArrowUp size={16} aria-hidden="true" />{en ? 'Up' : '往前'}</button><button type="button" className={action} aria-label={`${en ? 'Move down' : '往後'} ${name}`} disabled={position === samePhase.length - 1} onClick={() => run(() => reorderManualExercise(session, editId, 1, exercises, lang), en ? 'Draft order updated.' : '已調整草稿順序。')}><ArrowDown size={16} aria-hidden="true" />{en ? 'Down' : '往後'}</button><button type="button" className={`${action} text-red-700`} aria-label={`${en ? 'Remove' : '移除'} ${name}`} onClick={() => remove(editId)}><Trash2 size={16} aria-hidden="true" />{en ? 'Remove' : '移除'}</button></div></div>
      </form>}
    </ExerciseDetails>
  </section>;
}
