import { Play } from 'lucide-react';
import { getLevelInfo } from '../lib/progress.ts';
import { FancyDiscLogo } from './ui/FancyDiscLogo.tsx';
import { t } from '../i18n/index.ts';

interface HeaderProps {
  xp: number;
  roundActive: boolean;
  onStart: () => void;
  onHome: () => void;
}

export function Header({ xp, roundActive, onStart, onHome }: HeaderProps) {
  const level = getLevelInfo(xp);
  return (
    <header className="shrink-0 glass-bar border-b border-sky-400/20 shadow-[0_6px_24px_rgba(0,0,0,0.45)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={onHome}
          aria-label={t('Gå til startsiden')}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <FancyDiscLogo />
          <div className="min-w-0">
            <h1 className="title-gradient truncate text-base font-black leading-tight">
              {t('DISC GOLF RPG')}</h1>
            <p className="truncate text-xs font-bold text-emerald-400">
              {t('Lvl {level} • {title}', { level: level.level, title: level.tier.title })}</p>
          </div>
        </button>
        <button type="button" onClick={onStart} className="btn btn-primary shrink-0">
          <Play className="h-4 w-4" aria-hidden />
          {roundActive ? t('Fortsett') : t('Start spill')}
        </button>
      </div>
    </header>
  );
}
