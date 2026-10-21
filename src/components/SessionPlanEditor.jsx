import { useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Plus, Share2, Trash2 } from 'lucide-react';
import { SESSION_PHASES } from '../domain/phases.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { addManualExercises, manualPlannerErrorMessage, removeManualExercise, reorderManualExercise, updateManualPrescription } from '../domain/manualPlanner.js';
import ExerciseDetails from './ExerciseDetails.jsx';
import './manual-planner.css';

const PHASES = {
  zh: { warmup: '暖身', skill: '技能', strength: '肌力', accessory: '輔助', recovery: '恢復', cooldown: '收操' },
  en: { warmup: 'Warm-up', skill: 'Skill', strength: 'Strength', accessory: 'Accessory', recovery: 'Recovery', cooldown: 'Cooldown' },
};
const UNIT = { zh: { reps: '下', seconds: '秒', minutes: '分鐘', breaths: '次呼吸' }, en: { reps: 'reps', seconds: 'sec', minutes: 'min', breaths: 'breaths' } };
const control = 'min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600';
const action = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-sky-700 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600';

export default function SessionPlanEditor({ session, exercises = {}, eligibleExercises = {}, lang = 'zh', t, onChange, onAddExercises, onSaveWorkout, onShare }) {
  const en = lang === 'en';
  const unit = UNIT[en ? 'en' : 'zh'];
  const phaseName = phase => t?.(`phase_${phase}`) || PHASES[en ? 'en' : 'zh'][phase];
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState(null);
  const id = useId();
  const heading = useRef(null);
  let minutes = 0;
  try { minutes = estimateSessionMinutes(session, exercises); } catch { /* Invalid restored content is retained and flagged below. */ }
  const run = (operation, message) => {
    try { const next = operation(); onChange(next); setError(''); setNotice(message || ''); setUndo(null); }
    catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const begin = dose => { setEditId(dose.id); setForm(structuredClone(dose)); setError(''); setUndo(null); };
  const close = () => { setEditId(null); setForm(null); setError(''); };
  const submitDose = event => {
    event.preventDefault();
    const changes = { ...form, sets: Number(form.sets), value: String(form.value).trim(), restSeconds: Number(form.restSeconds) };
    if (!['strength', 'accessory'].includes(changes.phase)) delete changes.preparation;
    try { onChange(updateManualPrescription(session, editId, changes, { exercises, lang })); close(); setNotice(en ? 'Draft dose updated.' : '已更新草稿組次與階段。'); }
    catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const remove = value => {
    try {
      const before = structuredClone(session); onChange(removeManualExercise(session, value, { exercises, lang })); setUndo(before); close(); setNotice(en ? 'Removed from this draft.' : '已從這份草稿移除。');
      requestAnimationFrame(() => heading.current?.focus());
    } catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const callback = async handler => {
    try { await handler?.(structuredClone(session)); setError(''); }
    catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
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
  const preparation = session.prescriptions.filter(dose => dose.preparation);
  return <section data-testid="session-plan-editor" aria-label={`${session.date} ${en ? 'draft editor' : '草稿編輯'}`} className="manual-session">
    <div className="manual-session-heading"><label htmlFor={`${id}-name`} className="min-w-0 flex-1"><span className="sr-only">{en ? 'Session name' : '這天的名稱'}</span><input id={`${id}-name`} ref={heading} data-testid="manual-session-name" value={session.theme} maxLength={160} onChange={event => { setUndo(null); onChange({ ...session, theme: event.target.value }); }} className="manual-session-name" /></label><p className="manual-time">{en ? `${minutes} min` : `${minutes} 分鐘`}</p></div>
    <div className="manual-reuse-actions">{onSaveWorkout && <button type="button" onClick={() => callback(onSaveWorkout)}><BookOpen size={18} aria-hidden="true" />{en ? 'Save workout' : '儲存為課表'}</button>}{onShare && <button type="button" onClick={() => callback(onShare)}><Share2 size={18} aria-hidden="true" />{en ? 'Share this day' : '分享這天'}</button>}</div>
    {error && !editId && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-sky-800"><p>{notice}</p>{undo && <button type="button" className={action} onClick={() => { onChange(undo); setUndo(null); setNotice(en ? 'Restored.' : '已復原。'); }}>{en ? 'Undo removal' : '復原移除'}</button>}</div>}
    {groups.map(group => {
      const doses = session.prescriptions.filter(dose => group.phases.includes(dose.phase));
      return <section key={group.phase} data-phase={group.phase} aria-labelledby={`${id}-${group.phase}`} className="manual-phase-card">
        <header><h3 id={`${id}-${group.phase}`}>{group.label}</h3><button type="button" data-testid={`manual-add-${group.phase}`} onClick={() => onAddExercises(group.phase)} className="manual-text-action"><Plus size={17} aria-hidden="true" />{en ? 'Add exercises' : '加入動作'}</button></header>
        {!doses.length && <p className="manual-phase-empty">{en ? 'No exercises yet.' : '尚未加入動作。'}{group.phase === 'warmup' && eligibleExercises.bf_A13 && !session.routine.includes('bf_A13') && <button type="button" disabled={session.routine.length >= 8} onClick={() => run(() => addManualExercises(session, ['bf_A13'], { exercises, eligibleExercises, phase: 'warmup', lang }), en ? 'Added the complete 10-minute flow to this draft.' : '已將完整 10 分鐘八段拉伸加入草稿。')} className="manual-text-action">{en ? 'Add my daily eight-part stretch' : '加入我的每日八段拉伸'}</button>}</p>}
        <ol>{doses.map((dose, index) => {
          const rowExercise = exercises[dose.id], rowName = rowExercise?.name || dose.id;
          return <li key={dose.id} data-exercise-id={dose.id} className="manual-exercise-row">
            <span className="manual-row-number">{index + 1}</span><div className="min-w-0 flex-1"><h4>{rowName}</h4><p>{dose.sets}{en ? ' sets' : '組'} × {dose.value} {unit[dose.unit] || dose.unit}{dose.perSide ? en ? ' / side' : '／側' : ''}</p>{!eligibleExercises[dose.id] && <p className="mt-2 text-sm text-red-700">{en ? 'No longer eligible. Remove or replace before reviewing.' : '目前已不符合可加入條件；請移除或更換後再檢查。'}</p>}</div><button type="button" aria-label={`${en ? 'Edit' : '編輯'} ${rowName}`} onClick={() => begin(dose)} className="manual-edit-action">{en ? 'Edit' : '編輯'}</button>
          </li>;
        })}</ol>
      </section>;
    })}
    <details className="manual-secondary-details"><summary>{en ? 'More training phases and timing' : '更多訓練階段與時間說明'}</summary><p>{en ? 'The three cards keep warm-up, skill, strength, accessory, recovery and cooldown phases in their original order. Edit an exercise to change its phase. Preparation, both sides and rests count toward the estimate.' : '三區保留暖身、技能、肌力、輔助、恢復與收操的原始階段與順序。點動作編輯可調整階段；預估時間包含準備組、左右側與休息。'}</p>{preparation.length > 0 && <div className="manual-preparation"><h4>{en ? 'Main-exercise preparation sets' : '主項輕量準備組'}</h4>{preparation.map(dose => <p key={dose.id}>{exercises[dose.id]?.name || dose.id}：{dose.preparation.sets} × {dose.preparation.value} {unit[dose.preparation.unit]}{dose.preparation.perSide ? en ? ' / side' : '／側' : ''} · {en ? 'rest ' : '休息 '}{dose.preparation.restSeconds} {en ? 'sec' : '秒'}。{dose.preparation.instruction}</p>)}</div>}<div className="flex flex-wrap gap-2 mt-3">{['skill', 'accessory', 'recovery'].map(phase => <button type="button" key={phase} data-testid={`manual-add-${phase}`} onClick={() => onAddExercises(phase)} className={action}><Plus size={16} aria-hidden="true" />{phaseName(phase)}</button>)}</div></details>
    <ExerciseDetails open={!!editingDose && !!form} title={name || ''} subtitle={en ? 'Edit draft exercise' : '編輯草稿動作'} closeLabel={en ? 'Close' : '關閉'} onClose={close}>
      {editingDose && form && <form onSubmit={submitDose} aria-label={`${en ? 'Edit dose' : '編輯組次'} ${name}`} className="space-y-4">
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
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
