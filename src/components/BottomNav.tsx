import { BarChart3, Medal, MapPin, Trophy, User, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { t } from '../i18n/index.ts';

export type Tab = 'profile' | 'courses' | 'stats' | 'achievements' | 'friends' | 'leaderboard';

const ITEMS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'profile', get label() { return t('Profil'); }, Icon: User },
  { id: 'courses', get label() { return t('Baner'); }, Icon: MapPin },
  { id: 'stats', get label() { return t('Stats'); }, Icon: BarChart3 },
  { id: 'achievements', get label() { return t('Trofeer'); }, Icon: Trophy },
  { id: 'friends', get label() { return t('Venner'); }, Icon: UsersRound },
  { id: 'leaderboard', get label() { return t('Topp'); }, Icon: Medal },
];

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      aria-label={t('Hovedmeny')}
      className="shrink-0 glass-bar border-t border-sky-400/20 shadow-[0_-6px_24px_rgba(0,0,0,0.45)] pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid w-full max-w-2xl grid-cols-6">
        {ITEMS.map(({ id, label, Icon }) => {
          const isActive = id === active;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-bold transition-colors ${
                  isActive ? 'text-emerald-300 [text-shadow:0_0_12px_rgba(34,211,238,0.8)] [&_svg]:drop-shadow-[0_0_6px_rgba(34,211,238,0.9)]' : 'text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="max-w-full truncate">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
