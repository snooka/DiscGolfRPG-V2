import { ACHIEVEMENTS } from '../data/achievements.ts';
import { allTotals } from './stats.ts';
import type { GameMode, Profile, PublicSummary, RoundHistoryEntry } from '../types.ts';

const MODES: GameMode[] = ['normal', 'dual_tee', 'roulette', 'putter'];

/** Tallene en venn ser på profilen din. Regnes ut fra den private profilen. */
export function buildSummary(profile: Profile): PublicSummary {
  const tm = allTotals(profile.stats);
  const known = new Set(ACHIEVEMENTS.map((a) => a.id));
  return {
    rounds: tm.rounds,
    holes: tm.holes,
    throws: tm.throws,
    aces: tm.counts.ace,
    eagles: tm.counts.eagle,
    birdies: tm.counts.birdie,
    pars: tm.counts.par,
    bogeys: tm.counts.bogey,
    worse: tm.counts.double + tm.counts.triple,
    bestRoundDiff: profile.stats.modes.normal.bestRoundDiff,
    totalKm: Math.round(profile.stats.totalKm * 10) / 10,
    achievements: Object.keys(profile.achievements).filter((id) => known.has(id)).length,
    courses: Object.keys(profile.stats.courses).length,
    modeRounds: {
      normal: profile.stats.modes.normal.rounds,
      dual_tee: profile.stats.modes.dual_tee.rounds,
      roulette: profile.stats.modes.roulette.rounds,
      putter: profile.stats.modes.putter.rounds,
    },
  };
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Leser en lagret oppsummering trygt (skyen kan ha eldre eller ufullstendig data). */
export function parseSummary(raw: unknown): PublicSummary | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.rounds !== 'number') return null;
  const mr = (typeof r.modeRounds === 'object' && r.modeRounds !== null ? r.modeRounds : {}) as Record<string, unknown>;
  return {
    rounds: n(r.rounds),
    holes: n(r.holes),
    throws: n(r.throws),
    aces: n(r.aces),
    eagles: n(r.eagles),
    birdies: n(r.birdies),
    pars: n(r.pars),
    bogeys: n(r.bogeys),
    worse: n(r.worse),
    bestRoundDiff: typeof r.bestRoundDiff === 'number' ? r.bestRoundDiff : null,
    totalKm: n(r.totalKm),
    achievements: n(r.achievements),
    courses: n(r.courses),
    modeRounds: Object.fromEntries(MODES.map((m) => [m, n(mr[m])])) as Record<GameMode, number>,
  };
}

/** Runder som ikke er sendt til skyen ennå. */
export function unsyncedRounds(history: RoundHistoryEntry[], synced: ReadonlySet<string>): RoundHistoryEntry[] {
  return history.filter((h) => !synced.has(h.id));
}
