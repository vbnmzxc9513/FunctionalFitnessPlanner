import { matchesTrainingTarget } from './trainingTargets.js';
import { recoveryDecision } from './recovery.js';
import { catalogExercises, equipmentChoices } from './exerciseCatalog.js';
import { classifyBalanceExercise } from './weeklyBalance.js';
import { libraryGroups, suggestedUses } from './library.js';
import { normalizePlanningContext, competitionDaysAway } from './planning.js';
import { dateForWeekDay } from './dates.js';
import { weeklyChoiceIds } from './trainingPreferences.js';

const CURATED = catalogExercises();

export function weeklyChoicePhase(id, exercise) {
  if (!exercise || CURATED[id]?.catalogCode !== exercise.catalogCode || !exercise.prescription) return null;
  if (exercise.catalogCode === 'D09') return 'cooldown';
  if (['power', 'footwork', 'reaction'].includes(exercise.category)) return 'skill';
  if (['lower', 'upper'].includes(exercise.category)) return 'strength';
  if (exercise.category === 'core') return exercise.type === 'mobility' ? 'cooldown' : 'accessory';
  if (exercise.catalogCode === 'I01') return 'recovery';
  if (exercise.category === 'conditioning') return null;
  return suggestedUses(id, exercise).includes('warmup') ? 'warmup' : 'cooldown';
}

// The caller supplies the same clinically conservative availability used by manual planning.
export function weeklyChoiceBlockReason(id, exercises, context, available) {
  const exercise = exercises[id];
  const profile = normalizePlanningContext(context);
  if (!exercise || exercise.deleted || exercise.active === false) return 'unavailable';
  if (!weeklyChoicePhase(id, exercise)) return 'metadata';
  if (exercise.advanced && profile.experience === 'beginner') return 'experience';
  if (exercise.requiresPartner && !profile.partnerAvailable) return 'partner';
  if (!equipmentChoices(exercise, profile.equipment).length) return 'equipment';
  if (!Object.hasOwn(available, id)) return 'health';
  return null;
}

export function recommendWeeklyChoices(exercises, context, focus, available) {
  const targets = context.targetRegions || [];
  const score = ([id, exercise]) => {
    const purpose = classifyBalanceExercise(id, exercise);
    return Number(targets.some(region => matchesTrainingTarget(region, id, exercise))) * 8
      + Number(libraryGroups(exercise).length > 0) * 3
      + Number(focus === 'coordination' && ['footwork', 'reaction'].includes(exercise.category)) * 4
      + Number(focus === 'stability' && ['B05', 'D01', 'D04', 'E01'].includes(exercise.catalogCode)) * 4
      + Number(purpose.mobility.some(region => context.stiffnessRegions?.includes(region))) * 4;
  };
  return Object.entries(exercises).filter(([id]) => !weeklyChoiceBlockReason(id, exercises, context, available))
    .sort((a, b) => score(b) - score(a) || a[0].localeCompare(b[0])).map(([id]) => id);
}

export function weeklyChoiceCoverage(ids, exercises) {
  return [...new Set(weeklyChoiceIds(ids).flatMap(id => classifyBalanceExercise(id, exercises[id]).patterns))];
}

export function buildWeeklyChoiceReport(plan, exercises, context = {}, available = {}, week, source = 'template') {
  return weeklyChoiceIds(plan?.weeklyIntent?.weeklyExerciseIds).map(id => {
    const days = (plan.schedule || []).filter(day => day.routine.includes(id)).map(day => day.day);
    if (days.length) return { id, days, reason: 'planned' };
    if (!week) return { id, days, reason: 'omitted' };
    const conditionsKnown = Array.isArray(context.equipment);
    const blocked = conditionsKnown ? weeklyChoiceBlockReason(id, exercises, context, available) : null;
    const protectedWeek = [1, 2, 3, 4, 5].some(day => {
      const away = competitionDaysAway(context.competitionDate, dateForWeekDay(week, day));
      return away !== null && away <= 10 && away >= -5;
    });
    const fixedOpening = weeklyChoicePhase(id, exercises[id]) === 'warmup' && (plan.schedule || []).some(day => day.routine.some(item => exercises[item]?.sequenceMinutes)) && !(plan.schedule || []).some(day => day.sessionType === 'training' && !day.routine.some(item => exercises[item]?.sequenceMinutes));
    const noStrength = weeklyChoicePhase(id, exercises[id]) === 'strength' && !(plan.schedule || []).some(day => day.prescriptions?.some(dose => dose.phase === 'strength'));
    return { id, days, reason: blocked || (source !== 'template' ? 'omitted' : protectedWeek ? 'competition' : noStrength ? 'no_strength' : fixedOpening ? 'warmup_flow' : !conditionsKnown ? 'conditions_unknown'
      : recoveryDecision(context).action !== 'normal' ? 'recovery' : 'capacity') };
  });
}

const phaseIsWarmup = exercise => exercise.category === 'warmup';

// Substitute an existing compatible slot; never add work or let a preference open a protected day.
export function applyWeeklyChoices(day, available, ids, used, lang = 'zh') {
  if (day.sessionType !== 'training') return day;
  const selected = weeklyChoiceIds(ids);
  const locked = new Set(day.prescriptions.filter(dose => selected.includes(dose.id)).map(dose => dose.id));
  const pending = selected.filter(id => !day.routine.includes(id) && available[id])
    .sort((a, b) => Number(used.has(a)) - Number(used.has(b)));
  for (const id of pending) {
    const exercise = available[id];
    // Keep the user's eight-part opening intact; preferences cannot replace it with running.
    if (phaseIsWarmup(exercise) && day.routine.some(item => available[item]?.sequenceMinutes)) continue;
    const phase = weeklyChoicePhase(id, exercise);
    const patterns = classifyBalanceExercise(id, exercise).patterns;
    const index = day.prescriptions.findIndex(dose => {
      if (locked.has(dose.id) || available[dose.id]?.sequenceMinutes || available[dose.id]?.catalogCode === 'A01') return false;
      if (['warmup', 'cooldown'].includes(phase)) return dose.phase === phase;
      if (phase === 'recovery' || !phase) return false;
      if (phase === 'accessory' && !['accessory', 'strength'].includes(dose.phase) || phase !== 'accessory' && dose.phase !== phase) return false;
      const existing = available[dose.id];
      return patterns.length ? classifyBalanceExercise(dose.id, existing).patterns.some(pattern => patterns.includes(pattern)) : existing?.category === exercise.category;
    });
    if (index < 0) continue;
    const old = day.prescriptions[index];
    const base = exercise.prescription;
    const value = !exercise.sequenceMinutes && old.unit === base.unit ? String(Math.min(...old.value.split(/[–-]/).map(Number), ...base.value.split(/[–-]/).map(Number))) : base.value;
    day.prescriptions[index] = { id, ...base, phase: old.phase, sets: Math.min(old.sets, base.sets), value, restSeconds: exercise.sequenceMinutes ? base.restSeconds : Math.max(old.restSeconds, base.restSeconds) };
    day.routine = day.routine.map(item => item === old.id ? id : item);
    if (old.phase === 'warmup') day.warmupNote = lang === 'en'
      ? 'Follow the listed dynamic stretches and any listed light lift preparation. No extra movements are added.'
      : '依序做列出的動態拉伸與主項輕準備組（有列出時）；不另加動作。';
    if (old.phase === 'cooldown') day.cooldownNote = lang === 'en'
      ? `Finish with ${exercise.nameEn || exercise.name} at an easy range; it may be omitted. No additional cooldown is required.`
      : `本次收尾安排「${exercise.name}」，保持舒適、可依感受省略；不需另補收操。`;
    locked.add(id);
  }
  return day;
}
