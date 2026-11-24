import { BODY_PARTS, bodyPartLabel, exerciseTags } from '../domain/exerciseTags.js';
export function BodyPartFilter({value='all',onChange,lang='zh',testId='body-part-filter',availableParts=null}){
 const allowed=availableParts?new Set(availableParts):null;
 const parts=allowed?BODY_PARTS.filter(([key])=>allowed.has(key)||key===value):BODY_PARTS;
 return <label className="body-part-filter"><span>{lang==='en'?'Body part':'部位'}</span><select aria-label={lang==='en'?'Filter by body part':'依部位篩選'} data-testid={testId} value={value} onChange={event=>onChange(event.target.value)}><option value="all">{lang==='en'?'All body parts':'全部部位'}</option>{parts.map(([key])=><option key={key} value={key}>{bodyPartLabel(key,lang)}</option>)}</select></label>;
}
export default function ExerciseTags({id,exercise,lang='zh',compact=false}){
 const tags=exerciseTags(id,exercise,lang);
 return <div data-testid={`exercise-tags-${id}`} className="exercise-tags">{(compact?tags.slice(0,2):tags).map(tag=><span key={tag}>{tag}</span>)}</div>;
}
