import { Check } from 'lucide-react';
import { RARITY_LABEL, RARITY_ORDER } from '../data/achievements.ts';
import { getDisplayTitle, TITLES } from '../data/titles.ts';
import { useSession } from '../context/auth-context.ts';
import { ProgressBar } from './ui/ProgressBar.tsx';
import { Sheet } from './ui/Sheet.tsx';
import { t } from '../i18n/index.ts';

interface TitlePickerSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Velg hvilken opplåst tittel som vises under navnet. */
export function TitlePickerSheet({ open, onClose }: TitlePickerSheetProps) {
  const { profile, updateProfile } = useSession();
  const shown = getDisplayTitle(profile);
  const sorted = [...TITLES].sort((a, b) => {
    const au = profile.titles[a.id] ? 0 : 1;
    const bu = profile.titles[b.id] ? 0 : 1;
    return au - bu || RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity];
  });

  const choose = (id: string | null) => {
    updateProfile((p) => ({ ...p, equippedTitle: id }));
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('Velg tittel')}>
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => choose(null)}
          aria-pressed={profile.equippedTitle === null}
          className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${
            profile.equippedTitle === null
              ? 'border-emerald-500/60 bg-emerald-500/10'
              : 'border-slate-800 bg-slate-950'
          }`}
        >
          <span>
            <span className="block text-sm font-bold text-white">{t('Automatisk')}</span>
            <span className="block text-xs text-slate-400">
              {t('Viser alltid din sjeldneste tittel')}</span>
          </span>
          {profile.equippedTitle === null && <Check className="h-5 w-5 text-emerald-400" />}
        </button>

        {sorted.map((tm) => {
          const unlocked = !!profile.titles[tm.id];
          const current = Math.min(tm.target, tm.metric(profile.stats));
          const selected = unlocked && shown.id === tm.id && profile.equippedTitle === tm.id;
          return (
            <button
              key={tm.id}
              type="button"
              disabled={!unlocked}
              onClick={() => choose(tm.id)}
              aria-pressed={selected}
              className={`w-full rounded-xl border p-3 text-left disabled:cursor-default ${
                selected
                  ? 'border-emerald-500/60 bg-emerald-500/10'
                  : 'border-slate-800 bg-slate-950'
              } ${unlocked ? '' : 'opacity-70'}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`text-2xl ${unlocked ? '' : 'opacity-40 grayscale'}`}
                  aria-hidden
                >
                  {tm.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-white">{tm.name}</span>
                    <span className="shrink-0 text-[11px] font-bold text-slate-400">
                      {RARITY_LABEL[tm.rarity]}
                    </span>
                  </div>
                  <p className="text-xs italic text-slate-300">«{tm.quip}»</p>
                  <p className="text-[11px] text-slate-500">{tm.desc}</p>
                </div>
                {selected && <Check className="h-5 w-5 shrink-0 text-emerald-400" />}
              </div>
              {!unlocked && (
                <div className="mt-2 flex items-center gap-2">
                  <ProgressBar value={current / tm.target} heightClass="h-1.5" label={`${tm.name} fremdrift`} />
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">
                    {current}/{tm.target}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
