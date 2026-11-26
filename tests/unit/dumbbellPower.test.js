import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { manualPlanningExercises, generateTemplatePlan } from '../../src/domain/templatePlanner.js';
import { addManualExercises, createManualSession } from '../../src/domain/manualPlanner.js';
import { exerciseTags, matchesExerciseQuery } from '../../src/domain/exerciseTags.js';
import { getExerciseGuide } from '../../src/data/exerciseGuides.js';
import { createPlanPayload, validatePlanPayload, rebuildPlanDays } from '../../src/domain/sharedPlans.js';
const ids = ['bf_E11', 'bf_E12'];
const context = { healthStatus: 'unrestricted', equipment: ['dumbbell'], experience: 'intermediate', recoveryState: 'normal', badmintonDays: [], trainingDays: [1,3,5], weeklyExerciseIds: ids };

test('requested dumbbell power movements are searchable, tagged and guided in both languages', () => {
  for (const lang of ['zh','en']) {
    const exercises = catalogExercises(lang);
    for (const [index,id] of ids.entries()) {
      const movement = exercises[id];
      assert.equal(movement.active, true);
      assert.ok(matchesExerciseQuery(id, movement, index ? '啞鈴原地跳轉' : '啞鈴火箭推', lang));
      assert.ok(matchesExerciseQuery(id, movement, index ? 'jump turn' : 'thruster', lang));
      const tags = exerciseTags(id,movement,lang);
      for (const tag of lang === 'en' ? ['Full body','Legs','Core','Power'] : ['全身','下肢整體','核心／腹部','爆發']) assert.ok(tags.includes(tag), `${id}: ${tag}`);
      assert.equal(getExerciseGuide(id,movement,lang).guide.steps.length,2);
    }
  }
});

test('equipment and shoulder treatment restrictions remain enforced without beginner gating', () => {
  const exercises = catalogExercises();
  const available = manualPlanningExercises(exercises,context);
  assert.ok(ids.every(id=>available[id]));
  assert.ok(manualPlanningExercises(exercises,{...context,experience:'beginner'}).bf_E12);
  assert.ok(manualPlanningExercises(exercises,{...context,experience:'beginner'}).bf_E11);
  for (const change of [{equipment:[]},{healthStatus:'restricted'}]) for (const id of ids) assert.equal(manualPlanningExercises(exercises,{...context,...change})[id],undefined);
  assert.equal(exercises.bf_E11.jumpContacts,0);
  assert.equal(exercises.bf_E12.jumpContacts,1);
  assert.equal(exercises.bf_E12.prescription.perSide,true);
});

test('power doses survive manual add, share and import with correct phases', () => {
  const exercises=catalogExercises(),available=manualPlanningExercises(exercises,context);
  const day=addManualExercises(createManualSession('2026-11-23'),ids,{exercises,eligibleExercises:available,phase:'skill'});
  assert.ok(day.prescriptions.every(dose=>dose.phase==='skill'));
  const payload=validatePlanPayload(createPlanPayload([day],{name:'啞鈴力量傳導',exercises}));
  const [copy]=rebuildPlanDays(payload);
  assert.deepEqual(copy.routine,day.routine);
  assert.deepEqual(copy.prescriptions,day.prescriptions);
});

test('explicit weekly choices can actually reach suitable training days', () => {
  const exercises=catalogExercises();
  const plan=generateTemplatePlan(exercises,context,40,'zh',{currentDate:'2026-11-23',currentWeek:'2026-W48'});
  for(const id of ids) assert.ok(plan.schedule.some(day=>day.routine.includes(id)),id);
});
