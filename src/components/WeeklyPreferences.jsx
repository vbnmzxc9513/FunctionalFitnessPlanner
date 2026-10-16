import { STIFFNESS_REGIONS, TARGET_REGIONS } from '../domain/trainingPreferences.js';

export function RegionChoices({ t, context, onChange, disabled, name, regions, label, prefix = name }) {
  const selected = context[name] || [];
  return <fieldset data-regions={name} className="space-y-2"><legend className="text-sm font-semibold mb-2">{t(label)}</legend><div className="flex flex-wrap gap-2">{regions.map(region => <label key={region} className={`inline-flex items-center gap-2 rounded-xl min-h-11 border px-3 py-2 text-sm ${selected.includes(region) ? 'bg-sky-50 border-sky-300 text-sky-800' : 'border-slate-200 text-slate-600'}`}><input type="checkbox" disabled={disabled || !selected.includes(region) && selected.length >= 2} checked={selected.includes(region)} onChange={event => onChange(name, event.target.checked ? [...selected, region] : selected.filter(item => item !== region))} />{t(`${prefix}_${region}`)}</label>)}</div></fieldset>;
}

export default function WeeklyPreferences({ t, context, onChange, disabled }) {
  const group = (name, regions, label) => <RegionChoices {...{ t, context, onChange, disabled, name, regions, label }} />;
  return <details data-testid="weekly-preferences" className="rounded-xl border border-sky-100 p-4">
    <summary className="cursor-pointer text-sm font-semibold">{t('weeklyPreferencesTitle')}</summary>
    <div className="space-y-4 mt-4"><p className="text-xs text-slate-500">{t('weeklyPreferencesHint')}</p>
      {group('targetRegions', TARGET_REGIONS, 'weeklyTargetRegions')}
      {group('stiffnessRegions', STIFFNESS_REGIONS, 'weeklyStiffnessRegions')}
      <p className="text-xs text-slate-600">{t('weeklyStiffnessHint')}</p>
    </div>
  </details>;
}
