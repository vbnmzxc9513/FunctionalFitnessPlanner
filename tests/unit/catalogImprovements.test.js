import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises, eligibleExercises } from '../../src/domain/exerciseCatalog.js';
import { getExerciseGuide } from '../../src/data/exerciseGuides.js';
import { BODY_PARTS, exerciseBodyParts, matchesBodyPart, matchesExerciseQuery } from '../../src/domain/exerciseTags.js';
import { LIBRARY_EQUIPMENT_FILTERS, matchesEquipmentFilter, suggestedUses } from '../../src/domain/library.js';
import { weeklyChoiceBlockReason } from '../../src/domain/weeklyChoices.js';
import { addManualExercises, createManualSession } from '../../src/domain/manualPlanner.js';
import { createPlanPayload, rebuildPlanDays, validatePlanPayload } from '../../src/domain/sharedPlans.js';

const NEW_IDS = [
  'bf_C22', 'bf_C23', 'bf_C24', 'bf_C25', 'bf_C26', 'bf_C27',
  'bf_B20', 'bf_B21', 'bf_B22', 'bf_B23',
  'bf_D10', 'bf_D11', 'bf_H13',
];

const catalogZh = catalogExercises('zh');
const catalogEn = catalogExercises('en');

test('all 13 curated exercises exist in both languages with complete schema and bilingual guides', () => {
  for (const id of NEW_IDS) {
    const zh = catalogZh[id];
    const en = catalogEn[id];
    assert.ok(zh, `Missing ${id} in zh catalog`);
    assert.ok(en, `Missing ${id} in en catalog`);
    assert.equal(zh.active, true, `${id} should be active`);
    assert.equal(zh.requiresPartner, false, `${id} should not require a partner`);
    assert.equal(zh.jumpContacts, 0, `${id} should have jumpContacts 0`);
    assert.equal(zh.contentVersion, 1, `${id} should have contentVersion 1`);
    assert.ok(zh.name && en.name && zh.name !== en.name, `${id} needs distinct bilingual names`);
    assert.ok(zh.tip && en.tip, `${id} needs bilingual cues`);
    assert.ok(zh.purpose && en.purpose, `${id} needs bilingual purposes`);
    assert.ok(Array.isArray(zh.equipmentOptions) && zh.equipmentOptions.length > 0, `${id} needs equipmentOptions`);
    assert.ok(zh.prescription && Number.isInteger(zh.prescription.sets), `${id} needs prescription`);

    for (const [lang, ex] of [['zh', zh], ['en', en]]) {
      const { guide } = getExerciseGuide(id, ex, lang);
      assert.ok(guide, `Missing ${lang} guide for ${id}`);
      assert.ok(guide.start.length >= 6);
      assert.ok(guide.steps.length >= 2 && guide.steps.length <= 3);
      assert.ok(guide.mistake.length >= 6);
      assert.ok(guide.easier.length >= 6);
    }
  }
});

test('body-part taxonomy cleans arms pollution and classifies every built-in movement', () => {
  const armIds = Object.entries(catalogZh)
    .filter(([id, ex]) => matchesBodyPart(id, ex, 'arms'))
    .map(([id]) => id)
    .sort();
  assert.deepEqual(armIds, ['bf_C19', 'bf_C20', 'bf_C21']);

  for (const polluted of ['bf_G03', 'bf_G04', 'bf_G05', 'bf_G06', 'bf_C02', 'bf_C03', 'bf_C11', 'bf_C14', 'bf_C17', 'bf_E11']) {
    assert.equal(matchesBodyPart(polluted, catalogZh[polluted], 'arms'), false, `${polluted} must not pollute arms`);
  }

  // Every built-in exercise has at least one real body part (no empty [] and no 'unclassified').
  for (const [id, ex] of Object.entries(catalogZh)) {
    const parts = exerciseBodyParts(id, ex);
    assert.ok(parts.length > 0, `${id} must have at least one body part`);
    assert.equal(parts.includes('unclassified'), false, `${id} must not be unclassified`);
  }

  // Every non-unclassified body part has at least one built-in exercise.
  for (const [key] of BODY_PARTS) {
    if (key === 'unclassified') continue;
    const count = Object.entries(catalogZh).filter(([id, ex]) => matchesBodyPart(id, ex, key)).length;
    assert.ok(count > 0, `Body part ${key} should have at least one built-in exercise`);
  }

  assert.equal(matchesBodyPart('bf_G07', catalogZh.bf_G07, 'full'), true);
  assert.equal(matchesBodyPart('bf_G03', catalogZh.bf_G03, 'full'), true);
  assert.equal(matchesBodyPart('bf_H13', catalogZh.bf_H13, 'neck'), true);
  assert.equal(matchesBodyPart('bf_H13', catalogZh.bf_H13, 'shoulder'), true);
  assert.equal(matchesBodyPart('bf_C22', catalogZh.bf_C22, 'back'), true);
  assert.equal(matchesBodyPart('bf_C22', catalogZh.bf_C22, 'shoulder'), true);
  assert.equal(matchesBodyPart('bf_C23', catalogZh.bf_C23, 'back'), true);
  assert.equal(matchesBodyPart('bf_C24', catalogZh.bf_C24, 'back'), true);
  assert.equal(matchesBodyPart('bf_C25', catalogZh.bf_C25, 'back'), true);
  assert.equal(matchesBodyPart('bf_C25', catalogZh.bf_C25, 'forearm'), true);
  assert.equal(matchesBodyPart('bf_C26', catalogZh.bf_C26, 'chest'), true);
  assert.equal(matchesBodyPart('bf_C26', catalogZh.bf_C26, 'shoulder'), true);
  assert.equal(matchesBodyPart('bf_C27', catalogZh.bf_C27, 'forearm'), true);
  assert.equal(matchesBodyPart('bf_B20', catalogZh.bf_B20, 'adductors'), true);
  assert.equal(matchesBodyPart('bf_B20', catalogZh.bf_B20, 'hip'), true);
  assert.equal(matchesBodyPart('bf_B20', catalogZh.bf_B20, 'core'), true);
  assert.equal(matchesBodyPart('bf_B21', catalogZh.bf_B21, 'hamstrings'), true);
  assert.equal(matchesBodyPart('bf_B21', catalogZh.bf_B21, 'glutes'), true);
  assert.equal(matchesBodyPart('bf_B22', catalogZh.bf_B22, 'hamstrings'), true);
  assert.equal(matchesBodyPart('bf_B22', catalogZh.bf_B22, 'glutes'), true);
  assert.equal(matchesBodyPart('bf_B23', catalogZh.bf_B23, 'calves'), true);
  assert.equal(matchesBodyPart('bf_B23', catalogZh.bf_B23, 'ankle'), true);
  assert.equal(matchesBodyPart('bf_D10', catalogZh.bf_D10, 'core'), true);
  assert.equal(matchesBodyPart('bf_D10', catalogZh.bf_D10, 'hip'), true);
  assert.equal(matchesBodyPart('bf_D11', catalogZh.bf_D11, 'core'), true);
  assert.equal(matchesBodyPart('bf_D11', catalogZh.bf_D11, 'glutes'), true);
});

test('library suggested uses and equipment filtering work accurately for new and existing movements', () => {
  assert.deepEqual(suggestedUses('bf_C22', catalogZh.bf_C22), ['warmup', 'training']);
  assert.deepEqual(suggestedUses('bf_H13', catalogZh.bf_H13), ['cooldown']);
  assert.deepEqual(LIBRARY_EQUIPMENT_FILTERS, ['all', 'bodyweight', 'band', 'dumbbell', 'cable', 'pullup_bar']);

  // Bodyweight filter
  for (const id of ['bf_C22', 'bf_C23', 'bf_C26', 'bf_B20', 'bf_B21', 'bf_B22', 'bf_B23', 'bf_H13']) {
    assert.equal(matchesEquipmentFilter(catalogZh[id], 'bodyweight'), true, `${id} should match bodyweight`);
  }
  assert.equal(matchesEquipmentFilter(catalogZh.bf_C25, 'bodyweight'), false);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_C17, 'bodyweight'), false);

  // Pull-up bar, band, dumbbell, cable filters
  assert.equal(matchesEquipmentFilter(catalogZh.bf_C24, 'pullup_bar'), true);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_C25, 'pullup_bar'), true);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_C25, 'band'), true);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_C27, 'band'), true);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_D10, 'band'), true);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_D10, 'dumbbell'), true);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_B23, 'dumbbell'), true);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_D11, 'band'), true);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_D11, 'cable'), true);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_C22, 'dumbbell'), false);
  assert.equal(matchesEquipmentFilter({ name: 'Legacy custom' }, 'bodyweight'), true);
  assert.equal(matchesEquipmentFilter(catalogZh.bf_C17, 'all'), true);

  // Search works by Chinese/English names and aliases
  assert.equal(matchesExerciseQuery('bf_B20', catalogZh.bf_B20, '哥本哈根', 'zh'), true);
  assert.equal(matchesExerciseQuery('bf_B23', catalogEn.bf_B23, 'Achilles', 'en'), true);
  assert.equal(matchesExerciseQuery('bf_H13', catalogZh.bf_H13, '頸部', 'zh'), true);
});

test('eligibility and weekly block reasons properly distinguish home bodyweight vs advanced/equipment moves', () => {
  const homeBeginner = { healthStatus: 'unrestricted', experience: 'beginner', equipment: [], badmintonDays: [] };
  const homeAvailable = eligibleExercises(catalogZh, homeBeginner);
  for (const id of ['bf_C22', 'bf_C23', 'bf_C26', 'bf_B20', 'bf_B21', 'bf_B22', 'bf_B23', 'bf_H13']) {
    assert.ok(homeAvailable[id], `${id} should be eligible at home for a beginner`);
    assert.equal(weeklyChoiceBlockReason(id, catalogZh, homeBeginner, homeAvailable), null, `${id} should not be blocked`);
  }

  // Pull-up is blocked for beginners (experience) and without pullup_bar (equipment)
  assert.equal(weeklyChoiceBlockReason('bf_C25', catalogZh, homeBeginner, homeAvailable), 'experience');
  const noBarInter = { healthStatus: 'unrestricted', experience: 'intermediate', equipment: ['band'], badmintonDays: [] };
  assert.equal(weeklyChoiceBlockReason('bf_C25', catalogZh, noBarInter, eligibleExercises(catalogZh, noBarInter)), 'equipment');

  const fullGymInter = { healthStatus: 'unrestricted', experience: 'intermediate', equipment: ['pullup_bar', 'band', 'dumbbell', 'cable', 'platform', 'racket'], badmintonDays: [] };
  const fullAvailable = eligibleExercises(catalogZh, fullGymInter);
  for (const id of NEW_IDS) {
    assert.ok(fullAvailable[id], `${id} should be eligible with full equipment`);
    assert.equal(weeklyChoiceBlockReason(id, catalogZh, fullGymInter, fullAvailable), null, `${id} should have no weekly block`);
  }

  // Restricted shoulder status allows non-shoulder-loaded bodyweight exercises, blocks shoulderLoaded ones
  const restricted = { healthStatus: 'restricted', experience: 'intermediate', equipment: ['pullup_bar', 'band', 'dumbbell'], badmintonDays: [] };
  const restrictedAvailable = eligibleExercises(catalogZh, restricted);
  for (const id of ['bf_C22', 'bf_C23', 'bf_B20', 'bf_B21', 'bf_B22', 'bf_B23', 'bf_H13']) {
    assert.ok(restrictedAvailable[id], `${id} should remain available when shoulder-restricted`);
  }
  assert.equal(restrictedAvailable.bf_C25, undefined);
  assert.equal(restrictedAvailable.bf_C26, undefined);
});

test('all 13 new exercises survive manual add and plan share/import round-trip', () => {
  const fullGym = { healthStatus: 'unrestricted', experience: 'advanced', equipment: ['pullup_bar', 'band', 'dumbbell', 'cable', 'platform', 'racket'], badmintonDays: [] };
  const available = eligibleExercises(catalogZh, fullGym);
  let day = createManualSession('2026-11-24');
  day = addManualExercises(day, NEW_IDS.slice(0, 10), { exercises: catalogZh, eligibleExercises: available, phase: 'strength' });
  day = addManualExercises(day, ['bf_D10', 'bf_D11'], { exercises: catalogZh, eligibleExercises: available, phase: 'accessory' });
  day = addManualExercises(day, ['bf_H13'], { exercises: catalogZh, eligibleExercises: available, phase: 'cooldown' });

  const payload = validatePlanPayload(createPlanPayload([day], { name: '新動作測試', exercises: catalogZh }));
  const [rebuilt] = rebuildPlanDays(payload);
  assert.deepEqual(rebuilt.routine, day.routine);
  const pick = list => list.map(({ id, phase, sets, value, unit, restSeconds, perSide }) => ({ id, phase, sets, value, unit, restSeconds, perSide }));
  assert.deepEqual(pick(rebuilt.prescriptions), pick(day.prescriptions));
});
