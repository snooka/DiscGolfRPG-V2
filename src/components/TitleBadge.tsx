import { RARITY_STYLE } from '../data/achievements.ts';
import type { TitleDef } from '../data/titles.ts';

/** Liten «pille» med tittelens ikon og navn, farget etter sjeldenhet. */
export function TitleBadge({
  title,
  size = 'md',
}: {
  title: TitleDef;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border bg-slate-950/70 font-bold ${
        RARITY_STYLE[title.rarity]
      } ${size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'}`}
    >
      <span aria-hidden>{title.icon}</span>
      <span className="truncate">{title.name}</span>
    </span>
  );
}
