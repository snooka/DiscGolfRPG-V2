// ==========================================
// Felles typer for hele appen
// ==========================================

export type GameMode = 'normal' | 'dual_tee' | 'roulette' | 'putter';

export type DiscType =
  | 'Putter'
  | 'Midrange'
  | 'Fairway Driver'
  | 'Distance Driver';

/** Resultat på ett hull, relativt til par. */
export type HoleResult =
  | 'ace'
  | 'eagle'
  | 'birdie'
  | 'par'
  | 'bogey'
  | 'double'
  | 'triple';

export type ScoreCounts = Record<HoleResult, number>;

// ---------- Baner ----------

export interface CourseItem {
  id: string;
  name: string;
  location: string;
  holes: number;
  par: number;
  image: string;
  lat: number;
  lng: number;
}

// ---------- Diskbag ----------

export interface DiscItem {
  id: string;
  name: string;
  brand: string;
  type: DiscType;
  speed: number;
  glide: number;
  turn: number;
  fade: number;
  plastic: string;
  color: string;
}

// ---------- Brukere ----------

/** Innlogget bruker (hentet fra skyen). Passord håndteres kun av Supabase Auth. */
export interface Account {
  id: string;
  email: string;
  name: string;
  createdAt: number;
}

/** Offentlig profil – det alle innloggede kan se (toppliste, venne-søk). */
export interface PublicProfile {
  id: string;
  name: string;
  xp: number;
  /** Valgt tittel (id), null = høyeste opplåste */
  titleId: string | null;
  /** Rating (Normal Game), null = ingen runder ennå. Regnes ut i skyen. */
  rating: number | null;
  ratingRounds: number;
}

/** Samlet statistikk som venner kan se på profilen din (tall, ikke rådata). */
export interface PublicSummary {
  rounds: number;
  holes: number;
  throws: number;
  /** Antall hull per resultat, alle spillmodi */
  aces: number;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  /** Dobbel bogey eller verre */
  worse: number;
  /** Beste Normal Game-runde mot par (null = ingen) */
  bestRoundDiff: number | null;
  totalKm: number;
  achievements: number;
  courses: number;
  /** Antall runder per spillmodus */
  modeRounds: Record<GameMode, number>;
}

/** Det en venn kan se av en spillers profil. */
export interface PlayerPublic {
  summary: PublicSummary | null;
  bag: DiscItem[];
  /** Nyeste først */
  rounds: RoundHistoryEntry[];
}

// ---------- Statistikk ----------

/** Statistikk for ett utfall på Disc Roulette (f.eks. «Putter»). */
export interface OutcomeStats {
  holes: number;
  throws: number;
  /** Sum av (kast - par) over alle hull med dette utfallet. */
  diff: number;
  counts: ScoreCounts;
}

/** All statistikk for én spillmodus. Hver modus har sitt eget regnskap. */
export interface ModeStats {
  rounds: number;
  holes: number;
  /** Antall kast som teller på scorekortet. */
  throws: number;
  /** Antall disker faktisk kastet (inkl. gratis ekstra tee-kast i Dual Tee). */
  discsThrown: number;
  parTotal: number;
  counts: ScoreCounts;
  bestRoundDiff: number | null;
  xpEarned: number;
  /** Dual Tee: hvilket av de to tee-kastene som ble valgt. */
  teePicks: { first: number; second: number };
  /** Disc Roulette: statistikk per utfall (id fra ROULETTE_SEGMENTS). */
  byOutcome: Record<string, OutcomeStats>;
  /** Putter Game: totalt antall putts, ein-putts og tre-putts (eller flere). */
  putts: number;
  onePutts: number;
  threePutts: number;
}

export interface ExtraCounters {
  rainRounds: number;
  windRounds: number;
  /** Runder med minst 3 hull på +2 eller dårligere («furutrær»). */
  treeRounds: number;
  /** Normal Game-runder på eller under banens par. */
  underParRounds: number;
  /** Runder på bane med kraftig regn (≥ 2 mm/t). */
  heavyRainRounds: number;
  /** Runder i storm (vind ≥ 12 m/s). */
  stormRounds: number;
  /** Runder i sol. */
  sunRounds: number;
  /** Runder med vindkast over 8 m/s. */
  gustRounds: number;
  /** Runder ved ≥ 22 °C. */
  hotRounds: number;
  /** Runder ved ≤ 0 °C. */
  coldRounds: number;
  /** Antall ulike dager man har spilt (GPS-verifiserte runder). */
  playDays: number;
  /** Siste dag (lokal dato) som er telt i playDays. */
  lastPlayDay: string;
  /** Tidspunkt for første og siste fullførte runde (0 = ingen). */
  firstPlayAt: number;
  lastPlayAt: number;
}

export interface CourseRecord {
  course: CourseItem;
  rounds: number;
  lastPlayed: number;
}

export interface PlayerStats {
  modes: Record<GameMode, ModeStats>;
  totalKm: number;
  courses: Record<string, CourseRecord>;
  extras: ExtraCounters;
}

export interface RoundHistoryEntry {
  id: string;
  at: number;
  mode: GameMode;
  courseName: string;
  holes: number;
  throws: number;
  diff: number;
  xp: number;
  /** Antall hull under par i runden (brukes av Daily Quests). */
  birdies: number;
  /** Antall putts (Putter Game). */
  putts: number;
}

// ---------- Profil ----------

export interface Group {
  id: string;
  name: string;
  /** Brukerid-er til venner (må fortsatt være venner for å bli med i en runde). */
  memberIds: string[];
  /** Navn på gjestespillere (uten konto). */
  guests: string[];
}

export interface Profile {
  version: 1;
  userId: string;
  xp: number;
  stats: PlayerStats;
  /** achievement-id -> tidspunkt låst opp */
  achievements: Record<string, number>;
  /** tittel-id -> tidspunkt låst opp */
  titles: Record<string, number>;
  /** Valgt tittel; null = høyeste opplåste tittel velges automatisk. */
  equippedTitle: string | null;
  bag: DiscItem[];
  groups: Group[];
  history: RoundHistoryEntry[];
  /** Daily Quests: dato (lokal) -> id-er på quests det er hentet belønning for. Kun dagens dato beholdes. */
  questClaims: Record<string, string[]>;
}

// ---------- Runde (pågående) ----------

export interface Weather {
  isRain: boolean;
  /** Mm nedbør neste time. */
  rainMm: number;
  isSunny: boolean;
  isWindy: boolean;
  windSpeed: number;
  /** Høyeste vindkast (m/s) i perioden. Kan mangle i eldre runder. */
  windGust?: number;
  temp: number;
  desc: string;
}

export interface RoundPlayer {
  /** Unik nøkkel innen runden. */
  key: string;
  name: string;
  /** null = gjestespiller (ingen konto, ingenting lagres på profil). */
  userId: string | null;
  /** Har forlatt runden (får ikke runden på profilen sin). */
  left?: boolean;
}

export interface HoleLayout {
  hole: number;
  par: number;
}

export type TeePick = 1 | 2;

export interface RoundState {
  id: string;
  startedAt: number;
  mode: GameMode;
  course: CourseItem;
  layout: HoleLayout[];
  players: RoundPlayer[];
  /** [spiller][hull] = antall kast som teller */
  scores: number[][];
  /** [spiller][hull] – kun Dual Tee */
  teePicks: (TeePick | null)[][];
  /** [hull] = utfalls-id fra hjulet – kun Disc Roulette */
  spins: (string | null)[];
  /** Hvilke segmenter som er på hjulet (Disc Roulette) */
  segments: string[];
  /** [spiller][hull] = antall putts – kun Putter Game */
  putts: number[][];
  /** [hull] = id til disk fra bagen hjulet landet på (kun Disc Roulette med bag-hjul) */
  spinDiscs: (string | null)[];
  /** [hull] = selve disken (kopi), slik at alle i runden ser hvilken disk som ble trukket */
  spinDiscItems: (DiscItem | null)[];
  /** Hjulkilde: 'generic' | 'bag:all' | 'bag:<disktype>' */
  wheelSource: string;
  /** Stod spilleren på banen (GPS) da runden startet? Kun da lagres banen og vær-achievements gis. */
  courseVerified: boolean;
  /** Hull som er bekreftet via «Lagre hull» */
  confirmed: boolean[];
  currentHole: number;
  steps: number;
  weather: Weather | null;
}

export interface PlayedHole {
  par: number;
  score: number;
  outcomeId: string | null;
  teePick: TeePick | null;
  putts: number;
}

export interface PlayerRoundInput {
  mode: GameMode;
  course: CourseItem;
  at: number;
  holes: PlayedHole[];
  km: number;
  weather: Weather | null;
  /** GPS bekreftet at runden ble spilt på banen. */
  verified: boolean;
  xp: number;
}

// ---------- Varsler ----------

export type NotificationKind = 'passed' | 'round_invite' | 'friend_request' | 'friend_accepted';

export interface AppNotification {
  id: string;
  at: number;
  kind: NotificationKind;
  /** Hvem varselet kommer fra (id) */
  fromId: string | null;
  text: string;
  /** Ekstra data, f.eks. { roundId } for runde-invitasjoner */
  data: Record<string, unknown>;
  read: boolean;
}
