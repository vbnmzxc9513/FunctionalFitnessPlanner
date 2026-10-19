import { STIFFNESS_REGIONS, TARGET_REGIONS, MAX_TARGET_REGIONS, BASIC_TARGET_REGIONS, TARGET_GROUPS } from '../domain/trainingPreferences.js';

export function RegionChoices({ t, context, onChange, disabled, name, regions, label, prefix = name }) {
  const selected = context[name] || [];
  const target = name === 'targetRegions';
  const maximum = target ? MAX_TARGET_REGIONS : 2;
  const choices = items => <div className="flex flex-wrap gap-2">{items.map(region => <label key={region} className={`inline-flex items-center gap-2 rounded-xl min-h-11 border px-3 py-2 text-sm ${selected.includes(region) ? 'bg-sky-50 border-sky-300 text-sky-800' : 'border-slate-200 text-slate-600'}`}><input type="checkbox" data-target-region={target ? region : undefined} disabled={disabled || !selected.includes(region) && selected.length >= maximum} checked={selected.includes(region)} onChange={event => onChange(name, event.target.checked ? [...selected, region] : selected.filter(item => item !== region))} />{t(`${prefix}_${region}`)}</label>)}</div>;
  return <fieldset data-regions={name} className="space-y-2"><legend className="text-sm font-semibold mb-2">{t(label)}{target && ` · ${selected.length} / ${maximum}`}</legend>
    {choices(target ? BASIC_TARGET_REGIONS : regions)}
    {target && <><p className="text-xs text-slate-500">{t('targetSelectionHint')}</p><details data-testid="target-details" className="rounded-xl border border-slate-200 p-3"><summary className="text-sm font-medium text-sky-800">{t('targetDetails')}{selected.some(region => !BASIC_TARGET_REGIONS.includes(region)) && ` · ${selected.filter(region => !BASIC_TARGET_REGIONS.includes(region)).map(region => t(`${prefix}_${region}`)).join('、')}`}</summary><div className="mt-4 space-y-4">{TARGET_GROUPS.map(group => <fieldset key={group.key}><legend className="text-xs font-medium text-slate-500 mb-2">{t(`targetGroup_${group.key}`)}</legend>{choices(group.regions)}</fieldset>)}</div></details></>}
  </fieldset>;
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
