export const SESSION_PHASES = ['warmup', 'skill', 'strength', 'accessory', 'recovery', 'cooldown'];
export const SESSION_TYPES = ['training', 'recovery', 'rest'];

export function exercisePhase(day, id, exercise = {}) {
  const explicit = day.prescriptions?.find(dose => dose.id === id)?.phase;
  if (SESSION_PHASES.includes(explicit)) return explicit;
  if (day.sessionType === 'recovery') return 'recovery';
  if (exercise.catalogCode === 'D09') return 'cooldown';
  if (['B07', 'B08', 'B09', 'C05', 'C06', 'C07', 'C08', 'C09'].includes(exercise.catalogCode)) return 'accessory';
  if (exercise.category === 'warmup') return 'warmup';
  if (['footwork', 'reaction', 'power'].includes(exercise.category) || exercise.type === 'power') return 'skill';
  if (exercise.category === 'recovery') return 'cooldown';
  if (['lower', 'upper'].includes(exercise.category) || ['lower', 'upper_pull', 'upper_push'].includes(exercise.type)) return 'strength';
  if (exercise.type === 'mobility') return id === 'stretch_10m' ? 'cooldown' : 'warmup';
  return 'accessory';
}

export function orderedRoutine(day, exercises) {
  return [...day.routine].sort((a, b) => SESSION_PHASES.indexOf(exercisePhase(day, a, exercises[a])) - SESSION_PHASES.indexOf(exercisePhase(day, b, exercises[b])));
}

export function syncSessionType(day, exercises) {
  if (!day.sessionType && !day.prescriptions?.some(dose => dose.phase)) return day;
  const activePhases = day.routine.map(id => exercisePhase({ ...day, sessionType: 'training' }, id, exercises[id]));
  return { ...day, sessionType: day.routine.length === 0 ? 'rest' : activePhases.some(phase => ['skill', 'strength', 'accessory'].includes(phase)) ? 'training' : 'recovery' };
}

export function moveWithinPhase(day, id, direction, exercises) {
  const routine = [...day.routine];
  const phase = exercisePhase(day, id, exercises[id]);
  const positions = routine.map((item, index) => ({ item, index })).filter(({ item }) => exercisePhase(day, item, exercises[item]) === phase);
  const position = positions.findIndex(item => item.item === id);
  const other = positions[position + direction];
  if (position < 0 || !other) return day;
  const current = positions[position].index;
  [routine[current], routine[other.index]] = [routine[other.index], routine[current]];
  return { ...day, routine };
}
