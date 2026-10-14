const string = { type: 'STRING' };
const integer = { type: 'INTEGER' };
const boolean = { type: 'BOOLEAN' };
const dose = {
  type: 'OBJECT', properties: {
    id: string, sets: integer, value: string,
    unit: { type: 'STRING', enum: ['reps', 'seconds', 'minutes', 'breaths'] },
    restSeconds: integer, perSide: boolean,
    phase: { type: 'STRING', enum: ['warmup', 'skill', 'strength', 'accessory', 'recovery', 'cooldown'] },
    preparation: { type: 'OBJECT', properties: { sets: integer, value: string,
      unit: { type: 'STRING', enum: ['reps', 'seconds', 'breaths'] }, restSeconds: integer, perSide: boolean, instruction: string },
    required: ['sets', 'value', 'unit', 'restSeconds', 'perSide', 'instruction'] },
  }, required: ['id', 'sets', 'value', 'unit', 'restSeconds', 'perSide', 'phase'],
};
export const planSchema = {
  type: 'OBJECT', properties: {
    conclusion: string,
    schedule: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      day: integer, name: string, theme: string, concept: string, coachAdvice: string,
      sessionType: { type: 'STRING', enum: ['training', 'recovery', 'rest'] },
      warmupNote: string, cooldownNote: string,
      routine: { type: 'ARRAY', items: string }, prescriptions: { type: 'ARRAY', items: dose },
    }, required: ['day', 'name', 'theme', 'concept', 'coachAdvice', 'sessionType', 'warmupNote', 'cooldownNote', 'routine', 'prescriptions'] } },
  }, required: ['conclusion', 'schedule'],
};
