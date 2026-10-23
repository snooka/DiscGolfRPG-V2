import { ChevronLeft, X } from 'lucide-react';
import type { LiveInfo, RemoteTouch } from '../../hooks/useRounds.ts';
import { GAME_MODE_BY_ID, DUAL_TEE_EXTRA_THROW_COUNTS } from '../../data/gameModes.ts';
import { useSession } from '../../context/auth-context.ts';
import {
  adjustPutts,
  adjustScore,
  confirmHole,
  goToHole,
  holeBlockReason,
  PAR_OPTIONS,
  playerTotals,
  recordSpin,
  setHolePar,
  setWheelSource,
  setTeePick,
  unconfirmedHoles,
} from '../../lib/round.ts';
import type { RoundResult } from '../../lib/round.ts';
import type { RoundState } from '../../types.ts';
import { HoleDots } from './HoleDots.tsx';
import { PlayerScoreRow } from './PlayerScoreRow.tsx';
import { RoundSummary } from './RoundSummary.tsx';
import { RouletteHolePanel } from './RouletteHolePanel.tsx';
import { t } from '../../i18n/index.ts';

interface RoundScreenProps {
  round: RoundState | null;
  result: RoundResult | null;
  /** Synk-status (delte runder) */
  live: LiveInfo | null;
  /** Siste endring fra en annen spiller (markeres kort) */
  touch: RemoteTouch | null;
  onChange: (updater: (round: RoundState) => RoundState) => void;
  onMinimize: () => void;
  onAbandon: () => void;
  /** Får den ferdige runden (med siste hull lagret) */
  onFinish: (round: RoundState) => void;
  onDone: () => void;
}

/** Fullskjerms rundevisning: scorekort under spill, og oppsummering til slutt. */
export function RoundScreen({
  round,
  result,
  live,
  touch,
  onChange,
  onMinimize,
  onAbandon,
  onFinish,
  onDone,
}: RoundScreenProps) {
  if (result) return <RoundSummary result={result} onDone={onDone} />;
  if (!round) return null;
  return (
    <ActiveRound
      round={round}
      live={live}
      touch={touch}
      onChange={onChange}
      onMinimize={onMinimize}
      onAbandon={onAbandon}
      onFinish={onFinish}
    />
  );
}

function ActiveRound({
  round,
  live,
  touch,
  onChange,
  onMinimize,
  onAbandon,
  onFinish,
}: Omit<RoundScreenProps, 'result' | 'onDone' | 'round'> & { round: RoundState }) {
  const { user } = useSession();

  const hole = round.currentHole;
  const total = round.layout.length;
  const par = round.layout[hole].par;
  const isLast = hole === total - 1;
  const mode = GAME_MODE_BY_ID[round.mode];
  const blocked = holeBlockReason(round, hole);
  const alreadySaved = round.confirmed[hole];
  const savedCount = round.confirmed.filter(Boolean).length;

  const saveAndNext = () => onChange((r) => confirmHole(r, hole));

  // Resultatet kan ikke åpnes før alle hull er spilt og lagret
  const missingOthers = unconfirmedHoles(round).filter((i) => i !== hole);
  const waitingForHoles = isLast && missingOthers.length > 0;

  const finish = () => {
    if (waitingForHoles) {
      onChange((r) => goToHole(r, missingOthers[0]));
      return;
    }
    const withLast = confirmHole(round, hole);
    if (!withLast.confirmed[hole] || unconfirmedHoles(withLast).length > 0) return;
    onFinish(withLast);
  };

  const primaryLabel = blocked
    ? blocked
    : waitingForHoles
      ? t('Hull {holes} mangler – gå til hull {first}', { holes: missingOthers.map((i) => i + 1).join(', '), first: missingOthers[0] + 1 })
      : isLast
      ? t('Fullfør runde & se resultater 🏁')
      : alreadySaved
        ? t('Oppdater hull {n} & neste ➔', { n: hole + 1 })
        : t('Lagre hull {n} & neste ➔', { n: hole + 1 });

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-950">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-2 py-2">
          <button
            type="button"
            onClick={onMinimize}
            aria-label={t('Minimer runden og gå tilbake til appen')}
            className="btn btn-ghost btn-icon"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <h2 className="truncate text-sm font-black text-white">{round.course.name}</h2>
            <p className="truncate text-xs font-bold text-emerald-400">
              <span aria-hidden>{mode.icon}</span> {' '}{t('{name} • Hull {n} av {total} • {savedCount} lagret', { name: mode.name, n: hole + 1, total, savedCount })}</p>
            {live?.shared && <LiveChip live={live} />}
          </div>
          <button
            type="button"
            onClick={onAbandon}
            aria-label={live?.shared && !live.isHost ? t('Forlat runden') : t('Avbryt runden')}
            className="btn btn-ghost btn-icon hover:text-red-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mx-auto w-full max-w-2xl">
          <HoleDots
            total={total}
            current={hole}
            confirmed={round.confirmed}
            onSelect={(i) => onChange((r) => goToHole(r, i))}
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-4">
          <section className="card flex items-center justify-between gap-3 p-3.5">
            <div>
              <div className="text-lg font-black text-white">{t('HULL {n}', { n: hole + 1 })}</div>
              <div className="font-mono text-xs font-bold text-emerald-400">{t('Par {par}', { par })}</div>
            </div>
            <div role="group" aria-label={t('Par for hullet')} className="flex items-center gap-1.5">
              <span className="eyebrow mr-1">{t('Par')}</span>
              {PAR_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="chip min-w-10 justify-center"
                  aria-pressed={par === p}
                  onClick={() => onChange((r) => setHolePar(r, p))}
                >
                  {p}
                </button>
              ))}
            </div>
          </section>

          {round.mode === 'roulette' && (
            <RouletteHolePanel
              key={hole}
              round={round}
              onSpin={(id, disc) => onChange((r) => recordSpin(r, r.currentHole, id, disc))}
              onSource={(source) => onChange((r) => setWheelSource(r, source))}
            />
          )}

          {round.mode === 'putter' && (
            <section className="rounded-2xl border border-pink-500/40 bg-pink-500/10 p-3.5 text-sm text-pink-100">
              <div className="font-black">{t('🎳 Putter Game')}</div>
              <p className="mt-0.5 text-xs">
                {t('Kun putter hele runden. Registrer hvor mange av kastene som var putts – de teller i puttstatistikken din.')}</p>
            </section>
          )}

          {round.mode === 'dual_tee' && (
            <section className="rounded-2xl border border-cyan-500/40 bg-cyan-500/10 p-3.5 text-sm text-cyan-100">
              <div className="font-black">{t('👯 Dual Tee')}</div>
              <p className="mt-0.5 text-xs">
                {t('Kast to kast fra tee, velg det beste og spill resten av hullet derfra.')}{' '}{DUAL_TEE_EXTRA_THROW_COUNTS
                  ? t('Begge tee-kastene teller på scoren.')
                  : t('Det ekstra tee-kastet teller ikke på scoren.')}
              </p>
            </section>
          )}

          <div className="space-y-2">
            {round.players.map((player, pIdx) => {
              const totals = playerTotals(round, pIdx);
              return (
                <PlayerScoreRow
                  key={player.key}
                  player={player}
                  isYou={player.userId === user.id}
                  mode={round.mode}
                  par={par}
                  score={round.scores[pIdx][hole]}
                  totalThrows={totals.throws}
                  totalDiff={totals.diff}
                  putts={round.putts[pIdx][hole]}
                  teePick={round.teePicks[pIdx][hole]}
                  locked={round.mode === 'roulette' && !round.spins[hole]}
                  onAdjust={(d) => onChange((r) => adjustScore(r, pIdx, d))}
                  onPutts={(d) => onChange((r) => adjustPutts(r, pIdx, d))}
                  flash={touch !== null && touch.hole - 1 === hole && (touch.playerKey === null || touch.playerKey === player.key)}
                  onTeePick={(pick) => onChange((r) => setTeePick(r, pIdx, pick))}
                />
              );
            })}
          </div>
        </div>
      </main>

      <footer className="shrink-0 border-t border-slate-800 bg-slate-900 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-2xl">
          <button
            type="button"
            disabled={blocked !== null}
            onClick={() => (isLast ? finish() : saveAndNext())}
            className="btn btn-primary w-full text-base"
          >
            {primaryLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}

function LiveChip({ live }: { live: LiveInfo }) {
  const tone =
    live.status === 'live'
      ? { dot: 'bg-emerald-400', text: 'text-emerald-300', label: t('Live • {memberCount} spillere', { memberCount: live.memberCount }) }
      : live.status === 'saving'
        ? { dot: 'bg-amber-400', text: 'text-amber-300', label: t('Synker…') }
        : { dot: 'bg-red-500', text: 'text-red-300', label: t('Offline – lagres på telefonen og sendes senere') };
  return (
    <p className={`mt-0.5 flex items-center justify-center gap-1.5 truncate text-[11px] font-bold ${tone.text}`} role="status">
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot} ${live.status === 'live' ? 'animate-pulse' : ''}`} aria-hidden />
      {tone.label}
    </p>
  );
}
