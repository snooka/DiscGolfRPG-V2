import { X } from 'lucide-react';
import { useEffect, useId } from 'react';
import type { ReactNode } from 'react';
import { t } from '../../i18n/index.ts';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Fast bunn-felt (f.eks. hovedknapp) som alltid er synlig */
  footer?: ReactNode;
  /** Fyller hele skjermen i stedet for å være et ark fra bunnen */
  full?: boolean;
  /** Ekstra z-indeks-klasse (standard z-50) */
  zClass?: string;
  /** Venstre-knapp i headeren i stedet for lukk-kryss */
  leading?: ReactNode;
}

/** Bunnark/modal som fyller bredden på mobil. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  full = false,
  zClass = 'z-50',
  leading,
}: SheetProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`anim-fade fixed inset-0 ${zClass} flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`anim-sheet flex w-full flex-col glass-bar border border-sky-400/25 bg-slate-900/90 shadow-[0_0_40px_rgba(34,211,238,0.12),0_20px_60px_rgba(0,0,0,0.6)] ${
          full
            ? 'h-dvh max-h-none rounded-none border-0'
            : 'max-h-[92dvh] max-w-lg rounded-t-3xl sm:rounded-3xl'
        }`}
      >
        <div
          className={`flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 ${
            full ? 'pt-[max(0.75rem,env(safe-area-inset-top))]' : ''
          }`}
        >
          {leading ?? <span className="w-11" aria-hidden />}
          <h2 id={titleId} className="flex-1 text-center text-base font-black text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Lukk')}
            className="btn btn-ghost btn-icon btn-sm"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {children}
        </div>

        {footer && (
          <div className="border-t border-slate-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
