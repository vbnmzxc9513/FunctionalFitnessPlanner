import { matchesTrainingTarget } from './trainingTargets.js';
import { recoveryDecision } from './recovery.js';
import { catalogExercises, equipmentChoices } from './exerciseCatalog.js';
import { classifyBalanceExercise } from './weeklyBalance.js';
import { libraryGroups, suggestedUses } from './library.js';
import { normalizePlanningContext, competitionDaysAway } from './planning.js';
import { dateForWeekDay } from './dates.js';
import { weeklyChoiceIds } from './trainingPreferences.js';
import { estimateSessionMinutes } from './sessions.js';
import { SESSION_PHASES } from './phases.js';

const CURATED = catalogExercises();

export function weeklyChoicePhase(id, exercise) {
  if (!exercise || CURATED[id]?.catalogCode !== exercise.catalogCode || !exercise.prescription) return null;
  if (exercise.catalogCode === 'D09') return 'cooldown';
  if (['A07', 'A08', 'B07', 'B08', 'C05', 'C06', 'C07', 'C08', 'C09'].includes(exercise.catalogCode)) return 'accessory';
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
  if (['A01', 'I01'].includes(exercise.catalogCode)) return 'stretch_opening';
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
    const protectedWeek = (plan.schedule || []).length > 0 && plan.schedule.every(day => {
      const away = competitionDaysAway(context.competitionDate, day.date || dateForWeekDay(week, day.day));
      return away !== null && away <= 10 && away >= -5;
    });
    const fixedOpening = weeklyChoicePhase(id, exercises[id]) === 'warmup' && (plan.schedule || []).some(day => day.routine.some(item => exercises[item]?.sequenceMinutes)) && !(plan.schedule || []).some(day => day.sessionType === 'training' && !day.routine.some(item => exercises[item]?.sequenceMinutes));
    const noStrength = weeklyChoicePhase(id, exercises[id]) === 'strength' && !(plan.schedule || []).some(day => day.prescriptions?.some(dose => dose.phase === 'strength'));
    return { id, days, reason: blocked || (source !== 'template' ? 'omitted' : protectedWeek ? 'competition' : noStrength ? 'no_strength' : fixedOpening ? 'warmup_flow' : !conditionsKnown ? 'conditions_unknown'
      : recoveryDecision(context).action !== 'normal' ? 'recovery' : 'capacity') };
  });
}

// Schedule fresh choices before repeating selected defaults. Main patterns remain
// complementary; a spare accessory slot can take one selected assistance lift.
// Recovery days only accept comfortable mobility, never strength or skill work.
export function applyWeeklyChoices(day, available, ids, used, lang = 'zh', minutes = Infinity) {
  if (day.sessionType === 'rest') return day;
  const selected = weeklyChoiceIds(ids);
  const recovery = day.sessionType === 'recovery';
  const locked = new Set(day.prescriptions.filter(dose => selected.includes(dose.id) && !used.has(dose.id)).map(dose => dose.id));
  const pending = selected.filter(id => !day.routine.includes(id) && !used.has(id) && available[id]);
  for (const id of pending) {
    const exercise = available[id];
    const phase = weeklyChoicePhase(id, exercise);
    if (!phase || phase === 'recovery' || ['A01', 'I01'].includes(exercise.catalogCode)) continue;
    if (recovery && (!['warmup', 'cooldown'].includes(phase) || !['warmup', 'recovery', 'core'].includes(exercise.category))) continue;
    const patterns = classifyBalanceExercise(id, exercise).patterns;
    let index = exercise.sequenceMinutes ? day.prescriptions.findIndex(dose => available[dose.id]?.sequenceMinutes && !locked.has(dose.id)) : -1;
    if (index < 0) index = day.prescriptions.findIndex(dose => {
      if (locked.has(dose.id) || available[dose.id]?.sequenceMinutes || available[dose.id]?.catalogCode === 'A01') return false;
      if (['warmup', 'cooldown'].includes(phase)) return dose.phase === phase || recovery && dose.phase === 'recovery';
      if (phase === 'accessory') return dose.phase === 'accessory';
      if (dose.phase !== phase) return false;
      const existing = available[dose.id];
      return patterns.length ? classifyBalanceExercise(dose.id, existing).patterns.some(pattern => patterns.includes(pattern)) : existing?.category === exercise.category;
    });
    if (index < 0 && !recovery && phase === 'strength') index = day.prescriptions.findIndex(dose => dose.phase === 'accessory' && !selected.includes(dose.id));
    // The fixed flow stays intact. Explicit single stretches can use a spare
    // mobility/finish slot rather than being silently ignored by the flow.
    if (index < 0 && !recovery && phase === 'warmup' && !exercise.sequenceMinutes) index = day.prescriptions.findIndex(dose => dose.phase === 'cooldown' && available[dose.id]?.catalogCode === 'D09' && !selected.includes(dose.id));
    const extraMobility = index < 0 && recovery && day.routine.length < 3;
    if (index < 0 && !extraMobility) continue;
    const old = index >= 0 ? day.prescriptions[index] : null;
    const base = exercise.prescription;
    const value = !exercise.sequenceMinutes && old?.unit === base.unit ? String(Math.min(...String(old.value).split(/[–-]/).map(Number), ...String(base.value).split(/[–-]/).map(Number))) : base.value;
    const targetPhase = recovery ? 'recovery' : phase === 'warmup' ? 'warmup' : old.phase;
    const replacement = { id, ...base, phase: targetPhase, sets: Math.min(old?.sets || 1, base.sets), value, restSeconds: exercise.sequenceMinutes ? base.restSeconds : Math.max(old?.restSeconds || 0, base.restSeconds) };
    const prescriptions = [...day.prescriptions];
    if (old) prescriptions[index] = replacement; else prescriptions.push(replacement);
    prescriptions.sort((a, b) => SESSION_PHASES.indexOf(a.phase) - SESSION_PHASES.indexOf(b.phase));
    const candidate = { ...day, prescriptions, routine: prescriptions.map(dose => dose.id) };
    const budget = Math.max(minutes, estimateSessionMinutes(day, available));
    while (!recovery && estimateSessionMinutes(candidate, available) > budget) {
      const optional = candidate.prescriptions.findIndex(dose => ['skill', 'cooldown'].includes(dose.phase) && !selected.includes(dose.id));
      if (optional < 0) break;
      const [removed] = candidate.prescriptions.splice(optional, 1);
      candidate.routine = candidate.routine.filter(item => item !== removed.id);
    }
    if (candidate.routine.length > 8 || estimateSessionMinutes(candidate, available) > budget) continue;
    day.prescriptions = candidate.prescriptions; day.routine = candidate.routine;
    if (targetPhase === 'warmup') day.warmupNote = lang === 'en'
      ? 'Follow the listed dynamic stretches and any listed light lift preparation. No extra movements are added.'
      : '依序做列出的動態拉伸與主項輕準備組（有列出時）；不另加動作。';
    if (targetPhase === 'cooldown') day.cooldownNote = lang === 'en'
      ? `Finish with ${exercise.nameEn || exercise.name} at an easy range; it may be omitted. No additional cooldown is required.`
      : `本次收尾安排「${exercise.name}」，保持舒適、可依感受省略；不需另補收操。`;
    locked.add(id);
  }
  return day;
}
