import { BarChart3 } from 'lucide-react';
import { BackButton } from '../AchievementsTab.tsx';
import { useState } from 'react';
import { ALL_MODES, GAME_MODE_BY_ID } from '../../data/gameModes.ts';
import { useSession } from '../../context/auth-context.ts';
import {
  allTotals,
  formatDiff,
  parOrBetter,
  percent,
  sumCounts,
  underParHoles,
} from '../../lib/stats.ts';
import type { GameMode, ModeStats, RoundHistoryEntry } from '../../types.ts';
import { SegmentedControl } from '../ui/SegmentedControl.tsx';
import { RecentRounds } from './RecentRounds.tsx';
import { ResultBreakdown } from './ResultBreakdown.tsx';
import { RouletteTable } from './RouletteTable.tsx';
import { PuttSection } from './PuttSection.tsx';
import { t } from '../../i18n/index.ts';

type View = 'all' | GameMode;

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: 'all', get label() { return t('Alle'); } },
  { value: 'normal', get label() { return t('Normal'); } },
  { value: 'dual_tee', get label() { return t('Dual Tee'); } },
  { value: 'roulette', get label() { return t('Roulette'); } },
  { value: 'putter', get label() { return t('Putter'); } },
];

export function StatsTab({ onBack }: { onBack?: () => void }) {
  const { profile } = useSession();
  const [view, setView] = useState<View>('all');
  const stats = profile.stats;

  return (
    <div className="space-y-4">
      {onBack && <BackButton onClick={onBack} />}
      <h2 className="flex items-center gap-2 text-base font-black text-white">
        <BarChart3 className="h-5 w-5 text-emerald-400" aria-hidden />
        {t('Statistikk')}</h2>

      <SegmentedControl
        label={t('Velg spillmodus')}
        value={view}
        onChange={setView}
        options={VIEW_OPTIONS}
      />

      {view === 'all' ? (
        <AllModesView onPick={setView} />
      ) : (
        <ModeView
          key={view}
          mode={view}
          stats={stats.modes[view]}
          history={profile.history.filter((h) => h.mode === view)}
        />
      )}

    </div>
  );
}

// ---------- «Alle»-visning ----------

function AllModesView({ onPick }: { onPick: (view: View) => void }) {
  const { profile } = useSession();
  const stats = profile.stats;
  const totals = allTotals(stats);
  const courseList = Object.values(stats.courses).sort((x, y) => y.rounds - x.rounds);

  return (
    <>
      <section className="grid grid-cols-2 gap-2" aria-label={t('Totalt')}>
        <Tile label={t('Runder totalt')} value={String(totals.rounds)} tone="text-emerald-400" />
        <Tile label={t('Hull spilt')} value={String(totals.holes)} tone="text-cyan-400" />
        <Tile label={t(t('Disker kastet'))} value={String(totals.discsThrown)} tone="text-amber-400" />
        <Tile label={t('Gått')} value={`${stats.totalKm} km`} tone="text-fuchsia-300" />
        <Tile label={t('Putts totalt')} value={String(stats.modes.putter.putts)} tone="text-pink-300" />
      </section>

      <section className="card space-y-3">
        <h3 className="eyebrow">{t('Alle resultater samlet')}</h3>
        <ResultBreakdown counts={totals.counts} />
      </section>

      <section className="space-y-2" aria-label={t('Spillmodi')}>
        <h3 className="eyebrow">{t('Per spillmodus')}</h3>
        {ALL_MODES.map((m) => {
          const def = GAME_MODE_BY_ID[m];
          const s = stats.modes[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(m)}
              className={`w-full rounded-2xl border p-3 text-left ${def.accent}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-white">
                  <span aria-hidden>{def.icon}</span> {def.name}
                </span>
                <span className="text-xs font-bold">{t('Se detaljer ›')}</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                <Mini label={t('Runder')} value={s.rounds} />
                <Mini label={t('Birdie+')} value={underParHoles(s.counts)} />
                <Mini label={t('Par')} value={s.counts.par} />
                <Mini label={t('Bogey+')} value={s.counts.bogey + s.counts.double + s.counts.triple} />
              </div>
            </button>
          );
        })}
        <p className="text-xs text-slate-500">
          {t('Normal Game teller mot rating. Dual Tee, Disc Roulette og Putter Game har egen statistikk og påvirker ikke ratingen din.')}</p>
      </section>

      <section className="card space-y-2">
        <h3 className="eyebrow">{t('Baner du har spilt')}</h3>
        {courseList.length === 0 ? (
          <p className="text-xs text-slate-500">{t('Ingen runder spilt ennå.')}</p>
        ) : (
          <ul className="space-y-1.5">
            {courseList.map((c) => (
              <li
                key={c.course.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
              >
                <span className="truncate font-bold text-white">
                  {c.course.image} {c.course.name}
                </span>
                <span className="shrink-0 pl-3 font-mono font-bold text-emerald-400">
                  {c.rounds} {c.rounds === 1 ? t('runde') : t('runder')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-2">
        <h3 className="eyebrow">{t('Siste runder')}</h3>
        <RecentRounds entries={profile.history.slice(0, 5)} />
      </section>
    </>
  );
}

// ---------- Visning per modus ----------

function ModeView({
  mode,
  stats,
  history,
}: {
  mode: GameMode;
  stats: ModeStats;
  history: RoundHistoryEntry[];
}) {
  const def = GAME_MODE_BY_ID[mode];
  const holes = stats.holes;
  const diff = stats.throws - stats.parTotal;
  const avgHole = holes > 0 ? diff / holes : 0;
  const teeTotal = stats.teePicks.first + stats.teePicks.second;
  const counts = sumCounts([stats.counts]);

  return (
    <>
      <div className={`rounded-2xl border p-3 text-sm ${def.accent}`}>
        <div className="font-black text-white">
          <span aria-hidden>{def.icon}</span> {def.name}
        </div>
        <p className="mt-0.5 text-xs">
          {def.countsForRating
            ? t('Denne modusen teller mot rating og vanlig fremgang.')
            : t('Egen statistikk – påvirker ikke ratingen i Normal Game.')}
        </p>
      </div>

      {stats.rounds === 0 ? (
        <div className="card text-center">
          <p className="text-sm font-bold text-slate-200">{t('Ingen runder i {name} ennå', { name: def.name })}</p>
          <p className="mt-1 text-xs text-slate-400">
            {t('Trykk «Start spill» og velg {name} for å begynne å samle statistikk.', { name: def.name })}</p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2" aria-label={t('Nøkkeltall')}>
            <Tile label={t('Runder')} value={String(stats.rounds)} tone="text-emerald-400" />
            <Tile label={t('Hull spilt')} value={String(holes)} tone="text-cyan-400" />
            <Tile
              label={mode === 'dual_tee' ? t('Disker kastet') : t('Kast')}
              value={String(stats.discsThrown)}
              tone="text-amber-400"
            />
            <Tile label={t('XP fra modus')} value={String(stats.xpEarned)} tone="text-fuchsia-300" />
            <Tile
              label={t('Beste runde')}
              value={stats.bestRoundDiff === null ? '–' : formatDiff(stats.bestRoundDiff)}
              tone="text-emerald-300"
            />
            <Tile
              label={t('Snitt per hull')}
              value={`${avgHole > 0 ? '+' : ''}${(Math.round(avgHole * 100) / 100).toFixed(2)}`}
              tone="text-cyan-300"
            />
            <Tile
              label={t('Birdie eller bedre')}
              value={`${underParHoles(counts)} (${percent(underParHoles(counts), holes)}%)`}
              tone="text-cyan-400"
            />
            <Tile
              label={t('Par eller bedre')}
              value={`${parOrBetter(counts)} (${percent(parOrBetter(counts), holes)}%)`}
              tone="text-emerald-400"
            />
          </section>

          <section className="card space-y-3">
            <h3 className="eyebrow">{t('Resultater')}</h3>
            <ResultBreakdown counts={stats.counts} />
          </section>

          {mode === 'dual_tee' && (
            <section className="card space-y-3">
              <h3 className="eyebrow">{t('Hvilket tee-kast valgte du?')}</h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <Tile label={t('Kast 1')} value={String(stats.teePicks.first)} tone="text-cyan-400" />
                <Tile label={t('Kast 2')} value={String(stats.teePicks.second)} tone="text-amber-400" />
              </div>
              <p className="text-xs text-slate-400">
                {teeTotal > 0
                  ? t('Du valgte det andre kastet {pct} % av gangene.', { pct: percent(stats.teePicks.second, teeTotal) })
                  : t('Ingen valg registrert ennå.')}
              </p>
            </section>
          )}

          {mode === 'putter' && <PuttSection stats={stats} />}

          {mode === 'roulette' && (
            <section className="card space-y-3">
              <h3 className="eyebrow">{t('Per disktype fra hjulet')}</h3>
              <RouletteTable stats={stats} />
            </section>
          )}
        </>
      )}

      <section className="card space-y-2">
        <h3 className="eyebrow">{t('Siste runder i {name}', { name: def.name })}</h3>
        <RecentRounds entries={history.slice(0, 8)} />
      </section>
    </>
  );
}

// ---------- Små byggeklosser ----------

function Tile({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="card p-3">
      <div className="eyebrow">{label}</div>
      <div className={`mt-0.5 font-mono text-xl font-black ${tone}`}>{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-950/60 py-1.5">
      <div className="font-mono text-base font-black text-white">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
