import { useEffect, useId, useRef, useState } from 'react';
import { Copy, Share2, X } from 'lucide-react';
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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const message = code => code === 'UNSUPPORTED_SHARE' ? t.unsupported : code === 'PLAN_SHARE_TOO_LONG' ? t.tooLong
    : code === 'SESSION_CHANGED' ? t.sessionChanged : ['INVALID_PLAN_SHARE', 'INVALID_SHARE'].includes(code) ? t.invalid : t.createFailed;
  let preview, previewError;
  try { preview = created?.payload || createPlanPayload(days, { name: publicName, exercises, level }); }
  catch (value) { previewError = value.message; }
  useEffect(() => {
    const prior = document.activeElement;
    input.current?.focus();
    return () => { if (prior instanceof HTMLElement && prior.isConnected) prior.focus(); };
  }, []);

  const create = async () => {
    if (pending.current || created) return;
    pending.current = true; setBusy(true); setError(''); setStatus('');
    try {
      // Capture exactly once at the user's create action. Neither props changing
      // during the request nor later source edits can alter the published copy.
      const payload = createPlanPayload(days, { name: publicName, exercises, level });
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
    const controls = [...panel.current.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')];
    if (!controls.length) return;
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-3 sm:p-6">
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={headingId} aria-describedby={privacyId} onKeyDown={keyDown} className="mx-auto w-full max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-xl">
      <div className="flex items-center justify-between gap-3"><h2 id={headingId} className="text-xl font-bold text-slate-900">{t.title}</h2><button type="button" aria-label={t.close} disabled={busy} onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-50"><X size={20} /></button></div>
      <p id={privacyId} className="text-sm text-slate-600">{t.privacy}</p>
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.permanent}</p>
      <div><label htmlFor={nameId} className="mb-1 block text-sm font-semibold text-slate-700">{t.name}</label><input ref={input} id={nameId} maxLength={MAX_PLAN_NAME_LENGTH} disabled={busy || !!created} value={publicName} onChange={event => setPublicName(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 p-3 disabled:bg-slate-50" /></div>
      {preview && <div className="rounded-xl border border-slate-200 p-3 text-sm"><p className="font-semibold">{preview.days.length} {t.days} · {preview.days.reduce((sum, day) => sum + day.items.length, 0)} {t.actions}</p><ol className="mt-2 space-y-1 text-slate-600">{preview.days.map((day, index) => <li key={index}>{lang === 'en' ? `Day ${index + 1}` : day.name} · {t.offset} {day.offset} {t.interval} · {day.items.length} {t.actions}</li>)}</ol></div>}
      <p className="text-sm text-slate-600">{uid ? t.signed : t.guest}</p>
      {(error || previewError) && <p role="alert" className="text-sm text-amber-900">{message(error || previewError)}</p>}
      {!created && <button type="button" disabled={busy || !!previewError} onClick={create} className="min-h-11 w-full rounded-xl bg-sky-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? t.creating : t.create}</button>}
      {!uid && error === 'PLAN_SHARE_TOO_LONG' && onSignIn && <button type="button" onClick={onSignIn} className="min-h-11 w-full rounded-xl border border-sky-700 px-4 py-3 font-semibold text-sky-800">{t.signIn}</button>}
      {created && <><div className="flex flex-wrap gap-2"><button type="button" onClick={() => action('copy')} className="flex min-h-11 items-center gap-2 rounded-lg bg-sky-50 px-4 py-3 font-semibold text-sky-800"><Copy size={16} />{t.copy}</button>{typeof navigator.share === 'function' && <button type="button" onClick={() => action('share')} className="flex min-h-11 items-center gap-2 rounded-lg bg-slate-100 px-4 py-3"><Share2 size={16} />{t.share}</button>}</div><label className="block text-sm text-slate-600">{t.manual}<input readOnly value={created.url} onFocus={event => event.target.select()} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 p-3 text-sm" /></label></>}
      <p role="status" aria-live="polite" className="text-sm text-slate-700">{status}</p>
    </section>
  </div>;
}
