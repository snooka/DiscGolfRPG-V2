import { createContext, useContext } from 'react';
import type { Backend, Friendship } from '../backend/types.ts';
import type { Account, AppNotification, Profile, PublicProfile } from '../types.ts';

export type AuthResult = { ok: true } | { ok: false; error: string };

/**
 * loading   – sjekker innlogging / henter profil
 * anon      – ikke innlogget
 * error     – innlogget, men profilen kunne ikke hentes (nettfeil)
 * ready     – innlogget og klar
 */
export type AuthStatus = 'loading' | 'anon' | 'error' | 'ready';

/** Status for lagring av profilen til skyen */
export type SyncState = 'saved' | 'saving' | 'error';

export interface AuthApi {
  status: AuthStatus;
  /** Innlogget bruker (null = ikke innlogget) */
  user: Account | null;
  profile: Profile | null;
  profileSync: SyncState;
  loadError: string | null;
  retryLoad: () => void;
  backend: Backend;

  register: (input: { name: string; email: string; password: string }) => Promise<
    AuthResult & { needsConfirmation?: boolean }
  >;
  login: (email: string, password: string) => Promise<AuthResult>;
  /** Sender en e-post med 6-sifret engangskode for å velge nytt passord. */
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  /** Verifiserer koden fra e-posten og setter nytt passord (logger inn med det). */
  resetPasswordWithCode: (email: string, code: string, password: string) => Promise<AuthResult>;
  resendConfirmation: (email: string) => Promise<AuthResult>;
  logout: () => void;
  deleteAccount: () => Promise<AuthResult>;

  /** Oppdaterer profilen til innlogget bruker (lagres til skyen automatisk) */
  updateProfile: (fn: (profile: Profile) => Profile) => void;
  /**
   * Legger inn profilen etter en fullført runde, og varsler (kun) vennene
   * man klatret forbi på topplisten.
   */
  commitFinishedProfile: (after: Profile) => Promise<void>;

  // ---------- Sosialt ----------
  /** Alle spillere (toppliste), inkludert deg selv. id -> offentlig profil */
  people: Record<string, PublicProfile>;
  /** Godtatte venner */
  friends: PublicProfile[];
  /** Alle vennskap og forespørsler (både godtatte og ventende) */
  friendships: Friendship[];
  incoming: Friendship[];
  outgoing: Friendship[];
  refreshSocial: () => Promise<void>;
  /** Kalles når en runde jeg deltar i opprettes eller endrer status. Returnerer avmelding. */
  onRoundsChanged: (cb: () => void) => () => void;
  sendFriendRequest: (userId: string) => Promise<AuthResult & { result?: 'requested' | 'accepted' | 'already' }>;
  acceptFriend: (friendshipId: string) => Promise<AuthResult>;
  /** Fjerner venn, avslår eller trekker tilbake forespørsel */
  removeFriend: (friendshipId: string) => Promise<AuthResult>;

  notifications: AppNotification[];
  markNotificationsRead: () => void;
}

export const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth må brukes innenfor <AuthProvider>');
  return ctx;
}

export interface SessionApi extends AuthApi {
  user: Account;
  profile: Profile;
}

/** For skjermer som bare vises når man er innlogget. */
export function useSession(): SessionApi {
  const auth = useAuth();
  if (!auth.user || !auth.profile) {
    throw new Error('useSession kan bare brukes når en bruker er innlogget');
  }
  return auth as SessionApi;
}
