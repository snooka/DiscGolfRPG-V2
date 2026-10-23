import { ChevronLeft, Trophy } from 'lucide-react';
import { useState } from 'react';
import {
  ACHIEVEMENTS,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  EMBLEM_ACHIEVEMENTS,
  RARITY_LABEL,
  RARITY_STYLE,
  RARITY_TEXT,
} from '../data/achievements.ts';
import type { AchievementDef } from '../data/achievements.ts';
import { getDisplayTitle, TITLES } from '../data/titles.ts';
import { useSession } from '../context/auth-context.ts';
import { ProgressBar } from './ui/ProgressBar.tsx';
import { SegmentedControl } from './ui/SegmentedControl.tsx';
import { TitleBadge } from './TitleBadge.tsx';
import { t } from '../i18n/index.ts';

export type View = 'achievements' | 'emblems' | 'titles';

export function AchievementsTab({
  initialView = 'achievements',
  onBack,
}: {
  initialView?: View;
  onBack?: () => void;
}) {
  const { profile } = useSession();
  const [view, setView] = useState<View>(initialView);
  const unlockedCount = ACHIEVEMENTS.filter((a) => profile.achievements[a.id]).length;

  return (
    <div className="space-y-4">
      {onBack && <BackButton onClick={onBack} />}
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-black text-white">
          <Trophy className="h-5 w-5 text-amber-400" aria-hidden />
          {t('Prestasjoner')}</h2>
        <span className="font-mono text-xs font-bold text-emerald-400">
          {t('{unlockedCount} / {length} låst opp', { unlockedCount, length: ACHIEVEMENTS.length })}</span>
      </div>

      <SegmentedControl
        label={t('Visning')}
        value={view}
        onChange={setView}
        options={[
          { value: 'achievements', label: t('Achievements') },
          { value: 'emblems', label: t('Emblemer') },
          { value: 'titles', label: t('Titler') },
        ]}
      />

      {view === 'achievements' && <AchievementList />}
      {view === 'emblems' && <EmblemGrid />}
      {view === 'titles' && <TitleList />}
    </div>
  );
}

// ---------- Achievements ----------

function AchievementList() {
  const { profile } = useSession();
  return (
    <div className="space-y-5">
      {CATEGORY_ORDER.map((cat) => {
        const list = ACHIEVEMENTS.filter((a) => a.category === cat);
        const done = list.filter((a) => profile.achievements[a.id]).length;
        return (
          <section key={cat} className="space-y-2" aria-label={CATEGORY_LABEL[cat]}>
            <h3 className="eyebrow flex justify-between">
              <span>{CATEGORY_LABEL[cat]}</span>
              <span className="font-mono">
                {done}/{list.length}
              </span>
            </h3>
            <ul className="space-y-2">
              {list.map((a) => (
                <AchievementRow key={a.id} def={a} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function AchievementRow({ def }: { def: AchievementDef }) {
  const { profile } = useSession();
  const unlocked = !!profile.achievements[def.id];
  const current = Math.min(def.target, Math.floor(def.metric(profile.stats) * 100) / 100);

  return (
    <li
      className={`rounded-2xl p-3 ${
        unlocked && def.rarity === 'legendary'
          ? 'rarity-legendary'
          : unlocked && def.rarity === 'epic'
            ? 'rarity-epic'
            : unlocked
              ? 'border border-amber-500/50 bg-slate-950'
              : 'border border-slate-800 bg-slate-950/60'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-2xl ${
            unlocked
              ? 'border-amber-500/40 bg-amber-950/40'
              : 'border-slate-800 bg-slate-900 opacity-40 grayscale'
          }`}
          aria-hidden
        >
          {def.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-black text-white">{def.title}</h4>
            {unlocked ? (
              <span className="shrink-0 text-xs font-bold text-amber-400">{t('Låst opp 🏆')}</span>
            ) : (
              <span className="shrink-0 font-mono text-xs text-slate-400">
                {current} / {def.target}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">{def.desc}</p>
          <p className="mt-1 text-[11px] font-bold">
            <span className={RARITY_TEXT[def.rarity]}>
              {RARITY_LABEL[def.rarity]}
            </span>
            <span className="text-slate-500"> {t('• +{xp} XP', { xp: def.xp })}</span>
            {def.emblem && <span className="text-slate-500"> {t('• gir emblem')}</span>}
          </p>
        </div>
      </div>
      {!unlocked && def.target > 1 && (
        <div className="mt-2">
          <ProgressBar
            value={current / def.target}
            fillClass="bg-amber-500"
            heightClass="h-1.5"
            label={`${def.title} fremdrift`}
          />
        </div>
      )}
    </li>
  );
}

// ---------- Emblemer ----------

function EmblemGrid() {
  const { profile } = useSession();
  const have = EMBLEM_ACHIEVEMENTS.filter((a) => profile.achievements[a.id]).length;
  return (
    <section className="space-y-3">
      <p className="text-xs text-slate-400">
        {t('Emblemer er samleobjekter du får for de største prestasjonene. Du har')}{' '}<span className="font-bold text-emerald-400">
          {t('{have} av {length}', { have, length: EMBLEM_ACHIEVEMENTS.length })}</span>
        .
      </p>
      <ul className="grid grid-cols-3 gap-2">
        {EMBLEM_ACHIEVEMENTS.map((a) => {
          const unlocked = !!profile.achievements[a.id];
          return (
            <li
              key={a.id}
              className={`flex flex-col items-center gap-1 rounded-2xl border-2 bg-slate-950 p-3 text-center ${
                unlocked ? RARITY_STYLE[a.rarity] : 'border-slate-800 text-slate-600'
              }`}
            >
              <span
                className={`text-3xl ${unlocked ? '' : 'opacity-30 grayscale'}`}
                aria-hidden
              >
                {a.icon}
              </span>
              <span className="text-[11px] font-bold leading-tight">
                {unlocked ? a.title : '???'}
              </span>
              {!unlocked && <span className="text-[10px] leading-tight text-slate-500">{a.desc}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- Titler ----------

function TitleList() {
  const { profile } = useSession();
  const shown = getDisplayTitle(profile);
  return (
    <section className="space-y-3">
      <div className="card flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">{t('Vises under navnet ditt')}</span>
        <TitleBadge title={shown} />
      </div>
      <ul className="space-y-2">
        {TITLES.map((tm) => {
          const unlocked = !!profile.titles[tm.id];
          const current = Math.min(tm.target, tm.metric(profile.stats));
          return (
            <li
              key={tm.id}
              className={`flex items-center gap-3 rounded-2xl border p-3 ${
                unlocked ? 'border-slate-700 bg-slate-950' : 'border-slate-800 bg-slate-950/50'
              }`}
            >
              <span className={`text-2xl ${unlocked ? '' : 'opacity-30 grayscale'}`} aria-hidden>
                {tm.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-black ${unlocked ? 'text-white' : 'text-slate-400'}`}>
                    {tm.name}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">{RARITY_LABEL[tm.rarity]}</span>
                </div>
                <p className="text-xs italic text-slate-300">«{tm.quip}»</p>
                <p className="text-[11px] text-slate-500">{tm.desc}</p>
                {!unlocked && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <ProgressBar value={current / tm.target} heightClass="h-1.5" label={`${tm.name} fremdrift`} />
                    <span className="shrink-0 font-mono text-[11px] text-slate-400">
                      {current}/{tm.target}
                    </span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">{t('Bytt tittel fra profilsiden.')}</p>
    </section>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn btn-secondary btn-sm">
      <ChevronLeft className="h-4 w-4" aria-hidden />
      {t('Tilbake')}</button>
  );
}
