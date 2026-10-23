import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BackendError } from '../backend/types.ts';
import type { RoundHead, RoundOp } from '../backend/types.ts';
import { useSession } from '../context/auth-context.ts';
import { useUi } from '../context/ui-context.ts';
import { getDistanceKm } from '../lib/geo.ts';
import { getPosition, ON_COURSE_KM } from '../lib/gps.ts';
import { uuid } from '../lib/random.ts';
import { fetchWeather, mergeWeather } from '../lib/weather.ts';
import { allHolesPlayed, finishRound, unconfirmedHoles } from '../lib/round.ts';
import type { RoundConfig, RoundResult } from '../lib/round.ts';
import { createInputFromDoc, docFromRows, newRoundDoc, toRoundState } from '../lib/roundDoc.ts';
import type { DeviceRoundState, RoundDoc } from '../lib/roundDoc.ts';
import {
  addLocalRoundId,
  dismissedRounds,
  dismissRound,
  loadPersisted,
  localRoundIds,
  removeLocalRound,
  savePersisted,
} from '../lib/roundStorage.ts';
import { RoundSync } from '../lib/roundSync.ts';
import type { SyncSnapshot, SyncStatus } from '../lib/roundSync.ts';
import { sounds } from '../lib/sound.ts';
import type { RoundState } from '../types.ts';
import { justSwitchedLang, t } from '../i18n/index.ts';

/** Slutter man mer enn dette fra banen når runden fullføres, regnes den ikke som «på banen». */
export const FINISH_MAX_KM = 1.5;

export interface LiveInfo {
  status: SyncStatus;
  /** Delt runde (flere kontoer) – synkes i sanntid */
  shared: boolean;
  isHost: boolean;
  /** Spillere som har kontoer og er med (til «live»-visning) */
  memberCount: number;
}

export interface RemoteTouch {
  playerKey: string | null;
  hole: number;
  at: number;
}

const noopSubscribe = () => () => undefined;
const nullSnapshot = (): SyncSnapshot | null => null;

const errorText = (e: unknown): string =>
  e instanceof BackendError ? e.message : t('Noe gikk galt. Prøv igjen om litt.');

/**
 * Alt som har med runder å gjøre i appen: start, gjenopprett, åpne invitasjoner,
 * live synk, fullføring (stats på hver spillers egen profil) og avbrudd.
 */
export function useRounds() {
  const { user, profile, backend, commitFinishedProfile, onRoundsChanged } = useSession();
  const { toast } = useUi();

  const [sync, setSync] = useState<RoundSync | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [roundOpen, setRoundOpen] = useState(false);
  const [others, setOthers] = useState<RoundHead[]>([]);
  const [touch, setTouch] = useState<RemoteTouch | null>(null);
  const [booting, setBooting] = useState(true);

  const syncRef = useRef<RoundSync | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const processing = useRef(new Set<string>());
  const stepsRef = useRef(0);

  const snapshot = useSyncExternalStore(sync?.subscribe ?? noopSubscribe, sync?.getSnapshot ?? nullSnapshot);

  const round: RoundState | null = useMemo(
    () => (snapshot ? toRoundState(snapshot.doc, snapshot.device, user.id) : null),
    [snapshot, user.id]
  );

  const live: LiveInfo | null = useMemo(() => {
    if (!snapshot) return null;
    const members = snapshot.doc.players.filter((p) => p.userId);
    return {
      status: snapshot.status,
      shared: sync?.remote ?? false,
      isHost: snapshot.doc.head.hostId === user.id,
      memberCount: members.length,
    };
  }, [snapshot, sync, user.id]);

  // ---------- Fullføring: hver spiller regner ut sin egen profil ----------

  const finalize = useCallback(
    async (doc: RoundDoc, device: DeviceRoundState): Promise<boolean> => {
      const id = doc.head.id;
      if (processing.current.has(id)) return false;
      const me = doc.players.find((p) => p.userId === user.id);
      const current = profileRef.current;
      if (!me || !current) return false;
      processing.current.add(id);
      let handled = false;
      try {
        // Ferdig runde: skyen er fasiten. Vi bruker ferske rader, ikke en lokal kopi som kan være utdatert.
        let finalDoc = doc;
        const shared = doc.players.some((p) => p.userId !== null && p.userId !== user.id);
        if (shared && doc.head.status === 'finished') {
          const rows = await backend.rounds.load(id).catch(() => null);
          if (rows) finalDoc = docFromRows(rows);
        }
        const state = toRoundState(finalDoc, device, user.id);
        if (!allHolesPlayed(state)) return false; // prøves igjen ved neste synk
        // Allerede regnet med (f.eks. åpnet på en annen enhet)? Da hopper vi over.
        if (current.history.some((h) => h.id === id)) {
          handled = true;
          return false;
        }

        // GPS-sjekk ved slutten: står man fortsatt i nærheten av banen? (Ingen GPS-svar = behold)
        let verified = finalDoc.players.find((p) => p.userId === user.id)?.verified ?? me.verified;
        if (verified) {
          const pos = await getPosition(5000, 60_000);
          if (pos && getDistanceKm(pos.lat, pos.lng, finalDoc.head.course.lat, finalDoc.head.course.lng) > FINISH_MAX_KM) {
            verified = false;
          }
        }
        // Værsjekk ved lagring: slå sammen været ved start og slutt (regn/vind kan ha kommet underveis)
        let weather = state.weather;
        if (verified) {
          const ctrl = new AbortController();
          const timer = window.setTimeout(() => ctrl.abort(), 6000);
          const now = await fetchWeather(finalDoc.head.course.lat, finalDoc.head.course.lng, ctrl.signal);
          window.clearTimeout(timer);
          weather = mergeWeather(weather, now);
        }
        const { result: res, updatedProfiles } = finishRound(
          { ...state, weather, steps: device.steps, courseVerified: verified },
          { [user.id]: profileRef.current ?? current },
          finalDoc.head.finishedAt ?? Date.now()
        );
        const after = updatedProfiles[user.id];
        if (after) await commitFinishedProfile(after);
        setResult(res);
        setRoundOpen(true);
        sounds.finish();
        const mine = res.players.find((p) => p.player.userId === user.id)?.outcome;
        if (mine) toast(t('🎉 Runde lagret! +{xp} XP', { xp: mine.xpFromRound + mine.xpFromAchievements }));
        handled = true;
        return true;
      } finally {
        processing.current.delete(id);
        if (handled) {
          removeLocalRound(user.id, id);
          dismissRound(user.id, id);
        }
      }
    },
    [backend, user.id, commitFinishedProfile, toast]
  );

  const closeSync = useCallback((s: RoundSync | null) => {
    s?.stop();
    if (syncRef.current === s) {
      syncRef.current = null;
      setSync(null);
    }
  }, []);

  // ---------- Opprette og åpne synk ----------

  const makeSync = useCallback(
    (
      doc: RoundDoc,
      shared: boolean,
      saved?: { device: DeviceRoundState; unsent: RoundOp[] } | null
    ): RoundSync => {
      const roundId = doc.head.id;
      addLocalRoundId(user.id, roundId);
      const s: RoundSync = new RoundSync({
        backend: shared ? backend : null,
        userId: user.id,
        doc,
        device: saved?.device ?? { currentHole: 0, steps: 0, wheelSource: 'generic' },
        unsent: saved?.unsent,
        persist: (st) => {
          savePersisted(user.id, roundId, st);
        },
        onRemoteTouch: (tm) => setTouch({ ...tm, at: Date.now() }),
        onHeadStatus: (status) => {
          if (status === 'finished') {
            void (async () => {
              await s.resync();
              if (syncRef.current === s) {
                const ok = await finalize(s.getDoc(), s.getSnapshot().device);
                if (ok) closeSync(s);
              }
            })();
          } else if (status === 'abandoned') {
            toast(t('Verten avbrøt runden'), { tone: 'info' });
            removeLocalRound(user.id, roundId);
            dismissRound(user.id, roundId);
            closeSync(s);
            setRoundOpen(false);
          }
        },
      });
      stepsRef.current = s.getSnapshot().device.steps;
      syncRef.current = s;
      setSync(s);
      // Lagre med en gang: ellers går en nystartet runde (uten scorer ennå) tapt ved reload eller språkbytte
      if (!saved) savePersisted(user.id, roundId, { doc, device: s.getSnapshot().device, unsent: [] });
      s.start();
      return s;
    },
    [backend, user.id, finalize, closeSync, toast]
  );

  /** Sjekker (en gang) at jeg står på banen, slik at jeg får banen/vær-achievements på min profil. */
  const verifyMe = useCallback(async (s: RoundSync) => {
    const doc = s.getDoc();
    const me = doc.players.find((p) => p.userId === user.id);
    if (!me || me.verified || !doc.head.config.courseKnown) return;
    const pos = await getPosition(8000, 60_000);
    if (!pos) return;
    if (getDistanceKm(pos.lat, pos.lng, doc.head.course.lat, doc.head.course.lng) <= ON_COURSE_KM) {
      await s.updateMe({ verified: true }).catch(() => undefined);
    }
  }, [user.id]);

  // ---------- Start / åpne ----------

  const start = useCallback(
    async (config: RoundConfig) => {
      const doc = newRoundDoc(uuid(), user.id, config);
      const shared = config.players.some((p) => p.userId !== null && p.userId !== user.id);
      if (shared) {
        try {
          await backend.rounds.create(createInputFromDoc(doc, config.courseVerified));
        } catch (e) {
          toast(errorText(e), { tone: 'danger' });
          throw e;
        }
      }
      if (syncRef.current) closeSync(syncRef.current);
      setResult(null);
      makeSync(doc, shared);
      setRoundOpen(true);
    },
    [backend, user.id, toast, makeSync, closeSync]
  );

  const open = useCallback(
    async (roundId: string) => {
      if (syncRef.current?.roundId === roundId) {
        setRoundOpen(true);
        return;
      }
      try {
        const rows = await backend.rounds.load(roundId);
        if (!rows) {
          toast(t('Fant ikke runden. Kanskje den er avsluttet.'), { tone: 'danger' });
          return;
        }
        if (rows.head.status !== 'active') {
          toast(t('Den runden er allerede avsluttet.'), { tone: 'info' });
          return;
        }
        const saved = loadPersisted(user.id, roundId);
        if (syncRef.current) closeSync(syncRef.current);
        setResult(null);
        const s = makeSync(docFromRows(rows), true, saved);
        setRoundOpen(true);
        void verifyMe(s);
      } catch (e) {
        toast(errorText(e), { tone: 'danger' });
      }
    },
    [backend, user.id, toast, makeSync, closeSync, verifyMe]
  );

  // ---------- Oppdateringer fra UI ----------

  const update = useCallback((updater: (r: RoundState) => RoundState) => {
    syncRef.current?.update(updater);
  }, []);

  const setSteps = useCallback((steps: number) => {
    stepsRef.current = steps;
    syncRef.current?.setSteps(steps);
  }, []);

  /** Siste hull er lagret – fullfør runden for alle. */
  const finish = useCallback(
    async (finalState: RoundState) => {
      const s = syncRef.current;
      if (!s) return;
      s.update(() => finalState);
      if (s.remote) {
        try {
          await s.flush();
          await s.resync();
        } catch (e) {
          toast(t('Fikk ikke sendt siste hull. Sjekk nettforbindelsen og prøv igjen.'), { tone: 'danger' });
          void e;
          return;
        }
        const state = s.getState();
        if (!allHolesPlayed(state)) {
          const missing = unconfirmedHoles(state).map((i) => i + 1);
          toast(t('Hull {holes} mangler fortsatt.', { holes: missing.join(', ') }), { tone: 'danger' });
          return;
        }
        try {
          await backend.rounds.finish(s.roundId);
        } catch (e) {
          toast(errorText(e), { tone: 'danger' });
          return;
        }
      }
      s.setStatusLocal('finished');
      const ok = await finalize(s.getDoc(), s.getSnapshot().device);
      if (ok || syncRef.current === s) closeSync(s);
    },
    [backend, finalize, closeSync, toast]
  );

  /** Verten avbryter for alle; andre forlater runden (de andre fortsetter). */
  const leave = useCallback(async () => {
    const s = syncRef.current;
    if (!s) return;
    const doc = s.getDoc();
    const isHost = doc.head.hostId === user.id;
    try {
      if (s.remote) {
        if (isHost) await backend.rounds.abandon(s.roundId);
        else await s.updateMe({ left: true });
      }
    } catch (e) {
      toast(errorText(e), { tone: 'danger' });
      return;
    }
    removeLocalRound(user.id, s.roundId);
    dismissRound(user.id, s.roundId);
    closeSync(s);
    setRoundOpen(false);
    toast(isHost || !s.remote ? t('Runden ble avbrutt') : t('Du forlot runden'), { tone: 'info' });
  }, [backend, user.id, closeSync, toast]);

  const clearResult = useCallback(() => {
    setResult(null);
    setRoundOpen(false);
  }, []);

  // ---------- Finn runder jeg er med i (ved oppstart og når skyen varsler) ----------

  const refreshMine = useCallback(async () => {
    let heads: RoundHead[];
    try {
      heads = await backend.rounds.listMine();
    } catch {
      return; // ingen nett
    }
    const dismissed = new Set(dismissedRounds(user.id));
    const hist = new Set(profileRef.current?.history.map((h) => h.id) ?? []);

    // Runder som ble fullført mens jeg var borte: regn dem med på profilen min
    for (const head of heads) {
      if (head.status !== 'finished' || dismissed.has(head.id) || hist.has(head.id)) continue;
      if (processing.current.has(head.id)) continue;
      const rows = await backend.rounds.load(head.id).catch(() => null);
      if (!rows) continue;
      const doc = docFromRows(rows);
      const me = doc.players.find((p) => p.userId === user.id);
      if (!me || me.left) {
        dismissRound(user.id, head.id);
        continue;
      }
      const saved = loadPersisted(user.id, head.id);
      const ok = await finalize(doc, saved?.device ?? { currentHole: 0, steps: 0, wheelSource: 'generic' });
      if (ok && syncRef.current?.roundId === head.id) closeSync(syncRef.current);
    }

    const active = heads.filter((h) => h.status === 'active' && !dismissed.has(h.id));
    const currentId = syncRef.current?.roundId ?? null;
    setOthers(active.filter((h) => h.id !== currentId));
  }, [backend, user.id, finalize, closeSync]);

  // Oppstart: gjenopprett lokale runder (også de med usendte endringer), deretter spør skyen
  useEffect(() => {
    let alive = true;
    void (async () => {
      const dismissed = new Set(dismissedRounds(user.id));
      for (const id of localRoundIds(user.id)) {
        if (dismissed.has(id) || syncRef.current) continue;
        const saved = loadPersisted(user.id, id);
        if (!saved || saved.doc.head.status !== 'active') {
          removeLocalRound(user.id, id);
          continue;
        }
        const shared = saved.doc.players.some((p) => p.userId !== null && p.userId !== user.id);
        if (!alive) return;
        const s = makeSync(saved.doc, shared, saved);
        setRoundOpen(!justSwitchedLang());
        if (shared) void verifyMe(s);
      }
      await refreshMine();
      if (alive) setBooting(false);
    })();
    return () => {
      alive = false;
    };
    // Kjøres én gang per innlogget bruker (AppShell har key={user.id})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const off = onRoundsChanged(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshMine(), 300);
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshMine();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [onRoundsChanged, refreshMine]);

  // Rydder bort markeringen av fjernendringer etter litt tid
  useEffect(() => {
    if (!touch) return;
    const tm = window.setTimeout(() => setTouch((cur) => (cur === touch ? null : cur)), 2200);
    return () => window.clearTimeout(tm);
  }, [touch]);

  // Stopp synk når appen lukkes/bytter bruker
  useEffect(
    () => () => {
      syncRef.current?.stop();
    },
    []
  );

  return {
    round,
    live,
    result,
    roundOpen,
    setRoundOpen,
    others,
    touch,
    booting,
    stepsRef,
    initialSteps: sync?.getSnapshot().device.steps ?? 0,
    start,
    open,
    update,
    setSteps,
    finish,
    leave,
    clearResult,
  };
}
