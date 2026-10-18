import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';

export default function ExerciseRow({ id, name, number, summary, preparation, actionLabel, done = false, disabled = false, onToggle, onOpen }) {
  const press = useRef(null);
  const [pressing, setPressing] = useState(false);
  const cancel = () => { clearTimeout(press.current?.timer); press.current = null; setPressing(false); };
  useEffect(() => () => clearTimeout(press.current?.timer), []);
  const begin = event => {
    if (!event.isPrimary || event.button !== 0) { cancel(); return; }
    cancel();
    const target = event.currentTarget;
    const { clientX: x, clientY: y, pointerId } = event;
    setPressing(true);
    const timer = setTimeout(() => { press.current = null; setPressing(false); onOpen(target); }, 500);
    press.current = { x, y, pointerId, timer };
  };
  return <div data-testid={`exercise-row-${id}`} data-pressing={pressing} tabIndex={-1} className="exercise-row"
    onPointerDown={begin} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
    onPointerMove={event => { const value = press.current; if (value && (event.pointerId !== value.pointerId || Math.hypot(event.clientX - value.x, event.clientY - value.y) > 10)) cancel(); }}
    onContextMenu={event => { if (event.nativeEvent.pointerType === 'touch') event.preventDefault(); }}>
    {onToggle ? <button type="button" aria-label={name} aria-pressed={done} disabled={disabled} onPointerDown={event => event.stopPropagation()} onClick={onToggle} className="exercise-row-check disabled:opacity-40">{done ? <CheckCircle2 size={23} /> : <Circle size={23} />}</button> : <span className="exercise-row-number" aria-hidden="true">{number}</span>}
    <div className="min-w-0 flex-1"><h4 className={`exercise-row-title ${done ? 'text-slate-500' : ''}`}>{onToggle && `${number}. `}{name}</h4><p className="exercise-row-dose">{summary}</p>{preparation && <span className="exercise-row-preparation">{preparation}</span>}</div>
    <button type="button" data-testid={`exercise-open-${id}`} aria-label={`${actionLabel} ${name}`} aria-haspopup="dialog" onPointerDown={event => event.stopPropagation()} onClick={event => onOpen(event.currentTarget)} className="exercise-row-open"><span>{actionLabel}</span><ChevronRight size={16} aria-hidden="true" /></button>
  </div>;
}
