import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomExercise, customExerciseForStorage, hydrateCustomExercise, readDeviceExercises, writeDeviceExercise, DEVICE_EXERCISES_KEY } from '../../src/domain/customExercises.js';
import { catalogExercises } from '../../src/domain/exerciseCatalog.js';
import { exerciseBodyParts, matchesExerciseQuery } from '../../src/domain/exerciseTags.js';
import { exerciseSelection, selectionReason } from '../../src/domain/exerciseSelection.js';
import { manualPlanningExercises } from '../../src/domain/templatePlanner.js';
import { classifyBalanceExercise } from '../../src/domain/weeklyBalance.js';
import { exercisePhase } from '../../src/domain/phases.js';
const input = { name:'自己的背部動作', purpose:'training', bodyParts:['back'], equipment:['dumbbell'], description:'穩住身體再拉回' };
const storage = () => { const values=new Map(); return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}; };

test('manual custom creation owns its metadata and preserves explicit parts without guessing outcomes',()=>{
 const row=createCustomExercise({...input,catalogCode:'C01',active:false,admin:true});
 assert.equal(row.type,'upper_pull');assert.equal(row.active,true);assert.equal(row.catalogCode,undefined);assert.equal(row.admin,undefined);
 assert.deepEqual(hydrateCustomExercise(customExerciseForStorage(row)),row);
 assert.equal(customExerciseForStorage(row).equipmentOptions,undefined);
 assert.deepEqual(exerciseBodyParts('custom_one',row),['back']);
 assert.deepEqual(row.prescription,{sets:2,value:'8',unit:'reps',restSeconds:60,perSide:false});
 assert.equal(classifyBalanceExercise('custom_one',row).unclassified,true);
 assert.equal(exercisePhase({},'custom_one',row),'strength');
 for(const purpose of ['warmup','cooldown']){const e=createCustomExercise({...input,purpose});assert.equal(e.prescription.unit,'seconds');assert.equal(exercisePhase({},'custom_one',e),purpose);}
});
test('custom input rejects unknown parts/equipment, unsafe doses and invalid names',()=>{
 for(const change of [{name:''},{name:'x'.repeat(101)},{name:'bad\nname'},{bodyParts:['forged']},{equipment:['medicine_ball']},{prescription:{sets:99,value:'8',unit:'reps',restSeconds:60,perSide:false}},{purpose:'admin'}])assert.throws(()=>createCustomExercise({...input,...change}));
});
test('device creation survives reload and preserves prior definitions on storage errors/corruption',()=>{
 const store=storage(),row=createCustomExercise(input);writeDeviceExercise('custom_one',row,store);
 assert.deepEqual(readDeviceExercises(store).custom_one,row);
 const original=store.getItem(DEVICE_EXERCISES_KEY);
 assert.throws(()=>writeDeviceExercise('custom_two',row,{getItem:store.getItem,setItem:()=>{throw Error('quota')}}),/CUSTOM_STORAGE/);
 assert.equal(store.getItem(DEVICE_EXERCISES_KEY),original);
 const corrupted=storage();corrupted.setItem(DEVICE_EXERCISES_KEY,'{bad');assert.throws(()=>writeDeviceExercise('custom_two',row,corrupted),/CUSTOM_STORAGE/);assert.equal(corrupted.getItem(DEVICE_EXERCISES_KEY),'{bad');
 writeDeviceExercise('custom_one',{...row,deleted:true,active:false},store);const removed=readDeviceExercises(store).custom_one;assert.equal(removed.deleted,true);assert.equal(removed.active,false);assert.equal(removed.name,row.name,'deleting does not erase historical movement identity');
});
test('basic chest and shoulder presses are discoverable even when equipment makes them unavailable',()=>{
 const rows=catalogExercises();
 for(const lang of ['zh','en']){const all=catalogExercises(lang);const selected=exerciseSelection(all,{}, {query:'胸推',context:{healthStatus:'unrestricted',equipment:[]},lang});assert.ok(selected.some(row=>row.id==='bf_C11'));assert.ok(selected.some(row=>row.id==='bf_C17'));assert.ok(selected.every(row=>!row.available));assert.match(selectionReason(selected.find(row=>row.id==='bf_C11')),/器材/);}
 assert.ok(matchesExerciseQuery('shoulder_press',rows.shoulder_press,'肩推'));
 const available=manualPlanningExercises(rows,{equipment:['dumbbell'],healthStatus:'unrestricted'});
 assert.ok(exerciseSelection(rows,available,{query:'肩推'})[0].available);
 assert.equal(available.bf_C17,undefined,'bench press still requires a stable bench');
 const personal=createCustomExercise({...input,equipment:[]});const withPersonal={...rows,custom_mine:personal};
 assert.equal(exerciseSelection(withPersonal,manualPlanningExercises(withPersonal,{healthStatus:'unrestricted',equipment:['dumbbell','cable','platform']}))[0].id,'custom_mine');
 for(const id of ['bf_C17','bf_C18','bf_C19','bf_C20','bf_C21','bf_B19'])assert.ok(rows[id].prescription);
});
test('manual custom equipment and treatment restrictions cannot be bypassed by declaring tags',()=>{
 const row=createCustomExercise(input),all={custom_one:row};
 assert.ok(manualPlanningExercises(all,{healthStatus:'unrestricted',equipment:['dumbbell']}).custom_one);
 for(const context of [{healthStatus:'restricted',equipment:['dumbbell']},{healthStatus:'unrestricted',equipment:[]}])assert.equal(manualPlanningExercises(all,context).custom_one,undefined);
});
