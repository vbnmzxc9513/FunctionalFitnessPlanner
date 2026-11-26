import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import ExerciseDetails from './ExerciseDetails.jsx';
import { BODY_PARTS, bodyPartLabel } from '../domain/exerciseTags.js';
import { EQUIPMENT } from '../domain/exerciseCatalog.js';
import { createCustomExercise, customExerciseError } from '../domain/customExercises.js';
import { aiCustomExerciseError } from '../domain/aiCustomExercise.js';

export default function CreateExerciseDialog({ lang = 'zh', t, scope = 'device', initialPart = 'unclassified', addToDay = false, aiConfig, onSave, onClose }) {
  const en = lang === 'en', formId = useId();
  const [form, setForm] = useState({ name: '', purpose: 'training', bodyParts: [initialPart === 'all' ? 'unclassified' : initialPart], equipment: [], description: '' });
  const [busy, setBusy] = useState(false), [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState(''), [aiStatus, setAiStatus] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const mounted = useRef(true), saving = useRef(false), abortRef = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);
  const close = () => {
    if (!saving.current) {
      abortRef.current?.abort();
      mounted.current = false;
      onClose();
    }
  };
  const submit = async event => {
    event.preventDefault(); if (saving.current || aiBusy) return;
    try {
      createCustomExercise(form); saving.current = true; setBusy(true); setError('');
      await onSave(form);
      if (mounted.current) onClose();
    } catch (cause) { if (mounted.current) setError(customExerciseError(cause, lang)); }
    finally { saving.current = false; if (mounted.current) setBusy(false); }
  };

  const generateWithAI = async () => {
    if (aiBusy || saving.current) return;
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError(aiCustomExerciseError(new Error('CUSTOM_NAME'), lang));
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAiBusy(true);
    setError('');
    setAiStatus('');
    try {
      const { generateCustomExerciseWithAI } = await import('../services/gemini.js');
      const generated = await generateCustomExerciseWithAI({
        name: trimmedName,
        apiKey: aiConfig?.apiKey || '',
        model: aiConfig?.model || 'gemini-2.5-flash',
        lang,
        aiMemberActive: !!aiConfig?.memberActive,
        signal: controller.signal,
      });
      if (!mounted.current || controller.signal.aborted) return;
      setForm(generated);
      setMoreOpen(true);
      setAiStatus(en
        ? 'AI filled in body parts, equipment, starting dose, and movement instructions. Review or edit before saving.'
        : '已由 AI 自動生成動作分類、器材、預設組次與動作說明，可直接儲存或微調。');
    } catch (cause) {
      if (mounted.current && cause?.message !== 'ABORTED') {
        setError(aiCustomExerciseError(cause, lang));
      }
    } finally {
      if (mounted.current) setAiBusy(false);
    }
  };

  const dose = form.prescription || { sets: form.purpose === 'training' ? 2 : 1, value: form.purpose === 'training' ? '8' : '30', unit: form.purpose === 'training' ? 'reps' : 'seconds', restSeconds: form.purpose === 'training' ? 60 : 0, perSide: false };
  const changeDose = change => setForm({ ...form, prescription: { ...dose, ...change } });
  const hasAiReady = !!(aiConfig?.memberActive || String(aiConfig?.apiKey || '').trim());
  const secondaryParts = form.bodyParts.slice(1);
  const saveButton = <button type="submit" form={formId} data-testid="custom-exercise-save" className="create-exercise-submit" disabled={busy || aiBusy || !form.name.trim()}>{busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}{busy ? en ? 'Saving…' : '儲存中…' : addToDay ? en ? 'Save and add to this day' : '儲存並加入這天' : en ? 'Save exercise' : '儲存動作'}</button>;
  return <ExerciseDetails footer={saveButton} open title={en ? 'Create an exercise' : '新增自己的動作'} subtitle={scope === 'account' ? en ? 'Save to your account' : '儲存到我的帳號' : en ? 'Save on this device' : '儲存在這個裝置'} closeLabel={en ? 'Close' : '關閉'} onClose={close}>
    <form id={formId} data-testid="create-exercise-form" className="create-exercise-form" onSubmit={submit}>
      {error && <p role="alert" className="create-exercise-error">{error}</p>}
      {aiStatus && <p role="status" data-testid="custom-exercise-ai-status" className="create-exercise-ai-status"><Sparkles size={15} aria-hidden="true" /><span>{aiStatus}</span></p>}
      <fieldset disabled={busy || aiBusy}>
        <div className="create-exercise-name-block">
          <label>{en ? 'Exercise name' : '動作名稱'}<input autoFocus required maxLength={100} data-testid="custom-exercise-name" value={form.name} placeholder={en ? 'e.g. Seated chest press' : '例如：坐姿胸推、啞鈴保加利亞分腿蹲'} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <button
            type="button"
            data-testid="custom-exercise-ai-fill"
            className="create-exercise-ai-btn"
            disabled={busy || aiBusy || !form.name.trim()}
            onClick={generateWithAI}
          >
            {aiBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} aria-hidden="true" />}
            <span>{aiBusy ? (en ? 'Generating details…' : 'AI 正在生成動作與說明…') : (en ? 'AI auto-fill details & guide' : 'AI 自動生成動作與說明')}</span>
            {hasAiReady && !aiBusy && <em className="create-exercise-ai-pill">{aiConfig?.memberActive ? (en ? 'Cloud AI' : '雲端 AI') : 'Gemini'}</em>}
          </button>
        </div>
        <div className="create-exercise-purposes" role="group" aria-label={en ? 'Use' : '動作用途'}>{[['warmup', en ? 'Warm-up' : '暖身'], ['training', en ? 'Training' : '訓練'], ['cooldown', en ? 'Cooldown' : '收操']].map(([value, label]) => <button key={value} type="button" aria-pressed={form.purpose === value} onClick={() => setForm({ ...form, purpose: value, prescription: undefined })}>{label}</button>)}</div>
        <div className="create-exercise-part-block">
          <label>{en ? 'Main body part' : '主要部位'}<select data-testid="custom-exercise-part" value={form.bodyParts[0]} onChange={e => setForm({ ...form, bodyParts: [e.target.value, ...form.bodyParts.slice(1).filter(part => part !== e.target.value)] })}>{BODY_PARTS.map(([key]) => <option key={key} value={key}>{bodyPartLabel(key, lang)}</option>)}</select></label>
          {secondaryParts.length > 0 && (
            <div className="create-exercise-extra-parts">
              <span>{en ? 'Also targets:' : '協同部位：'}</span>
              {secondaryParts.map(part => (
                <button key={part} type="button" className="create-exercise-part-chip" onClick={() => setForm({ ...form, bodyParts: form.bodyParts.filter(item => item !== part) })} title={en ? 'Remove' : '移除'}>
                  {bodyPartLabel(part, lang)} ×
                </button>
              ))}
            </div>
          )}
        </div>
        <details className="create-exercise-equipment"><summary>{en ? 'Equipment' : '器材'} · {form.equipment.length ? form.equipment.map(key => t?.(`equipment_${key}`) || key).join('、') : en ? 'Bodyweight' : '徒手'}</summary><div>{EQUIPMENT.map(key => <label key={key}><input type="checkbox" data-testid={`custom-equipment-${key}`} checked={form.equipment.includes(key)} onChange={e => setForm({ ...form, equipment: e.target.checked ? [...form.equipment, key] : form.equipment.filter(v => v !== key) })} />{t?.(`equipment_${key}`) || key}</label>)}</div></details>
        <details className="create-exercise-more" open={moreOpen} onToggle={e => setMoreOpen(e.currentTarget.open)}><summary>{en ? 'Notes and starting dose' : '說明與預設組次'}</summary><label>{en ? 'Movement guide & notes' : '動作說明與筆記'}<textarea maxLength={1000} rows={4} data-testid="custom-exercise-description" value={form.description} placeholder={en ? 'Starting position, execution cues, or safety notes…' : '起始姿勢、發力要領或安全提醒…'} onChange={e => setForm({ ...form, description: e.target.value })} /></label><div className="create-dose-grid"><label>{en ? 'Sets' : '組數'}<input type="number" min="1" max="5" value={dose.sets} onChange={e => changeDose({ sets: Number(e.target.value) })} /></label><label>{en ? 'Amount' : '每組數值'}<input value={dose.value} maxLength={7} onChange={e => changeDose({ value: e.target.value })} /></label><label>{en ? 'Unit' : '單位'}<select value={dose.unit} onChange={e => changeDose({ unit: e.target.value })}>{[['reps', en ? 'Reps' : '次'], ['seconds', en ? 'Seconds' : '秒'], ['minutes', en ? 'Minutes' : '分鐘'], ['breaths', en ? 'Breaths' : '次呼吸']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>{en ? 'Rest (seconds)' : '組間休息（秒）'}<input type="number" min="0" max="300" value={dose.restSeconds} onChange={e => changeDose({ restSeconds: Number(e.target.value) })} /></label></div><label className="create-per-side"><input type="checkbox" checked={dose.perSide} onChange={e => changeDose({ perSide: e.target.checked })} />{en ? 'Amount per side' : '數值為每側'}</label></details>
      </fieldset>
    </form>
  </ExerciseDetails>;
}
