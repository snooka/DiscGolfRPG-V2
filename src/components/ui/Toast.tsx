import { Sparkles } from 'lucide-react';
import type { ToastOptions } from '../../context/ui-context.ts';

interface ToastProps {
  message: string;
  options?: ToastOptions;
  onDismiss: () => void;
}

const TONE: Record<NonNullable<ToastOptions['tone']>, string> = {
  success: 'border-green-400/60 bg-green-950/95 text-green-100',
  info: 'border-cyan-400/60 bg-slate-900/95 text-cyan-100',
  danger: 'border-red-400/60 bg-red-950/95 text-red-100',
};

/** Varsel øverst på skjermen (med valgfri handling, f.eks. «Angre»). */
export function Toast({ message, options, onDismiss }: ToastProps) {
  const tone = options?.tone ?? 'success';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div
        role="status"
        aria-live="polite"
        className={`anim-toast pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-2xl ${TONE[tone]}`}
      >
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{message}</span>
        {options?.action && (
          <button
            type="button"
            onClick={() => {
              options.action?.onClick();
              onDismiss();
            }}
            className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-black uppercase tracking-wide hover:bg-white/25"
          >
            {options.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
