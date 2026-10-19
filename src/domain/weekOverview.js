import { matchesTrainingTarget } from './trainingTargets.js';
import { dateForWeekDay } from './dates.js';
import { sessionSections, estimateSessionMinutes } from './sessions.js';
import { classifyBalanceExercise } from './weeklyBalance.js';
import { normalizeWeeklyIntent } from './trainingPreferences.js';

// Derive the overview from saved work, never from unsaved controls or AI prose.
export function buildWeekOverview(schedule, exercises, week, intent, level = 1) {
  const saved = normalizeWeeklyIntent(intent);
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = index + 1;
    const entry = schedule.find(item => item.day === day);
    const sections = entry ? sessionSections(entry, exercises, level) : [];
    const ids = phases => sections.filter(section => phases.includes(section.phase)).flatMap(section => section.items.map(item => item.id));
    const main = ids(['strength', 'accessory', 'skill']);
    const strength = ids(['strength']);
    const skill = ids(['skill']);
    const type = !entry ? 'unplanned' : !entry.routine.length ? 'rest' : entry.sessionType === 'recovery' ? 'recovery' : strength.length ? 'strength' : skill.length ? 'skill' : 'training';
    return { day, date: dateForWeekDay(week, day), court: saved ? saved.badmintonDays.includes(day) : null,
      type, minutes: entry ? estimateSessionMinutes(entry, exercises, level) : null, main, strength, skill, targetMain: ids(['strength', 'accessory']),
      warmup: ids(['warmup']), cooldown: ids(['cooldown']), recovery: ids(['recovery']),
      preparation: sections.flatMap(section => section.preparation.map(item => item.id)), entry };
  });
  const targetCoverage = (saved?.targetRegions || []).map(region => ({ region,
    days: days.filter(day => day.targetMain.some(id => matchesTrainingTarget(region, id, exercises[id]))).map(day => day.day) }));
  const stiffnessCoverage = (saved?.stiffnessRegions || []).map(region => ({ region,
    days: days.filter(day => [...day.warmup, ...day.cooldown, ...day.recovery].some(id => classifyBalanceExercise(id, exercises[id]).mobility.includes(region))).map(day => day.day) }));
  const counts = Object.fromEntries(['strength', 'skill', 'training', 'recovery', 'rest'].map(type => [type, days.filter(day => type === 'strength' ? day.strength.length > 0 : type === 'skill' ? day.skill.length > 0 : day.type === type).length]));
  return { intent: saved, days, counts, targetCoverage, stiffnessCoverage,
    minutes: days.reduce((sum, day) => sum + (day.minutes || 0), 0),
    competitionInWeek: !!saved?.competitionDate && saved.competitionDate >= days[0].date && saved.competitionDate <= days[6].date };
}
