import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import ExerciseDetails from './ExerciseDetails.jsx';
import { BODY_PARTS, bodyPartLabel } from '../domain/exerciseTags.js';
import { EQUIPMENT } from '../domain/exerciseCatalog.js';
import { createCustomExercise, customExerciseError } from '../domain/customExercises.js';

export default function CreateExerciseDialog({ lang = 'zh', t, scope = 'device', initialPart = 'unclassified', addToDay = false, onSave, onClose }) {
  const en = lang === 'en', formId = useId();
  const [form, setForm] = useState({ name:'', purpose:'training', bodyParts:[initialPart === 'all' ? 'unclassified' : initialPart], equipment:[], description:'' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true), saving = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const close = () => { if (!saving.current) { mounted.current = false; onClose(); } };
  const submit = async event => {
    event.preventDefault(); if (saving.current) return;
    try {
      createCustomExercise(form); saving.current = true; setBusy(true); setError('');
      await onSave(form);
      if (mounted.current) onClose();
    } catch (cause) { if (mounted.current) setError(customExerciseError(cause, lang)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  };
  const dose = form.prescription || { sets:form.purpose === 'training' ? 2 : 1, value:form.purpose === 'training' ? '8' : '30', unit:form.purpose === 'training' ? 'reps' : 'seconds', restSeconds:form.purpose === 'training' ? 60 : 0, perSide:false };
  const changeDose = change => setForm({ ...form, prescription:{ ...dose, ...change } });
  const saveButton = <button type="submit" form={formId} data-testid="custom-exercise-save" className="create-exercise-submit" disabled={busy || !form.name.trim()}>{busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}{busy ? en ? 'Saving…' : '儲存中…' : addToDay ? en ? 'Save and add to this day' : '儲存並加入這天' : en ? 'Save exercise' : '儲存動作'}</button>;
  return <ExerciseDetails footer={saveButton} open title={en ? 'Create an exercise' : '新增自己的動作'} subtitle={scope === 'account' ? en ? 'Save to your account' : '儲存到我的帳號' : en ? 'Save on this device' : '儲存在這個裝置'} closeLabel={en ? 'Close' : '關閉'} onClose={close}>
    <form id={formId} data-testid="create-exercise-form" className="create-exercise-form" onSubmit={submit}>
      {error && <p role="alert" className="create-exercise-error">{error}</p>}
      <fieldset disabled={busy}>
        <label>{en ? 'Exercise name' : '動作名稱'}<input autoFocus required maxLength={100} data-testid="custom-exercise-name" value={form.name} placeholder={en ? 'e.g. Seated chest press' : '例如：坐姿胸推'} onChange={e => setForm({ ...form, name:e.target.value })} /></label>
        <div className="create-exercise-purposes" role="group" aria-label={en ? 'Use' : '動作用途'}>{[['warmup',en?'Warm-up':'暖身'],['training',en?'Training':'訓練'],['cooldown',en?'Cooldown':'收操']].map(([value,label]) => <button key={value} type="button" aria-pressed={form.purpose===value} onClick={() => setForm({ ...form, purpose:value, prescription:undefined })}>{label}</button>)}</div>
        <label>{en ? 'Main body part' : '主要部位'}<select data-testid="custom-exercise-part" value={form.bodyParts[0]} onChange={e => setForm({ ...form, bodyParts:[e.target.value] })}>{BODY_PARTS.map(([key]) => <option key={key} value={key}>{bodyPartLabel(key,lang)}</option>)}</select></label>
        <details className="create-exercise-equipment"><summary>{en ? 'Equipment' : '器材'} · {form.equipment.length ? form.equipment.map(key => t?.(`equipment_${key}`) || key).join('、') : en ? 'Bodyweight' : '徒手'}</summary><div>{EQUIPMENT.map(key => <label key={key}><input type="checkbox" data-testid={`custom-equipment-${key}`} checked={form.equipment.includes(key)} onChange={e => setForm({ ...form, equipment:e.target.checked ? [...form.equipment,key] : form.equipment.filter(v => v!==key) })} />{t?.(`equipment_${key}`) || key}</label>)}</div></details>
        <details className="create-exercise-more"><summary>{en ? 'Notes and starting dose' : '說明與預設組次'}</summary><label>{en ? 'Your movement notes' : '自己的動作筆記'}<textarea maxLength={1000} rows={3} value={form.description} onChange={e => setForm({ ...form, description:e.target.value })} /></label><div className="create-dose-grid"><label>{en ? 'Sets' : '組數'}<input type="number" min="1" max="5" value={dose.sets} onChange={e=>changeDose({sets:Number(e.target.value)})} /></label><label>{en ? 'Amount' : '每組數值'}<input value={dose.value} maxLength={7} onChange={e=>changeDose({value:e.target.value})} /></label><label>{en ? 'Unit' : '單位'}<select value={dose.unit} onChange={e=>changeDose({unit:e.target.value})}>{[['reps',en?'Reps':'次'],['seconds',en?'Seconds':'秒'],['minutes',en?'Minutes':'分鐘'],['breaths',en?'Breaths':'次呼吸']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>{en ? 'Rest (seconds)' : '組間休息（秒）'}<input type="number" min="0" max="300" value={dose.restSeconds} onChange={e=>changeDose({restSeconds:Number(e.target.value)})} /></label></div><label className="create-per-side"><input type="checkbox" checked={dose.perSide} onChange={e=>changeDose({perSide:e.target.checked})} />{en ? 'Amount per side' : '數值為每側'}</label></details>
      </fieldset>

    </form>
  </ExerciseDetails>;
}
