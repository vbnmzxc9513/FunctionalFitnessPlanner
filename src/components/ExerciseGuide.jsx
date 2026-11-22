import { useEffect, useState } from 'react';
import ExerciseTags from './ExerciseTags.jsx';
import { getExerciseSource } from '../data/exerciseSources.js';
import { getCachedExerciseGuides, loadExerciseGuides } from '../data/exerciseGuidesLoader.js';

export default function ExerciseGuide({ id, exercise = {}, lang = 'zh', expanded = false }) {
  const targetId = id || exercise.id;
  const initiallyOpen = expanded || ['bf_A12', 'bf_A13'].includes(targetId);
  const [guides, setGuides] = useState(getCachedExerciseGuides);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!initiallyOpen || getCachedExerciseGuides()) return;
    let active = true;
    loadExerciseGuides().then(module => {
      if (active) { setGuides(module); setLoadFailed(false); }
    }).catch(() => {
      if (active) setLoadFailed(true);
    });
    return () => { active = false; };
  }, [initiallyOpen]);

  const ensureLoaded = () => {
    const cached = getCachedExerciseGuides();
    if (cached) {
      if (guides !== cached) setGuides(cached);
      return;
    }
    setLoadFailed(false);
    loadExerciseGuides().then(module => {
      setGuides(module);
      setLoadFailed(false);
    }).catch(() => {
      setLoadFailed(true);
    });
  };

  const source = getExerciseSource(targetId);
  const resolved = guides ? guides.getExerciseGuide(id, exercise, lang) : null;

  return <details
    open={initiallyOpen ? true : undefined}
    onToggle={event => { if (event.currentTarget.open) ensureLoaded(); }}
    className="mt-4 border-t border-slate-100 pt-2"
    data-testid={`exercise-guide-${targetId || 'custom'}`}
  >
    <summary className="cursor-pointer text-sm font-medium text-sky-800">{lang === 'en' ? 'Movement guide' : '動作說明'}</summary>
    {!resolved ? (
      <p role="status">{loadFailed ? (lang === 'en' ? 'Could not load guide. Close and reopen to retry.' : '無法載入動作指引，請重新展開重試。') : (lang === 'en' ? 'Loading guide…' : '載入動作指引…')}</p>
    ) : (
      <div className="mt-3 space-y-3 text-sm text-slate-600 leading-relaxed"><ExerciseTags id={id} exercise={exercise} lang={lang} />
        {resolved.guide ? <>
          <p><strong className="text-slate-800">{resolved.text.start}：</strong>{resolved.guide.start}</p>
          <div><p className="font-semibold text-slate-800">{resolved.text.steps}</p><ol className="list-decimal pl-5 space-y-1">{resolved.guide.steps.map(step => <li key={step}>{step}</li>)}</ol></div>
          <p><strong className="text-slate-800">{resolved.text.mistake}：</strong>{resolved.guide.mistake}</p>
          <p><strong className="text-slate-800">{resolved.text.easier}：</strong>{resolved.guide.easier}</p>
        </> : <><p>{resolved.text.fallback}</p><p>{resolved.tip}</p></>}
        <p className="text-xs text-slate-500">{resolved.text.safety}</p>
        {source && <div className="border-t border-slate-100 pt-2 text-xs text-slate-500">
          <div className="flex flex-wrap gap-3">
            <a className="inline-flex min-h-11 items-center text-sky-800 underline" href={source.videoUrl} target="_blank" rel="noopener noreferrer">{lang === 'en' ? 'Reference video ↗' : `原表參考影片：${source.title} ↗`}</a>
            <a className="inline-flex min-h-11 items-center text-sky-800 underline" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">{lang === 'en' ? 'Canva movement grid ↗' : 'Canva 動作方格 ↗'}</a>
          </div>
          <p>{lang === 'en' ? 'The reference may show a different variation. Follow this page’s instructions and your planned dose.' : '影片版本可能不同，請以本頁動作說明與課表劑量為準。'}</p>
        </div>}
      </div>
    )}
  </details>;
}
