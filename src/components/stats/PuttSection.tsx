import { ACHIEVEMENTS } from '../../data/achievements.ts';
import { percent } from '../../lib/stats.ts';
import type { ModeStats } from '../../types.ts';
import { ProgressBar } from '../ui/ProgressBar.tsx';
import { t } from '../../i18n/index.ts';

const PUTT_ACHIEVEMENTS = ACHIEVEMENTS.filter((a) => a.id.startsWith('putts_')).sort(
  (a, b) => a.target - b.target
);

/** Egen progresjonsmodul for putts: total, snitt og neste «teite» milepæl. */
export function PuttSection({ stats }: { stats: ModeStats }) {
  const next = PUTT_ACHIEVEMENTS.find((a) => stats.putts < a.target);
  const prev = [...PUTT_ACHIEVEMENTS].reverse().find((a) => stats.putts >= a.target);
  const perHole = stats.holes > 0 ? stats.putts / stats.holes : 0;

  return (
    <section className="card space-y-3" aria-label={t('Putt-progresjon')}>
      <h3 className="eyebrow text-pink-300">{t('🎳 Putt-progresjon')}</h3>
      <div className="text-center">
        <div className="font-mono text-4xl font-black text-pink-300">{stats.putts}</div>
        <div className="text-xs text-slate-400">{t('putts totalt')}</div>
      </div>

      {next ? (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-bold text-slate-300">
            <span>
              {t('{icon} Neste: {title}', { icon: next.icon, title: next.title })}</span>
            <span className="font-mono text-pink-300">
              {stats.putts} / {next.target}
            </span>
          </div>
          <ProgressBar value={stats.putts / next.target} label={t('Putts mot {title}', { title: next.title })} />
          <p className="text-[11px] text-slate-500">{next.desc}</p>
        </div>
      ) : (
        <p className="text-center text-xs font-bold text-amber-300">
          {t('Alle putt-achievements er låst opp. Du er offisielt for mye på banen. 🏆')}</p>
      )}
      {prev && <p className="text-center text-[11px] text-slate-500">{t('Siste opplåst: {icon} {title}', { icon: prev.icon, title: prev.title })}</p>}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label={t('Putts/hull')} value={perHole.toFixed(2)} />
        <Stat label={t('Ein-putts')} value={`${stats.onePutts} (${percent(stats.onePutts, stats.holes)}%)`} />
        <Stat label={t('3+ putts')} value={`${stats.threePutts}`} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-950/60 px-1 py-2">
      <div className="font-mono text-sm font-black text-white">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
