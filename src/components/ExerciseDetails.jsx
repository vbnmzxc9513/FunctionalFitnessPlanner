import { useBackNavigation } from '../hooks/useBackNavigation.js';
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function ExerciseDetails({ open, title, subtitle, closeLabel, onClose, children, footer }) {
  useBackNavigation(open, onClose, 110);
  const dialog = useRef(null);
  const titleId = useId();
  const content = useRef(null);
  const closeAction = useRef(onClose);
  useEffect(() => { closeAction.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    element.querySelector('[data-detail-close]')?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => { if (open) content.current?.scrollTo({ top: 0 }); }, [title, open]);
  return <dialog ref={dialog} data-testid="exercise-details" className="exercise-details" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); closeAction.current(); }}>
    <header className="exercise-details-header"><div className="min-w-0"><p className="text-xs text-sky-700 mb-1">{subtitle}</p><h3 id={titleId} className="text-lg font-bold text-slate-800 break-words">{title}</h3></div><button type="button" data-detail-close data-testid="exercise-details-close" onClick={onClose} className="exercise-details-close" aria-label={closeLabel}><X size={20} /><span>{closeLabel}</span></button></header>
    <div ref={content} className="exercise-details-content">{children}</div>
    {footer && <footer className="exercise-details-footer">{footer}</footer>}
  </dialog>;
}
