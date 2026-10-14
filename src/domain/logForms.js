export const emptySet = () => ({ value: '', otherSide: '' });
export const optionalNumber = value => value === '' || value === null || value === undefined ? null : Number(value);

export function defaultLoadBasis(variant) {
  return ({ bodyweight: 'none', dumbbell: 'per_dumbbell', cable: 'stack', band: 'description', other: 'description' })[variant] || 'description';
}

export function trainingLogInput(form, context) {
  return { ...context, variant: form.variant, loadKg: ['none', 'description'].includes(form.loadBasis) ? null : optionalNumber(form.loadKg),
    loadBasis: form.loadBasis, resistanceLabel: form.resistanceLabel.trim(),
    sets: form.sets.map(set => ({ value: optionalNumber(set.value), otherSide: context.perSide ? optionalNumber(set.otherSide) : null })),
    rir: optionalNumber(form.rir), quality: form.quality, symptoms: form.symptoms, nextDay: form.nextDay, schemaVersion: 1 };
}

export function readinessInput(form, date) {
  return { date, sleepHours: optionalNumber(form.sleepHours), fatigue: optionalNumber(form.fatigue), soreness: optionalNumber(form.soreness),
    symptoms: form.symptoms, yesterdayCourtMinutes: optionalNumber(form.yesterdayCourtMinutes), yesterdayCourtRpe: optionalNumber(form.yesterdayCourtRpe),
    todayCourtIntensity: form.todayCourtIntensity, schemaVersion: 1 };
}

export function readinessForm(value) {
  return { sleepHours: value?.sleepHours ?? '', fatigue: value?.fatigue ?? '', soreness: value?.soreness ?? '', symptoms: value?.symptoms || 'unknown',
    yesterdayCourtMinutes: value?.yesterdayCourtMinutes ?? '', yesterdayCourtRpe: value?.yesterdayCourtRpe ?? '', todayCourtIntensity: value?.todayCourtIntensity || 'unknown' };
}

export function trainingLogForm(saved, setCount) {
  return { variant: saved?.variant || 'bodyweight', loadBasis: saved?.loadBasis || 'none', loadKg: saved?.loadKg ?? '', resistanceLabel: saved?.resistanceLabel || '',
    sets: saved ? saved.sets.map(set => ({ value: String(set.value), otherSide: set.otherSide === null ? '' : String(set.otherSide) })) : Array.from({ length: setCount }, emptySet),
    rir: saved?.rir ?? '', quality: saved?.quality || 'unknown', symptoms: saved?.symptoms || 'unknown', nextDay: saved?.nextDay || 'pending' };
}
