import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '../context/auth-context.ts';
import { DISC_TYPES } from '../data/gameModes.ts';
import { GAME_MODE_BY_ID } from '../data/gameModes.ts';
import { DEFAULT_TITLE_ID, TITLE_BY_ID } from '../data/titles.ts';
import { buildSummary } from '../lib/publicProfile.ts';
import { calcRating, nextTier, ratingTier, tierProgress } from '../lib/rating.ts';
import { getLevelInfo } from '../lib/progress.ts';
import { formatDiff } from '../lib/stats.ts';
import type { DiscItem, PlayerPublic, PublicSummary, RoundHistoryEntry } from '../types.ts';
import { TitleBadge } from './TitleBadge.tsx';
import { SegmentedControl } from './ui/SegmentedControl.tsx';
import { Sheet } from './ui/Sheet.tsx';
import { dateFormat, t } from '../i18n/index.ts';

type Tab = 'overview' | 'rounds' | 'bag';

/**
 * En spillers profil: rating og nivå, statistikk, rundehistorikk og diskbag.
 * Venner (og deg selv) ser alt. Andre ser bare rating, nivå og tittel (databasen avgjør, ikke appen).
 */
export function PlayerProfileSheet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const open = userId !== null;
  return (
    <Sheet open={open} onClose={onClose} title={t('Spillerprofil')} full>
      {userId && <ProfileBody key={userId} userId={userId} />}
    </Sheet>
  );
}

function ProfileBody({ userId }: { userId: string }) {
  const { user, profile, people, friends, backend } = useSession();
  const isMe = userId === user.id;
  const isFriend = friends.some((f) => f.id === userId);
  const person = people[userId];
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<PlayerPublic | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setData(null);
    backend.profiles.loadPublic(userId).then(setData, () => setFailed(true));
  }, [backend, userId]);

  useEffect(() => {
    if (!isMe && isFriend) load();
  }, [isMe, isFriend, load]);

  // Egen profil leses direkte (ferskest), venners fra skyen
  const shown: PlayerPublic | null = isMe
    ? { summary: buildSummary(profile), bag: profile.bag, rounds: profile.history }
    : data;

  const own = isMe ? calcRating(profile.history) : null;
  const rating = isMe ? own!.rating : (person?.rating ?? null);
  const ratingRounds = isMe ? own!.rounds : (person?.ratingRounds ?? 0);
  const tier = ratingTier(rating);
  const next = nextTier(rating);
  const level = getLevelInfo(person?.xp ?? 0);
  const title = TITLE_BY_ID[person?.titleId ?? DEFAULT_TITLE_ID] ?? TITLE_BY_ID[DEFAULT_TITLE_ID];
  const neon = tier?.neon ?? 'tier-amator';
  const canSeeDetails = isMe || isFriend;

  return (
    <div className="space-y-4">
      <section className={`${neon} neon-card space-y-3 rounded-3xl p-4`} aria-label={t('Rating')}>
        <div className="flex items-center gap-3">
          <span
            className="neon-chip flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl"
            aria-hidden
          >
            {tier?.icon ?? '🥏'}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-xl font-black text-white">
              {person?.name ?? 'Spiller'}
              {isMe && <span className="ml-1.5 text-xs font-bold text-emerald-400">{t('(deg)')}</span>}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <TitleBadge title={title} size="sm" />
              <span className="font-mono text-[11px] text-slate-300">
                {t('Lvl {level} •', { level: level.level })}{' '}{person?.xp ?? 0} {' '}{t('XP')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">{t('PDGA-inspirert rating')}</div>
            <div className="neon-text font-mono text-5xl leading-none font-black">{rating ?? '–'}</div>
          </div>
          <div className="text-right">
            <div className="neon-text text-lg font-black">{tier ? `${tier.icon} ${tier.name}` : t('Ikke ratet')}</div>
            <div className="text-[11px] text-slate-400">
              {rating === null
                ? t('Spill en Normal Game-runde')
                : ratingRounds === 1
                  ? t('Bygger på 1 runde')
                  : t('Bygger på {n} runder', { n: ratingRounds })}
            </div>
          </div>
        </div>

        {tier && rating !== null && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={Math.round(tierProgress(rating) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={t('Fremgang til neste nivå')}>
              <div className="neon-bar h-full rounded-full" style={{ width: `${Math.round(tierProgress(rating) * 100)}%` }} />
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {next ? t('{points} poeng til {name}', { points: next.min - rating, name: next.name }) : t('Høyeste nivå – tøft! 👑')}
            </div>
          </div>
        )}
      </section>

      {!canSeeDetails ? (
        <div className="card space-y-1 p-4 text-center">
          <div className="text-2xl" aria-hidden>🔒</div>
          <div className="text-sm font-black text-white">{t('Statistikk, runder og bag er for venner')}</div>
          <p className="text-xs text-slate-400">
            {t('Send en venneforespørsel fra Venner-fanen. Når {name} godtar, ser du alt.', { name: person?.name ?? t('spilleren') })}</p>
        </div>
      ) : failed ? (
        <div className="card space-y-2 p-4 text-center">
          <p className="text-sm text-slate-300">{t('Kunne ikke hente profilen akkurat nå.')}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>
            {t('Prøv igjen')}</button>
        </div>
      ) : !shown ? (
        <p className="text-center text-sm text-slate-400" role="status">{t('Henter profilen…')}</p>
      ) : (
        <>
          <SegmentedControl
            label={t('Profildel')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: t('Statistikk') },
              { value: 'rounds', label: shown.rounds.length ? t('Runder ({n})', { n: shown.rounds.length }) : t('Runder') },
              { value: 'bag', label: shown.bag.length ? t('Bag ({n})', { n: shown.bag.length }) : t('Bag') },
            ]}
          />
          {tab === 'overview' && <Overview summary={shown.summary} neon={neon} />}
          {tab === 'rounds' && <Rounds rounds={shown.rounds} />}
          {tab === 'bag' && <Bag bag={shown.bag} />}
        </>
      )}
    </div>
  );
}

// ---------- Statistikk ----------

function Overview({ summary, neon }: { summary: PublicSummary | null; neon: string }) {
  if (!summary || summary.rounds === 0) {
    return <div className="card p-4 text-center text-sm text-slate-400">{t('Ingen fullførte runder ennå.')}</div>;
  }
  const good = summary.aces + summary.eagles + summary.birdies;
  const bars = [
    { label: t('Birdie eller bedre'), n: good, cls: 'bg-cyan-400' },
    { label: t('Par'), n: summary.pars, cls: 'bg-emerald-400' },
    { label: t('Bogey'), n: summary.bogeys, cls: 'bg-amber-400' },
    { label: t('Dobbel bogey eller verre'), n: summary.worse, cls: 'bg-rose-500' },
  ];
  const total = Math.max(1, bars.reduce((a, b) => a + b.n, 0));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label={t('Runder')} value={summary.rounds} />
        <Tile label={t('Hull')} value={summary.holes} />
        <Tile label={t('Kast')} value={summary.throws} />
        <Tile
          label={t('Beste runde')}
          value={summary.bestRoundDiff === null ? '–' : formatDiff(summary.bestRoundDiff)}
          tone={neon}
        />
        <Tile label={t('Birdies+')} value={good} />
        <Tile label={t('Aces')} value={summary.aces} />
        <Tile label={t('Baner')} value={summary.courses} />
        <Tile label={t('Kilometer')} value={summary.totalKm} />
        <Tile label={t('Achievements')} value={summary.achievements} />
      </div>

      <section className="card space-y-2 p-3.5" aria-label={t('Resultatfordeling')}>
        <div className="eyebrow">{t('Resultater på hullene')}</div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-800" role="img" aria-label={t('Fordeling av resultater')}>
          {bars.map((b) => (
            <div key={b.label} className={b.cls} style={{ width: `${(b.n / total) * 100}%` }} />
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300">
          {bars.map((b) => (
            <li key={b.label} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${b.cls}`} aria-hidden />
              <span className="truncate">{b.label}</span>
              <span className="ml-auto font-mono font-bold text-white">{b.n}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-1.5 p-3.5" aria-label={t('Spillmodi')}>
        <div className="eyebrow">{t('Runder per spillmodus')}</div>
        {(Object.keys(summary.modeRounds) as (keyof typeof summary.modeRounds)[]).map((m) => (
          <div key={m} className="flex items-center justify-between text-sm">
            <span className="text-slate-300">
              {GAME_MODE_BY_ID[m].icon} {GAME_MODE_BY_ID[m].name}
            </span>
            <span className="font-mono font-bold text-white">{summary.modeRounds[m]}</span>
          </div>
        ))}
      </section>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`${tone ?? ''} card p-3 text-center`}>
      <div className="eyebrow">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-black ${tone ? 'neon-text' : 'text-white'}`}>{value}</div>
    </div>
  );
}

// ---------- Runder ----------

const dateFmt = () => dateFormat({ day: 'numeric', month: 'short', year: 'numeric' });

function Rounds({ rounds }: { rounds: RoundHistoryEntry[] }) {
  if (rounds.length === 0) {
    return <div className="card p-4 text-center text-sm text-slate-400">{t('Ingen runder å vise ennå.')}</div>;
  }
  return (
    <ul className="space-y-2" aria-label={t('Rundehistorikk')}>
      {rounds.map((r) => {
        const mode = GAME_MODE_BY_ID[r.mode];
        const tone = r.diff < 0 ? 'text-cyan-300' : r.diff === 0 ? 'text-emerald-300' : 'text-amber-300';
        return (
          <li key={r.id} className="card flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">{r.courseName || t('Fri runde')}</div>
              <div className="text-[11px] text-slate-400">
                {t('{icon} {name} • {holes} hull •', { icon: mode.icon, name: mode.name, holes: r.holes })}{' '}{r.at ? dateFmt().format(r.at) : ''}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className={`font-mono text-sm font-black ${tone}`}>
                {r.throws} ({formatDiff(r.diff)})
              </div>
              <div className="font-mono text-[11px] text-slate-500">{t('+{xp} XP', { xp: r.xp })}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Diskbag ----------

function Bag({ bag }: { bag: DiscItem[] }) {
  const groups = useMemo(() => {
    const known = new Set<string>(DISC_TYPES);
    const list = [...DISC_TYPES].reverse().map((tm) => ({ type: tm as string, discs: bag.filter((d) => d.type === tm) }));
    const other = bag.filter((d) => !known.has(d.type));
    if (other.length) list.push({ type: t('Annet'), discs: other });
    return list.filter((g) => g.discs.length > 0);
  }, [bag]);

  if (bag.length === 0) {
    return <div className="card p-4 text-center text-sm text-slate-400">{t('Bagen er tom.')}</div>;
  }
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.type} aria-label={g.type} className="space-y-1.5">
          <h4 className="eyebrow">
            {g.type} ({g.discs.length})
          </h4>
          <ul className="space-y-1.5">
            {g.discs.map((d) => (
              <li key={d.id} className="card flex items-center gap-3 p-3">
                <span
                  className="h-7 w-7 shrink-0 rounded-full border-2 border-slate-700"
                  style={{ background: d.color || '#475569', boxShadow: `0 0 10px ${d.color || '#475569'}66` }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">{d.name}</div>
                  <div className="truncate text-[11px] text-slate-400">
                    {[d.brand, d.plastic].filter(Boolean).join(' • ')}
                  </div>
                </div>
                <div className="shrink-0 font-mono text-xs font-bold text-emerald-300" title={t('Speed / Glide / Turn / Fade')}>
                  {d.speed} | {d.glide} | {d.turn} | {d.fade}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
