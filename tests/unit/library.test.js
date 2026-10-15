import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryGroups, suggestedUses, matchesLibraryPurpose } from '../../src/domain/library.js';
import { LIBRARY_TEXT } from '../../src/libraryLocale.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { generateTemplatePlan } from '../../src/domain/templatePlanner.js';

test('personal uses sanitize invalid values, remove duplicates and keep stable purpose order', () => {
  assert.deepEqual(libraryGroups({ libraryGroups: ['cooldown', 'invalid', 'warmup', 'warmup', null, 3] }), ['warmup', 'cooldown']);
  for (const libraryGroupsValue of [null, undefined, 'training', {}, 3]) assert.deepEqual(libraryGroups({ libraryGroups: libraryGroupsValue }), []);
  assert.deepEqual(libraryGroups(null), []);
});

test('suggested uses support breathing and mobility in multiple parts without changing a prescription', () => {
  assert.deepEqual(suggestedUses('bf_D09', { category: 'core' }), ['warmup', 'cooldown']);
  assert.deepEqual(suggestedUses('bf_A01', { category: 'warmup', type: 'mobility' }), ['warmup']);
  assert.deepEqual(suggestedUses('bf_H01', { category: 'recovery', type: 'mobility' }), ['cooldown']);
  assert.deepEqual(suggestedUses('legacy_mobility', { type: 'mobility' }), ['warmup', 'cooldown']);
  assert.deepEqual(suggestedUses('bf_B10', { category: 'lower' }), ['training']);
});

test('mine uses explicit personal groups; all combines suggested and personal uses', () => {
  const movement = { category: 'lower', libraryGroups: ['warmup', 'cooldown'], active: false };
  assert.equal(matchesLibraryPurpose('bf_B01', movement, 'training', 'all'), true);
  assert.equal(matchesLibraryPurpose('bf_B01', movement, 'warmup', 'all'), true);
  assert.equal(matchesLibraryPurpose('bf_B01', movement, 'training', 'mine'), false);
  assert.equal(matchesLibraryPurpose('bf_B01', movement, 'warmup', 'mine'), true);
  assert.equal(matchesLibraryPurpose('bf_B01', movement, 'cooldown', 'mine'), true);
  assert.equal(matchesLibraryPurpose('bf_B01', movement, 'all', 'mine'), true);
  assert.equal(matchesLibraryPurpose('bf_B01', { active: true }, 'all', 'mine'), false);
  assert.equal(matchesLibraryPurpose('bf_B01', { ...movement, deleted: true }, 'all', 'mine'), false);
  assert.equal(matchesLibraryPurpose('bf_B01', movement, 'invalid'), false);
});

test('favorites remain separate from active status and do not mutate the movement', () => {
  const movement = { category: 'lower', active: false, prescription: { sets: 2 }, libraryGroups: ['training'] };
  const before = structuredClone(movement);
  assert.equal(matchesLibraryPurpose('bf_B01', movement, 'training', 'mine'), true);
  assert.deepEqual(movement, before);
  assert.equal(matchesLibraryPurpose('bf_B01', { ...movement, libraryGroups: [] }, 'all', 'mine'), false);
  assert.equal(matchesLibraryPurpose('bf_B01', { ...movement, libraryGroups: [] }, 'training', 'all'), true);
});

test('library controls and purpose names cover both languages', () => {
  assert.deepEqual(Object.keys(LIBRARY_TEXT.zh).sort(), Object.keys(LIBRARY_TEXT.en).sort());
  for (const text of Object.values(LIBRARY_TEXT)) for (const key of ['warmup', 'training', 'cooldown', 'mine', 'login', 'organize']) assert.ok(text[key].length > 0);
});


test('light mobility supports warm-up and cool-down while shoulder accessory drills remain out of cool-down', () => {
  const catalog = catalogExercises();
  for (const code of ['A02', 'A03', 'A04', 'A05', 'A06', 'A09', 'A10', 'A11']) {
    const id = `bf_${code}`;
    assert.deepEqual(suggestedUses(id, catalog[id]), ['warmup', 'cooldown']);
  }
  for (const code of ['A07', 'A08']) {
    const id = `bf_${code}`;
    assert.deepEqual(suggestedUses(id, catalog[id]), ['warmup', 'training']);
    assert.equal(matchesLibraryPurpose(id, catalog[id], 'cooldown'), false);
  }
});

test('normal templates expose their actual cool-down and recovery mobility in the cool-down library', () => {
  const catalog = catalogExercises();
  const profile = { badmintonDays: [2, 4, 5], badmintonMinutes: 90, badmintonIntensity: 'mixed', equipment: ['dumbbell', 'band', 'cable', 'foam_roller'], healthStatus: 'unrestricted', experience: 'beginner' };
  const options = { currentDate: '2026-10-12', currentWeek: '2026-W42' };
  const seen = new Set();
  // Exercise unavailable alternatives too: rotation must stay discoverable after choosing a fallback.
  for (const excluded of [[], ['bf_A11'], ['bf_A11', 'bf_A06', 'bf_H12'], ['bf_A05']]) {
    const available = Object.fromEntries(Object.entries(catalog).filter(([id]) => !excluded.includes(id)));
    const plan = generateTemplatePlan(available, profile, 35, 'zh', options);
    const coolDowns = plan.schedule.flatMap(day => day.prescriptions.filter(dose => dose.phase === 'cooldown'));
    assert.ok(coolDowns.length > 0, 'a normal eligible week must exercise the cool-down assertion');
    const mobility = plan.schedule.flatMap(day => day.prescriptions.filter(dose => dose.phase === 'recovery' && available[dose.id].type === 'mobility'));
    for (const dose of [...coolDowns, ...mobility]) {
      seen.add(dose.id);
      assert.equal(matchesLibraryPurpose(dose.id, available[dose.id], 'cooldown'), true, `${dose.id} must be discoverable where its prescribed purpose is shown`);
    }
  }
  for (const id of ['bf_A11', 'bf_A06', 'bf_A10', 'bf_A03', 'bf_A05']) assert.ok(seen.has(id), `${id} should be exercised by a real template`);
});
