// Notes are supplementary information, not an unrestricted language classifier.
export const RECOVERY_STATES = ['unknown', 'normal', 'reduce', 'recover'];
const POSITIVE = /^(?:無|沒有|正常|沒有疲勞|不疲勞|不累|睡得很好|精神很好|none|normal|not tired|no fatigue|well rested|slept well)[。.!\s]*$/i;
const FATIGUE = /有點累|很累|疲勞|睡不好|睡眠不足|腿.*(?:沉|重)|疲憊|\btired\b|\bfatigued?\b|poor sleep|sleep deprived/i;

export function recoveryDecision(context = {}) {
  const state = RECOVERY_STATES.includes(context.recoveryState) ? context.recoveryState : 'unknown';
  const notes = String(context.recoveryNotes || '').trim();
  const clauses = notes.split(/[，,。.!！？;；\n]/).map(clause => clause.trim()).filter(Boolean);
  const fatigueText = notes.replace(/(?:沒有|無|不覺得|不)(?:明顯)?(?:疲勞|疲憊)|不累|沒有睡不好|沒有睡眠不足|\b(?:no fatigue|not fatigued|not tired|not sleep deprived)\b/gi, '');
  const noteFatigue = FATIGUE.test(fatigueText);
  const positive = clauses.length > 0 && clauses.every(clause => POSITIVE.test(clause));
  const soreness = context.sorenessRegions?.length > 0;
  // Unclear or movement-limiting soreness does not authorize loaded work.
  const limited = soreness && context.sorenessImpact !== 'mild';
  const action = limited || state === 'recover' ? 'recover' : state === 'reduce' || (state === 'unknown' && noteFatigue) || soreness ? 'reduce' : 'normal';
  return { action, limited, notesUninterpreted: !!notes && state === 'unknown' && !positive && !noteFatigue };
}
