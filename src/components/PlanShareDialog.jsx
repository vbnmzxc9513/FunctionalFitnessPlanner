import { useEffect, useId, useRef, useState } from 'react';
import { Copy, Share2, X } from 'lucide-react';
import { estimateSessionMinutes } from '../domain/sessions.js';
import './workout-sharing.css';
import { createPlanPayload, MAX_PLAN_NAME_LENGTH } from '../domain/sharedPlans.js';
import { buildEmbeddedPlanUrl, buildSharedPlanUrl, createSharedPlan } from '../services/sharedPlanRepository.js';

const TEXT = {
  zh: {
    title: '分享多日課表', name: '公開課表名稱', defaultName: '我的訓練課表', close: '關閉分享',
    privacy: '持有連結的人都能查看公開名稱、動作、組次、順序與相對間隔。原日期、帳號、健康資訊、實際重量、完成紀錄與私人筆記不會分享。',
    permanent: '分享後是獨立副本，不會隨原課表修改。公開連結目前無法撤回，請先確認名稱與內容。',
    create: '建立分享連結', creating: '正在建立…', created: '分享副本已建立。之後修改原課表不會改動這個連結。',
    copy: '複製連結', copied: '連結已複製。', share: '分享連結', manual: '分享連結，可選取後手動複製',
    failed: '無法完成操作；可選取下方連結手動複製。', createFailed: '無法建立連結，請檢查網路後重試。',
    invalid: '名稱或課表格式無效，請先調整；名稱最多 40 字，課表最多 28 天。',
    unsupported: '含自訂或不支援的舊動作，整份課表無法分享。請先替換成動作庫中的動作，不會略過任何動作。',
    tooLong: '課表超出免登入連結長度。請登入以建立短連結，或縮短這次分享的內容。',
    signIn: '登入建立短連結', guest: '未登入：使用含課表內容的連結；較長課表需登入建立短連結。',
    signed: '將建立公開短連結；不會公開你的帳號識別碼。', days: '天', actions: '個動作', offset: '距第 1 天', interval: '天',
    sessionChanged: '登入狀態已變更，請關閉後重新分享。',
  },
  en: {
    title: 'Share a training plan', name: 'Public plan name', defaultName: 'My training plan', close: 'Close sharing',
    privacy: 'Anyone with the link can view its public name, catalog exercises, doses, order and relative spacing. Original dates, account details, health information, actual weights, completion records and private notes are excluded.',
    permanent: 'Sharing creates an independent copy. Later edits do not change it. Public links cannot currently be revoked; check the name and content first.',
    create: 'Create share link', creating: 'Creating…', created: 'Your shared copy is ready. Later edits to the original will not change this link.',
    copy: 'Copy link', copied: 'Link copied.', share: 'Share link', manual: 'Share link; select to copy manually',
    failed: 'The action failed. Select the link below to copy it manually.', createFailed: 'Could not create the link. Check your connection and retry.',
    invalid: 'Check the name and plan format. Use up to 40 characters and 28 days.',
    unsupported: 'Custom or unsupported legacy exercises prevent sharing the entire plan. Replace them with catalog exercises first; no exercises are silently omitted.',
    tooLong: 'This plan exceeds the signed-out link length. Sign in for a short link, or share less content.',
    signIn: 'Sign in for a short link', guest: 'Signed out: the link contains the plan. Longer plans require signing in for a short link.',
    signed: 'Creates a public short link without exposing your account identifier.', days: 'days', actions: 'exercises', offset: 'After day 1:', interval: 'days',
    sessionChanged: 'Your sign-in session changed. Close this dialog and share again.',
  },
};

export default function PlanShareDialog({ days, name, exercises, level = 1, uid, lang = 'zh', onClose, onSignIn }) {
  const t = TEXT[lang] || TEXT.zh;
  const headingId = useId(), nameId = useId(), privacyId = useId();
  const panel = useRef(null), input = useRef(null), pending = useRef(false);
  const [publicName, setPublicName] = useState((name || t.defaultName).slice(0, MAX_PLAN_NAME_LENGTH));
  const [created, setCreated] = useState(null);
  const [selected, setSelected] = useState(() => days.map((_, index) => index));
  const selectedDays = days.filter((_, index) => selected.includes(index));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const message = code => code === 'UNSUPPORTED_SHARE' ? t.unsupported : code === 'PLAN_SHARE_TOO_LONG' ? t.tooLong
    : code === 'SESSION_CHANGED' ? t.sessionChanged : ['INVALID_PLAN_SHARE', 'INVALID_SHARE'].includes(code) ? t.invalid : t.createFailed;
  let preview, previewError;
  try { preview = created?.payload || createPlanPayload(selectedDays, { name: publicName, exercises, level }); }
  catch (value) { previewError = value.message; }
  useEffect(() => {
    const prior = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    input.current?.focus();
    return () => { document.body.style.overflow = overflow; if (prior instanceof HTMLElement && prior.isConnected) prior.focus(); };
  }, []);

  const create = async () => {
    if (pending.current || created) return;
    pending.current = true; setBusy(true); setError(''); setStatus('');
    try {
      // Capture exactly once at the user's create action. Neither props changing
      // during the request nor later source edits can alter the published copy.
      const payload = createPlanPayload(selectedDays, { name: publicName, exercises, level });
      const url = uid ? buildSharedPlanUrl(await createSharedPlan(uid, payload)) : buildEmbeddedPlanUrl(payload);
      setCreated({ payload, url }); setStatus(t.created);
    } catch (value) { setError(value.message || 'CREATE_FAILED'); }
    finally { pending.current = false; setBusy(false); }
  };
  const action = async kind => {
    setStatus('');
    try {
      if (kind === 'share') await navigator.share({ title: created.payload.name, url: created.url });
      else {
        if (!navigator.clipboard?.writeText) throw new Error('COPY_FAILED');
        await navigator.clipboard.writeText(created.url); setStatus(t.copied);
      }
    } catch (value) { if (value.name !== 'AbortError') setStatus(t.failed); }
  };
  const keyDown = event => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose?.(); }
    if (event.key !== 'Tab') return;
    const controls = [...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],summary')];
    if (!controls.length) return;
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const en = lang === 'en';
  const minutes = day => { try { return estimateSessionMinutes(day, exercises); } catch { return '—'; } };
  return <div className="plan-share-overlay workout-ui">
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={privacyId} onKeyDown={keyDown} className="plan-share-ui" data-testid="plan-share-dialog">
      <div className="plan-share-top"><button type="button" aria-label={t.close} disabled={busy} onClick={onClose} className="workout-ui-back"><X size={18} />{en ? 'Close' : '返回課表'}</button></div>
      <header className="workout-ui-heading"><h2 id={headingId}>{en ? 'Share a workout plan' : '分享課表'}</h2><p>{en ? 'Choose the days to share. You do not have to share the whole week.' : '挑選要分享的天數，不必分享整週。'}</p></header>
      <div className="workout-ui-form"><label htmlFor={nameId}>{t.name}</label><input ref={input} id={nameId} maxLength={MAX_PLAN_NAME_LENGTH} disabled={busy || !!created} value={publicName} onChange={event => { setPublicName(event.target.value); setError(''); }} /></div>
      <section className="workout-ui-card plan-share-days" aria-label={en ? 'Days to share' : '選擇分享日期'}>
        {days.map((day, index) => <label key={index} className={selected.includes(index) ? 'is-selected' : ''}><input type="checkbox" data-testid={`plan-share-day-${index}`} checked={selected.includes(index)} disabled={busy || !!created} onChange={() => { setSelected(previous => previous.includes(index) ? previous.filter(value => value !== index) : [...previous, index]); setError(''); setStatus(''); }} /><span><strong>{day.date ? `${day.date.slice(5).replace('-', '/')} · ` : days.length === 1 ? en ? 'Single day · ' : '單日課表 · ' : en ? `Day ${index + 1} · ` : `第 ${index + 1} 天 · `}{day.theme || day.name || publicName}</strong><small>{minutes(day)} {en ? 'min' : '分鐘'} · {day.routine.length} {t.actions}</small></span></label>)}
      </section>
      <section className="workout-ui-info"><h3>{en ? 'Shared information' : '分享內容'}</h3><p id={privacyId}>{en ? t.privacy : '只包含公開名稱、動作、計畫組次、休息、順序與相對間隔。不含健康資訊、實際重量或完成紀錄。'}</p></section>
      <p className="workout-ui-muted">{t.permanent}</p>
      {preview && <p className="workout-ui-muted" data-testid="plan-share-selection-summary">{en ? `${preview.days.length} of ${days.length} days selected. Recipients choose their own dates; relative gaps are preserved.` : `已選 ${preview.days.length}／${days.length} 天。接收者自行選日期，保留所選日期之間的間隔。`}</p>}
      {!selected.length ? <p role="alert" className="workout-ui-error">{en ? 'Select at least one day to share.' : '請至少選擇一天分享。'}</p> : (error || previewError) && <p role="alert" className="workout-ui-error">{message(error || previewError)}</p>}
      {!uid && error === 'PLAN_SHARE_TOO_LONG' && onSignIn && <button type="button" onClick={onSignIn} className="workout-ui-secondary">{t.signIn}</button>}
      {created && <section className="workout-ui-card plan-share-created"><span className="workout-ui-success">✓ {en ? 'Share link created' : '分享連結已建立'}</span><label className="workout-ui-form">{t.manual}<input readOnly value={created.url} onFocus={event => event.target.select()} /></label><p className="workout-ui-muted">{t.created}</p><a className="workout-ui-link" href={created.url} target="_blank" rel="noreferrer">{en ? 'See the recipient preview' : '查看接收者會看到的畫面'} ›</a><button type="button" className="workout-ui-link" onClick={() => { setCreated(null); setStatus(''); setError(''); }}>{en ? 'Adjust sharing contents' : '調整分享內容'}</button>{typeof navigator.share === 'function' && <button type="button" onClick={() => action('share')} className="workout-ui-secondary"><Share2 size={16} />{t.share}</button>}</section>}
      <details className="workout-ui-fineprint"><summary>{en ? 'Public information and storage' : '完整公開範圍與連結儲存'}</summary><p>{t.privacy}</p><p>{uid ? t.signed : t.guest}</p></details>
      <p role="status" className="workout-ui-muted">{status}</p>
      <footer className="workout-ui-actionbar"><div><strong>{en ? `Share ${created?.payload.days.length ?? selected.length} days` : `分享 ${created?.payload.days.length ?? selected.length} 天`}</strong><p>{en ? 'An independent copy' : '分享的是固定副本'}</p></div>{created ? <button type="button" onClick={() => action('copy')} className="workout-ui-primary"><Copy size={17} />{t.copy}</button> : <button type="button" data-testid="plan-share-create" disabled={busy || !!previewError || !selected.length} onClick={create} className="workout-ui-primary">{busy ? t.creating : t.create}</button>}</footer>
    </section>
  </div>;
}
