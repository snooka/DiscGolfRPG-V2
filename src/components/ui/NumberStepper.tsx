import { Minus, Plus } from 'lucide-react';
import { t } from '../../i18n/index.ts';

interface NumberStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const clean = (n: number) => Math.round(n * 100) / 100;

/** Stor +/−-kontroll som er enkel å treffe med tommelen. */
export function NumberStepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: NumberStepperProps) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-2">
      <div className="eyebrow mb-1 text-center">{label}</div>
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          aria-label={t('Mindre {label}', { label })}
          disabled={value <= min}
          onClick={() => onChange(clean(Math.max(min, value - step)))}
          className="btn btn-secondary btn-sm btn-icon"
        >
          <Minus className="h-4 w-4" />
        </button>
        <output
          aria-label={label}
          className="min-w-8 text-center font-mono text-lg font-black text-emerald-400"
        >
          {value}
        </output>
        <button
          type="button"
          aria-label={t('Mer {label}', { label })}
          disabled={value >= max}
          onClick={() => onChange(clean(Math.min(max, value + step)))}
          className="btn btn-secondary btn-sm btn-icon"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
