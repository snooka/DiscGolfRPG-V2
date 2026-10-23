import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BackendError } from './types.ts';
import type {
  AuthEvent,
  Backend,
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
} from './types.ts';
import { translate } from './errors.ts';
import { signupRedirectUrl } from './redirect.ts';
import { isNativeApp } from '../lib/pwa.ts';
import { parseSummary } from '../lib/publicProfile.ts';
import type {
  Account,
  AppNotification,
  DiscItem,
  GameMode,
  NotificationKind,
  PublicProfile,
  RoundHistoryEntry,
} from '../types.ts';
import { t } from '../i18n/index.ts';

// ==========================================
// SUPABASE-IMPLEMENTASJON
// ==========================================
// Rader i databasen bruker snake_case (se supabase/schema.sql). Her oversettes
// det til appens typer, og feilmeldinger gjøres om til norsk.

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const time = (v: unknown): number => {
  const tm = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(tm) ? tm : Date.now();
};

type PgError = { message: string; code?: string } | null;

function check(error: PgError): void {
  if (error) throw new BackendError(translate(error.message, error.code), error.code);
}

/** Tabell/RPC/rad mangler, eller RLS nekter – ikke en grunn til å stenge brukeren ute. */
function isAbsent(error: PgError): boolean {
  if (!error) return false;
  const c = error.code ?? '';
  const m = error.message.toLowerCase();
  return (
    c === 'PGRST116' ||
    c === 'PGRST202' ||
    c === 'PGRST205' ||
    c === '42P01' ||
    c === '42501' ||
    m.includes('schema cache') ||
    m.includes('does not exist') ||
    m.includes('0 rows') ||
    m.includes('could not find the table') ||
    m.includes('could not find the function')
  );
}

function displayNameFor(userId: string, name: string, attempt = 0): string {
  const base = name.trim() || 'Spiller';
  if (attempt === 0) {
    const n = base.slice(0, 20);
    return n.length >= 2 ? n : `Spiller${userId.replace(/-/g, '').slice(0, 6)}`.slice(0, 20);
  }
  const suffix = userId.replace(/-/g, '').slice(attempt * 2, attempt * 2 + 4);
  return `${base.slice(0, 16)}${suffix}`.slice(0, 20);
}

/**
 * Er spillernavnet ledig? Først RPC `name_available` (kan kalles uten innlogging). Finnes den ikke
 * i prosjektet (404), spør vi `profiles` direkte. Kan vi ikke avgjøre det, sier vi «ledig»:
 * registreringen skal aldri stoppes av selve sjekken, og databasen sørger for unikt navn.
 */
async function nameIsFree(client: SupabaseClient, name: string): Promise<boolean> {
  const rpc = await client.rpc('name_available', { p_name: name.trim() });
  if (!rpc.error && typeof rpc.data === 'boolean') return rpc.data;

  const needle = name.trim().toLowerCase();
  const { data, error } = await client.from('profiles').select('name');
  if (error) return true;
  return !((data ?? []) as Row[]).some((r) => str(r.name).toLowerCase() === needle);
}

/** Opprett offentlig + privat profilrad hvis triggeren ved registrering ikke har kjørt. */
async function ensureProfileRows(client: SupabaseClient, userId: string, name: string): Promise<void> {
  const rpc = await client.rpc('ensure_my_profile', { p_name: name.trim() || null });
  if (!rpc.error) return;
  if (!isAbsent(rpc.error)) return;

  const existing = await client.from('profiles').select('id').eq('id', userId).maybeSingle();
  if (existing.error && !isAbsent(existing.error)) return;
  if (!existing.data) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const ins = await client.from('profiles').insert({
        id: userId,
        name: displayNameFor(userId, name, attempt),
      });
      if (!ins.error) break;
      if (isAbsent(ins.error)) break;
      const dup = /profiles_name_key|duplicate key|already exists/i.test(ins.error.message);
      if (!dup) break;
    }
  }

  const priv = await client.from('profile_data').select('user_id').eq('user_id', userId).maybeSingle();
  if (priv.error && !isAbsent(priv.error)) return;
  if (!priv.data) {
    await client.from('profile_data').insert({ user_id: userId, data: {} });
  }
}

const toAccount = (u: {
  id: string;
  email?: string | null;
  created_at?: string;
  user_metadata?: Record<string, unknown> | null;
}): Account => ({
  id: u.id,
  email: u.email ?? '',
  name: str(u.user_metadata?.name, (u.email ?? 'Spiller').split('@')[0]),
  createdAt: time(u.created_at),
});

const toPublic = (r: Row): PublicProfile => ({
  id: str(r.id),
  name: str(r.name, 'Spiller'),
  xp: num(r.xp),
  titleId: typeof r.title_id === 'string' ? r.title_id : null,
  rating: typeof r.rating === 'number' ? r.rating : null,
  ratingRounds: num(r.rating_rounds),
});

const toNotification = (r: Row): AppNotification => ({
  id: str(r.id),
  at: time(r.created_at),
  kind: str(r.kind, 'passed') as NotificationKind,
  fromId: typeof r.from_user === 'string' ? r.from_user : null,
  text: str(r.text),
  data: typeof r.data === 'object' && r.data !== null ? (r.data as Record<string, unknown>) : {},
  read: r.read === true,
});

const toHead = (r: Row): RoundHead => ({
  id: str(r.id),
  hostId: str(r.host_id),
  mode: str(r.mode, 'normal') as GameMode,
  course: r.course as RoundHead['course'],
  holeCount: num(r.hole_count, 9),
  config: {
    segments: [],
    weather: null,
    courseKnown: false,
    ...((typeof r.config === 'object' && r.config !== null ? r.config : {}) as object),
  },
  status: str(r.status, 'active') as RoundHead['status'],
  createdAt: time(r.created_at),
  finishedAt: typeof r.finished_at === 'string' ? time(r.finished_at) : null,
});

const toPlayer = (r: Row): RoundPlayerRow => ({
  key: str(r.key),
  name: str(r.name),
  userId: typeof r.user_id === 'string' ? r.user_id : null,
  position: num(r.position),
  verified: r.verified === true,
  left: r.left_round === true,
});

const toHoleOp = (r: Row): RoundOp => ({
  t: 'hole',
  hole: num(r.hole),
  par: num(r.par, 3),
  confirmed: r.confirmed === true,
  spin: typeof r.spin === 'string' ? r.spin : null,
  spinDisc: typeof r.spin_disc === 'string' ? r.spin_disc : null,
});

const toScoreOp = (r: Row): RoundOp => ({
  t: 'score',
  playerKey: str(r.player_key),
  hole: num(r.hole),
  score: num(r.score, 3),
  putts: num(r.putts),
  teePick: r.tee_pick === 1 || r.tee_pick === 2 ? r.tee_pick : null,
});

const toHoleRow = (r: Row): RoundHoleRow => ({
  hole: num(r.hole),
  par: num(r.par, 3),
  confirmed: r.confirmed === true,
  spin: typeof r.spin === 'string' ? r.spin : null,
  spinDisc: typeof r.spin_disc === 'string' ? r.spin_disc : null,
});

const toScoreRow = (r: Row): RoundScoreRow => ({
  playerKey: str(r.player_key),
  hole: num(r.hole),
  score: num(r.score, 3),
  putts: num(r.putts),
  teePick: r.tee_pick === 1 || r.tee_pick === 2 ? r.tee_pick : null,
});

interface SessionLike {
  user: {
    id: string;
    email?: string | null;
    created_at?: string;
    user_metadata?: Record<string, unknown> | null;
  };
}

/**
 * MIDLERTIDIG hardkodet tilkobling, brukes når .env ikke er lest.
 * Publishable-nøkkelen er laget for å ligge i nettleseren (sikkerheten ligger i RLS).
 * Fjern disse når .env fungerer, og bruk aldri service_role/secret-nøkkelen her.
 */
export const FALLBACK_SUPABASE_URL = 'https://floystiztwdtwsctxfzc.supabase.co';
export const FALLBACK_SUPABASE_KEY = 'sb_publishable_8RBDf_O9euB1adZbn_rMVA_6DC48gfT';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  /** Fast offentlig adresse til nettversjonen (VITE_PUBLIC_APP_URL). Valgfri. */
  publicUrl?: string;
}

export function createSupabaseBackend(config: SupabaseConfig): Backend {
  const client: SupabaseClient = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 20 } },
  });

  let uid: string | null = null;
  const listeners = new Set<(event: AuthEvent, user: Account | null) => void>();
  /** true mens koden for nytt passord sjekkes: da skal ikke den midlertidige innloggingen slippe inn i appen. */
  let suppressAuth = false;
  // E-postlenker (kun bekreftelse av ny konto): aldri localhost, og ingen dyp lenke. Se redirect.ts.
  const redirectTo = (): string | undefined =>
    signupRedirectUrl({
      native: isNativeApp(),
      publicUrl: config.publicUrl,
      origin: location.origin,
      pathname: location.pathname,
    });

  const backend: Backend = {

    auth: {
      async getSession() {
        const { data, error } = await client.auth.getSession();
        check(error);
        uid = data.session?.user.id ?? null;
        return data.session ? toAccount(data.session.user) : null;
      },

      onAuthChange(cb) {
        listeners.add(cb);
        const { data } = client.auth.onAuthStateChange((event: string, session: SessionLike | null) => {
          uid = session?.user.id ?? null;
          const user = session ? toAccount(session.user) : null;
          if (suppressAuth) return;
          let mapped: AuthEvent | null = null;
          if (event === 'SIGNED_OUT') mapped = 'signed_out';
          else if (event === 'SIGNED_IN') mapped = 'signed_in';
          if (mapped) cb(mapped, user);
        });
        return () => {
          listeners.delete(cb);
          data.subscription.unsubscribe();
        };
      },

      async signUp({ email, password, name }) {
        const display = name.trim();
        if (!(await nameIsFree(client, display).catch(() => true))) {
          throw new BackendError(t('Brukernavnet er allerede tatt. Velg et annet.'));
        }
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: { data: { name: display }, emailRedirectTo: redirectTo() },
        });
        if (error) console.error('[signUp] Supabase-feil:', error.code, error.message);
        check(error);
        // Supabase skjuler om en e-post finnes ved å returnere en bruker uten identiteter
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          throw new BackendError(t('Denne e-posten er allerede registrert. Logg inn i stedet.'));
        }
        return { needsConfirmation: !data.session };
      },

      async signIn(email, password) {
        const { error } = await client.auth.signInWithPassword({ email, password });
        check(error);
      },

      async signOut() {
        const { error } = await client.auth.signOut();
        check(error);
      },

      // Sender en e-post med en 6-sifret engangskode (krever {{ .Token }} i «Reset Password»-malen, se README).
      // Ingen redirectTo: det finnes ingen lenke å følge.
      async requestPasswordReset(email) {
        const { error } = await client.auth.resetPasswordForEmail(email);
        // Supabase svarer med en 60-sekunders pause per bruker hvis en kode nettopp er sendt.
        // Da er forrige kode fortsatt gyldig, så brukeren skal videre til kodeskjermen, ikke stoppes.
        const m = (error?.message ?? '').toLowerCase();
        if (error && m.includes('security purposes') && m.includes('seconds')) return;
        check(error);
      },

      // Verifiserer koden og setter nytt passord i ett steg. Rører kun auth-brukerens passord, aldri spilldata.
      async resetPasswordWithCode(email, code, password) {
        suppressAuth = true;
        try {
          const { data, error } = await client.auth.verifyOtp({ email, token: code.trim(), type: 'recovery' });
          check(error);
          const { error: updateError } = await client.auth.updateUser({ password });
          if (updateError) {
            await client.auth.signOut().catch(() => undefined); // ikke la brukeren bli stående innlogget uten nytt passord
            check(updateError);
          }
          const user = data.session?.user ?? data.user;
          uid = user?.id ?? null;
          if (user) listeners.forEach((cb) => cb('signed_in', toAccount(user)));
        } finally {
          suppressAuth = false;
        }
      },

      async resendConfirmation(email) {
        const { error } = await client.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: redirectTo() },
        });
        check(error);
      },

      async deleteAccount() {
        const { error } = await client.rpc('delete_my_account');
        check(error);
        await client.auth.signOut();
      },
    },

    profiles: {
      async loadMine(userId) {
        const { data: session } = await client.auth.getUser();
        const metaName = str(session.user?.user_metadata?.name, (session.user?.email ?? 'Spiller').split('@')[0]);
        await ensureProfileRows(client, userId, metaName);

        const { data, error } = await client
          .from('profile_data')
          .select('data')
          .eq('user_id', userId)
          .maybeSingle();
        if (error && !isAbsent(error)) check(error);
        const raw = (data as Row | null)?.data ?? null;
        return raw;
      },

      async saveMine(userId, data, pub) {
        const { data: session } = await client.auth.getUser();
        const metaName = str(session.user?.user_metadata?.name, (session.user?.email ?? 'Spiller').split('@')[0]);
        await ensureProfileRows(client, userId, metaName);

        const xp = Math.max(0, Math.round(pub.xp));
        const [a, b] = await Promise.all([
          client
            .from('profile_data')
            .upsert({ user_id: userId, data, updated_at: new Date().toISOString() }),
          client.from('profiles').update({ xp, title_id: pub.titleId }).eq('id', userId),
        ]);
        // Feil skal ALDRI skjules her: da tror appen at alt er lagret når det ikke er det.
        check(a.error);
        check(b.error);
      },

      async loadAchievements(userId) {
        const { data, error } = await client
          .from('user_achievements')
          .select('achievement_id,unlocked_at')
          .eq('user_id', userId);
        // Tabellen kan mangle i eldre prosjekter: da faller vi tilbake til profildata
        if (error) {
          if (isAbsent(error)) return {};
          check(error);
        }
        const out: Record<string, number> = {};
        for (const r of (data ?? []) as Row[]) {
          const tm = Date.parse(str(r.unlocked_at));
          out[str(r.achievement_id)] = Number.isFinite(tm) ? tm : Date.now();
        }
        return out;
      },

      async saveAchievements(userId, achievements) {
        const rows = Object.entries(achievements).map(([id, at]) => ({
          user_id: userId,
          achievement_id: id,
          unlocked_at: new Date(at).toISOString(),
        }));
        if (rows.length === 0) return;
        const { error } = await client
          .from('user_achievements')
          .upsert(rows, { onConflict: 'user_id,achievement_id', ignoreDuplicates: true });
        if (error && !isAbsent(error)) check(error);
      },

      async syncPublic(userId, snap) {
        // 1) Samlet statistikk
        const a = await client
          .from('profile_public')
          .upsert({ user_id: userId, summary: snap.summary, updated_at: new Date().toISOString() });
        if (a.error && !isAbsent(a.error)) check(a.error);

        // 2) Diskbag: legg til/oppdater, fjern disker som er slettet
        const discs = snap.bag.map((d, i) => ({
          user_id: userId,
          disc_id: d.id,
          name: d.name,
          brand: d.brand,
          disc_type: d.type,
          speed: d.speed,
          glide: d.glide,
          turn: d.turn,
          fade: d.fade,
          plastic: d.plastic,
          color: d.color,
          position: i,
        }));
        if (discs.length > 0) {
          const up = await client.from('user_discs').upsert(discs, { onConflict: 'user_id,disc_id' });
          if (up.error && !isAbsent(up.error)) check(up.error);
        }
        const existing = await client.from('user_discs').select('disc_id').eq('user_id', userId);
        if (!existing.error) {
          const keep = new Set(snap.bag.map((d) => d.id));
          const gone = ((existing.data ?? []) as Row[]).map((r) => str(r.disc_id)).filter((id) => !keep.has(id));
          if (gone.length > 0) {
            const del = await client.from('user_discs').delete().eq('user_id', userId).in('disc_id', gone);
            if (del.error) check(del.error);
          }
        } else if (!isAbsent(existing.error)) check(existing.error);

        // 3) Nye runder. Databasen regner ut ratingen selv når de legges inn.
        if (snap.rounds.length > 0) {
          const rows = snap.rounds.map((r) => ({
            user_id: userId,
            round_id: r.id,
            mode: r.mode,
            course_name: r.courseName,
            played_at: new Date(r.at).toISOString(),
            holes: r.holes,
            throws: r.throws,
            diff: r.diff,
            xp: r.xp,
            birdies: r.birdies,
            putts: r.putts,
          }));
          const ins = await client
            .from('player_rounds')
            .upsert(rows, { onConflict: 'user_id,round_id', ignoreDuplicates: true });
          if (ins.error && !isAbsent(ins.error)) check(ins.error);
        }
      },

      async loadPublic(userId) {
        const [sum, discs, rounds] = await Promise.all([
          client.from('profile_public').select('summary').eq('user_id', userId).maybeSingle(),
          client.from('user_discs').select('*').eq('user_id', userId).order('position', { ascending: true }),
          client
            .from('player_rounds')
            .select('*')
            .eq('user_id', userId)
            .order('played_at', { ascending: false })
            .limit(60),
        ]);
        for (const r of [sum, discs, rounds]) if (r.error && !isAbsent(r.error)) check(r.error);
        const bag: DiscItem[] = ((discs.data ?? []) as Row[]).map((d) => ({
          id: str(d.disc_id),
          name: str(d.name),
          brand: str(d.brand),
          type: str(d.disc_type) as DiscItem['type'],
          speed: num(d.speed),
          glide: num(d.glide),
          turn: num(d.turn),
          fade: num(d.fade),
          plastic: str(d.plastic),
          color: str(d.color),
        }));
        const history: RoundHistoryEntry[] = ((rounds.data ?? []) as Row[]).map((r) => ({
          id: str(r.round_id),
          at: Date.parse(str(r.played_at)) || 0,
          mode: str(r.mode, 'normal') as GameMode,
          courseName: str(r.course_name),
          holes: num(r.holes),
          throws: num(r.throws),
          diff: num(r.diff),
          xp: num(r.xp),
          birdies: num(r.birdies),
          putts: num(r.putts),
        }));
        return {
          summary: parseSummary((sum.data as Row | null)?.summary),
          bag,
          rounds: history,
        };
      },

      async directory() {
        const { data, error } = await client
          .from('profiles')
          .select('id,name,xp,title_id,rating,rating_rounds')
          .order('xp', { ascending: false })
          .limit(1000);
        check(error);
        return ((data ?? []) as Row[]).map(toPublic);
      },

      async nameAvailable(name) {
        return nameIsFree(client, name);
      },
    },

    friends: {
      async list() {
        const me = uid;
        if (!me) return [];
        const { data, error } = await client
          .from('friendships')
          .select('id,status,requester,addressee');
        check(error);
        const rows = (data ?? []) as Row[];
        const otherIds = rows.map((r) => (r.requester === me ? str(r.addressee) : str(r.requester)));
        if (otherIds.length === 0) return [];
        const { data: profs, error: pe } = await client
          .from('profiles')
          .select('id,name,xp,title_id,rating,rating_rounds')
          .in('id', otherIds);
        check(pe);
        const byId = new Map(((profs ?? []) as Row[]).map((p) => [str(p.id), toPublic(p)]));
        return rows.flatMap((r): Friendship[] => {
          const outgoing = r.requester === me;
          const other = byId.get(outgoing ? str(r.addressee) : str(r.requester));
          if (!other) return [];
          return [
            {
              id: str(r.id),
              status: r.status === 'accepted' ? 'accepted' : 'pending',
              direction: outgoing ? 'outgoing' : 'incoming',
              other,
            },
          ];
        });
      },

      async request(userId) {
        const { data, error } = await client.rpc('request_friend', { p_user: userId });
        check(error);
        return (typeof data === 'string' ? data : 'requested') as FriendRequestResult;
      },

      async accept(friendshipId) {
        const { error } = await client.rpc('accept_friend', { p_id: friendshipId });
        check(error);
      },

      async remove(friendshipId) {
        const { error } = await client.from('friendships').delete().eq('id', friendshipId);
        check(error);
      },
    },

    notifications: {
      async list() {
        const { data, error } = await client
          .from('notifications')
          .select('id,from_user,kind,text,data,read,created_at')
          .order('created_at', { ascending: false })
          .limit(50);
        check(error);
        return ((data ?? []) as Row[]).map(toNotification);
      },

      async markAllRead() {
        const { error } = await client.from('notifications').update({ read: true }).eq('read', false);
        check(error);
      },

      async sendPassed(toUserId, fromUserId, text) {
        const { error } = await client
          .from('notifications')
          .insert({ user_id: toUserId, from_user: fromUserId, kind: 'passed', text });
        check(error);
      },
    },

    rounds: {
      async create(input: CreateRoundInput) {
        const { error } = await client.rpc('create_round', {
          p_id: input.id,
          p_mode: input.mode,
          p_course: input.course,
          p_hole_count: input.holeCount,
          p_config: input.config,
          p_players: input.players,
        });
        check(error);
        if (input.hostVerified) {
          // Egen rad: verten er alltid med i runden
          await backend.rounds.updateMe(input.id, { verified: true });
        }
      },

      async load(id) {
        const [head, players, holes, scores] = await Promise.all([
          client.from('rounds').select('*').eq('id', id).maybeSingle(),
          client.from('round_players').select('*').eq('round_id', id),
          client.from('round_holes').select('*').eq('round_id', id),
          client.from('round_scores').select('*').eq('round_id', id),
        ]);
        check(head.error);
        check(players.error);
        check(holes.error);
        check(scores.error);
        if (!head.data) return null;
        const rows: RoundRows = {
          head: toHead(head.data as Row),
          players: ((players.data ?? []) as Row[]).map(toPlayer),
          holes: ((holes.data ?? []) as Row[]).map(toHoleRow),
          scores: ((scores.data ?? []) as Row[]).map(toScoreRow),
        };
        return rows;
      },

      async listMine() {
        const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
        const { data, error } = await client
          .from('rounds')
          .select('*')
          .or(`status.eq.active,finished_at.gte.${since}`)
          .order('created_at', { ascending: false })
          .limit(50);
        check(error);
        return ((data ?? []) as Row[]).map(toHead);
      },

      async writeOps(roundId, userId, ops) {
        const stamp = { updated_by: userId, updated_at: new Date().toISOString() };
        // Én forespørsel per endring: delvis oppdatering krever at alle rader i
        // en forespørsel har de samme kolonnene.
        const results = await Promise.all(
          ops.map((op) => {
            if (op.t === 'hole') {
              const row: Row = { round_id: roundId, hole: op.hole, ...stamp };
              if (op.par !== undefined) row.par = op.par;
              if (op.confirmed !== undefined) row.confirmed = op.confirmed;
              if (op.spin !== undefined) row.spin = op.spin;
              if (op.spinDisc !== undefined) row.spin_disc = op.spinDisc;
              return client.from('round_holes').upsert(row, { onConflict: 'round_id,hole' });
            }
            const row: Row = { round_id: roundId, player_key: op.playerKey, hole: op.hole, ...stamp };
            if (op.score !== undefined) row.score = op.score;
            if (op.putts !== undefined) row.putts = op.putts;
            if (op.teePick !== undefined) row.tee_pick = op.teePick;
            return client.from('round_scores').upsert(row, { onConflict: 'round_id,player_key,hole' });
          })
        );
        for (const r of results) check(r.error);
      },

      async updateMe(roundId, patch) {
        if (!uid) throw new BackendError(t('Ikke innlogget'));
        const row: Row = {};
        if (patch.verified !== undefined) row.verified = patch.verified;
        if (patch.left !== undefined) row.left_round = patch.left;
        const { error } = await client
          .from('round_players')
          .update(row)
          .eq('round_id', roundId)
          .eq('user_id', uid);
        check(error);
      },

      async finish(roundId) {
        const { error } = await client.rpc('finish_round', { p_round: roundId });
        check(error);
      },

      async abandon(roundId) {
        const { error } = await client.rpc('abandon_round', { p_round: roundId });
        check(error);
      },
    },

    realtime: {
      subscribeSocial(userId: string, h: SocialHandlers) {
        const channel = client
          .channel(`social:${userId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () =>
            h.onFriendsChanged()
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
            (payload: { new: Row }) => h.onNotification(toNotification(payload.new))
          )
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'round_players', filter: `user_id=eq.${userId}` },
            () => h.onMyRoundsChanged()
          )
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds' }, () =>
            h.onMyRoundsChanged()
          )
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () =>
            h.onDirectoryChanged()
          )
          .subscribe();
        return () => {
          void client.removeChannel(channel);
        };
      },

      subscribeRound(roundId: string, h: RoundHandlers) {
        const filter = `round_id=eq.${roundId}`;
        const channel = client
          .channel(`round:${roundId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'round_holes', filter }, (p: { new: Row }) => {
            if (p.new && 'hole' in p.new) h.onOp(toHoleOp(p.new));
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'round_scores', filter }, (p: { new: Row }) => {
            if (p.new && 'player_key' in p.new) h.onOp(toScoreOp(p.new));
          })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'round_players', filter }, (p: { new: Row }) =>
            h.onPlayer(toPlayer(p.new))
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `id=eq.${roundId}` },
            (p: { new: Row }) => h.onHead(toHead(p.new))
          )
          .subscribe((status: string) => {
            if (status === 'SUBSCRIBED') h.onConnected();
          });
        return () => {
          void client.removeChannel(channel);
        };
      },
    },
  };

  return backend;
}
