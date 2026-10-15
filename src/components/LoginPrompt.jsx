import { Feather, LogIn } from 'lucide-react';

export default function LoginPrompt({ t, title, googleLogin, guestLogin, busy }) {
  return <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-sky-100 shadow-sm">
    <Feather size={32} className="text-sky-500 mb-4" />
    <h3 className="text-lg font-bold text-slate-800 mb-2">{title || t('promoLoginTitle')}</h3>
    <p className="text-sm text-slate-500 mb-6 max-w-xs">{t('promoLoginDesc')}</p>
    <button disabled={busy} onClick={googleLogin} className="flex items-center justify-center py-3 px-6 bg-sky-600 text-white rounded-xl font-bold w-full max-w-xs disabled:opacity-50">
      <LogIn className="mr-2" size={20} />{t('promoLoginBtn')}
    </button>
    <button disabled={busy} onClick={guestLogin} className="mt-3 py-3 px-6 bg-slate-100 text-slate-700 rounded-xl font-bold w-full max-w-xs disabled:opacity-50">{t('promoAnonymousBtn')}</button>
    <p className="text-xs text-slate-500 mt-4 max-w-xs">{t('accountStorageAnonymous')}</p>
  </div>;
}
