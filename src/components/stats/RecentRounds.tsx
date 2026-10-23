import { GAME_MODE_BY_ID } from '../../data/gameModes.ts';
import { formatDiff } from '../../lib/stats.ts';
import type { RoundHistoryEntry } from '../../types.ts';
import { dateFormat, t } from '../../i18n/index.ts';

const dateFmt = () => dateFormat({ day: 'numeric', month: 'short' });

export function RecentRounds({ entries }: { entries: RoundHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-slate-500">{t('Ingen runder å vise ennå.')}</p>;
  }
  return (
    <ul className="space-y-1.5">
      {entries.map((e) => (
        <li
          key={e.id}
          className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
        >
          <span className="text-xl" aria-hidden>
            {GAME_MODE_BY_ID[e.mode].icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-white">{e.courseName}</div>
            <div className="text-xs text-slate-400">
              {t('{date} • {name} • {holes} hull', { date: dateFmt().format(e.at), name: GAME_MODE_BY_ID[e.mode].name, holes: e.holes })}</div>
          </div>
          <div className="text-right font-mono">
            <div className="text-sm font-black text-white">
              {e.throws} <span className="text-xs text-emerald-400">({formatDiff(e.diff)})</span>
            </div>
            <div className="text-[11px] text-slate-500">{t('+{xp} XP', { xp: e.xp })}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
