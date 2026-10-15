import { getExerciseGuide } from '../data/exerciseGuides.js';

export default function ExerciseGuide({ id, exercise = {}, lang = 'zh' }) {
  const { text, guide, tip } = getExerciseGuide(id, exercise, lang);
  return <details className="mt-4 border-t border-slate-100 pt-2" data-testid={`exercise-guide-${id || exercise.id || 'custom'}`}>
    <summary className="cursor-pointer text-sm font-medium text-sky-800">{text.title}</summary>
    <div className="mt-3 space-y-3 text-sm text-slate-600 leading-relaxed">
      {guide ? <>
        <p><strong className="text-slate-800">{text.start}：</strong>{guide.start}</p>
        <div><p className="font-semibold text-slate-800">{text.steps}</p><ol className="list-decimal pl-5 space-y-1">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol></div>
        <p><strong className="text-slate-800">{text.mistake}：</strong>{guide.mistake}</p>
        <p><strong className="text-slate-800">{text.easier}：</strong>{guide.easier}</p>
      </> : <><p>{text.fallback}</p><p>{tip}</p></>}
      <p className="text-xs text-slate-500">{text.safety}</p>
    </div>
  </details>;
}
