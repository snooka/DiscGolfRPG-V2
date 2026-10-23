import { Minus, Plus } from 'lucide-react';
import { DUAL_TEE_EXTRA_THROW_COUNTS } from '../../data/gameModes.ts';
import { describeHole, formatDiff } from '../../lib/stats.ts';
import type { GameMode, RoundPlayer, TeePick } from '../../types.ts';
import { t } from '../../i18n/index.ts';

interface PlayerScoreRowProps {
  player: RoundPlayer;
  isYou: boolean;
  mode: GameMode;
  par: number;
  score: number;
  /** Sum og differanse over lagrede hull */
  totalThrows: number;
  totalDiff: number;
  teePick: TeePick | null;
  /** Putter Game: antall putts på hullet */
  putts: number;
  locked: boolean;
  /** En annen spiller har nettopp endret denne raden */
  flash?: boolean;
  onAdjust: (delta: number) => void;
  onPutts: (delta: number) => void;
  onTeePick: (pick: TeePick) => void;
}

const holeTone = (score: number, par: number) => {
  if (score <= 1) return 'text-amber-300';
  const d = score - par;
  if (d < 0) return 'text-cyan-400';
  if (d === 0) return 'text-green-400';
  return 'text-amber-400';
};

export function PlayerScoreRow({
  player,
  isYou,
  mode,
  par,
  score,
  totalThrows,
  totalDiff,
  teePick,
  putts,
  locked,
  flash = false,
  onAdjust,
  onPutts,
  onTeePick,
}: PlayerScoreRowProps) {
  return (
    <div
      className={`card space-y-3 p-3.5 transition-shadow duration-500 ${
        flash ? 'border-cyan-400/70 shadow-[0_0_0_2px_rgba(34,211,238,0.45)]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-black text-white">
              {isYou ? '🥏 ' : player.userId ? '🤝 ' : '🎟️ '}
              {player.name}
              {player.left && <span className="text-xs font-bold text-slate-400"> {t('(forlot)')}</span>}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs">
            <span className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-slate-300">
              {t('Tot {totalThrows} ({diff})', { totalThrows, diff: formatDiff(totalDiff) })}</span>
            <span className={`font-bold ${holeTone(score, par)}`}>{describeHole(score, par)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onAdjust(-1)}
            disabled={locked || score <= 1}
            aria-label={t('Ett kast mindre for {name}', { name: player.name })}
            className="btn btn-secondary btn-icon h-12 w-12"
          >
            <Minus className="h-5 w-5" />
          </button>
          <output
            aria-label={t('Kast for {name}', { name: player.name })}
            className="w-9 text-center font-mono text-3xl font-black text-emerald-400"
          >
            {score}
          </output>
          <button
            type="button"
            onClick={() => onAdjust(1)}
            disabled={locked}
            aria-label={t('Ett kast mer for {name}', { name: player.name })}
            className="btn btn-secondary btn-icon h-12 w-12"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {mode === 'putter' && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-pink-500/30 bg-slate-950 px-3 py-2">
          <div>
            <div className="eyebrow">{t('Putts på hullet')}</div>
            <div className="text-[11px] text-slate-500">{t('Hvor mange av kastene var putts?')}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPutts(-1)}
              disabled={putts <= 0}
              aria-label={t('Færre putts for {name}', { name: player.name })}
              className="btn btn-secondary btn-icon"
            >
              <Minus className="h-4 w-4" />
            </button>
            <output aria-label={t('Putts for {name}', { name: player.name })} className="w-7 text-center font-mono text-xl font-black text-pink-300">
              {putts}
            </output>
            <button
              type="button"
              onClick={() => onPutts(1)}
              disabled={putts >= score}
              aria-label={t('Flere putts for {name}', { name: player.name })}
              className="btn btn-secondary btn-icon"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {mode === 'dual_tee' && (
        <div>
          <div className="eyebrow mb-1.5">{t('Beste tee-kast')}</div>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('Beste tee-kast for {name}', { name: player.name })}>
            {([1, 2] as const).map((pick) => (
              <button
                key={pick}
                type="button"
                aria-pressed={teePick === pick}
                onClick={() => onTeePick(pick)}
                className={`btn btn-sm border ${
                  teePick === pick
                    ? 'border-cyan-300 bg-cyan-500 text-slate-950'
                    : 'border-slate-700 bg-slate-950 text-slate-300'
                }`}
              >
                {t('Tee-kast {pick}', { pick })}</button>
            ))}
          </div>
        </div>
      )}
      {mode === 'dual_tee' && !DUAL_TEE_EXTRA_THROW_COUNTS && teePick && (
        <p className="-mt-1 text-[11px] text-slate-500">
          {t('Scoren teller fra det valgte tee-kastet (kast 1 = utkastet).')}</p>
      )}
    </div>
  );
}
