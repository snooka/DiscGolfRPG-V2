import { useEffect } from 'react';
import { RARITY_LABEL, RARITY_STYLE, RARITY_TEXT } from '../data/achievements.ts';
import type { Rarity } from '../data/achievements.ts';
import { sounds } from '../lib/sound.ts';

interface UnlockCardProps {
  icon: string;
  title: string;
  desc: string;
  rarity: Rarity;
  /** Liten tekst til høyre, f.eks. «+75 XP» */
  right?: string;
  /** Ekstra tekst ved tittelen, f.eks. «nytt emblem» */
  tag?: string;
}

/**
 * Opplåst achievement/tittel. Episke og legendariske får sterkere farger,
 * animasjon og en egen lydeffekt idet de vises.
 */
export function UnlockCard({ icon, title, desc, rarity, right, tag }: UnlockCardProps) {
  useEffect(() => {
    if (rarity === 'legendary') sounds.legendary();
    else if (rarity === 'epic') sounds.epic();
  }, [rarity]);

  const special =
    rarity === 'legendary' ? 'rarity-legendary anim-pop' : rarity === 'epic' ? 'rarity-epic anim-pop' : '';

  return (
    <div
      className={`relative flex items-center gap-3 rounded-xl p-3 ${
        special || 'border border-amber-500/50 bg-slate-950'
      }`}
    >
      {rarity === 'legendary' && (
        <>
          <span className="sparkle left-2 top-1 text-sm" aria-hidden>
            ✨
          </span>
          <span className="sparkle bottom-1 right-10 text-xs" style={{ animationDelay: '0.5s' }} aria-hidden>
            ✨
          </span>
        </>
      )}
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 text-2xl ${RARITY_STYLE[rarity]}`}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-black ${RARITY_TEXT[rarity]}`}>
          {title} {tag && <span className="text-xs font-bold text-slate-400">• {tag}</span>}
        </div>
        <div className="text-xs text-slate-300">{desc}</div>
        <div className={`mt-0.5 text-[10px] font-black uppercase tracking-wide ${RARITY_TEXT[rarity]}`}>
          {RARITY_LABEL[rarity]}
        </div>
      </div>
      {right && <span className="shrink-0 font-mono text-xs font-bold text-emerald-400">{right}</span>}
    </div>
  );
}
