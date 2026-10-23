import type { RoundHistoryEntry } from '../types.ts';
import { t } from '../i18n/index.ts';

/** Par på alle hull = 1000. */
export const RATING_BASE = 1000;
/** Antall Normal Game-runder ratingen bygger på (de siste). */
export const RATING_ROUNDS = 10;
/** Poeng per kast mot par per hull i snitt. På 18 hull tilsvarer ett kast over par ca. −17 poeng. */
export const RATING_PER_THROW = 300;
export const RATING_MIN = 400;
export const RATING_MAX = 1400;

export interface RatingTier {
  id: 'amator' | 'intermediate' | 'advanced' | 'pro';
  name: string;
  /** Laveste rating i nivået */
  min: number;
  icon: string;
  /** Neon-klasse (se index.css) */
  neon: string;
  /** Tekstfarge */
  text: string;
  /** Kort beskrivelse */
  blurb: string;
}

/** Nivåene, lavest først. Samme grenser som i `calc_rating`-funksjonene i skjemaet. */
export const RATING_TIERS: RatingTier[] = [
  { id: 'amator', get name() { return t('Amatør'); }, min: 0, icon: '🥏', neon: 'tier-amator', text: 'text-teal-300', get blurb() { return t('Du er i gang. Hver runde teller.'); } },
  { id: 'intermediate', name: 'Intermediate', min: 850, icon: '⚡', neon: 'tier-intermediate', text: 'text-cyan-300', get blurb() { return t('Jevne runder og flere birdies.'); } },
  { id: 'advanced', name: 'Advanced', min: 950, icon: '🔥', neon: 'tier-advanced', text: 'text-fuchsia-300', get blurb() { return t('Par eller bedre er normalen.'); } },
  { id: 'pro', name: 'Open / Pro', min: 1040, icon: '👑', neon: 'tier-pro', text: 'text-amber-300', get blurb() { return t('Under par runde etter runde.'); } },
];

export function ratingTier(rating: number | null): RatingTier | null {
  if (rating === null) return null;
  let tier = RATING_TIERS[0];
  for (const tm of RATING_TIERS) if (rating >= tm.min) tier = tm;
  return tier;
}

export function nextTier(rating: number | null): RatingTier | null {
  const cur = ratingTier(rating);
  if (!cur || rating === null) return null;
  return RATING_TIERS[RATING_TIERS.indexOf(cur) + 1] ?? null;
}

/** 0–1: hvor langt man er på vei fra nåværende nivå til neste. */
export function tierProgress(rating: number | null): number {
  const cur = ratingTier(rating);
  const next = nextTier(rating);
  if (!cur || !next || rating === null) return rating === null ? 0 : 1;
  return Math.max(0, Math.min(1, (rating - cur.min) / (next.min - cur.min)));
}

export interface RatingInfo {
  rating: number | null;
  /** Antall Normal Game-runder rating bygger på. */
  rounds: number;
  /** Snitt kast mot par per hull. */
  avgPerHole: number | null;
  tier: RatingTier | null;
}

type RatedRound = Pick<RoundHistoryEntry, 'mode' | 'holes' | 'diff'>;

/**
 * Rating bygger kun på Normal Game (de siste 10 rundene, nyeste først).
 * 1000 = par hele veien. Hver birdie/bogey per hull i snitt flytter ratingen 300 poeng.
 * Samme formel kjøres i databasen (`calc_rating`), slik at skyen alltid har riktig tall.
 */
export function calcRating(history: RatedRound[]): RatingInfo {
  const recent = history.filter((r) => r.mode === 'normal' && r.holes > 0).slice(0, RATING_ROUNDS);
  const holes = recent.reduce((a, r) => a + r.holes, 0);
  if (recent.length === 0 || holes === 0) return { rating: null, rounds: 0, avgPerHole: null, tier: null };
  const avg = recent.reduce((a, r) => a + r.diff, 0) / holes;
  const rating = Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(RATING_BASE - avg * RATING_PER_THROW)));
  return { rating, rounds: recent.length, avgPerHole: avg, tier: ratingTier(rating) };
}
