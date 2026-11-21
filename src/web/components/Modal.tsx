import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ name, onClose, children, className }: {
  name: string;
  onClose(): void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => opener?.focus({ preventScroll: true });
  }, []);
  return <dialog ref={ref} className={className} aria-labelledby="dialog-title" onCancel={onClose}
    onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-content">
      <button type="button" className="icon-button close-modal" onClick={onClose} aria-label="Bezárás"><X size={20} /></button>
      <h2 id="dialog-title">{name}</h2>
      {children}
    </div>
  </dialog>;
}
