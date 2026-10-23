import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { getBackend } from '../backend/index.ts';
import { BackendError } from '../backend/types.ts';
import type { Friendship } from '../backend/types.ts';
import { getDisplayTitle } from '../data/titles.ts';
import { findLegacyBag, findLegacyProfile, markLegacyImported } from '../lib/legacyImport.ts';
import { normalizeEmail } from '../lib/auth.ts';
import { passedFriends } from '../lib/passing.ts';
import { createProfile, normalizeProfile } from '../lib/profile.ts';
import { mergeAchievements, newAchievements } from '../lib/profile.ts';
import { buildSummary, unsyncedRounds } from '../lib/publicProfile.ts';
import { calcRating } from '../lib/rating.ts';
import { AuthContext } from './auth-context.ts';
import type { AuthApi, SyncState } from './auth-context.ts';
import { useUi } from './ui-context.ts';
import type { Account, AppNotification, Profile, PublicProfile } from '../types.ts';
import { t } from '../i18n/index.ts';

const messageOf = (e: unknown): string =>
  e instanceof BackendError ? e.message : t('Noe gikk galt. Prøv igjen om litt.');

const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: messageOf(e) });

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const SAVE_DELAY_MS = 700;
const SAVE_RETRY_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const backend = useMemo(() => getBackend(), []);
  const { toast } = useUi();

  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState<Account | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileSync, setProfileSync] = useState<SyncState>('saved');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  const [saveTick, setSaveTick] = useState(0);

  const [directory, setDirectory] = useState<PublicProfile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const profileRef = useRef<Profile | null>(null);
  const savedAch = useRef<Record<string, number>>({});
  const syncedRounds = useRef(new Set<string>());
  const lastPublic = useRef('');
  const lastSaved = useRef<Profile | null>(null);
  const friendsRef = useRef<PublicProfile[]>([]);
  const roundListeners = useRef(new Set<() => void>());

  // ---------- Innlogging ----------

  useEffect(() => {
    let alive = true;
    const off = backend.auth.onAuthChange((event, next) => {
      if (!alive) return;
      if (event === 'signed_in') {
        setUser((prev) => (prev?.id === next?.id ? prev : next));
      } else {
        setUser(null);
        setProfile(null);
        setDirectory([]);
        setFriendships([]);
        setNotifications([]);
        lastSaved.current = null;
      }
    });
    backend.auth
      .getSession()
      .then((u) => {
        if (!alive) return;
        setUser((prev) => prev ?? u);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setBooted(true);
      });
    return () => {
      alive = false;
      off();
    };
  }, [backend]);

  // ---------- Profil: hent ----------

  const userId = user?.id ?? null;
  const userEmail = user?.email ?? '';
  const userName = user?.name ?? '';

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoadError(null);
    void (async () => {
      try {
        const raw = await backend.profiles.loadMine(userId);
        // Achievements ligger også som egne rader i skyen – ta dem med så ingenting går tapt
        const cloudAch = await backend.profiles.loadAchievements(userId).catch(() => ({}));
        if (!alive) return;
        let p: Profile;
        if (isRecord(raw) && raw.version === 1) {
          p = normalizeProfile(raw, userId);
          lastSaved.current = p;
        } else {
          // Ny konto: ta med profilen fra den gamle lokale versjonen hvis den finnes
          const legacy = findLegacyProfile(userEmail, userId);
          p = legacy ?? createProfile(userId, Date.now(), findLegacyBag());
          lastSaved.current = null; // må lagres
          if (legacy) {
            markLegacyImported(userEmail);
            toast(t('Profilen din fra den gamle, lokale versjonen er overført 🎉'));
          }
        }
        savedAch.current = { ...cloudAch };
        syncedRounds.current = new Set();
        lastPublic.current = '';
        const merged = mergeAchievements(p.achievements, cloudAch);
        if (merged.changed) {
          p = { ...p, achievements: merged.achievements };
          lastSaved.current = null; // profilen må lagres på nytt med de gjenopprettede achievementene
        }
        profileRef.current = p;
        setProfile(p);
      } catch (e) {
        // VIKTIG: ved feil (nett, RLS, 404) starter vi ALDRI med en tom profil – den ville blitt
        // lagret over den ekte. «Ingen rad» håndteres i backend (returnerer null), ikke her.
        if (!alive) return;
        setLoadError(messageOf(e));
      }
    })();
    return () => {
      alive = false;
    };
    // toast er stabil; e-post leses bare ved første innlasting
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, userId, loadTick]);

  // ---------- Profil: lagre (med forsinkelse, og nye forsøk ved feil) ----------

  /** Delbar kopi til skyen (statistikk, bag, nye runder). Rating regnes ut av databasen. */
  const publishProfile = useCallback(
    async (p: Profile) => {
      if (!userId) return;
      const summary = buildSummary(p);
      const rounds = unsyncedRounds(p.history, syncedRounds.current);
      const fingerprint = JSON.stringify([summary, p.bag]);
      if (rounds.length === 0 && fingerprint === lastPublic.current) return;
      await backend.profiles.syncPublic(userId, { summary, bag: p.bag, rounds });
      for (const r of rounds) syncedRounds.current.add(r.id);
      lastPublic.current = fingerprint;
    },
    [backend, userId]
  );

  const saveNow = useCallback(
    async (p: Profile) => {
      if (!userId) return;
      try {
        await backend.profiles.saveMine(userId, p, { xp: p.xp, titleId: getDisplayTitle(p).id });
        await publishProfile(p);
        const fresh = newAchievements(p.achievements, savedAch.current);
        if (Object.keys(fresh).length > 0) {
          await backend.profiles.saveAchievements(userId, fresh);
          savedAch.current = { ...savedAch.current, ...fresh };
        }
        lastSaved.current = p;
        setProfileSync(profileRef.current === p ? 'saved' : 'saving');
      } catch {
        setProfileSync('error');
        window.setTimeout(() => setSaveTick((n) => n + 1), SAVE_RETRY_MS);
      }
    },
    [backend, userId, publishProfile]
  );

  useEffect(() => {
    if (!profile || profile === lastSaved.current) return;
    setProfileSync('saving');
    const tm = window.setTimeout(() => void saveNow(profile), SAVE_DELAY_MS);
    return () => window.clearTimeout(tm);
  }, [profile, saveTick, saveNow]);

  // Lagre med en gang når appen skjules (bytter app / lukker fanen)
  useEffect(() => {
    const flush = () => {
      const p = profileRef.current;
      if (p && p !== lastSaved.current && document.visibilityState === 'hidden') void saveNow(p);
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
    };
  }, [saveNow]);

  // ---------- Sosialt: venner, toppliste, varsler ----------

  const refreshSocial = useCallback(async () => {
    if (!userId) return;
    try {
      const [dir, fr, notes] = await Promise.all([
        backend.profiles.directory(),
        backend.friends.list(),
        backend.notifications.list(),
      ]);
      setDirectory(dir);
      setFriendships(fr);
      setNotifications(notes);
    } catch {
      /* beholder det vi har – prøver igjen ved neste hendelse */
    }
  }, [backend, userId]);

  const ready = profile !== null;
  useEffect(() => {
    if (!userId || !ready) return;
    void refreshSocial();
    let timer: number | undefined;
    const soon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshSocial(), 400);
    };
    const off = backend.realtime.subscribeSocial(userId, {
      onFriendsChanged: soon,
      onDirectoryChanged: soon,
      onMyRoundsChanged: () => roundListeners.current.forEach((cb) => cb()),
      onNotification: (n) => {
        setNotifications((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
        if (n.kind === 'friend_request' || n.kind === 'friend_accepted') soon();
      },
    });
    const onFocus = () => {
      if (document.visibilityState === 'visible') void refreshSocial();
    };
    document.addEventListener('visibilitychange', onFocus);
    const interval = window.setInterval(() => void refreshSocial(), 60_000);
    return () => {
      off();
      window.clearTimeout(timer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [backend, userId, ready, refreshSocial]);

  const people = useMemo(() => {
    const map: Record<string, PublicProfile> = {};
    for (const p of directory) map[p.id] = p;
    // Din egen XP/tittel vises alltid ferskest
    if (user && profile) {
      const rated = calcRating(profile.history);
      map[user.id] = {
        id: user.id,
        name: userName,
        xp: profile.xp,
        titleId: getDisplayTitle(profile).id,
        rating: rated.rating,
        ratingRounds: rated.rounds,
      };
    }
    return map;
  }, [directory, user, profile, userName]);

  const friends = useMemo(
    () =>
      friendships
        .filter((f) => f.status === 'accepted')
        .map((f) => people[f.other.id] ?? f.other)
        .sort((a, b) => a.name.localeCompare(b.name, 'nb')),
    [friendships, people]
  );
  friendsRef.current = friends;
  const incoming = useMemo(
    () => friendships.filter((f) => f.status === 'pending' && f.direction === 'incoming'),
    [friendships]
  );
  const outgoing = useMemo(
    () => friendships.filter((f) => f.status === 'pending' && f.direction === 'outgoing'),
    [friendships]
  );

  // ---------- Handlinger ----------

  const register = useCallback<AuthApi['register']>(
    async ({ name, email, password }) => {
      try {
        const res = await backend.auth.signUp({
          email: normalizeEmail(email),
          password,
          name: name.trim(),
        });
        if (!res.needsConfirmation) toast(t('Velkommen! Profilen din er opprettet 🥏'));
        return { ok: true, needsConfirmation: res.needsConfirmation };
      } catch (e) {
        return fail(e);
      }
    },
    [backend, toast]
  );

  const login = useCallback<AuthApi['login']>(
    async (email, password) => {
      try {
        await backend.auth.signIn(normalizeEmail(email), password);
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
    [backend]
  );

  const requestPasswordReset = useCallback<AuthApi['requestPasswordReset']>(
    async (email) => {
      try {
        await backend.auth.requestPasswordReset(normalizeEmail(email));
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
    [backend]
  );

  const resetPasswordWithCode = useCallback<AuthApi['resetPasswordWithCode']>(
    async (email, code, password) => {
      try {
        await backend.auth.resetPasswordWithCode(normalizeEmail(email), code, password);
        toast(t('Passordet er endret ✅'));
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
    [backend, toast]
  );

  const resendConfirmation = useCallback<AuthApi['resendConfirmation']>(
    async (email) => {
      try {
        await backend.auth.resendConfirmation(normalizeEmail(email));
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
    [backend]
  );

  const logout = useCallback(() => {
    // Lagrer siste endringer før vi logger ut
    const p = profileRef.current;
    const done = p && p !== lastSaved.current ? saveNow(p) : Promise.resolve();
    void done.finally(() => void backend.auth.signOut().catch(() => undefined));
  }, [backend, saveNow]);

  const deleteAccount = useCallback<AuthApi['deleteAccount']>(async () => {
    try {
      await backend.auth.deleteAccount();
      return { ok: true };
    } catch (e) {
      return fail(e);
    }
  }, [backend]);

  const updateProfile = useCallback<AuthApi['updateProfile']>((fn) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      profileRef.current = next;
      return next;
    });
  }, []);

  const commitFinishedProfile = useCallback<AuthApi['commitFinishedProfile']>(
    async (after) => {
      const before = profileRef.current;
      profileRef.current = after;
      setProfile(after);
      if (!before || !userId || after.xp <= before.xp) return;
      // Ferske tall for vennene, så varselet ikke bygger på gammel XP
      let dir: PublicProfile[] = directory;
      try {
        dir = await backend.profiles.directory();
        setDirectory(dir);
      } catch {
        /* bruker det vi har */
      }
      const xpOf = new Map(dir.map((p) => [p.id, p.xp]));
      const candidates = friendsRef.current.map((f) => ({ id: f.id, xp: xpOf.get(f.id) ?? f.xp }));
      const passed = passedFriends(before.xp, after.xp, candidates);
      await Promise.all(
        passed.map((id) =>
          backend.notifications
            .sendPassed(id, userId, t('{userName} gikk forbi deg på topplisten! 🏃💨', { userName }))
            .catch(() => undefined)
        )
      );
    },
    [backend, userId, userName, directory]
  );

  const sendFriendRequest = useCallback<AuthApi['sendFriendRequest']>(
    async (id) => {
      try {
        const result = await backend.friends.request(id);
        await refreshSocial();
        return { ok: true, result };
      } catch (e) {
        return fail(e);
      }
    },
    [backend, refreshSocial]
  );

  const acceptFriend = useCallback<AuthApi['acceptFriend']>(
    async (id) => {
      try {
        await backend.friends.accept(id);
        await refreshSocial();
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
    [backend, refreshSocial]
  );

  const removeFriend = useCallback<AuthApi['removeFriend']>(
    async (id) => {
      try {
        await backend.friends.remove(id);
        await refreshSocial();
        return { ok: true };
      } catch (e) {
        return fail(e);
      }
    },
    [backend, refreshSocial]
  );

  const markNotificationsRead = useCallback(() => {
    setNotifications((prev) => (prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev));
    void backend.notifications.markAllRead().catch(() => undefined);
  }, [backend]);

  const retryLoad = useCallback(() => setLoadTick((n) => n + 1), []);

  const onRoundsChanged = useCallback<AuthApi['onRoundsChanged']>((cb) => {
    roundListeners.current.add(cb);
    return () => {
      roundListeners.current.delete(cb);
    };
  }, []);

  const status: AuthApi['status'] = !booted
    ? 'loading'
    : !user
      ? 'anon'
      : loadError
          ? 'error'
          : !profile
            ? 'loading'
            : 'ready';

  const value = useMemo<AuthApi>(
    () => ({
      status,
      user,
      profile,
      profileSync,
      loadError,
      retryLoad,
      backend,
      register,
      login,
      requestPasswordReset,
      resetPasswordWithCode,
      resendConfirmation,
      logout,
      deleteAccount,
      updateProfile,
      commitFinishedProfile,
      people,
      friends,
      friendships,
      incoming,
      outgoing,
      refreshSocial,
      onRoundsChanged,
      sendFriendRequest,
      acceptFriend,
      removeFriend,
      notifications,
      markNotificationsRead,
    }),
    [
      status,
      user,
      profile,
      profileSync,
      loadError,
      retryLoad,
      backend,
      register,
      login,
      requestPasswordReset,
      resetPasswordWithCode,
      resendConfirmation,
      logout,
      deleteAccount,
      updateProfile,
      commitFinishedProfile,
      people,
      friends,
      friendships,
      incoming,
      outgoing,
      refreshSocial,
      onRoundsChanged,
      sendFriendRequest,
      acceptFriend,
      removeFriend,
      notifications,
      markNotificationsRead,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
