import { ROULETTE_SEGMENTS } from '../../data/gameModes.ts';
import { parOrBetter, underParHoles } from '../../lib/stats.ts';
import type { ModeStats } from '../../types.ts';
import { t } from '../../i18n/index.ts';

function avgLabel(diff: number, holes: number): string {
  if (holes === 0) return '–';
  const avg = diff / holes;
  const rounded = Math.round(avg * 100) / 100;
  return rounded > 0 ? `+${rounded.toFixed(2)}` : rounded.toFixed(2);
}

/** Resultater fordelt på hva hjulet landet på (Putter, Midrange osv.). */
export function RouletteTable({ stats }: { stats: ModeStats }) {
  const rows = ROULETTE_SEGMENTS.filter(
    (seg) => seg.discType || (stats.byOutcome[seg.id]?.holes ?? 0) > 0
  );

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t('Resultater per hjulutfall')}</caption>
        <thead className="bg-slate-950 text-[11px] uppercase tracking-wide text-slate-400">
          <tr>
            <th scope="col" className="px-3 py-2 font-bold">
              {t('Hjulet')}</th>
            <th scope="col" className="px-1 py-2 text-right font-bold">
              {t('Hull')}</th>
            <th scope="col" className="px-1 py-2 text-right font-bold">
              {t('Snitt')}</th>
            <th scope="col" className="px-1 py-2 text-right font-bold">
              <abbr title={t('Birdie eller bedre')}>{t('Birdie+')}</abbr>
            </th>
            <th scope="col" className="px-3 py-2 text-right font-bold">
              {t('Par+')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((seg) => {
            const o = stats.byOutcome[seg.id];
            return (
              <tr key={seg.id} className="border-t border-slate-800">
                <th scope="row" className="px-3 py-2.5 font-semibold text-slate-100">
                  <span aria-hidden className="mr-1.5">
                    {seg.icon}
                  </span>
                  {seg.label}
                </th>
                <td className="px-1 py-2.5 text-right font-mono">{o?.holes ?? 0}</td>
                <td className="px-1 py-2.5 text-right font-mono text-slate-300">
                  {o ? avgLabel(o.diff, o.holes) : '–'}
                </td>
                <td className="px-1 py-2.5 text-right font-mono font-bold text-cyan-300">
                  {o ? underParHoles(o.counts) : 0}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-300">
                  {o ? parOrBetter(o.counts) : 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-500">
        {t('Snitt = kast mot par per hull. Par+ = par eller bedre.')}</p>
    </div>
  );
}
