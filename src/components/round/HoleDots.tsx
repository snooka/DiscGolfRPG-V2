import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { t } from '../../i18n/index.ts';

interface HoleDotsProps {
  total: number;
  current: number;
  confirmed: boolean[];
  onSelect: (hole: number) => void;
}

/** Rad med hullnumre: hopp til et hull, se hvilke som er lagret. */
export function HoleDots({ total, current, confirmed, onSelect }: HoleDotsProps) {
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [current]);

  return (
    <div
      className="flex gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none]"
      role="tablist"
      aria-label={t('Hull')}
    >
      {Array.from({ length: total }, (_, i) => {
        const isCurrent = i === current;
        const done = confirmed[i];
        return (
          <button
            key={i}
            ref={isCurrent ? currentRef : undefined}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            aria-label={done ? t('Hull {n} (lagret)', { n: i + 1 }) : t('Hull {n}', { n: i + 1 })}
            onClick={() => onSelect(i)}
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-black transition-colors ${
              isCurrent
                ? 'border-emerald-300 bg-emerald-500 text-slate-950'
                : done
                  ? 'border-emerald-700 bg-emerald-950 text-emerald-300'
                  : 'border-slate-700 bg-slate-900 text-slate-400'
            }`}
          >
            {done && !isCurrent ? <Check className="h-4 w-4" /> : i + 1}
          </button>
        );
      })}
    </div>
  );
}
