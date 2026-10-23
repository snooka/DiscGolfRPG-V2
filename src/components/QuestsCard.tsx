import { Check, Lock } from 'lucide-react';
import { useSession } from '../context/auth-context.ts';
import { questStatuses } from '../lib/quests.ts';
import { ProgressBar } from './ui/ProgressBar.tsx';
import { t } from '../i18n/index.ts';

/**
 * Dagens oppdrag. XP kan ikke hentes manuelt: oppdragene verifiseres
 * automatisk mot resultatene fra fullførte runder og belønnes når runden
 * er ferdig.
 */
export function QuestsCard() {
  const { profile } = useSession();
  const statuses = questStatuses(profile);
  const doneCount = statuses.filter((s) => s.claimed).length;

  return (
    <section className="card space-y-3" aria-labelledby="quests-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="quests-title" className="text-sm font-black text-white">
          {t('📅 Daily Quests')}</h2>
        <span className="text-xs font-bold text-emerald-400">
          {t('{doneCount} / {length} fullført i dag', { doneCount, length: statuses.length })}</span>
      </div>
      <ul className="space-y-2">
        {statuses.map(({ quest, progress, claimed }) => (
          <li key={quest.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl" aria-hidden>
                {quest.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-white">{quest.title}</div>
                <div className="text-xs text-slate-400">{quest.desc}</div>
              </div>
              {claimed ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-emerald-400">
                  <Check className="h-4 w-4" aria-hidden /> {' '}{t('+{reward} XP', { reward: quest.reward })}</span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-slate-500">
                  <Lock className="h-3.5 w-3.5" aria-hidden /> {' '}{t('+{reward} XP', { reward: quest.reward })}</span>
              )}
            </div>
            {!claimed && quest.target > 1 && (
              <div className="mt-2 space-y-1">
                <ProgressBar value={progress / quest.target} label={`${quest.title} fremdrift`} />
                <div className="text-right font-mono text-[11px] text-slate-400">
                  {progress} / {quest.target}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-500">
        {t('Nye oppdrag hver dag. XP gis automatisk når resultatet fra en fullført runde viser at oppdraget er klart – det kan ikke hentes ut manuelt.')}</p>
    </section>
  );
}
