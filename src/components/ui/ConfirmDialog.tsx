import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Liten sentrert bekreftelsesboks («Er du sikker?»). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Fokus på «Avbryt» slik at et utilsiktet Enter-trykk aldri bekrefter
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="anim-fade fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="anim-pop w-full max-w-sm rounded-3xl glass-bar border border-sky-400/30 bg-slate-900/90 p-5 shadow-[0_0_40px_rgba(34,211,238,0.15),0_20px_60px_rgba(0,0,0,0.6)]"
      >
        <h2 id={titleId} className="text-lg font-black text-white">
          {title}
        </h2>
        {message && <div className="mt-2 text-sm text-slate-300">{message}</div>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
