import { ChevronLeft, MapPin, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  ALL_MODES,
  DEFAULT_SEGMENT_IDS,
  GAME_MODE_BY_ID,
  MIN_SEGMENTS,
  ROULETTE_SEGMENTS,
} from '../data/gameModes.ts';
import { useSession } from '../context/auth-context.ts';
import { MAX_PLAYERS } from '../lib/round.ts';
import type { RoundConfig } from '../lib/round.ts';
import { useAuthCourses } from '../hooks/useAuthCourses.ts';
import { detectCourse, freeRoundCourse, locate } from '../lib/gps.ts';
import type { GeoFailure } from '../lib/gps.ts';
import { useLocation } from '../context/location-context.ts';
import { KNOWN_COURSES_DB } from '../data/courses.ts';
import type { GeoPoint } from '../lib/gps.ts';
import { fetchWeather } from '../lib/weather.ts';
import type { CourseItem, GameMode, PublicProfile, RoundPlayer, Weather } from '../types.ts';
import { Sheet } from './ui/Sheet.tsx';
import { t } from '../i18n/index.ts';

interface SetupRoundSheetProps {
  /** Forhåndsvalgt gruppe eller venn (fra Venner-fanen) */
  presetGroupId: string | null;
  presetFriendId: string | null;
  onClose: () => void;
  onStart: (config: RoundConfig) => Promise<void>;
}

type Detect =
  | { status: 'locating' }
  | { status: 'found'; course: CourseItem; pos: GeoPoint }
  | { status: 'unknown'; pos: GeoPoint | null; reason?: GeoFailure };

/** To trinn: 1) velg spillmodus, 2) bane, spillere og innstillinger. */
export function SetupRoundSheet({
  presetGroupId,
  presetFriendId,
  onClose,
  onStart,
}: SetupRoundSheetProps) {
  const { user, profile, friends } = useSession();
  const friendById = new Map(friends.map((f) => [f.id, f]));
  const [step, setStep] = useState<'mode' | 'setup'>('mode');
  const [mode, setMode] = useState<GameMode>('normal');
  const playedCourses = useAuthCourses();
  const [detect, setDetect] = useState<Detect>({ status: 'locating' });
  const [attempt, setAttempt] = useState(0);
  const loc = useLocation();
  /** Bane valgt for hånd (når GPS ikke er tillatt eller banen ikke ble funnet). Gir ikke vær-achievements. */
  const [chosenId, setChosenId] = useState('');
  const chosen = KNOWN_COURSES_DB.find((c) => c.id === chosenId) ?? playedCourses.find((c) => c.id === chosenId) ?? null;
  const course: CourseItem =
    detect.status === 'found'
      ? detect.course
      : (chosen ?? freeRoundCourse(detect.status === 'unknown' ? detect.pos : null));
  const verified = detect.status === 'found';
  const holeOptions = [...new Set([9, 12, 18, course.holes])].sort((a, b) => a - b);
  const [holeCount, setHoleCount] = useState(9);
  const [segments, setSegments] = useState<string[]>(DEFAULT_SEGMENT_IDS);
  const [guestInput, setGuestInput] = useState('');
  const [starting, setStarting] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);

  const me: RoundPlayer = { key: `u_${user.id}`, name: user.name, userId: user.id };
  const friendPlayer = (a: PublicProfile): RoundPlayer => ({ key: `u_${a.id}`, name: a.name, userId: a.id });

  const [players, setPlayers] = useState<RoundPlayer[]>(() => {
    const list: RoundPlayer[] = [me];
    const group = presetGroupId ? profile.groups.find((g) => g.id === presetGroupId) : undefined;
    if (group) {
      for (const id of group.memberIds) {
        const a = friendById.get(id);
        if (a) list.push(friendPlayer(a));
      }
      group.guests.forEach((g, i) =>
        list.push({ key: `g_${i}_${g}`, name: `${g} (Gjest)`, userId: null })
      );
    } else if (presetFriendId && friendById.get(presetFriendId)) {
      list.push(friendPlayer(friendById.get(presetFriendId)!));
    }
    return list.slice(0, MAX_PLAYERS);
  });

  // GPS: finn banen man står på
  useEffect(() => {
    let cancelled = false;
    setDetect({ status: 'locating' });
    void locate(8000, 0).then((r) => {
      if (cancelled) return;
      const pos = r.ok ? r.point : null;
      const match = pos ? detectCourse(pos, playedCourses) : null;
      if (pos && match) {
        setDetect({ status: 'found', course: match.course, pos });
        setHoleCount(match.course.holes);
      } else {
        setDetect({ status: 'unknown', pos, reason: r.ok ? undefined : r.reason });
      }
    });
    return () => {
      cancelled = true;
    };
    // playedCourses endrer seg ikke mens arket er åpent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Vær på posisjonen (brukes til vær-achievements, kun når man står på banen)
  const pos = detect.status === 'locating' ? null : (detect.pos ?? (chosen ? { lat: chosen.lat, lng: chosen.lng } : null));
  useEffect(() => {
    if (!pos) {
      setWeather(null);
      return;
    }
    const controller = new AbortController();
    void fetchWeather(pos.lat, pos.lng, controller.signal).then((w) => {
      if (!controller.signal.aborted) setWeather(w);
    });
    return () => controller.abort();
  }, [pos?.lat, pos?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const full = players.length >= MAX_PLAYERS;
  const selected = (id: string) => players.some((p) => p.userId === id);

  const toggleFriend = (a: PublicProfile) =>
    setPlayers((cur) =>
      cur.some((p) => p.userId === a.id)
        ? cur.filter((p) => p.userId !== a.id)
        : cur.length >= MAX_PLAYERS
          ? cur
          : [...cur, friendPlayer(a)]
    );

  const applyGroup = (groupId: string) => {
    const group = profile.groups.find((g) => g.id === groupId);
    if (!group) return;
    const next: RoundPlayer[] = [me];
    for (const id of group.memberIds) {
      const a = friendById.get(id);
      if (a) next.push(friendPlayer(a));
    }
    group.guests.forEach((g, i) =>
      next.push({ key: `g_${i}_${g}`, name: `${g} (Gjest)`, userId: null })
    );
    setPlayers(next.slice(0, MAX_PLAYERS));
  };

  const addGuest = () => {
    const name = guestInput.trim().slice(0, 20);
    if (!name || full) return;
    setPlayers((cur) => [
      ...cur,
      { key: `g_${Date.now()}_${name}`, name: `${name} (Gjest)`, userId: null },
    ]);
    setGuestInput('');
  };

  const toggleSegment = (id: string) =>
    setSegments((cur) =>
      cur.includes(id)
        ? cur.length > MIN_SEGMENTS
          ? cur.filter((x) => x !== id)
          : cur
        : [...cur, id]
    );

  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await onStart({
        mode,
        course,
        holeCount,
        players,
        // Behold rekkefølgen fra definisjonene slik at hjulet ser likt ut hver gang
        segments: ROULETTE_SEGMENTS.filter((s) => segments.includes(s.id)).map((s) => s.id),
        weather,
        courseVerified: verified,
      });
    } finally {
      setStarting(false);
    }
  };

  const modeDef = GAME_MODE_BY_ID[mode];

  // ---------- Trinn 1: velg spillmodus ----------
  if (step === 'mode') {
    return (
      <Sheet open onClose={onClose} title={t('Velg spillmodus')}>
        <div className="space-y-3">
          {ALL_MODES.map((id) => {
            const def = GAME_MODE_BY_ID[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id);
                  setStep('setup');
                }}
                className={`w-full rounded-2xl border-2 p-4 text-left transition-transform active:scale-[0.98] ${def.accent}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl" aria-hidden>
                    {def.icon}
                  </span>
                  <div>
                    <div className="text-base font-black text-white">{def.name}</div>
                    <div className="text-xs font-bold">{def.tagline}</div>
                  </div>
                </div>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-200">
                  {def.rules.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      </Sheet>
    );
  }

  // ---------- Trinn 2: oppsett ----------

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('Rundeoppsett')}
      leading={
        <button
          type="button"
          onClick={() => setStep('mode')}
          aria-label={t('Tilbake til valg av spillmodus')}
          className="btn btn-ghost btn-icon btn-sm"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      }
      footer={
        <button
          type="button"
          className="btn btn-primary w-full text-base"
          disabled={starting || players.length === 0 || detect.status === 'locating'}
          onClick={() => void start()}
        >
          {starting ? t('Starter…') : detect.status === 'locating' ? t('Finner bane…') : t('Start {name} ➔', { name: modeDef.name })}
        </button>
      }
    >
      <div className="space-y-5">
        <div className={`flex items-center justify-between rounded-2xl border p-3 ${modeDef.accent}`}>
          <span className="text-sm font-black text-white">
            <span aria-hidden>{modeDef.icon}</span> {modeDef.name}
          </span>
          <button type="button" className="text-xs font-bold underline" onClick={() => setStep('mode')}>
            {t('Bytt modus')}</button>
        </div>

        <section className="card space-y-3 p-3.5" aria-label={t('Bane')}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {' '}{t('Bane (GPS)')}</div>
              {detect.status === 'locating' && (
                <div className="text-sm font-bold text-slate-300">{t('Finner posisjonen din…')}</div>
              )}
              {detect.status === 'found' && (
                <>
                  <div className="truncate text-sm font-black text-emerald-300">
                    {course.image} {course.name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {t('Du står på banen ✓ – banen lagres under «Dine spilte baner» når runden er fullført.')}</div>
                </>
              )}
              {detect.status === 'unknown' && (
                <>
                  <div className="text-sm font-black text-white">
                    {chosen ? `${chosen.image} ${chosen.name}` : t('📍 Fri runde')}
                  </div>
                  <div className="text-xs text-slate-400">
                    {detect.pos
                      ? t('Fant ingen kjent bane der du står.')
                      : detect.reason === 'no-consent'
                        ? t('Posisjon er ikke slått på.')
                        : detect.reason === 'denied'
                          ? t('Posisjon er blokkert for appen.')
                          : t('Fikk ikke tak i posisjonen din.')}{' '}
                    {chosen ? t('Banen er valgt for hånd') : t('Banen lagres ikke')}{t(', og vær-achievements gis ikke.')}</div>
                </>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm shrink-0"
              onClick={() => {
                if (loc.consent && loc.permission !== 'denied') {
                  setAttempt((n) => n + 1);
                } else {
                  void loc.requestGps().then(() => setAttempt((n) => n + 1));
                }
              }}
              disabled={detect.status === 'locating'}
            >
              {loc.consent ? t('Prøv GPS igjen') : t('Slå på GPS')}
            </button>
          </div>
          {detect.status === 'unknown' && (
            <label className="block">
              <span className="eyebrow mb-1 block">{t('Velg bane selv')}</span>
              <select className="field" value={chosenId} onChange={(e) => setChosenId(e.target.value)}>
                <option value="">{t('Fri runde (ingen bane)')}</option>
                {KNOWN_COURSES_DB.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.location})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div>
            <div className="eyebrow mb-1.5">{t('Antall hull')}</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('Antall hull')}>
              {holeOptions.map((h) => (
                <button
                  key={h}
                  type="button"
                  className="chip"
                  aria-pressed={holeCount === h}
                  onClick={() => setHoleCount(h)}
                >
                  {t('{h} hull', { h })}</button>
              ))}
            </div>
          </div>
        </section>

        {mode === 'roulette' && (
          <section className="card space-y-2 p-3.5" aria-label={t('Hjulet')}>
            <div className="eyebrow">{t('Hva skal være på hjulet?')}</div>
            <div className="flex flex-wrap gap-2">
              {ROULETTE_SEGMENTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="chip"
                  aria-pressed={segments.includes(s.id)}
                  onClick={() => toggleSegment(s.id)}
                >
                  <span aria-hidden>{s.icon}</span> {s.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {t('{length} felt på hjulet (minst {MIN_SEGMENTS}). Hjulet spinner på nytt før hvert hull.', { length: segments.length, MIN_SEGMENTS })}</p>
          </section>
        )}

        <section className="space-y-3" aria-label={t('Spillere')}>
          <div className="flex items-center justify-between">
            <h3 className="eyebrow">
              {t('Spillere ({length}/{MAX_PLAYERS})', { length: players.length, MAX_PLAYERS })}</h3>
          </div>

          {profile.groups.length > 0 && (
            <div>
              <div className="field-label">{t('Start fra en gruppe')}</div>
              <div className="flex flex-wrap gap-2">
                {profile.groups.map((g) => (
                  <button key={g.id} type="button" className="chip" onClick={() => applyGroup(g.id)}>
                    👥 {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {friends.length > 0 && (
            <div>
              <div className="field-label">{t('Ta med venner')}</div>
              <div className="flex flex-wrap gap-2">
                {friends.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="chip"
                    aria-pressed={selected(a.id)}
                    disabled={!selected(a.id) && full}
                    onClick={() => toggleFriend(a)}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="setup-guest" className="field-label">
              {t('Legg til gjestespiller (uten konto)')}</label>
            <div className="flex gap-2">
              <input
                id="setup-guest"
                className="field"
                value={guestInput}
                maxLength={20}
                placeholder={t('Navn på gjest')}
                onChange={(e) => setGuestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addGuest();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-secondary shrink-0"
                disabled={!guestInput.trim() || full}
                onClick={addGuest}
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t('Gjest')}</button>
            </div>
          </div>

          <ul className="space-y-2">
            {players.map((p, idx) => (
              <li
                key={p.key}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-bold text-white"
              >
                <span>
                  {idx === 0 ? '🥏' : p.userId ? '🤝' : '🎟️'} {p.name}
                  {idx === 0 && <span className="text-slate-400"> {t('(deg)')}</span>}
                </span>
                {idx > 0 && (
                  <button
                    type="button"
                    aria-label={t('Fjern {name}', { name: p.name })}
                    onClick={() => setPlayers((cur) => cur.filter((x) => x.key !== p.key))}
                    className="btn btn-ghost btn-sm btn-icon hover:text-red-400"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {players.length > 0 && players.some((p) => p.userId && p.userId !== user.id) && (
            <p className="text-xs text-slate-500">
              {t('Vennene dine får runden opp på sin egen telefon med en gang, og alle kan føre kast for alle – i sanntid. Hver spiller får runden på sin egen profil (XP, statistikk og achievements) når runden er ferdig.')}</p>
          )}
        </section>
      </div>
    </Sheet>
  );
}
