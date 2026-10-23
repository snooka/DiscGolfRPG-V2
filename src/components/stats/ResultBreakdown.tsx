import { HOLE_RESULTS, percent, RESULT_LABELS } from '../../lib/stats.ts';
import type { HoleResult, ScoreCounts } from '../../types.ts';
import { t } from '../../i18n/index.ts';

/** Farger per resultat. Teksten viser alltid tall, så fargen er aldri alene. */
export const RESULT_COLOR: Record<HoleResult, string> = {
  ace: 'bg-amber-400',
  eagle: 'bg-fuchsia-400',
  birdie: 'bg-cyan-400',
  par: 'bg-green-400',
  bogey: 'bg-orange-400',
  double: 'bg-red-400',
  triple: 'bg-rose-700',
};

const RESULT_ICON: Record<HoleResult, string> = {
  ace: '🌟',
  eagle: '🦅',
  birdie: '🐦',
  par: '🎯',
  bogey: '😬',
  double: '😵',
  triple: '🌲',
};

/** Stablet søyle + liste som viser fordelingen av resultater. */
export function ResultBreakdown({ counts }: { counts: ScoreCounts }) {
  const total = HOLE_RESULTS.reduce((a, k) => a + counts[k], 0);
  const summary = HOLE_RESULTS.filter((k) => counts[k] > 0)
    .map((k) => `${RESULT_LABELS[k]} ${counts[k]}`)
    .join(', ');

  return (
    <div className="space-y-3">
      <div
        role="img"
        aria-label={total ? t('Fordeling av {total} hull: {summary}', { total, summary }) : t('Ingen hull ennå')}
        className="flex h-3 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950"
      >
        {HOLE_RESULTS.map((k) =>
          counts[k] > 0 ? (
            <div
              key={k}
              className={RESULT_COLOR[k]}
              style={{ width: `${(counts[k] / total) * 100}%` }}
            />
          ) : null
        )}
      </div>

      <ul className="space-y-1.5">
        {HOLE_RESULTS.map((k) => (
          <li key={k} className="flex items-center gap-3 text-sm">
            <span className={`h-3 w-3 shrink-0 rounded-sm ${RESULT_COLOR[k]}`} aria-hidden />
            <span aria-hidden className="w-5 text-center">
              {RESULT_ICON[k]}
            </span>
            <span className="flex-1 text-slate-200">{RESULT_LABELS[k]}</span>
            <span className="w-10 text-right font-mono text-xs text-slate-400">
              {percent(counts[k], total)}%
            </span>
            <span className="w-9 text-right font-mono text-base font-black text-white">
              {counts[k]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
