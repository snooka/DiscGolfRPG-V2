import { ratingTier } from '../lib/rating.ts';
import { t } from '../i18n/index.ts';

/** Liten neon-brikke med nivået (Amatør … Open / Pro) og ratingtallet. */
export function RatingTierBadge({ rating, compact = false }: { rating: number | null; compact?: boolean }) {
  const tier = ratingTier(rating);
  if (!tier || rating === null) {
    return <span className="text-[11px] font-bold text-slate-500">{t('Ikke ratet')}</span>;
  }
  return (
    <span
      className={`${tier.neon} neon-chip inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black`}
      title={t('Rating {rating} – {name}', { rating, name: tier.name })}
    >
      <span aria-hidden>{tier.icon}</span>
      {!compact && <span>{tier.name}</span>}
      <span className="font-mono">{rating}</span>
    </span>
  );
}
