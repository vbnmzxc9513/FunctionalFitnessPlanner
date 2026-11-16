import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogExercises} from '../../src/domain/exerciseCatalog.js';
import {BODY_PARTS, exerciseTags, exerciseBodyParts, matchesBodyPart, matchesExerciseQuery} from '../../src/domain/exerciseTags.js';
const all=catalogExercises('zh');
test('every catalog movement has unique readable tags in both languages',()=>{
 for(const [id,e]of Object.entries(all))for(const lang of ['zh','en']){const tags=exerciseTags(id,e,lang);assert.ok(tags.length>0,id);assert.equal(new Set(tags).size,tags.length);assert.ok(tags.every(v=>typeof v==='string'&&v.length>0));}
});
test('body menu exposes chest and specific upper/lower regions without excluding stretches',()=>{
 for(const part of ['chest','back','arms','shoulder','serratus','core','thoracic','hip','glutes','quadriceps','hamstrings','adductors','calves','ankle','foot','neck'])assert.ok(BODY_PARTS.some(([v])=>v===part));
 for(const code of ['C02','C03','C11','H07'])assert.equal(matchesBodyPart(`bf_${code}`,all[`bf_${code}`],'chest'),true,code);
 assert.equal(matchesBodyPart('bf_B11',all.bf_B11,'chest'),false);
 assert.equal(matchesBodyPart('bf_C12',all.bf_C12,'serratus'),true);
});
test('custom movement tags are explicit about unknown regions and do not confuse thoracic with chest',()=>{
 assert.ok(exerciseTags('mine',{name:'我的自訂動作',type:'full'}).includes('未分類'));
 const parts=exerciseBodyParts('mine',{name:'自訂胸椎旋轉',type:'mobility'});
 assert.ok(parts.includes('thoracic'));assert.equal(parts.includes('chest'),false);
 assert.ok(exerciseBodyParts('mine',{name:'前鋸肌牆滑',type:'mobility'}).includes('serratus'));
 assert.equal(exerciseBodyParts('mine',{name:'Backward lunge and throw',type:'full'}).includes('back'),false);
 assert.equal(exerciseBodyParts('mine',{name:'Whip reaction drill',type:'full'}).includes('hip'),false);
});

test('shared search preserves codes and aliases while adding region and purpose tags',()=>{
 assert.equal(matchesExerciseQuery('bf_B03',all.bf_B03,'B03'),true);
 assert.equal(matchesExerciseQuery('bf_C11',all.bf_C11,'胸 訓練'),true);
 assert.equal(matchesExerciseQuery('bf_C11',all.bf_C11,'胸 小腿'),false);
 assert.equal(matchesExerciseQuery('custom',{name:'我的動作',aliases:['旋轉推胸']},'旋轉推胸'),true);
});
