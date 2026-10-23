import { useState } from 'react';
import { useSession } from '../context/auth-context.ts';
import { calcRating, nextTier, RATING_BASE, RATING_ROUNDS, RATING_TIERS } from '../lib/rating.ts';
import { formatDiff } from '../lib/stats.ts';
import { Sheet } from './ui/Sheet.tsx';
import { t } from '../i18n/index.ts';

/** Rating-tall + knapp ved siden av profilnavnet. Åpner et ark med forklaring og siste Normal-runder. */
const avgText = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

export function RatingBadge() {
  const { profile } = useSession();
  const [open, setOpen] = useState(false);
  const info = calcRating(profile.history);
  const recent = profile.history.filter((r) => r.mode === 'normal').slice(0, RATING_ROUNDS);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('Rating {rating}. Vis detaljer', { rating: info.rating ?? 'ingen' })}
        className={`${info.tier?.neon ?? 'tier-amator'} neon-chip shrink-0 rounded-full px-2.5 py-0.5 font-mono text-xs font-bold`}
      >
        {info.tier?.icon ?? '⭐'} {info.rating ?? '–'}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('Rating')}>
        <div className="space-y-4">
          <div className="card text-center">
            <div className="eyebrow">{t('Din rating (Normal Game)')}</div>
            <div className={`${info.tier?.neon ?? 'tier-amator'} neon-text font-mono text-4xl font-black`}>{info.rating ?? '–'}</div>
            {info.tier && (
              <div className={`${info.tier.neon} neon-text text-sm font-black`}>
                {info.tier.icon} {info.tier.name}
              </div>
            )}
            {info.rating !== null && nextTier(info.rating) && (
              <div className="text-xs text-slate-400">
                {t('{points} poeng til {name}', { points: nextTier(info.rating)!.min - info.rating, name: nextTier(info.rating)!.name })}</div>
            )}
            {info.avgPerHole !== null && (
              <div className="text-xs text-slate-400">
                {info.rounds === 1
                  ? t('Snitt {avg} kast mot par per hull over 1 runde', { avg: avgText(info.avgPerHole) })
                  : t('Snitt {avg} kast mot par per hull over {rounds} runder', { avg: avgText(info.avgPerHole), rounds: info.rounds })}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {t('Rating regnes kun fra Normal Game (de siste {RATING_ROUNDS} rundene). {RATING_BASE} = par hele veien. Dual Tee og Disc Roulette har egen statistikk og påvirker ikke ratingen. Ett kast over par på 18 hull koster ca. 17 poeng. Ratingen regnes også ut i skyen, så vennene dine ser samme tall.', { RATING_ROUNDS, RATING_BASE })}</p>
          <ul className="space-y-1.5" aria-label={t('Nivåer')}>
            {RATING_TIERS.map((tm) => (
              <li
                key={tm.id}
                className={`${tm.neon} flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                  info.tier?.id === tm.id ? 'neon-card' : 'border-slate-800'
                }`}
              >
                <span className="neon-text font-black">
                  {tm.icon} {tm.name}
                </span>
                <span className="font-mono text-xs text-slate-400">
                  {tm.min === 0 ? `under ${RATING_TIERS[1].min}` : `${tm.min}+`}
                </span>
              </li>
            ))}
          </ul>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400">{t('Spill en Normal Game-runde for å få en rating.')}</p>
          ) : (
            <ul className="space-y-2">
              {recent.map((r) => (
                <li key={r.id} className="card flex items-center justify-between p-3 text-sm">
                  <span className="min-w-0 truncate font-bold text-white">{r.courseName}</span>
                  <span className="font-mono text-emerald-400">
                    {r.throws} ({formatDiff(r.diff)})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  );
}
