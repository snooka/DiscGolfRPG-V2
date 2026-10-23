import { GUST_LIMIT } from './weather.ts';
import { DUAL_TEE_EXTRA_THROW_COUNTS, ALL_MODES } from '../data/gameModes.ts';
import { dayKey } from './quests.ts';
import type {
  ExtraCounters,
  GameMode,
  HoleResult,
  ModeStats,
  OutcomeStats,
  PlayerRoundInput,
  PlayerStats,
  ScoreCounts,
} from '../types.ts';
import { t } from '../i18n/index.ts';

// ==========================================
// TOMME STATISTIKK-OBJEKTER
// ==========================================

export const HOLE_RESULTS: HoleResult[] = [
  'ace',
  'eagle',
  'birdie',
  'par',
  'bogey',
  'double',
  'triple',
];

export const emptyCounts = (): ScoreCounts => ({
  ace: 0,
  eagle: 0,
  birdie: 0,
  par: 0,
  bogey: 0,
  double: 0,
  triple: 0,
});

export const emptyOutcomeStats = (): OutcomeStats => ({
  holes: 0,
  throws: 0,
  diff: 0,
  counts: emptyCounts(),
});

export const emptyModeStats = (): ModeStats => ({
  rounds: 0,
  holes: 0,
  throws: 0,
  discsThrown: 0,
  parTotal: 0,
  counts: emptyCounts(),
  bestRoundDiff: null,
  xpEarned: 0,
  teePicks: { first: 0, second: 0 },
  byOutcome: {},
  putts: 0,
  onePutts: 0,
  threePutts: 0,
});

export const emptyExtras = (): ExtraCounters => ({
  rainRounds: 0,
  windRounds: 0,
  treeRounds: 0,
  underParRounds: 0,
  heavyRainRounds: 0,
  stormRounds: 0,
  sunRounds: 0,
  gustRounds: 0,
  hotRounds: 0,
  coldRounds: 0,
  playDays: 0,
  lastPlayDay: '',
  firstPlayAt: 0,
  lastPlayAt: 0,
});

export const emptyPlayerStats = (): PlayerStats => ({
  modes: {
    normal: emptyModeStats(),
    dual_tee: emptyModeStats(),
    roulette: emptyModeStats(),
    putter: emptyModeStats(),
  },
  totalKm: 0,
  courses: {},
  extras: emptyExtras(),
});

// ==========================================
// KLASSIFISERING AV ETT HULL
// ==========================================

/** Ace = 1 kast. Ellers avgjøres resultatet av differansen mot par. */
export function classifyHole(score: number, par: number): HoleResult {
  if (score <= 1) return 'ace';
  const diff = score - par;
  if (diff <= -2) return 'eagle';
  if (diff === -1) return 'birdie';
  if (diff === 0) return 'par';
  if (diff === 1) return 'bogey';
  if (diff === 2) return 'double';
  return 'triple';
}

export const RESULT_LABELS: Record<HoleResult, string> = {
  get ace() { return t('Ace'); },
  get eagle() { return t('Eagle'); },
  get birdie() { return t('Birdie'); },
  get par() { return t('Par'); },
  get bogey() { return t('Bogey'); },
  get double() { return t(t('Dobbel bogey')); },
  get triple() { return t('Triple bogey+'); },
};

/** Kort tekst til scorekortet, f.eks. «Birdie 🐦» eller «+3». */
export function describeHole(score: number, par: number): string {
  const result = classifyHole(score, par);
  const diff = score - par;
  switch (result) {
    case 'ace':
      return 'ACE! 🌟';
    case 'eagle':
      return diff <= -3 ? `Albatross ${diff}` : 'Eagle 🦅';
    case 'birdie':
      return 'Birdie 🐦';
    case 'par':
      return t('Par');
    case 'bogey':
      return 'Bogey';
    case 'double':
      return t('Dobbel bogey');
    default:
      return `+${diff}`;
  }
}

/** «E», «+3» eller «-2». */
export function formatDiff(diff: number): string {
  if (diff === 0) return 'E';
  return diff > 0 ? `+${diff}` : `${diff}`;
}

// ==========================================
// OPPDATERE STATISTIKK ETTER EN RUNDE
// ==========================================

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Legger én fullført runde til en spillers statistikk. Returnerer en ny
 * kopi. Alt føres kun i statistikken til *den valgte modusen*, slik at
 * Disc Roulette og Dual Tee aldri påvirker tallene til Normal Game.
 */
export function applyRoundToStats(
  stats: PlayerStats,
  input: PlayerRoundInput
): PlayerStats {
  const next = structuredClone(stats);
  const mode = next.modes[input.mode];

  let roundThrows = 0;
  let roundPar = 0;
  let heavyHoles = 0;

  for (const hole of input.holes) {
    const result = classifyHole(hole.score, hole.par);
    mode.counts[result] += 1;
    mode.holes += 1;
    mode.throws += hole.score;
    mode.parTotal += hole.par;

    const extraTeeThrow =
      input.mode === 'dual_tee' && !DUAL_TEE_EXTRA_THROW_COUNTS ? 1 : 0;
    mode.discsThrown += hole.score + extraTeeThrow;

    roundThrows += hole.score;
    roundPar += hole.par;
    if (hole.score - hole.par >= 2) heavyHoles += 1;

    if (input.mode === 'putter') {
      const putts = Math.max(0, Math.min(hole.putts, hole.score));
      mode.putts += putts;
      if (putts === 1) mode.onePutts += 1;
      if (putts >= 3) mode.threePutts += 1;
    }

    if (input.mode === 'dual_tee' && hole.teePick) {
      if (hole.teePick === 1) mode.teePicks.first += 1;
      else mode.teePicks.second += 1;
    }

    if (input.mode === 'roulette' && hole.outcomeId) {
      const outcome: OutcomeStats =
        mode.byOutcome[hole.outcomeId] ?? emptyOutcomeStats();
      outcome.holes += 1;
      outcome.throws += hole.score;
      outcome.diff += hole.score - hole.par;
      outcome.counts[result] += 1;
      mode.byOutcome[hole.outcomeId] = outcome;
    }
  }

  const roundDiff = roundThrows - roundPar;
  mode.rounds += 1;
  mode.bestRoundDiff =
    mode.bestRoundDiff === null
      ? roundDiff
      : Math.min(mode.bestRoundDiff, roundDiff);
  mode.xpEarned += input.xp;

  next.totalKm = round2(next.totalKm + input.km);

  // Baner lagres kun når GPS bekrefter at man faktisk spilte på banen
  if (input.verified) {
    const prevCourse = next.courses[input.course.id];
    next.courses[input.course.id] = {
      course: input.course,
      rounds: (prevCourse?.rounds ?? 0) + 1,
      lastPlayed: input.at,
    };
  }

  // Dager spilt (for langtidsachievements)
  const today = dayKey(input.at);
  if (next.extras.lastPlayDay !== today) {
    next.extras.playDays += 1;
    next.extras.lastPlayDay = today;
  }
  if (next.extras.firstPlayAt === 0) next.extras.firstPlayAt = input.at;
  next.extras.lastPlayAt = input.at;

  // Vær-achievements gis kun når man står på banen (verified) og været er kjent
  const w = input.verified ? input.weather : null;
  if (w) {
    if (w.isRain) next.extras.rainRounds += 1;
    if (w.rainMm >= 2) next.extras.heavyRainRounds += 1;
    if (w.isWindy) next.extras.windRounds += 1;
    if (w.windSpeed >= 12) next.extras.stormRounds += 1;
    if (w.isSunny) next.extras.sunRounds += 1;
    if ((w.windGust ?? 0) > GUST_LIMIT) next.extras.gustRounds += 1;
    if (w.temp >= 22) next.extras.hotRounds += 1;
    if (w.temp <= 0) next.extras.coldRounds += 1;
  }
  if (heavyHoles >= 3) next.extras.treeRounds += 1;
  if (input.mode === 'normal' && roundDiff <= 0) next.extras.underParRounds += 1;

  return next;
}

// ==========================================
// AGGREGERING / HJELPEFUNKSJONER
// ==========================================

export function sumCounts(list: ScoreCounts[]): ScoreCounts {
  const total = emptyCounts();
  for (const c of list) {
    for (const key of HOLE_RESULTS) total[key] += c[key];
  }
  return total;
}

export interface Totals {
  rounds: number;
  holes: number;
  throws: number;
  discsThrown: number;
  counts: ScoreCounts;
}

/** Summerer tvers av modi (for «Alle»-visning og generelle achievements). */
export function totalsForModes(stats: PlayerStats, modes: GameMode[]): Totals {
  const list = modes.map((m) => stats.modes[m]);
  return {
    rounds: list.reduce((a, m) => a + m.rounds, 0),
    holes: list.reduce((a, m) => a + m.holes, 0),
    throws: list.reduce((a, m) => a + m.throws, 0),
    discsThrown: list.reduce((a, m) => a + m.discsThrown, 0),
    counts: sumCounts(list.map((m) => m.counts)),
  };
}

export const allTotals = (stats: PlayerStats): Totals =>
  totalsForModes(stats, ALL_MODES);

/** Ace + Eagle + Birdie. */
export const underParHoles = (c: ScoreCounts): number =>
  c.ace + c.eagle + c.birdie;

/** Par eller bedre. */
export const parOrBetter = (c: ScoreCounts): number => underParHoles(c) + c.par;

export const percent = (part: number, whole: number): number =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;
