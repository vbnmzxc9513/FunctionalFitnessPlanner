import { useState } from 'react';
import { Copy, Download, Share2 } from 'lucide-react';
import { catalogExercises } from '../domain/exerciseCatalog.js';
import { createSharePayload, shareDay, shareUrl } from '../domain/sharing.js';
import { sessionSections, estimateSessionMinutes } from '../domain/sessions.js';

const TEXT = {
  zh: {
    title: '分享今天的課表', privacy: '只分享公開動作、組數與順序；不含個人資料、健康紀錄、私人筆記或金鑰。',
    unsupported: '這份課表含自訂或舊版動作，無法安全分享。請改用動作庫中的動作後再試。', invalid: '這份課表的組數或格式無法安全分享，請先調整課表。',
    download: '下載課表圖片', copy: '複製連結', share: '分享連結', copied: '課表連結已複製。', saved: '圖片已準備下載。', failed: '無法完成操作；可手動複製下面的連結。',
    imageFailed: '無法產生圖片，請改用分享連結。', manual: '課表分享連結', imageTitle: '羽球體能課表', reference: '依自身能力、器材與專業建議調整。',
    sets: '組', units: { reps: '次', seconds: '秒', minutes: '分鐘', breaths: '次呼吸' }, perSide: '每側', rest: '休息',
    prep: '準備組', prepHint: '徒手或輕阻力，保留餘力；不算另一個完成動作。', empty: '休息日：無需額外暖身或收操。',
    phases: { warmup: '暖身與準備組', skill: '協調與步伐', strength: '主要肌力', accessory: '輔助訓練', recovery: '恢復', cooldown: '收操' },
  },
  en: {
    title: 'Share today’s workout', privacy: 'Shares catalog exercises, doses and order only. Personal details, health records, private notes and API keys are excluded.',
    unsupported: 'This workout includes custom or legacy exercises and cannot be safely shared. Replace them with catalog exercises first.', invalid: 'This workout’s dose or format cannot be safely shared. Adjust it first.',
    download: 'Download workout image', copy: 'Copy link', share: 'Share link', copied: 'Workout link copied.', saved: 'Your image is ready to download.', failed: 'The operation failed. Copy the link below manually.',
    imageFailed: 'The image could not be created. Use the workout link instead.', manual: 'Workout share link', imageTitle: 'Badminton workout', reference: 'Adapt to your ability, equipment and professional advice.',
    sets: 'sets', units: { reps: 'reps', seconds: 'seconds', minutes: 'minutes', breaths: 'breaths' }, perSide: 'each side', rest: 'Rest',
    prep: 'Preparation sets', prepHint: 'Use bodyweight or light resistance, leaving repetitions in reserve. Not a separate completion item.', empty: 'Rest day: no extra warm-up or cool-down.',
    phases: { warmup: 'Warm-up and preparation', skill: 'Coordination and footwork', strength: 'Main strength', accessory: 'Accessory work', recovery: 'Recovery', cooldown: 'Cool-down' },
  },
};

function imageBlob(payload, lang, t) {
  const exercises = catalogExercises(lang);
  const day = shareDay(payload, lang);
  const sections = sessionSections(day, exercises);
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('NO_CANVAS');
  const lines = [];
  const add = (text, size = 25, color = '#475569') => {
    ctx.font = `${size}px sans-serif`;
    let line = '';
    for (const char of text) {
      if (ctx.measureText(line + char).width > 800 && line) { lines.push({ text: line, size, color }); line = ''; }
      line += char;
    }
    lines.push({ text: line, size, color });
  };
  add('Fitness Planner', 25, '#0284c7');
  add(t.imageTitle, 38, '#0f172a');
  if (day.routine.length) add(`~ ${estimateSessionMinutes(day, exercises)} ${t.units.minutes}`, 25);
  if (!day.routine.length) add(t.empty);
  let number = 0;
  const doseText = dose => `${dose.sets} ${t.sets} × ${dose.value} ${t.units[dose.unit]}${dose.perSide ? ` · ${t.perSide}` : ''}${dose.restSeconds ? ` · ${t.rest} ${dose.restSeconds} ${t.units.seconds}` : ''}`;
  for (const section of sections.filter(value => value.items.length || value.preparation.length)) {
    add('', 14); add(t.phases[section.phase], 29, '#0369a1');
    for (const { id, dose } of section.items) {
      add(`${++number}. ${exercises[id].name}`, 26, '#0f172a');
      add(doseText(dose), 23);
    }
    for (const { id, dose } of section.preparation) {
      add(`${t.prep} · ${exercises[id].name}`, 26, '#92400e');
      add(doseText(dose), 23); add(t.prepHint, 21);
    }
  }
  add('', 16); add(t.reference, 21);
  canvas.height = Math.ceil(100 + lines.reduce((sum, line) => sum + line.size * 1.55, 0));
  ctx.fillStyle = '#f0f9ff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 60;
  for (const line of lines) { ctx.font = `${line.size}px sans-serif`; ctx.fillStyle = line.color; ctx.fillText(line.text, 50, y); y += line.size * 1.55; }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('NO_IMAGE')), 'image/png'));
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* Use the selection fallback. */ }
  }
  const input = document.createElement('textarea');
  input.value = value; input.style.position = 'fixed'; input.style.opacity = '0';
  document.body.append(input); input.focus(); input.select();
  let copied = false;
  try { copied = typeof document.execCommand === 'function' && document.execCommand('copy'); }
  finally { input.remove(); }
  if (!copied) throw new Error('COPY_FAILED');
}

export default function WorkoutShare({ day, exercises, level = 1, lang = 'zh' }) {
  const t = TEXT[lang] || TEXT.zh;
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  let payload; let error;
  try { payload = createSharePayload(day, exercises, level); } catch (value) { error = value.message; }
  const url = payload ? shareUrl(payload) : '';
  const action = async kind => {
    setBusy(true); setStatus(''); setManual(false);
    try {
      if (kind === 'image') {
        const blob = await imageBlob(payload, lang, t);
        const localUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = localUrl; link.download = 'fitness-planner-workout.png';
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(localUrl), 1000); setStatus(t.saved);
      } else if (kind === 'share' && navigator.share) await navigator.share({ title: t.imageTitle, url });
      else { await copyText(url); setStatus(t.copied); }
    } catch (value) {
      if (value.name !== 'AbortError') { setStatus(kind === 'image' ? t.imageFailed : t.failed); setManual(kind !== 'image'); }
    } finally { setBusy(false); }
  };
  return <section className="bg-white rounded-2xl p-5 border border-sky-100 space-y-3" aria-label={t.title}>
    <h3 className="font-bold text-slate-800">{t.title}</h3>
    <p className="text-xs text-slate-500">{t.privacy}</p>
    {error ? <p role="status" className="text-sm text-amber-800">{error === 'UNSUPPORTED_SHARE' ? t.unsupported : t.invalid}</p> : <div className="flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => action('image')} className="flex items-center gap-2 rounded-lg bg-sky-50 text-sky-700 p-3 text-sm disabled:opacity-50"><Download size={16} />{t.download}</button>
      <button disabled={busy} onClick={() => action('copy')} className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm disabled:opacity-50"><Copy size={16} />{t.copy}</button>
      {typeof navigator.share === 'function' && <button disabled={busy} onClick={() => action('share')} className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm disabled:opacity-50"><Share2 size={16} />{t.share}</button>}
    </div>}
    {status && <p role="status" className="text-sm text-slate-600">{status}</p>}
    {manual && <input aria-label={t.manual} value={url} readOnly onFocus={event => event.target.select()} className="w-full rounded-lg border border-slate-200 p-3 text-sm" />}
  </section>;
}
