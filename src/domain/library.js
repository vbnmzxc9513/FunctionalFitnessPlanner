// Personal organization is independent of catalog eligibility and prescriptions.
export const LIBRARY_PURPOSES = ['warmup', 'training', 'cooldown'];

export function libraryGroups(exercise = {}) {
  if (!Array.isArray(exercise?.libraryGroups)) return [];
  return LIBRARY_PURPOSES.filter(group => exercise.libraryGroups.includes(group));
}

export function suggestedUses(id, exercise = {}) {
  const code = exercise.catalogCode || (typeof id === 'string' && id.startsWith('bf_') ? id.slice(3) : '');
  // These unloaded mobility drills also occupy the existing template's recovery slots.
  if (['D09', 'A02', 'A03', 'A04', 'A05', 'A06', 'A09', 'A10', 'A11', 'A14', 'A15'].includes(code)) return ['warmup', 'cooldown'];
  // Scapular control and light shoulder rotation can be preparation or accessory work.
  if (['A07', 'A08'].includes(code)) return ['warmup', 'training'];
  if (exercise.category === 'warmup') return ['warmup'];
  if (exercise.category === 'recovery') return ['cooldown'];
  if (exercise.type === 'mobility') return ['warmup', 'cooldown'];
  return ['training'];
}

// In all: inferred uses plus explicit personal uses. In mine: explicit uses only.
// A disabled exercise remains discoverable; callers separately enforce planning eligibility.
export function matchesLibraryPurpose(id, exercise = {}, purpose = 'all', scope = 'all') {
  if (exercise.deleted) return false;
  const groups = libraryGroups(exercise);
  if (scope === 'mine' && groups.length === 0) return false;
  if (!purpose || purpose === 'all') return true;
  if (!LIBRARY_PURPOSES.includes(purpose)) return false;
  const uses = scope === 'mine' ? groups : [...new Set([...suggestedUses(id, exercise), ...groups])];
  return uses.includes(purpose);
}
