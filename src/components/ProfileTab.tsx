import { BarChart3, LogOut, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { EMBLEM_ACHIEVEMENTS, RARITY_STYLE } from '../data/achievements.ts';
import { getDisplayTitle } from '../data/titles.ts';
import { useSession } from '../context/auth-context.ts';
import { useUi } from '../context/ui-context.ts';
import { getLevelInfo } from '../lib/progress.ts';
import { allTotals, formatDiff } from '../lib/stats.ts';
import { BagSection } from './BagSection.tsx';
import type { Tab } from './BottomNav.tsx';
import { useLocation } from '../context/location-context.ts';
import { WeatherCard } from './WeatherCard.tsx';
import { QuestsCard } from './QuestsCard.tsx';
import { RatingBadge } from './RatingBadge.tsx';
import { TitleBadge } from './TitleBadge.tsx';
import { TitlePickerSheet } from './TitlePickerSheet.tsx';
import { ProgressBar } from './ui/ProgressBar.tsx';
import { LanguagePicker } from './LanguagePicker.tsx';
import { t } from '../i18n/index.ts';

export function ProfileTab({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { user, profile, profileSync, logout, deleteAccount } = useSession();
  const { confirm, toast } = useUi();
  const [pickerOpen, setPickerOpen] = useState(false);
  const loc = useLocation();

  const level = getLevelInfo(profile.xp);
  const title = getDisplayTitle(profile);
  const totals = allTotals(profile.stats);
  const best = profile.stats.modes.normal.bestRoundDiff;
  const emblems = EMBLEM_ACHIEVEMENTS.filter((a) => profile.achievements[a.id]);

  const onLogout = async () => {
    const ok = await confirm({
      title: t('Logge ut?'),
      message: t('Profilen din ligger trygt i skyen. Du kan logge inn igjen når som helst, fra hvilken som helst telefon.'),
      confirmLabel: t('Logg ut'),
    });
    if (ok) logout();
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: t('Slette kontoen din?'),
      message:
        t('Profilen din (XP, statistikk, achievements, bag), vennskap og runder du har vært vert for slettes for alltid. Dette kan ikke angres.'),
      confirmLabel: t('Ja, slett kontoen'),
      cancelLabel: t('Behold den'),
      danger: true,
    });
    if (!ok) return;
    const res = await deleteAccount();
    if (!res.ok) toast(res.error, { tone: 'danger' });
  };

  const lastCourse = Object.values(profile.stats.courses).sort((a, b) => b.lastPlayed - a.lastPlayed)[0]?.course;

  return (
    <div className="space-y-4">
      <WeatherCard fallbackCourse={lastCourse} />
      <section className="card space-y-3" aria-label={t('Profil')}>
        <div className="flex items-center gap-3">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950 text-3xl"
            aria-hidden
          >
            {level.tier.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-lg font-black text-white">{user.name}</h2>
              <div className="flex shrink-0 items-center gap-1.5">
                <RatingBadge />
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-400">
                  {t('Lvl {level}', { level: level.level })}</span>
              </div>
            </div>
            {/* Tittelen vises rett under navnet */}
            <div className="mt-1 flex items-center gap-2">
              <TitleBadge title={title} />
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="text-xs font-bold text-emerald-400 underline-offset-2 hover:underline"
              >
                {t('Bytt')}</button>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-bold text-emerald-400">{level.tier.title}</p>
          <p className="text-xs italic text-slate-400">«{level.tier.desc}»</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs font-bold text-slate-400">
            <span>{level.isMax ? t('Maks level nådd') : t('XP mot Level {level}', { level: level.level + 1 })}</span>
            <span className="font-mono text-emerald-400">
              {profile.xp}
              {!level.isMax && ` / ${level.nextFloor}`} {' '}{t('XP')}</span>
          </div>
          <ProgressBar value={level.progress} label={t('XP-fremdrift')} />
        </div>
      </section>

      <QuestsCard />

      <section className="grid grid-cols-3 gap-2" aria-label={t('Hurtigstatistikk')}>
        <QuickStat label={t('Runder')} value={String(totals.rounds)} tone="text-emerald-400" />
        <QuickStat label={t('Gått')} value={`${profile.stats.totalKm} km`} tone="text-cyan-400" />
        <QuickStat
          label={t('Beste (Normal)')}
          value={best === null ? '–' : formatDiff(best)}
          tone="text-teal-300"
        />
      </section>

      <section className="card space-y-3" aria-labelledby="emblems-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="emblems-title" className="text-sm font-black text-white">
            {t('🎖️ Emblemer ({length}/{length2})', { length: emblems.length, length2: EMBLEM_ACHIEVEMENTS.length })}</h2>
          <button
            type="button"
            onClick={() => onNavigate('achievements')}
            className="text-xs font-bold text-emerald-400"
          >
            {t('Se alle')}</button>
        </div>
        {emblems.length === 0 ? (
          <p className="text-xs text-slate-400">
            {t('Fullfør runder og sett birdies for å låse opp dine første emblemer.')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {emblems.map((a) => (
              <li
                key={a.id}
                title={`${a.title} – ${a.desc}`}
                aria-label={a.title}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border-2 bg-slate-950 text-2xl ${RARITY_STYLE[a.rarity]}`}
              >
                <span aria-hidden>{a.icon}</span>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => onNavigate('stats')}
          className="btn btn-secondary btn-sm w-full"
        >
          <BarChart3 className="h-4 w-4" aria-hidden />
          {t('Se full statistikk per spillmodus')}</button>
      </section>

      <BagSection />

      <section className="card space-y-2 p-3.5" aria-label={t('Språk')}>
        <div className="eyebrow">{t('Språk')}</div>
        <LanguagePicker />
      </section>

      <section className="card space-y-2 p-3.5" aria-label={t('Posisjon og personvern')}>
        <div className="eyebrow">{t('Posisjon og personvern')}</div>
        <p className="text-xs text-slate-400">
          {loc.source === 'gps' && t('📍 Posisjon er på (brukes kun mens appen er åpen).')}
          {loc.source === 'manual' && t('📍 Du har valgt sted manuelt: {name}.', { name: loc.manual?.name ?? '' })}
          {loc.source === 'none' &&
            (loc.permission === 'denied' || loc.failure === 'denied'
              ? t('📍 Posisjon er blokkert for appen. Du kan velge sted manuelt.')
              : t('📍 Posisjon er ikke slått på. Appen fungerer fint uten.'))}
        </p>
        <div className="flex gap-2">
          {loc.source !== 'gps' && loc.permission !== 'denied' && (
            <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => void loc.requestGps()}>
              {t('Slå på posisjon')}</button>
          )}
          <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={loc.openPicker}>
            {t('Velg sted manuelt')}</button>
        </div>
        <a href="/personvern.html" target="_blank" rel="noopener" className="block text-center text-xs font-bold text-emerald-300 underline">
          {t('Personvernerklæring')}</a>
      </section>

      <button type="button" onClick={() => void onLogout()} className="btn btn-ghost w-full">
        <LogOut className="h-4 w-4" aria-hidden />
        {t('Logg ut ({email})', { email: user.email })}</button>

      <p className="text-center text-[11px] text-slate-500" role="status">
        {profileSync === 'saved' && t('☁️ Profilen er lagret i skyen')}
        {profileSync === 'saving' && t('☁️ Lagrer…')}
        {profileSync === 'error' && t('⚠️ Får ikke lagret akkurat nå – prøver igjen automatisk')}
      </p>

      <button type="button" onClick={() => void onDelete()} className="btn btn-ghost btn-sm w-full text-slate-500 hover:text-red-400">
        <Trash2 className="h-4 w-4" aria-hidden />
        {t('Slett kontoen min')}</button>

      <TitlePickerSheet open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

function QuickStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="card p-3 text-center">
      <div className="eyebrow">{label}</div>
      <div className={`mt-0.5 font-mono text-lg font-black ${tone}`}>{value}</div>
    </div>
  );
}
