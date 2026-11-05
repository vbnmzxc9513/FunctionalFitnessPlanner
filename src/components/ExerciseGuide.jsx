import { getExerciseGuide } from '../data/exerciseGuides.js';
import { getExerciseSource } from '../data/exerciseSources.js';

export default function ExerciseGuide({ id, exercise = {}, lang = 'zh' }) {
  const { text, guide, tip } = getExerciseGuide(id, exercise, lang);
  const source = getExerciseSource(id || exercise.id);
  return <details open={['bf_A12', 'bf_A13'].includes(id || exercise.id) ? true : undefined} className="mt-4 border-t border-slate-100 pt-2" data-testid={`exercise-guide-${id || exercise.id || 'custom'}`}>
    <summary className="cursor-pointer text-sm font-medium text-sky-800">{text.title}</summary>
    <div className="mt-3 space-y-3 text-sm text-slate-600 leading-relaxed">
      {guide ? <>
        <p><strong className="text-slate-800">{text.start}：</strong>{guide.start}</p>
        <div><p className="font-semibold text-slate-800">{text.steps}</p><ol className="list-decimal pl-5 space-y-1">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol></div>
        <p><strong className="text-slate-800">{text.mistake}：</strong>{guide.mistake}</p>
        <p><strong className="text-slate-800">{text.easier}：</strong>{guide.easier}</p>
      </> : <><p>{text.fallback}</p><p>{tip}</p></>}
      <p className="text-xs text-slate-500">{text.safety}</p>
      {source && <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
        <div className="flex flex-wrap gap-3">
          <a className="inline-flex min-h-11 items-center text-sky-800 underline" href={source.videoUrl} target="_blank" rel="noopener noreferrer">{lang === 'en' ? 'Reference video ↗' : `原表參考影片：${source.title} ↗`}</a>
          <a className="inline-flex min-h-11 items-center text-sky-800 underline" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{lang === 'en' ? 'Canva movement grid ↗' : 'Canva 動作方格 ↗'}</a>
        </div>
        <p>{lang === 'en' ? 'The reference may show a different variation. Follow this page’s instructions and your planned dose.' : '影片版本可能不同，請以本頁動作說明與課表劑量為準。'}</p>
      </div>}
    </div>
  </details>;
}
