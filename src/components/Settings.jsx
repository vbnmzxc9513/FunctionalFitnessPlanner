import { ExternalLink, Key } from 'lucide-react';

export default function Settings({ t, input, setInput, apiKey, model, setModel, models, onSave, onClear }) {
  return <section className="bg-white p-5 rounded-2xl border border-sky-100">
    <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><Key size={20} className="text-blue-600" />{t('settingsTitle')}</h2>
    <p className="text-sm text-sky-700 bg-sky-50 rounded-xl p-4 mb-4">{t('freeSettings')}</p>
    <details><summary className="cursor-pointer font-semibold text-sm mb-4">{t('advancedByok')}</summary>
    <p className="text-sm text-slate-500 mb-4">{t('settingsDesc')}<strong>{t('settingsDescStrong')}</strong>{t('settingsDescEnd')}</p>
    <p className="text-sm text-slate-500 mb-4">{t('dataSharingNotice')}</p>
    <label className="block text-sm mb-4">Gemini API Key<input type="password" autoComplete="off" value={input} onChange={event => setInput(event.target.value)} className="mt-2 w-full border border-sky-200 bg-slate-50 rounded-xl p-3 font-mono" /></label>
    <label className="block text-sm mb-4">{t('settingsModelTitle')}<select value={model} onChange={event => setModel(event.target.value)} className="mt-2 w-full border border-sky-200 bg-slate-50 rounded-xl p-3">{models.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    <div className="flex flex-wrap gap-3">
      <button onClick={onSave} className="bg-blue-600 text-white py-3 px-4 rounded-xl">{t('settingsSaveBtn')}</button>
      {apiKey && <button onClick={onClear} className="bg-slate-100 py-3 px-4 rounded-xl">{t('clearKey')}</button>}
      <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600"><ExternalLink size={16} />{t('settingsGetKey')}</a>
    </div>
    {apiKey && <p className="text-xs text-sky-600 mt-4">{t('settingsKeyBound')}</p>}
    </details>
  </section>;
}
