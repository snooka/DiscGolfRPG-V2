import { BackendError } from '../../src/backend/types.ts';
import type {
  AuthEvent,
  CreateRoundInput,
  FriendRequestResult,
  Friendship,
  RoundHandlers,
  RoundHead,
  RoundHoleRow,
  RoundOp,
  RoundPlayerRow,
  RoundRows,
  RoundScoreRow,
  SocialHandlers,
} from '../../src/backend/types.ts';
import type { ExtendedBackend } from '../../src/backend/index.ts';
import { calcRating } from '../../src/lib/rating.ts';
import type {
  Account,
  AppNotification,
  DiscItem,
  PlayerPublic,
  PublicProfile,
  PublicSummary,
  RoundHistoryEntry,
} from '../../src/types.ts';

// ==========================================
// BACKEND I MINNET – KUN FOR TESTER OG VERIFIKASJON
// ==========================================
// Etterligner reglene i supabase/schema.sql (venner, medlemskap, «alle hull
// må være lagret», delvise oppdateringer) uten nettverk. Flere «enheter» kan
// dele samme server; hver enhet har sin egen innloggede bruker.
// Selve SQL-reglene er testet separat mot ekte Postgres.

interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  confirmed: boolean;
  createdAt: number;
}

interface StoredRound {
  head: RoundHead;
  players: RoundPlayerRow[];
  holes: Record<number, RoundHoleRow>;
  scores: Record<string, RoundScoreRow>;
}

interface FriendRow {
  id: string;
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
}

export interface Mail {
  to: string;
  kind: 'confirm' | 'reset';
  token: string;
}

export interface ServerState {
  users: Record<string, User>;
  profileData: Record<string, unknown>;
  achievements?: Record<string, Record<string, number>>;
  /** Delbar kopi (tilsvarer profile_public, user_discs, player_rounds) */
  shared?: Record<string, { summary: PublicSummary | null; bag: DiscItem[]; rounds: RoundHistoryEntry[] }>;
  pub: Record<string, { xp: number; titleId: string | null }>;
  friendships: FriendRow[];
  notifications: (AppNotification & { userId: string })[];
  rounds: Record<string, StoredRound>;
  mails: Mail[];
  seq: number;
}

export type Message =
  | { k: 'op'; roundId: string; op: RoundOp; to: string[] }
  | { k: 'player'; roundId: string; row: RoundPlayerRow; to: string[] }
  | { k: 'head'; roundId: string; head: RoundHead; to: string[] }
  | { k: 'notif'; n: AppNotification; to: string }
  | { k: 'friends'; to: string[] }
  | { k: 'rounds'; to: string[] }
  | { k: 'dir' };

export interface Env {
  load(): ServerState;
  save(state: ServerState): void;
  post(msg: Message): void;
  onMessage(cb: (msg: Message) => void): void;
  session: { get(): string | null; set(id: string | null): void };
  /** Lenke fra e-post (nullstilling): token i adressen */
  initialLink?: string | null;
}

export const emptyState = (): ServerState => ({
  users: {},
  profileData: {},
  pub: {},
  friendships: [],
  notifications: [],
  rounds: {},
  mails: [],
  seq: 1,
});

/** Delt «server» for tester i samme prosess. */
export class MemoryServer {
  state: ServerState = emptyState();
  offline = false;
  private subscribers = new Set<(msg: Message) => void>();

  post = (msg: Message): void => {
    for (const s of [...this.subscribers]) queueMicrotask(() => s(msg));
  };

  /** Ny «telefon» koblet til serveren. */
  device(options: { requireConfirmation?: boolean } = {}): MemoryBackend {
    let session: string | null = null;
    const env: Env = {
      load: () => this.state,
      save: (s) => {
        this.state = s;
      },
      post: this.post,
      onMessage: (cb) => {
        this.subscribers.add(cb);
      },
      session: { get: () => session, set: (id) => (session = id) },
    };
    return new MemoryBackend(env, () => this.offline, options.requireConfirmation ?? false);
  }
}

export class MemoryBackend implements ExtendedBackend {
  private authListeners = new Set<(e: AuthEvent, u: Account | null) => void>();
  private readonly env: Env;
  private readonly isOffline: () => boolean;
  private readonly requireConfirmation: boolean;

  constructor(env: Env, isOffline: () => boolean = () => false, requireConfirmation = false) {
    this.env = env;
    this.isOffline = isOffline;
    this.requireConfirmation = requireConfirmation;
    if (env.initialLink) {
      const mail = env.load().mails.find((m) => m.token === env.initialLink);
      const user = mail ? Object.values(env.load().users).find((u) => u.email === mail.to) : undefined;
      if (mail && user) {
        user.confirmed = true;
        env.save(env.load());
        env.session.set(user.id);
      }
    }
  }

  // ---------- hjelpere ----------

  private get db(): ServerState {
    if (this.isOffline()) throw new BackendError('Får ikke kontakt med serveren. Sjekk nettforbindelsen.');
    return this.env.load();
  }
  private commit(): void {
    this.env.save(this.env.load());
  }
  private get uid(): string {
    const id = this.env.session.get();
    if (!id) throw new BackendError('Ikke innlogget');
    return id;
  }
  private toAccount(u: User): Account {
    return { id: u.id, email: u.email, name: u.name, createdAt: u.createdAt };
  }
  private publicOf(id: string): PublicProfile | null {
    const u = this.env.load().users[id];
    if (!u) return null;
    const p = this.env.load().pub[id] ?? { xp: 0, titleId: null };
    const rated = calcRating(this.env.load().shared?.[id]?.rounds ?? []);
    return { id, name: u.name, xp: p.xp, titleId: p.titleId, rating: rated.rating, ratingRounds: rated.rounds };
  }
  private newId(prefix: string): string {
    const s = this.env.load();
    s.seq += 1;
    return `${prefix}${s.seq}`;
  }
  private areFriends(a: string, b: string): boolean {
    return this.env
      .load()
      .friendships.some(
        (f) =>
          f.status === 'accepted' &&
          ((f.requester === a && f.addressee === b) || (f.requester === b && f.addressee === a))
      );
  }
  private isMember(round: StoredRound, userId: string): boolean {
    return round.players.some((p) => p.userId === userId);
  }
  private memberIds(round: StoredRound): string[] {
    return round.players.flatMap((p) => (p.userId ? [p.userId] : []));
  }
  private notify(to: string, from: string | null, kind: AppNotification['kind'], text: string, data = {}): void {
    const s = this.env.load();
    const n: AppNotification & { userId: string } = {
      id: this.newId('n'),
      userId: to,
      at: Date.now(),
      kind,
      fromId: from,
      text,
      data,
      read: false,
    };
    s.notifications.unshift(n);
    const { userId: _u, ...pubN } = n;
    this.env.post({ k: 'notif', n: pubN, to });
  }

  // ---------- auth ----------

  readonly auth = {
    getSession: async (): Promise<Account | null> => {
      const id = this.env.session.get();
      const u = id ? this.env.load().users[id] : undefined;
      return u ? this.toAccount(u) : null;
    },
    onAuthChange: (cb: (e: AuthEvent, u: Account | null) => void) => {
      this.authListeners.add(cb);
      return () => this.authListeners.delete(cb);
    },
    signUp: async ({ email, password, name }: { email: string; password: string; name: string }) => {
      const s = this.db;
      const mail = email.trim().toLowerCase();
      if (Object.values(s.users).some((u) => u.email === mail)) {
        throw new BackendError('Denne e-posten er allerede registrert. Logg inn i stedet.');
      }
      if (!(await this.profiles.nameAvailable(name))) {
        throw new BackendError('Brukernavnet er allerede tatt. Velg et annet.');
      }
      if (password.length < 6) throw new BackendError('Passordet er for svakt. Bruk minst 6 tegn.');
      const id = this.newId('u');
      const user: User = {
        id,
        email: mail,
        password,
        name: name.trim(),
        confirmed: !this.requireConfirmation,
        createdAt: Date.now(),
      };
      s.users[id] = user;
      s.pub[id] = { xp: 0, titleId: null };
      if (this.requireConfirmation) {
        s.mails.push({ to: mail, kind: 'confirm', token: `confirm-${id}` });
        this.commit();
        this.env.post({ k: 'dir' });
        return { needsConfirmation: true };
      }
      this.commit();
      this.env.post({ k: 'dir' });
      this.env.session.set(id);
      this.emitAuth('signed_in', user);
      return { needsConfirmation: false };
    },
    signIn: async (email: string, password: string) => {
      const mail = email.trim().toLowerCase();
      const user = Object.values(this.db.users).find((u) => u.email === mail);
      if (!user || user.password !== password) throw new BackendError('Feil e-post eller passord.');
      if (!user.confirmed) {
        throw new BackendError('E-posten er ikke bekreftet ennå. Trykk på lenken i e-posten vi sendte deg.');
      }
      this.env.session.set(user.id);
      this.emitAuth('signed_in', user);
    },
    signOut: async () => {
      this.env.session.set(null);
      this.emitAuth('signed_out', null);
    },
    requestPasswordReset: async (email: string) => {
      const s = this.db;
      const mail = email.trim().toLowerCase();
      // Som hos Supabase: samme svar uansett om e-posten finnes. Mailen inneholder en 6-sifret kode.
      if (Object.values(s.users).some((u) => u.email === mail)) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        s.mails = s.mails.filter((m) => !(m.to === mail && m.kind === 'reset'));
        s.mails.push({ to: mail, kind: 'reset', token: code });
        this.commit();
      }
    },
    resetPasswordWithCode: async (email: string, code: string, password: string) => {
      const s = this.db;
      const mail = email.trim().toLowerCase();
      const found = s.mails.find((m) => m.to === mail && m.kind === 'reset' && m.token === code.trim());
      const u = Object.values(s.users).find((x) => x.email === mail);
      if (!found || !u) throw new BackendError('Koden er feil eller utløpt. Be om en ny kode.');
      if (password.length < 6) throw new BackendError('Passordet er for svakt. Bruk minst 6 tegn.');
      if (password === u.password) throw new BackendError('Det nye passordet må være forskjellig fra det gamle.');
      u.password = password;
      u.confirmed = true;
      s.mails = s.mails.filter((m) => m !== found); // koden kan bare brukes én gang
      this.commit();
      this.env.session.set(u.id);
      this.emitAuth('signed_in', u);
    },
    resendConfirmation: async (email: string) => {
      const s = this.db;
      const u = Object.values(s.users).find((x) => x.email === email.trim().toLowerCase());
      if (u && !u.confirmed) s.mails.push({ to: u.email, kind: 'confirm', token: `confirm-${u.id}` });
      this.commit();
    },
    deleteAccount: async () => {
      const s = this.db;
      const id = this.uid;
      delete s.users[id];
      delete s.pub[id];
      delete s.profileData[id];
      s.friendships = s.friendships.filter((f) => f.requester !== id && f.addressee !== id);
      this.commit();
      this.env.post({ k: 'dir' });
      this.env.session.set(null);
      this.emitAuth('signed_out', null);
    },
  };

  private emitAuth(e: AuthEvent, u: User | null): void {
    for (const cb of [...this.authListeners]) cb(e, u ? this.toAccount(u) : null);
  }

  /** Test: følg lenken fra en e-post (bekreftelse av ny konto). */
  followMailLink(token: string): void {
    const mail = this.env.load().mails.find((m) => m.token === token);
    if (!mail) throw new Error('Ukjent lenke');
    const user = Object.values(this.env.load().users).find((u) => u.email === mail.to);
    if (!user) throw new Error('Ukjent bruker');
    user.confirmed = true;
    this.commit();
    this.env.session.set(user.id);
    this.emitAuth('signed_in', user);
  }

  // ---------- profiler ----------

  readonly profiles = {
    loadMine: async (userId: string): Promise<unknown> => this.db.profileData[userId] ?? null,
    saveMine: async (userId: string, data: unknown, pub: { xp: number; titleId: string }) => {
      const s = this.db;
      if (userId !== this.uid) throw new BackendError('Ikke tillatt');
      s.profileData[userId] = JSON.parse(JSON.stringify(data));
      s.pub[userId] = { xp: pub.xp, titleId: pub.titleId };
      this.commit();
      this.env.post({ k: 'dir' });
    },
    loadAchievements: async (userId: string): Promise<Record<string, number>> => ({
      ...(this.db.achievements?.[userId] ?? {}),
    }),
    saveAchievements: async (userId: string, achievements: Record<string, number>) => {
      const s = this.db;
      if (userId !== this.uid) throw new BackendError('Ikke tillatt');
      s.achievements = s.achievements ?? {};
      s.achievements[userId] = { ...achievements, ...(s.achievements[userId] ?? {}) };
      this.commit();
    },
    syncPublic: async (
      userId: string,
      snap: { summary: PublicSummary; bag: DiscItem[]; rounds: RoundHistoryEntry[] }
    ) => {
      const s = this.db;
      if (userId !== this.uid) throw new BackendError('Ikke tillatt');
      s.shared = s.shared ?? {};
      const cur = s.shared[userId] ?? { summary: null, bag: [], rounds: [] };
      const have = new Set(cur.rounds.map((r) => r.id));
      const rounds = [...cur.rounds, ...snap.rounds.filter((r) => !have.has(r.id))].sort((a, b) => b.at - a.at);
      s.shared[userId] = { summary: snap.summary, bag: JSON.parse(JSON.stringify(snap.bag)), rounds };
      this.commit();
      this.env.post({ k: 'dir' });
    },
    loadPublic: async (userId: string): Promise<PlayerPublic> => {
      const me = this.uid;
      const empty: PlayerPublic = { summary: null, bag: [], rounds: [] };
      if (!me || (userId !== me && !this.areFriends(me, userId))) return empty; // RLS: bare eier og venner
      const d = this.db.shared?.[userId];
      return d ? { summary: d.summary, bag: d.bag, rounds: d.rounds.slice(0, 60) } : empty;
    },
    directory: async (): Promise<PublicProfile[]> =>
      Object.keys(this.db.users)
        .flatMap((id) => {
          const p = this.publicOf(id);
          return p ? [p] : [];
        })
        .sort((a, b) => b.xp - a.xp),
    nameAvailable: async (name: string): Promise<boolean> =>
      !Object.values(this.db.users).some((u) => u.name.toLowerCase() === name.trim().toLowerCase()),
  };

  // ---------- venner ----------

  readonly friends = {
    list: async (): Promise<Friendship[]> => {
      const me = this.uid;
      return this.db.friendships.flatMap((f): Friendship[] => {
        if (f.requester !== me && f.addressee !== me) return [];
        const other = this.publicOf(f.requester === me ? f.addressee : f.requester);
        if (!other) return [];
        return [
          { id: f.id, status: f.status, direction: f.requester === me ? 'outgoing' : 'incoming', other },
        ];
      });
    },
    request: async (userId: string): Promise<FriendRequestResult> => {
      const s = this.db;
      const me = this.uid;
      if (userId === me || !s.users[userId]) throw new BackendError('Fant ikke brukeren');
      const existing = s.friendships.find(
        (f) =>
          (f.requester === me && f.addressee === userId) || (f.requester === userId && f.addressee === me)
      );
      if (existing) {
        if (existing.status === 'accepted' || existing.requester === me) return 'already';
        existing.status = 'accepted';
        this.notify(existing.requester, me, 'friend_accepted', `${s.users[me].name} godtok vennskapet 🎉`);
        this.commit();
        this.env.post({ k: 'friends', to: [me, userId] });
        return 'accepted';
      }
      s.friendships.push({ id: this.newId('f'), requester: me, addressee: userId, status: 'pending' });
      this.notify(userId, me, 'friend_request', `${s.users[me].name} vil bli din venn 🤝`);
      this.commit();
      this.env.post({ k: 'friends', to: [me, userId] });
      return 'requested';
    },
    accept: async (friendshipId: string) => {
      const s = this.db;
      const me = this.uid;
      const f = s.friendships.find((x) => x.id === friendshipId && x.addressee === me && x.status === 'pending');
      if (!f) throw new BackendError('Forespørselen finnes ikke');
      f.status = 'accepted';
      this.notify(f.requester, me, 'friend_accepted', `${s.users[me].name} godtok vennskapet 🎉`);
      this.commit();
      this.env.post({ k: 'friends', to: [f.requester, f.addressee] });
    },
    remove: async (friendshipId: string) => {
      const s = this.db;
      const me = this.uid;
      const f = s.friendships.find((x) => x.id === friendshipId && (x.requester === me || x.addressee === me));
      if (!f) return;
      s.friendships = s.friendships.filter((x) => x !== f);
      this.commit();
      this.env.post({ k: 'friends', to: [f.requester, f.addressee] });
    },
  };

  // ---------- varsler ----------

  readonly notifications = {
    list: async (): Promise<AppNotification[]> => {
      const me = this.uid;
      return this.db.notifications.filter((n) => n.userId === me).map(({ userId: _u, ...n }) => n);
    },
    markAllRead: async () => {
      const me = this.uid;
      for (const n of this.db.notifications) if (n.userId === me) n.read = true;
      this.commit();
    },
    sendPassed: async (toUserId: string, fromUserId: string, text: string) => {
      void this.db;
      if (fromUserId !== this.uid || !this.areFriends(fromUserId, toUserId)) {
        throw new BackendError('Ikke tillatt');
      }
      this.notify(toUserId, fromUserId, 'passed', text);
      this.commit();
    },
  };

  // ---------- runder ----------

  private roundRows(r: StoredRound): RoundRows {
    return {
      head: r.head,
      players: r.players.map((p) => ({ ...p })),
      holes: Object.values(r.holes).map((h) => ({ ...h })),
      scores: Object.values(r.scores).map((x) => ({ ...x })),
    };
  }

  readonly rounds = {
    create: async (input: CreateRoundInput) => {
      const s = this.db;
      const me = this.uid;
      if (input.players.length < 1 || input.players.length > 6) {
        throw new BackendError('En runde må ha 1–6 spillere');
      }
      for (const p of input.players) {
        if (p.userId && p.userId !== me && !this.areFriends(me, p.userId)) {
          throw new BackendError('Du kan bare legge til venner i en runde');
        }
      }
      if (!input.players.some((p) => p.userId === me)) throw new BackendError('Du må selv delta i runden');
      const head: RoundHead = {
        id: input.id,
        hostId: me,
        mode: input.mode,
        course: input.course,
        holeCount: input.holeCount,
        config: input.config,
        status: 'active',
        createdAt: Date.now(),
        finishedAt: null,
      };
      const round: StoredRound = {
        head,
        players: input.players.map((p, i) => ({
          key: p.key,
          name: p.name,
          userId: p.userId,
          position: i,
          verified: p.userId === me && input.hostVerified,
          left: false,
        })),
        holes: {},
        scores: {},
      };
      s.rounds[input.id] = round;
      for (const p of round.players) {
        if (p.userId && p.userId !== me) {
          this.notify(p.userId, me, 'round_invite', `${s.users[me].name} har startet en runde med deg på ${input.course.name} 🥏`, {
            roundId: input.id,
          });
        }
      }
      this.commit();
      this.env.post({ k: 'rounds', to: this.memberIds(round) });
    },
    load: async (id: string): Promise<RoundRows | null> => {
      const r = this.db.rounds[id];
      if (!r || !this.isMember(r, this.uid)) return null;
      return this.roundRows(r);
    },
    listMine: async (): Promise<RoundHead[]> => {
      const me = this.uid;
      return Object.values(this.db.rounds)
        .filter((r) => this.isMember(r, me))
        .map((r) => r.head);
    },
    writeOps: async (roundId: string, userId: string, ops: RoundOp[]) => {
      const s = this.db;
      const r = s.rounds[roundId];
      if (!r || !this.isMember(r, this.uid) || userId !== this.uid) throw new BackendError('Ikke tillatt');
      if (r.head.status !== 'active') throw new BackendError('Runden er avsluttet');
      for (const op of ops) {
        if (op.hole < 1 || op.hole > r.head.holeCount) throw new BackendError('Ugyldig hull');
        if (op.t === 'hole') {
          if (op.par !== undefined && (op.par < 3 || op.par > 5)) throw new BackendError('Ugyldig par');
          const cur: RoundHoleRow = r.holes[op.hole] ?? {
            hole: op.hole,
            par: 3,
            confirmed: false,
            spin: null,
            spinDisc: null,
          };
          const next: RoundHoleRow = {
            ...cur,
            ...(op.par !== undefined ? { par: op.par } : {}),
            ...(op.confirmed !== undefined ? { confirmed: op.confirmed } : {}),
            ...(op.spin !== undefined ? { spin: op.spin } : {}),
            ...(op.spinDisc !== undefined ? { spinDisc: op.spinDisc } : {}),
          };
          r.holes[op.hole] = next;
          this.env.post({ k: 'op', roundId, op: { t: 'hole', ...next }, to: this.memberIds(r) });
        } else {
          if (!r.players.some((p) => p.key === op.playerKey)) throw new BackendError('Ukjent spiller');
          if (op.score !== undefined && (op.score < 1 || op.score > 15)) throw new BackendError('Ugyldig score');
          const key = `${op.playerKey}:${op.hole}`;
          const cur: RoundScoreRow = r.scores[key] ?? {
            playerKey: op.playerKey,
            hole: op.hole,
            score: 3,
            putts: 0,
            teePick: null,
          };
          const next: RoundScoreRow = {
            ...cur,
            ...(op.score !== undefined ? { score: op.score } : {}),
            ...(op.putts !== undefined ? { putts: op.putts } : {}),
            ...(op.teePick !== undefined ? { teePick: op.teePick } : {}),
          };
          r.scores[key] = next;
          this.env.post({ k: 'op', roundId, op: { t: 'score', ...next }, to: this.memberIds(r) });
        }
      }
      this.commit();
    },
    updateMe: async (roundId: string, patch: { verified?: boolean; left?: boolean }) => {
      const r = this.db.rounds[roundId];
      const me = this.uid;
      const p = r?.players.find((x) => x.userId === me);
      if (!r || !p) throw new BackendError('Ikke tillatt');
      if (patch.verified !== undefined) p.verified = patch.verified;
      if (patch.left !== undefined) p.left = patch.left;
      this.commit();
      this.env.post({ k: 'player', roundId, row: { ...p }, to: this.memberIds(r) });
    },
    finish: async (roundId: string) => {
      const r = this.db.rounds[roundId];
      if (!r || !this.isMember(r, this.uid)) throw new BackendError('Fant ikke runden');
      if (r.head.status !== 'active') return;
      const done = Object.values(r.holes).filter((h) => h.confirmed && h.hole <= r.head.holeCount).length;
      if (done < r.head.holeCount) throw new BackendError('Alle hull må være spilt før runden kan fullføres');
      r.head = { ...r.head, status: 'finished', finishedAt: Date.now() };
      this.commit();
      this.env.post({ k: 'head', roundId, head: r.head, to: this.memberIds(r) });
      this.env.post({ k: 'rounds', to: this.memberIds(r) });
    },
    abandon: async (roundId: string) => {
      const r = this.db.rounds[roundId];
      if (!r || r.head.hostId !== this.uid || r.head.status !== 'active') {
        throw new BackendError('Bare verten kan avbryte en pågående runde');
      }
      r.head = { ...r.head, status: 'abandoned', finishedAt: Date.now() };
      this.commit();
      this.env.post({ k: 'head', roundId, head: r.head, to: this.memberIds(r) });
      this.env.post({ k: 'rounds', to: this.memberIds(r) });
    },
  };

  // ---------- sanntid ----------

  readonly realtime = {
    subscribeSocial: (userId: string, h: SocialHandlers) => {
      let active = true;
      this.env.onMessage((m) => {
        if (!active) return;
        if (m.k === 'notif' && m.to === userId) h.onNotification(m.n);
        else if (m.k === 'friends' && m.to.includes(userId)) h.onFriendsChanged();
        else if (m.k === 'rounds' && m.to.includes(userId)) h.onMyRoundsChanged();
        else if (m.k === 'dir') h.onDirectoryChanged();
      });
      return () => {
        active = false;
      };
    },
    subscribeRound: (roundId: string, h: RoundHandlers) => {
      let active = true;
      const me = this.env.session.get();
      this.env.onMessage((m) => {
        if (!active || !me) return;
        if (m.k === 'op' && m.roundId === roundId && m.to.includes(me)) h.onOp(m.op);
        else if (m.k === 'player' && m.roundId === roundId && m.to.includes(me)) h.onPlayer(m.row);
        else if (m.k === 'head' && m.roundId === roundId && m.to.includes(me)) h.onHead(m.head);
      });
      queueMicrotask(() => {
        if (active) h.onConnected();
      });
      return () => {
        active = false;
      };
    },
  };
}
