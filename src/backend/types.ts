import type {
  Account,
  AppNotification,
  CourseItem,
  DiscItem,
  GameMode,
  PlayerPublic,
  PublicProfile,
  PublicSummary,
  RoundHistoryEntry,
  Weather,
} from '../types.ts';

// ==========================================
// BACKEND-GRENSESNITT
// ==========================================
// Appen snakker bare med dette grensesnittet. Produksjon bruker Supabase
// (backend/supabase.ts). Tester bruker en minne-implementasjon
// (tests/helpers/memoryBackend.ts), slik at flerspiller-logikken kan testes
// uten nettverk.

/** Feil med en melding som kan vises direkte til brukeren. */
export class BackendError extends Error {
  readonly code: string;
  constructor(message: string, code = 'error') {
    super(message);
    this.name = 'BackendError';
    this.code = code;
  }
}

export type AuthEvent = 'signed_in' | 'signed_out';

export interface SignUpResult {
  /** true = brukeren må bekrefte e-posten før hun kan logge inn */
  needsConfirmation: boolean;
}

export interface AuthApiBackend {
  /** Eksisterende økt (f.eks. etter reload). null = ikke innlogget. */
  getSession(): Promise<Account | null>;
  onAuthChange(cb: (event: AuthEvent, user: Account | null) => void): () => void;
  signUp(input: { email: string; password: string; name: string }): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Sender e-post med 6-sifret engangskode for å nullstille passordet. */
  requestPasswordReset(email: string): Promise<void>;
  /** Verifiserer 6-sifret kode fra e-posten og setter nytt passord. Logger inn med det nye passordet. */
  resetPasswordWithCode(email: string, code: string, password: string): Promise<void>;
  resendConfirmation(email: string): Promise<void>;
  deleteAccount(): Promise<void>;
}

export interface Friendship {
  id: string;
  status: 'pending' | 'accepted';
  /** incoming = noen har bedt DEG om vennskap */
  direction: 'incoming' | 'outgoing';
  other: PublicProfile;
}

export type FriendRequestResult = 'requested' | 'accepted' | 'already';

// ---------- Runder ----------

export interface RoundHead {
  id: string;
  hostId: string;
  mode: GameMode;
  course: CourseItem;
  holeCount: number;
  config: RoundConfigData;
  status: 'active' | 'finished' | 'abandoned';
  createdAt: number;
  finishedAt: number | null;
}

/** Delt oppsett for runden (lagres i rounds.config). */
export interface RoundConfigData {
  segments: string[];
  weather: Weather | null;
  /** Stod verten på en kjent bane (GPS)? Bare da kan andre spillere bli «verifisert». */
  courseKnown: boolean;
}

export interface RoundPlayerRow {
  key: string;
  name: string;
  userId: string | null;
  position: number;
  verified: boolean;
  left: boolean;
}

export interface RoundHoleRow {
  hole: number; // 1-basert
  par: number;
  confirmed: boolean;
  spin: string | null;
  spinDisc: string | null;
}

export interface RoundScoreRow {
  playerKey: string;
  hole: number; // 1-basert
  score: number;
  putts: number;
  teePick: 1 | 2 | null;
}

export interface RoundRows {
  head: RoundHead;
  players: RoundPlayerRow[];
  holes: RoundHoleRow[];
  scores: RoundScoreRow[];
}

/**
 * En endring i den delte runden. Bare feltene som er satt skrives (delvis
 * oppdatering), slik at to personer som endrer hver sin ting på samme hull
 * ikke overskriver hverandre. Siste skriver vinner per felt.
 */
export type RoundOp =
  | {
      t: 'hole';
      hole: number; // 1-basert
      par?: number;
      confirmed?: boolean;
      spin?: string | null;
      /** JSON-tekst av DiscItem (Disc Roulette med bag) */
      spinDisc?: string | null;
    }
  | {
      t: 'score';
      playerKey: string;
      hole: number; // 1-basert
      score?: number;
      putts?: number;
      teePick?: 1 | 2 | null;
    };

export interface CreateRoundInput {
  id: string;
  mode: GameMode;
  course: CourseItem;
  holeCount: number;
  config: RoundConfigData;
  players: { key: string; name: string; userId: string | null }[];
  /** Verten sin GPS-status */
  hostVerified: boolean;
}

export interface RoundHandlers {
  onOp: (op: RoundOp) => void;
  onPlayer: (row: RoundPlayerRow) => void;
  onHead: (head: RoundHead) => void;
  /** Kalles når (re)koblingen er etablert – bør hente full tilstand på nytt */
  onConnected: () => void;
}

export interface SocialHandlers {
  onFriendsChanged: () => void;
  onNotification: (n: AppNotification) => void;
  /** Ny eller endret runde der jeg er deltaker */
  onMyRoundsChanged: () => void;
  onDirectoryChanged: () => void;
}

export interface PublicSnapshot {
  summary: PublicSummary;
  bag: DiscItem[];
  /** Runder som skal legges til (eksisterende røres ikke) */
  rounds: RoundHistoryEntry[];
}

export interface Backend {
  readonly auth: AuthApiBackend;

  profiles: {
    /** Egen profildata (rå JSON; normaliseres av appen). null = ingen rad ennå. */
    loadMine(userId: string): Promise<unknown>;
    saveMine(
      userId: string,
      data: unknown,
      pub: { xp: number; titleId: string }
    ): Promise<void>;
    /** Opplåste achievements (id -> tidspunkt, ms). Lagres som egne rader i skyen. */
    loadAchievements(userId: string): Promise<Record<string, number>>;
    /** Legger til achievements (eksisterende røres ikke). */
    saveAchievements(userId: string, achievements: Record<string, number>): Promise<void>;
    /**
     * Sender den delbare kopien til skyen: oppsummering, diskbag og nye runder. Rating regnes ut
     * av databasen når runder legges til. Venner leser dette med `loadPublic`.
     */
    syncPublic(userId: string, snapshot: PublicSnapshot): Promise<void>;
    /** Leser en spillers delte profil (egen eller venns). Ikke-venner får tomt svar (RLS). */
    loadPublic(userId: string): Promise<PlayerPublic>;
    /** Alle offentlige profiler (toppliste og søk). */
    directory(): Promise<PublicProfile[]>;
    nameAvailable(name: string): Promise<boolean>;
  };

  friends: {
    list(): Promise<Friendship[]>;
    request(userId: string): Promise<FriendRequestResult>;
    accept(friendshipId: string): Promise<void>;
    /** Fjerner vennskap eller avslår/trekker forespørsel */
    remove(friendshipId: string): Promise<void>;
  };

  notifications: {
    list(): Promise<AppNotification[]>;
    markAllRead(): Promise<void>;
    /** «X gikk forbi deg»: kun til egne venner (håndheves av databasen). */
    sendPassed(toUserId: string, fromUserId: string, text: string): Promise<void>;
  };

  rounds: {
    create(input: CreateRoundInput): Promise<void>;
    load(id: string): Promise<RoundRows | null>;
    /** Aktive runder jeg deltar i, og nylig ferdige (siste 14 dager). */
    listMine(): Promise<RoundHead[]>;
    writeOps(roundId: string, userId: string, ops: RoundOp[]): Promise<void>;
    updateMe(roundId: string, patch: { verified?: boolean; left?: boolean }): Promise<void>;
    finish(roundId: string): Promise<void>;
    abandon(roundId: string): Promise<void>;
  };

  realtime: {
    subscribeSocial(userId: string, handlers: SocialHandlers): () => void;
    subscribeRound(roundId: string, handlers: RoundHandlers): () => void;
  };
}
