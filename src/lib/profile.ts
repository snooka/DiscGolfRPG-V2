import { ACHIEVEMENTS } from '../data/achievements.ts';
import { awardQuests } from './quests.ts';
import type { QuestDef } from './quests.ts';
import type { AchievementDef } from '../data/achievements.ts';
import { ALL_MODES } from '../data/gameModes.ts';
import { DEFAULT_TITLE_ID, TITLES } from '../data/titles.ts';
import type { TitleDef } from '../data/titles.ts';
import { getLevelInfo } from './progress.ts';
import {
  applyRoundToStats,
  emptyCounts,
  emptyModeStats,
  emptyOutcomeStats,
  emptyPlayerStats,
  HOLE_RESULTS,
} from './stats.ts';
import type {
  DiscItem,
  DiscType,
  Group,
  ModeStats,
  PlayerRoundInput,
  PlayerStats,
  Profile,
  RoundHistoryEntry,
  ScoreCounts,
} from '../types.ts';
import { t } from '../i18n/index.ts';

export const HISTORY_LIMIT = 40;

// ==========================================
// OPPRETTE / NORMALISERE PROFIL
// ==========================================

export function createProfile(
  userId: string,
  now: number = Date.now(),
  bag: DiscItem[] = []
): Profile {
  return {
    version: 1,
    userId,
    xp: 0,
    stats: emptyPlayerStats(),
    achievements: {},
    titles: { [DEFAULT_TITLE_ID]: now },
    equippedTitle: null,
    bag,
    groups: [],
    history: [],
    questClaims: {},
  };
}

const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function normalizeCounts(raw: unknown): ScoreCounts {
  const out = emptyCounts();
  if (isRecord(raw)) for (const k of HOLE_RESULTS) out[k] = num(raw[k]);
  return out;
}

function normalizeModeStats(raw: unknown): ModeStats {
  const base = emptyModeStats();
  if (!isRecord(raw)) return base;
  const tee = isRecord(raw.teePicks) ? raw.teePicks : {};
  const byOutcome: ModeStats['byOutcome'] = {};
  if (isRecord(raw.byOutcome)) {
    for (const [id, o] of Object.entries(raw.byOutcome)) {
      if (!isRecord(o)) continue;
      const stat = emptyOutcomeStats();
      stat.holes = num(o.holes);
      stat.throws = num(o.throws);
      stat.diff = num(o.diff);
      stat.counts = normalizeCounts(o.counts);
      byOutcome[id] = stat;
    }
  }
  return {
    rounds: num(raw.rounds),
    holes: num(raw.holes),
    throws: num(raw.throws),
    discsThrown: num(raw.discsThrown),
    parTotal: num(raw.parTotal),
    counts: normalizeCounts(raw.counts),
    bestRoundDiff:
      typeof raw.bestRoundDiff === 'number' && Number.isFinite(raw.bestRoundDiff)
        ? raw.bestRoundDiff
        : null,
    xpEarned: num(raw.xpEarned),
    teePicks: { first: num(tee.first), second: num(tee.second) },
    byOutcome,
    putts: num(raw.putts),
    onePutts: num(raw.onePutts),
    threePutts: num(raw.threePutts),
  };
}

function normalizeStats(raw: unknown): PlayerStats {
  const base = emptyPlayerStats();
  if (!isRecord(raw)) return base;
  const modes = isRecord(raw.modes) ? raw.modes : {};
  for (const m of ALL_MODES) base.modes[m] = normalizeModeStats(modes[m]);
  base.totalKm = num(raw.totalKm);
  if (isRecord(raw.courses)) {
    for (const [id, rec] of Object.entries(raw.courses)) {
      if (isRecord(rec) && isRecord(rec.course)) {
        base.courses[id] = {
          course: rec.course as unknown as PlayerStats['courses'][string]['course'],
          rounds: num(rec.rounds),
          lastPlayed: num(rec.lastPlayed),
        };
      }
    }
  }
  const ex = isRecord(raw.extras) ? raw.extras : {};
  base.extras = {
    rainRounds: num(ex.rainRounds),
    windRounds: num(ex.windRounds),
    treeRounds: num(ex.treeRounds),
    underParRounds: num(ex.underParRounds),
    heavyRainRounds: num(ex.heavyRainRounds),
    stormRounds: num(ex.stormRounds),
    sunRounds: num(ex.sunRounds),
    gustRounds: num(ex.gustRounds),
    hotRounds: num(ex.hotRounds),
    coldRounds: num(ex.coldRounds),
    playDays: num(ex.playDays),
    lastPlayDay: typeof ex.lastPlayDay === 'string' ? ex.lastPlayDay : '',
    firstPlayAt: num(ex.firstPlayAt),
    lastPlayAt: num(ex.lastPlayAt),
  };
  return base;
}

const DISC_TYPE_SET: ReadonlySet<string> = new Set<DiscType>([
  'Putter',
  'Midrange',
  'Fairway Driver',
  'Distance Driver',
]);

function normalizeDisc(raw: unknown): DiscItem | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const type = typeof raw.type === 'string' ? raw.type : '';
  return {
    id: raw.id,
    name: raw.name,
    brand: typeof raw.brand === 'string' ? raw.brand : '',
    type: DISC_TYPE_SET.has(type) ? (type as DiscType) : 'Midrange',
    speed: num(raw.speed, 5),
    glide: num(raw.glide, 5),
    turn: num(raw.turn),
    fade: num(raw.fade),
    plastic: typeof raw.plastic === 'string' ? raw.plastic : '',
    color: typeof raw.color === 'string' ? raw.color : '#10b981',
  };
}

/** Gjør en ukjent verdi om til en gyldig liste med disker. */
export function normalizeBag(raw: unknown): DiscItem[] {
  if (!Array.isArray(raw)) return [];
  const bag: DiscItem[] = [];
  for (const d of raw) {
    const disc = normalizeDisc(d);
    if (disc) bag.push(disc);
  }
  return bag;
}

function normalizeTimestamps(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (isRecord(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number') out[k] = v;
    }
  }
  return out;
}

/** Gjør lagret (muligens gammel eller ødelagt) data om til en gyldig profil. */
function normalizeClaims(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!isRecord(raw)) return out;
  for (const [day, ids] of Object.entries(raw)) {
    if (Array.isArray(ids)) out[day] = ids.filter((x): x is string => typeof x === 'string');
  }
  return out;
}

export function normalizeProfile(raw: unknown, userId: string): Profile {
  const base = createProfile(userId);
  if (!isRecord(raw)) return base;

  const groups: Group[] = [];
  if (Array.isArray(raw.groups)) {
    for (const g of raw.groups) {
      if (!isRecord(g) || typeof g.id !== 'string') continue;
      groups.push({
        id: g.id,
        name: typeof g.name === 'string' ? g.name : t('Gruppe'),
        memberIds: Array.isArray(g.memberIds)
          ? g.memberIds.filter((x): x is string => typeof x === 'string')
          : [],
        guests: Array.isArray(g.guests)
          ? g.guests.filter((x): x is string => typeof x === 'string')
          : [],
      });
    }
  }

  const history: RoundHistoryEntry[] = [];
  if (Array.isArray(raw.history)) {
    for (const h of raw.history) {
      if (!isRecord(h) || typeof h.id !== 'string') continue;
      const mode = ALL_MODES.find((m) => m === h.mode);
      if (!mode) continue;
      history.push({
        id: h.id,
        at: num(h.at),
        mode,
        courseName: typeof h.courseName === 'string' ? h.courseName : '',
        holes: num(h.holes),
        throws: num(h.throws),
        diff: num(h.diff),
        xp: num(h.xp),
        birdies: num(h.birdies),
        putts: num(h.putts),
      });
    }
  }

  return {
    version: 1,
    userId,
    xp: Math.max(0, num(raw.xp)),
    stats: normalizeStats(raw.stats),
    achievements: normalizeTimestamps(raw.achievements),
    titles: {
      [DEFAULT_TITLE_ID]: Date.now(),
      ...normalizeTimestamps(raw.titles),
    },
    equippedTitle:
      typeof raw.equippedTitle === 'string' ? raw.equippedTitle : null,
    bag: normalizeBag(raw.bag),
    groups,
    history: history.slice(0, HISTORY_LIMIT),
    questClaims: normalizeClaims(raw.questClaims),
  };
}

// ==========================================
// OPPLÅSING AV ACHIEVEMENTS OG TITLER
// ==========================================

export interface Unlocks {
  achievements: AchievementDef[];
  titles: TitleDef[];
}

/** Finner det som er nytt opplåst gitt statistikken (rene beregninger). */
export function findNewUnlocks(profile: Profile, stats: PlayerStats): Unlocks {
  return {
    achievements: ACHIEVEMENTS.filter(
      (a) => !profile.achievements[a.id] && a.metric(stats) >= a.target
    ),
    titles: TITLES.filter(
      (tm) => !profile.titles[tm.id] && tm.metric(stats) >= tm.target
    ),
  };
}

export interface RoundOutcomeForPlayer {
  profile: Profile;
  unlocks: Unlocks;
  xpFromRound: number;
  xpFromAchievements: number;
  /** Daily Quests som ble fullført (og belønnet) av denne runden. */
  questsCompleted: QuestDef[];
  xpFromQuests: number;
  levelBefore: number;
  levelAfter: number;
}

/**
 * Anvender en fullført runde på en profil: oppdaterer statistikk for riktig
 * modus, XP, historikk og låser opp achievements/titler. Ren funksjon.
 */
export function applyRoundToProfile(
  profile: Profile,
  input: PlayerRoundInput,
  roundId: string
): RoundOutcomeForPlayer {
  const stats = applyRoundToStats(profile.stats, input);
  const unlocks = findNewUnlocks(profile, stats);
  const xpFromAchievements = unlocks.achievements.reduce((a, x) => a + x.xp, 0);

  const totalThrows = input.holes.reduce((a, h) => a + h.score, 0);
  const totalPar = input.holes.reduce((a, h) => a + h.par, 0);

  const entry: RoundHistoryEntry = {
    id: roundId,
    at: input.at,
    mode: input.mode,
    courseName: input.course.name,
    holes: input.holes.length,
    throws: totalThrows,
    diff: totalThrows - totalPar,
    xp: input.xp + xpFromAchievements,
    birdies: input.holes.filter((h) => h.score < h.par).length,
    putts: input.mode === 'putter' ? input.holes.reduce((a, h) => a + h.putts, 0) : 0,
  };

  const unlockedAchievements = { ...profile.achievements };
  for (const a of unlocks.achievements) unlockedAchievements[a.id] = input.at;
  const unlockedTitles = { ...profile.titles };
  for (const tm of unlocks.titles) unlockedTitles[tm.id] = input.at;

  const withRound: Profile = {
    ...profile,
    xp: profile.xp + input.xp + xpFromAchievements,
    stats,
    achievements: unlockedAchievements,
    titles: unlockedTitles,
    history: [entry, ...profile.history].slice(0, HISTORY_LIMIT),
  };

  // Daily Quests verifiseres automatisk mot resultatet fra runden – ingen manuell henting
  const quests = awardQuests(withRound, input.at);
  const next = quests.profile;
  const xp = next.xp;

  return {
    profile: next,
    unlocks,
    xpFromRound: input.xp,
    xpFromAchievements,
    questsCompleted: quests.completed,
    xpFromQuests: quests.completed.reduce((a, q) => a + q.reward, 0),
    levelBefore: getLevelInfo(profile.xp).level,
    levelAfter: getLevelInfo(xp).level,
  };
}

/**
 * Slår sammen achievements fra profildata og fra skyens egne rader. Unionen beholdes,
 * og ved dobbelt opplåsing gjelder det tidligste tidspunktet. `changed` = profilen manglet noe.
 */
export function mergeAchievements(
  local: Record<string, number>,
  cloud: Record<string, number>
): { achievements: Record<string, number>; changed: boolean } {
  const out: Record<string, number> = { ...local };
  let changed = false;
  for (const [id, at] of Object.entries(cloud)) {
    if (!(id in out)) {
      out[id] = at;
      changed = true;
    } else if (at < out[id]) {
      out[id] = at;
    }
  }
  return { achievements: out, changed };
}

/** Achievements som ikke er lagret som egne rader i skyen ennå. */
export function newAchievements(
  current: Record<string, number>,
  saved: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(current)) if (!(id in saved)) out[id] = at;
  return out;
}
