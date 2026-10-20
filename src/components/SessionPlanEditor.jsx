import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { SESSION_PHASES } from '../domain/phases.js';
import { estimateSessionMinutes } from '../domain/sessions.js';
import { manualPlannerErrorMessage, removeManualExercise, reorderManualExercise, updateManualPrescription } from '../domain/manualPlanner.js';

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
  let minutes = 0;
  try { minutes = estimateSessionMinutes(session, exercises); } catch { /* Invalid restored content is retained and flagged below. */ }
  const run = (operation, message) => {
    try { const next = operation(); onChange(next); setError(''); setNotice(message || ''); setUndo(null); }
    catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const begin = dose => { setEditId(dose.id); setForm(structuredClone(dose)); setError(''); setUndo(null); };
  const submitDose = event => {
    event.preventDefault();
    const changes = { ...form, sets: Number(form.sets), value: String(form.value).trim(), restSeconds: Number(form.restSeconds) };
    if (!['strength', 'accessory'].includes(changes.phase)) delete changes.preparation;
    try { onChange(updateManualPrescription(session, editId, changes, { exercises, lang })); setEditId(null); setForm(null); setError(''); setNotice(en ? 'Draft dose updated.' : '已更新草稿組次與階段。'); }
    catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const remove = value => {
    try { const before = structuredClone(session); onChange(removeManualExercise(session, value, { exercises, lang })); setUndo(before); setError(''); setNotice(en ? 'Removed from this draft.' : '已從這份草稿移除。'); }
    catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  const callback = async handler => {
    try { await handler?.(structuredClone(session)); setError(''); }
    catch (problem) { setError(manualPlannerErrorMessage(problem, lang, exercises)); }
  };
  return <section data-testid="session-plan-editor" aria-label={`${session.date} ${en ? 'draft editor' : '草稿編輯'}`} className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><label className="flex-1 text-sm font-semibold text-slate-700" htmlFor={`${id}-name`}>{en ? 'Session name' : '這天的名稱'}<input id={`${id}-name`} data-testid="manual-session-name" value={session.theme} maxLength={160} onChange={event => { setUndo(null); onChange({ ...session, theme: event.target.value }); }} className={`${control} mt-2 w-full`} /></label><p className="pb-3 text-sm text-sky-800">{en ? `About ${minutes} min · ${session.routine.length} / 8 exercises` : `預估 ${minutes} 分鐘・${session.routine.length} / 8 個動作`}</p></div>
    <p className="text-xs leading-relaxed text-slate-500">{en ? 'Only this draft changes. The first strength exercise includes a light preparation set; all preparation, both sides and rests count toward time.' : '目前只改草稿。第一個肌力動作會明列輕量準備組；預估時間包含準備組、左右側與休息。'}</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-sky-800"><p>{notice}</p>{undo && <button type="button" className={action} onClick={() => { onChange(undo); setUndo(null); setNotice(en ? 'Restored.' : '已復原。'); }}>{en ? 'Undo removal' : '復原移除'}</button>}</div>}
    {SESSION_PHASES.map(phase => {
      const doses = session.prescriptions.filter(dose => dose.phase === phase);
      return <section key={phase} data-phase={phase} aria-labelledby={`${id}-${phase}`} className="rounded-2xl border border-sky-100 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 id={`${id}-${phase}`} className="font-bold text-slate-800">{phaseName(phase)}</h3><button type="button" data-testid={`manual-add-${phase}`} onClick={() => onAddExercises(phase)} className={action}><Plus size={17} aria-hidden="true" />{en ? 'Add exercises' : '加入動作'}</button></div>
        {!doses.length && <p className="mt-3 text-sm text-slate-500">{en ? 'No exercises in this phase yet.' : '這個階段尚未加入動作。'}</p>}
        <ol className="divide-y divide-slate-100">{doses.map((dose, index) => {
          const exercise = exercises[dose.id], name = exercise?.name || dose.id;
          const editing = editId === dose.id;
          const fixed = !!exercise?.sequenceMinutes;
          const skillOnly = ['power', 'footwork', 'reaction'].includes(exercise?.category);
          return <li key={dose.id} data-exercise-id={dose.id} className="py-4 first:pt-3 last:pb-0">
            <div className="flex items-start gap-3"><span className="mt-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-500">{index + 1}</span><div className="min-w-0 flex-1"><h4 className="break-words font-semibold text-slate-800">{name}</h4><p className="mt-1 text-sm text-slate-600">{dose.sets} × {dose.value} {unit[dose.unit] || dose.unit}{dose.perSide ? en ? ' / side' : '／側' : ''} · {en ? 'rest ' : '休息 '}{dose.restSeconds} {en ? 'sec' : '秒'}</p>{!eligibleExercises[dose.id] && <p className="mt-2 text-sm text-red-700">{en ? 'No longer eligible. Remove or replace before reviewing.' : '目前已不符合可加入條件；請移除或更換後再檢查。'}</p>}</div><button type="button" aria-label={`${en ? 'Edit' : '編輯'} ${name}`} onClick={() => begin(dose)} className={action}><Pencil size={16} aria-hidden="true" /><span>{en ? 'Edit' : '編輯'}</span></button></div>
            {dose.preparation && <p className="mt-3 rounded-xl bg-sky-50 p-3 text-xs leading-relaxed text-sky-900">{en ? 'Preparation' : '輕量準備組'}：{dose.preparation.sets} × {dose.preparation.value} {unit[dose.preparation.unit]}{dose.preparation.perSide ? en ? ' / side' : '／側' : ''} · {en ? 'rest ' : '休息 '}{dose.preparation.restSeconds} {en ? 'sec' : '秒'}。{dose.preparation.instruction}</p>}
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={action} aria-label={`${en ? 'Move up' : '往前'} ${name}`} disabled={index === 0} onClick={() => run(() => reorderManualExercise(session, dose.id, -1, exercises, lang), en ? 'Draft order updated.' : '已調整草稿順序。')}><ArrowUp size={16} aria-hidden="true" />{en ? 'Up' : '往前'}</button><button type="button" className={action} aria-label={`${en ? 'Move down' : '往後'} ${name}`} disabled={index === doses.length - 1} onClick={() => run(() => reorderManualExercise(session, dose.id, 1, exercises, lang), en ? 'Draft order updated.' : '已調整草稿順序。')}><ArrowDown size={16} aria-hidden="true" />{en ? 'Down' : '往後'}</button><button type="button" className={`${action} text-red-700`} aria-label={`${en ? 'Remove' : '移除'} ${name}`} onClick={() => remove(dose.id)}><Trash2 size={16} aria-hidden="true" />{en ? 'Remove' : '移除'}</button></div>
            {editing && form && <form onSubmit={submitDose} aria-label={`${en ? 'Edit dose' : '編輯組次'} ${name}`} className="mt-4 space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
              {fixed && <p className="text-sm text-indigo-800">{en ? `Complete ${exercise.sequenceMinutes}-minute flow; its dose includes every part and both sides.` : `整套 ${exercise.sequenceMinutes} 分鐘流程包含全部段落及左右側，劑量固定。`}</p>}
              <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-slate-700">{en ? 'Sets' : '組數'}<input autoFocus type="number" min="1" max="5" step="1" required disabled={fixed} value={form.sets} onChange={event => setForm({ ...form, sets: event.target.value })} className={`${control} mt-1 w-full disabled:bg-slate-100`} /></label><label className="text-sm text-slate-700">{en ? 'Amount per set (number or range)' : '每組數值（可填 6–8 範圍）'}<input required inputMode="decimal" disabled={fixed} value={form.value} onChange={event => setForm({ ...form, value: event.target.value })} className={`${control} mt-1 w-full disabled:bg-slate-100`} /></label><label className="text-sm text-slate-700">{en ? 'Unit' : '單位'}<select disabled={fixed} value={form.unit} onChange={event => setForm({ ...form, unit: event.target.value })} className={`${control} mt-1 w-full disabled:bg-slate-100`}>{Object.entries(unit).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="text-sm text-slate-700">{en ? 'Rest between sets (seconds)' : '組間休息（秒）'}<input type="number" min="0" max="300" step="1" required disabled={fixed} value={form.restSeconds} onChange={event => setForm({ ...form, restSeconds: event.target.value })} className={`${control} mt-1 w-full disabled:bg-slate-100`} /></label><label className="text-sm text-slate-700">{en ? 'Session phase' : '安排階段'}<select value={form.phase} onChange={event => setForm({ ...form, phase: event.target.value })} className={`${control} mt-1 w-full`}>{SESSION_PHASES.map(value => <option value={value} key={value} disabled={skillOnly && value !== 'skill' || fixed && !['warmup', 'recovery', 'cooldown'].includes(value)}>{phaseName(value)}</option>)}</select></label><label className="flex min-h-11 items-center gap-3 text-sm text-slate-700"><input type="checkbox" disabled={fixed} checked={form.perSide} onChange={event => setForm({ ...form, perSide: event.target.checked })} className="h-5 w-5 accent-sky-600" />{en ? 'Amount is per side' : '數值為每側'}</label></div>
              {dose.preparation && !['strength', 'accessory'].includes(form.phase) && <p className="text-xs text-amber-800">{en ? 'This phase does not include a separate preparation set. The preparation set will be removed when saved.' : '這個階段不另列主項準備組；儲存時會移除原本準備組。'}</p>}
              <div className="flex flex-wrap gap-2"><button type="submit" className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">{en ? 'Save draft changes' : '儲存草稿修改'}</button><button type="button" onClick={() => { setEditId(null); setForm(null); }} className={action}>{en ? 'Cancel changes' : '取消修改'}</button></div>
            </form>}
          </li>;
        })}</ol>
      </section>;
    })}
    <div className="flex flex-wrap gap-2">{onSaveWorkout && <button type="button" className={action} onClick={() => callback(onSaveWorkout)}>{en ? 'Save as a reusable workout' : '另存為可複用課表'}</button>}{onShare && <button type="button" className={action} onClick={() => callback(onShare)}>{en ? 'Share this draft day' : '分享這天草稿'}</button>}</div>
  </section>;
}
