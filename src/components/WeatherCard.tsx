import { Cloud, CloudRain, MapPin, Sun, Wind } from 'lucide-react';
import { useLocation } from '../context/location-context.ts';
import { useWeather } from '../hooks/useWeather.ts';
import { GUST_LIMIT } from '../lib/weather.ts';
import type { CourseItem } from '../types.ts';
import { t } from '../i18n/index.ts';

/**
 * Kompakt værkort øverst på startskjermen (Yr / MET Norway).
 * Sted: GPS → manuelt valgt sted → sist spilte bane. Uten noe av dette får man to valg: slå på posisjon eller velg sted.
 */
export function WeatherCard({ fallbackCourse }: { fallbackCourse?: CourseItem }) {
  const loc = useLocation();
  const point = loc.point ?? (fallbackCourse ? { lat: fallbackCourse.lat, lng: fallbackCourse.lng } : null);
  const place = loc.placeName ?? fallbackCourse?.name ?? null;
  const state = useWeather(point?.lat ?? null, point?.lng ?? null);

  // Ingen sted å vise vær for
  if (!point) {
    const blocked = loc.permission === 'denied' || loc.failure === 'denied';
    return (
      <section className="card space-y-3 p-3.5" aria-label={t('Vær')}>
        <div className="flex items-center gap-3">
          <Sun className="h-7 w-7 shrink-0 text-amber-300" aria-hidden />
          <div className="min-w-0">
            <div className="text-sm font-black text-white">{t('Se været der du spiller')}</div>
            <div className="text-xs text-slate-400">
              {blocked
                ? t('Posisjon er av for appen. Velg sted selv, eller slå på posisjon i telefonens innstillinger.')
                : t('Slå på posisjon eller velg sted manuelt.')}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {!blocked && (
            <button type="button" className="btn btn-primary btn-sm flex-1" onClick={() => void loc.requestGps()}>
              {t('Bruk posisjonen min')}</button>
          )}
          <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={loc.openPicker}>
            {t('Velg sted')}</button>
        </div>
      </section>
    );
  }

  const w = state.status === 'ready' ? state.weather : null;
  const Icon = w?.isRain ? CloudRain : w?.isSunny ? Sun : (w?.windGust ?? 0) > GUST_LIMIT ? Wind : Cloud;
  const tone = w?.isRain ? 'text-cyan-400' : w?.isSunny ? 'text-amber-300' : 'text-slate-300';
  const gusty = (w?.windGust ?? 0) > GUST_LIMIT;

  return (
    <section className="card flex items-center gap-3 p-3" aria-label={t('Vær')} role="status">
      <Icon className={`h-9 w-9 shrink-0 ${tone}`} aria-hidden />
      <div className="min-w-0 flex-1">
        {state.status === 'loading' || state.status === 'idle' ? (
          <div className="text-sm font-bold text-slate-400">{t('Henter vær…')}</div>
        ) : w ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-white">{w.temp}°</span>
              <span className="truncate text-sm font-bold text-slate-200">{w.desc}</span>
            </div>
            <div className="text-xs leading-snug text-slate-400">
              💨 {w.windSpeed} m/s
              {gusty && <span className="font-bold text-amber-300"> {t('(kast {windGust})', { windGust: w.windGust ?? '' })}</span>}
              {' • '}
              {w.isRain ? `🌧️ ${w.rainMm > 0 ? t('{mm} mm/t', { mm: w.rainMm }) : t('regn')}` : t('Ingen regn')}
            </div>
          </>
        ) : (
          <div className="text-sm font-bold text-slate-300">
            {t('Været er utilgjengelig akkurat nå')}{' '}<button type="button" className="underline" onClick={state.retry}>
              {t('Prøv igjen')}</button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={loc.openPicker}
        className="flex max-w-[30%] shrink-0 flex-col items-end gap-0.5 text-right"
        aria-label={t('Sted: {place}. Endre sted', { place: place ?? t('ukjent') })}
      >
        <span className="flex items-center gap-1 text-[11px] font-bold text-slate-300">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">{place}</span>
        </span>
        <span className="text-[10px] font-bold text-emerald-300 underline">{t('Endre')}</span>
      </button>
    </section>
  );
}
