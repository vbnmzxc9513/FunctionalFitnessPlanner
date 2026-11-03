import { dailyWarmupPrescriptions } from '../../src/domain/quickWorkouts.js';
import { createManualSession } from '../../src/domain/manualPlanner.js';

/** Public synthetic plan; no personal facts or medical fixtures. */
export function largePlannerDay(date = '2026-11-02', count = 24) {
  const strengthIds = ['bf_B01', 'bf_B02', 'bf_B03', 'bf_B04', 'bf_B05', 'bf_B06', 'bf_B07', 'bf_B08', 'bf_B09', 'bf_B10', 'bf_B11', 'bulgarian', 'bf_C01', 'bf_C02'];
  const strength = strengthIds.map(id => ({ id, phase: 'strength', sets: 1, value: '2', unit: 'reps', restSeconds: 0, perSide: false,
    preparation: { sets: 1, value: '2', unit: 'reps', restSeconds: 0, perSide: false, instruction: 'Use light resistance.' } }));
  const cooldown = ['bf_H01', 'bf_H02'].map(id => ({ id, phase: 'cooldown', sets: 1, value: '10', unit: 'seconds', restSeconds: 0, perSide: true }));
  const prescriptions = [...dailyWarmupPrescriptions(), ...strength.slice(0, count - 10), ...cooldown];
  return { ...createManualSession(date), sessionType: 'training', routine: prescriptions.map(dose => dose.id), prescriptions };
}
