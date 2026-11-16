import { manualExerciseRegions } from './manualPlanner.js';
import { exerciseTrainingTargets } from './trainingTargets.js';
import { suggestedUses } from './library.js';

// Shared navigation metadata only; these tags never claim isolation or measured load.
export const BODY_PARTS = [
  ['chest','胸','Chest'],['back','背','Back'],['shoulder','肩／肩胛','Shoulders'],['arms','手臂','Arms'],['forearm','前臂／手腕','Forearms'],['serratus','前鋸肌','Serratus'],
  ['core','核心／腹部','Core'],['thoracic','胸椎','Thoracic spine'],['glutes','臀','Glutes'],['hip','髖','Hips'],['quadriceps','大腿前側','Quads'],['hamstrings','腿後側','Hamstrings'],['adductors','內收肌','Adductors'],['calves','小腿','Calves'],['ankle','腳踝','Ankles'],['foot','足弓／腳趾','Feet'],['legs','下肢整體','Legs'],['neck','頸部','Neck'],['full','全身','Full body'],['unclassified','未分類','Unclassified'],
];
const codes = {
 chest:['C02','C03','C11','H07'], back:['C01','C04','C06','C10','C14','C16','A16'], shoulder:['A07','A08','A09','A18','C05','C06','C07','C12','C13','C15','H07'],
 legs:['G01','G02','G04','G05','G06','G08'], arms:['G03','G04','G05','G06','C02','C03','C04','C10','C11','C14','C15'], forearm:['C08','C09','H08','D08'], serratus:['A07','C07','C12'],
 core:['A10','D01','D02','D03','D04','D05','D06','D07','D08','D09','C16'], thoracic:['A06','A09','A10','A11','A17','H12'],
 glutes:['B01','B02','B03','B04','B05','B06','B09','B10','B11','B12','B18','H04','H11'], hip:['A03','A04','A05','A15','A17','B16','B17','H03','H04','H06'],
 quadriceps:['A14','B01','B02','B10','B12','B18','H09'], hamstrings:['A03','B03','B04','B05','B11','H05'], adductors:['A05','A17','B02','H06'],
 calves:['A02','A19','B07','B08','E04','H01','H02','H10','I04'], ankle:['A02','A19','B07','B08','B15','E04','H01','H02'], foot:['B13','B14','B15'], full:['A01','A12','A13','I01','I02','I03','I04'],
};
const terms = {
 chest: /胸(?!椎)|\b(chest|pectorals?)\b/i,
 back: /背|\b(back|rows?|rowing)\b/i,
 shoulder: /肩|\b(shoulders?|scapul[a-z]*)\b/i,
 arms: /手臂|肱|\b(biceps|triceps)\b/i,
 forearm: /前臂|手腕|\b(forearms?|wrists?)\b/i,
 serratus: /前鋸|\bserratus\b/i,
 core: /核心|腹|\b(core|abdominals?)\b/i,
 thoracic: /胸椎|\bthoracic\b/i,
 glutes: /臀|\bglutes?\b/i,
 hip: /髖|\bhips?\b/i,
 quadriceps: /大腿前|\b(quads?|quadriceps)\b/i,
 hamstrings: /腿後|腿后|\bhamstrings?\b/i,
 adductors: /內收|内收|\badductors?\b/i,
 calves: /小腿|\b(calf|calves)\b/i,
 ankle: /踝|\bankles?\b/i,
 foot: /足弓|腳趾|脚趾|\b(foot|feet|toes?)\b/i,
 neck: /頸|颈|\bneck\b/i,
};
export function exerciseBodyParts(id, exercise={}) {
 const valid=new Set(BODY_PARTS.map(([key])=>key));
 const code=exercise.catalogCode;
 const parts=new Set([...(code ? manualExerciseRegions(id,exercise) : []),...exerciseTrainingTargets(id,exercise)].filter(key=>valid.has(key)));
 for(const [part,list] of Object.entries(codes)) if(list.includes(code))parts.add(part);
 if(['lower','power','footwork'].includes(exercise.category) || exercise.type === 'lower')parts.add('legs');
 if(exercise.category === 'core' || exercise.type === 'core')parts.add('core');
 if(!code){const text=[exercise.name,exercise.nameEn,...(exercise.aliases||[])].join(' ');for(const [part,re]of Object.entries(terms))if(re.test(text))parts.add(part);}
 return parts.size?[...parts]:code==='G07'?[]:['unclassified'];
}
export function bodyPartLabel(part,lang='zh'){const item=BODY_PARTS.find(([key])=>key===part);return item?.[lang==='en'?2:1]||part;}
export function exerciseTags(id,exercise={},lang='zh'){
 const purposes={warmup:lang==='en'?'Warm-up':'暖身',training:lang==='en'?'Training':'訓練',cooldown:lang==='en'?'Cooldown':'收操'};
 const kind={reaction:lang==='en'?'Reaction':'反應',power:lang==='en'?'Power':'爆發',footwork:lang==='en'?'Footwork':'步法',recovery:lang==='en'?'Stretch / recovery':'拉伸／恢復'}[exercise.category];
 return [...new Set([...exerciseBodyParts(id,exercise).map(part=>bodyPartLabel(part,lang)),...suggestedUses(id,exercise).map(p=>purposes[p]),...(kind?[kind]:[])])];
}
export function matchesBodyPart(id,exercise,part){return !part||part==='all'||exerciseBodyParts(id,exercise).includes(part);}

export function matchesExerciseQuery(id, exercise = {}, query = '', lang = 'zh') {
 const text = [id, exercise.name, exercise.nameEn, exercise.catalogCode, exercise.purpose, ...(exercise.aliases || []), ...exerciseTags(id, exercise, lang)].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
 return query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean).every(token => text.includes(token));
}
