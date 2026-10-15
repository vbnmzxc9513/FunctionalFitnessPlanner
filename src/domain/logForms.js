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
    symptoms: form.symptoms, yesterdayCourtMinutes: form.yesterdayCourt === 'none' ? 0 : form.yesterdayCourt === 'unknown' ? null : optionalNumber(form.yesterdayCourtMinutes), yesterdayCourtRpe: ['none', 'unknown'].includes(form.yesterdayCourt) ? null : optionalNumber(form.yesterdayCourtRpe),
    todayCourtIntensity: form.todayCourtIntensity, schemaVersion: 1 };
}

export function readinessForm(value) {
  return { sleepHours: value?.sleepHours ?? '', fatigue: value?.fatigue ?? '', soreness: value?.soreness ?? '', symptoms: value?.symptoms || 'unknown',
    yesterdayCourt: value?.yesterdayCourtMinutes === 0 ? 'none' : value?.yesterdayCourtMinutes > 0 ? 'yes' : 'unknown',
    yesterdayCourtMinutes: value?.yesterdayCourtMinutes ?? '', yesterdayCourtRpe: value?.yesterdayCourtRpe ?? '', todayCourtIntensity: value?.todayCourtIntensity || 'unknown' };
}

export function trainingLogForm(saved, setCount) {
  return { variant: saved?.variant || 'bodyweight', loadBasis: saved?.loadBasis || 'none', loadKg: saved?.loadKg ?? '', resistanceLabel: saved?.resistanceLabel || '',
    sets: saved ? saved.sets.map(set => ({ value: String(set.value), otherSide: set.otherSide === null ? '' : String(set.otherSide) })) : Array.from({ length: setCount }, emptySet),
    rir: saved?.rir ?? '', quality: saved?.quality || 'unknown', symptoms: saved?.symptoms || 'unknown', nextDay: saved?.nextDay || 'pending' };
}

export function readinessMissing(input) {
  const fields = ['sleepHours', 'fatigue', 'soreness'].filter(key => input[key] === null);
  if (input.symptoms === 'unknown') fields.push('symptoms');
  if (input.yesterdayCourtMinutes === null) fields.push('yesterdayCourt');
  if (input.yesterdayCourtMinutes > 0 && input.yesterdayCourtRpe === null) fields.push('yesterdayCourtRpe');
  if (input.todayCourtIntensity === 'unknown') fields.push('todayCourtIntensity');
  return fields;
}

export function readinessChanges(original, adapted) {
  if (!original || !adapted) return [];
  const changes = [];
  for (const id of original.routine) {
    if (!adapted.routine.includes(id)) { changes.push({ id, removed: true }); continue; }
    const before = original.prescriptions?.find(dose => dose.id === id);
    const after = adapted.prescriptions?.find(dose => dose.id === id);
    if (before && after && (before.sets !== after.sets || before.value !== after.value || before.unit !== after.unit || before.perSide !== after.perSide || before.restSeconds !== after.restSeconds || JSON.stringify(before.preparation) !== JSON.stringify(after.preparation))) changes.push({ id, before, after });
  }
  return changes;
}
