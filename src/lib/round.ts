import { applyRoundToProfile } from './profile.ts';
import type { RoundOutcomeForPlayer } from './profile.ts';
import { xpForRound } from './progress.ts';
import { makeId } from './random.ts';
import type {
  CourseItem,
  DiscItem,
  GameMode,
  PlayedHole,
  PlayerRoundInput,
  Profile,
  RoundPlayer,
  RoundState,
  TeePick,
  Weather,
} from '../types.ts';
import { t } from '../i18n/index.ts';

// ==========================================
// RUNDE-LOGIKK (rene funksjoner – ingen React)
// ==========================================

export const MAX_PLAYERS = 6;
export const MIN_SCORE = 1;
export const MAX_SCORE = 15;
export const DEFAULT_PAR = 3;
export const PAR_OPTIONS = [3, 4, 5] as const;

export interface RoundConfig {
  mode: GameMode;
  course: CourseItem;
  holeCount: number;
  players: RoundPlayer[];
  segments: string[];
  weather: Weather | null;
  /** GPS bekreftet at spilleren står på banen. */
  courseVerified: boolean;
}

export function createRound(config: RoundConfig, now = Date.now()): RoundState {
  const layout = Array.from({ length: config.holeCount }, (_, i) => ({
    hole: i + 1,
    par: DEFAULT_PAR,
  }));
  return {
    id: makeId('r'),
    startedAt: now,
    mode: config.mode,
    course: config.course,
    layout,
    players: config.players,
    scores: config.players.map(() => layout.map((h) => h.par)),
    teePicks: config.players.map(() => layout.map(() => null)),
    putts: config.players.map(() => layout.map(() => 0)),
    spinDiscs: layout.map(() => null),
    spinDiscItems: layout.map(() => null),
    wheelSource: 'generic',
    courseVerified: config.courseVerified,
    spins: layout.map(() => null),
    segments: config.segments,
    confirmed: layout.map(() => false),
    currentHole: 0,
    steps: 0,
    weather: config.weather,
  };
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const replaceAt = <T>(list: T[], index: number, value: T): T[] =>
  list.map((item, i) => (i === index ? value : item));

/** Endrer antall kast for en spiller på nåværende hull. */
export function adjustScore(
  round: RoundState,
  playerIndex: number,
  delta: number
): RoundState {
  const hole = round.currentHole;
  const row = round.scores[playerIndex];
  if (!row) return round;
  const next = clamp(row[hole] + delta, MIN_SCORE, MAX_SCORE);
  if (next === row[hole]) return round;
  // Antall putts kan aldri overstige antall kast
  const puttRow = round.putts[playerIndex];
  const putts =
    puttRow && puttRow[hole] > next
      ? replaceAt(round.putts, playerIndex, replaceAt(puttRow, hole, next))
      : round.putts;
  return {
    ...round,
    putts,
    scores: replaceAt(round.scores, playerIndex, replaceAt(row, hole, next)),
  };
}

/** Putter Game: endrer antall putts for en spiller på nåværende hull (0 … antall kast). */
export function adjustPutts(
  round: RoundState,
  playerIndex: number,
  delta: number
): RoundState {
  const hole = round.currentHole;
  const row = round.putts[playerIndex];
  if (!row) return round;
  const next = clamp(row[hole] + delta, 0, round.scores[playerIndex][hole]);
  if (next === row[hole]) return round;
  return { ...round, putts: replaceAt(round.putts, playerIndex, replaceAt(row, hole, next)) };
}

export function setWheelSource(round: RoundState, source: string): RoundState {
  return source === round.wheelSource ? round : { ...round, wheelSource: source };
}

/**
 * Setter par for nåværende hull. Spillere som ikke har rørt scoren
 * (den står fortsatt på gammel par) følger med til ny par.
 */
export function setHolePar(round: RoundState, par: number): RoundState {
  const hole = round.currentHole;
  const oldPar = round.layout[hole].par;
  if (par === oldPar) return round;
  return {
    ...round,
    layout: replaceAt(round.layout, hole, { ...round.layout[hole], par }),
    scores: round.scores.map((row) =>
      row[hole] === oldPar && !round.confirmed[hole]
        ? replaceAt(row, hole, par)
        : row
    ),
  };
}

export function setTeePick(
  round: RoundState,
  playerIndex: number,
  pick: TeePick
): RoundState {
  const hole = round.currentHole;
  const row = round.teePicks[playerIndex];
  if (!row) return round;
  return {
    ...round,
    teePicks: replaceAt(round.teePicks, playerIndex, replaceAt(row, hole, pick)),
  };
}

/** Lagrer hjulets resultat for et hull. Et hull kan bare spinnes én gang. */
export function recordSpin(
  round: RoundState,
  hole: number,
  outcomeId: string,
  disc: DiscItem | null = null
): RoundState {
  if (round.spins[hole] !== null && round.spins[hole] !== undefined) {
    return round;
  }
  return {
    ...round,
    spins: replaceAt(round.spins, hole, outcomeId),
    spinDiscs: replaceAt(round.spinDiscs, hole, disc?.id ?? null),
    spinDiscItems: replaceAt(round.spinDiscItems, hole, disc),
  };
}

export function goToHole(round: RoundState, hole: number): RoundState {
  const target = clamp(hole, 0, round.layout.length - 1);
  return target === round.currentHole ? round : { ...round, currentHole: target };
}

/** Hvorfor nåværende hull ikke kan lagres ennå (null = klart). */
export function holeBlockReason(round: RoundState, hole: number): string | null {
  if (round.mode === 'roulette' && !round.spins[hole]) {
    return t('Spinn hjulet først.');
  }
  if (
    round.mode === 'dual_tee' &&
    round.teePicks.some((row) => !row[hole])
  ) {
    return t('Velg beste tee-kast for alle spillere.');
  }
  return null;
}

/** Markerer hull som lagret. Går videre til neste hull hvis det finnes. */
export function confirmHole(round: RoundState, hole: number): RoundState {
  if (holeBlockReason(round, hole)) return round;
  const confirmed = replaceAt(round.confirmed, hole, true);
  const nextHole = Math.min(round.layout.length - 1, hole + 1);
  return { ...round, confirmed, currentHole: hole === round.currentHole ? nextHole : round.currentHole };
}

/** Indekser til hull som ikke er lagret ennå. */
export function unconfirmedHoles(round: RoundState): number[] {
  return round.confirmed.flatMap((done, i) => (done ? [] : [i]));
}

/** Resultatet kan først vises/lagres når alle hull er spilt og lagret. */
export const allHolesPlayed = (round: RoundState): boolean =>
  unconfirmedHoles(round).length === 0;

export interface PlayerTotals {
  throws: number;
  par: number;
  diff: number;
}

/** Sum av lagrede (bekreftede) hull for en spiller. */
export function playerTotals(
  round: RoundState,
  playerIndex: number
): PlayerTotals {
  let throws = 0;
  let par = 0;
  round.layout.forEach((hole, i) => {
    if (round.confirmed[i]) {
      throws += round.scores[playerIndex][i];
      par += hole.par;
    }
  });
  return { throws, par, diff: throws - par };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Gått distanse. Bruker skritteller, men anslår hvis den nesten ikke har målt noe. */
export function roundDistanceKm(steps: number, holes: number): number {
  const walked = round2((steps * 0.76) / 1000);
  return walked > 0.2 ? walked : round2(holes * 0.14);
}

// ==========================================
// FULLFØRE RUNDEN
// ==========================================

export interface PlayerRoundResult {
  player: RoundPlayer;
  throws: number;
  par: number;
  diff: number;
  /** Kast per hull (i hullrekkefølge) */
  holeScores: number[];
  /** Bare for registrerte spillere (ikke gjester). */
  outcome: RoundOutcomeForPlayer | null;
}

export interface RoundResult {
  roundId: string;
  mode: GameMode;
  course: CourseItem;
  /** Antall hull som ble spilt og registrert */
  holes: number;
  /** Antall hull banen/runden var satt opp med */
  totalHoles: number;
  km: number;
  /** Par per hull */
  pars: number[];
  /** Stod man på banen (GPS)? Da lagres banen og vær-achievements gis. */
  verified: boolean;
  players: PlayerRoundResult[];
}

/** Hull som faktisk er spilt og lagret (ulagrede hull teller ikke med). */
const playedIndexes = (round: RoundState): number[] =>
  round.layout.flatMap((_, i) => (round.confirmed[i] ? [i] : []));

function playedHolesFor(round: RoundState, playerIndex: number): PlayedHole[] {
  return playedIndexes(round).map((i) => ({
    par: round.layout[i].par,
    score: round.scores[playerIndex][i],
    outcomeId: round.mode === 'roulette' ? round.spins[i] : null,
    teePick: round.mode === 'dual_tee' ? round.teePicks[playerIndex][i] : null,
    putts: round.mode === 'putter' ? round.putts[playerIndex][i] : 0,
  }));
}

/**
 * Regner ut resultatet og oppdaterer profilene til alle registrerte spillere.
 * Alle hull må være lagret – scoreboardet kan ikke åpnes før hele runden er
 * spilt (avbryt runden i stedet). Ren funksjon: returnerer
 * nye profiler, ingenting lagres her.
 */
export function finishRound(
  round: RoundState,
  profiles: Record<string, Profile>,
  now = Date.now()
): { result: RoundResult; updatedProfiles: Record<string, Profile> } {
  const holes = playedIndexes(round).length;
  if (!allHolesPlayed(round)) {
    throw new Error(t('Alle hull må være spilt og lagret før runden kan fullføres'));
  }

  const km = roundDistanceKm(round.steps, holes);
  const xp = xpForRound(round.mode, holes);
  const updatedProfiles: Record<string, Profile> = {};

  const players: PlayerRoundResult[] = round.players.map((player, i) => {
    const totals = playerTotals(round, i);
    let outcome: RoundOutcomeForPlayer | null = null;

    const profile = player.userId ? profiles[player.userId] : undefined;
    if (player.userId && profile && !player.left && !updatedProfiles[player.userId]) {
      const input: PlayerRoundInput = {
        mode: round.mode,
        course: round.course,
        at: now,
        holes: playedHolesFor(round, i),
        km,
        weather: round.courseVerified ? round.weather : null,
        verified: round.courseVerified,
        xp,
      };
      outcome = applyRoundToProfile(profile, input, round.id);
      updatedProfiles[player.userId] = outcome.profile;
    }
    return { player, ...totals, holeScores: round.scores[i].slice(), outcome };
  });

  players.sort((a, b) => a.diff - b.diff || a.throws - b.throws);

  return {
    result: {
      roundId: round.id,
      mode: round.mode,
      course: round.course,
      holes,
      totalHoles: round.layout.length,
      km,
      pars: round.layout.map((h) => h.par),
      verified: round.courseVerified,
      players,
    },
    updatedProfiles,
  };
}
