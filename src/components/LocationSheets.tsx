import { MapPin, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { KNOWN_COURSES_DB } from '../data/courses.ts';
import { PLACES } from '../data/places.ts';
import type { Place } from '../lib/locationStore.ts';
import { filterPlaces, searchPlaces } from '../lib/placeSearch.ts';
import { Sheet } from './ui/Sheet.tsx';
import { t } from '../i18n/index.ts';

/**
 * Forklaring som vises FØR systemets tillatelsesdialog (Google Play krever at appen
 * sier tydelig hva posisjonen brukes til før den ber om den).
 */
export function LocationRationaleSheet({
  open,
  denied,
  onAccept,
  onManual,
  onClose,
}: {
  open: boolean;
  /** Systemet har allerede blokkert posisjon for appen */
  denied: boolean;
  onAccept: () => void;
  onManual: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      zClass="z-[60]"
      title={t('Bruke posisjonen din?')}
      footer={
        <div className="space-y-2">
          {!denied && (
            <button type="button" className="btn btn-primary w-full" onClick={onAccept}>
              {t('Tillat posisjon')}</button>
          )}
          <button type="button" className="btn btn-secondary w-full" onClick={onManual}>
            {t('Velg sted manuelt')}</button>
          <button type="button" className="btn btn-ghost w-full" onClick={onClose}>
            {t('Ikke nå')}</button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-slate-300">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
            <MapPin className="h-6 w-6" aria-hidden />
          </span>
          <p className="font-bold text-white">
            {t('Posisjonen din brukes bare mens appen er åpen, og bare til dette:')}</p>
        </div>
        <ul className="space-y-2">
          <li>{t('🌦️ Vise været der du står (hentes fra Yr / Meteorologisk institutt).')}</li>
          <li>{t('🥏 Finne diskgolfbanen du er på, så du slipper å velge selv.')}</li>
          <li>{t('🏅 Bekrefte at runden er spilt på banen, slik at vær-achievements telles.')}</li>
        </ul>
        <div className="flex gap-2 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-xs text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
          <p>
            {t('Vi sporer deg ikke i bakgrunnen og lagrer ikke posisjonen din i profilen. Til værvarselet sendes en grov posisjon (ca. 1 km) til Meteorologisk institutt. Du kan når som helst skru av posisjon i telefonens innstillinger, og appen fungerer fint uten: du velger da sted selv.')}</p>
        </div>
        {denied && (
          <p className="rounded-xl bg-amber-500/10 p-3 text-xs font-bold text-amber-200">
            {t('Posisjon er blokkert for appen. Du kan slå den på igjen i telefonens innstillinger under «Apper → Disc Golf RPG → Tillatelser», eller velge sted manuelt her.')}</p>
        )}
      </div>
    </Sheet>
  );
}

/** Velg sted manuelt: egen liste (baner og byer) + søk på nett. */
export function PlacePickerSheet({
  open,
  current,
  hasGps,
  onPick,
  onClear,
  onClose,
}: {
  open: boolean;
  current: Place | null;
  hasGps: boolean;
  onPick: (p: Place) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);

  const courses = useMemo<Place[]>(
    () => KNOWN_COURSES_DB.map((c) => ({ name: `${c.name} (${c.location})`, lat: c.lat, lng: c.lng })),
    []
  );
  const shownCourses = filterPlaces(courses, query);
  const shownPlaces = filterPlaces(PLACES, query);

  useEffect(() => {
    if (!open || query.trim().length < 3) {
      setOnline([]);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const tm = window.setTimeout(() => {
      void searchPlaces(query, ctrl.signal).then((r) => {
        if (!ctrl.signal.aborted) {
          setOnline(r);
          setSearching(false);
        }
      });
    }, 500);
    return () => {
      ctrl.abort();
      window.clearTimeout(tm);
    };
  }, [query, open]);

  const row = (p: Place, key: string) => (
    <li key={key}>
      <button
        type="button"
        onClick={() => onPick(p)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-slate-100 hover:bg-slate-800 active:bg-slate-800"
      >
        <MapPin className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        <span className="truncate">{p.name}</span>
      </button>
    </li>
  );

  return (
    <Sheet open={open} onClose={onClose} zClass="z-[60]" title={t('Velg sted')} full>
      <div className="space-y-4">
        <label className="relative block">
          <span className="sr-only">{t('Søk etter sted')}</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            className="field pl-9"
            placeholder={t('Søk etter bane, by eller sted')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </label>

        {current && (
          <button type="button" className="btn btn-secondary w-full" onClick={onClear}>
            {hasGps ? t('Bruk posisjonen min i stedet') : t('Fjern valgt sted ({name})', { name: current.name })}
          </button>
        )}

        {shownCourses.length > 0 && (
          <section>
            <div className="eyebrow mb-1">{t('Diskgolfbaner')}</div>
            <ul>{shownCourses.map((p) => row(p, `c-${p.name}`))}</ul>
          </section>
        )}
        {shownPlaces.length > 0 && (
          <section>
            <div className="eyebrow mb-1">{t('Byer og steder')}</div>
            <ul>{shownPlaces.map((p) => row(p, `p-${p.name}`))}</ul>
          </section>
        )}
        {query.trim().length >= 3 && (
          <section>
            <div className="eyebrow mb-1">{t('Søk på nett (OpenStreetMap)')}</div>
            {searching && <p className="px-3 text-xs text-slate-500">{t('Søker…')}</p>}
            {!searching && online.length === 0 && <p className="px-3 text-xs text-slate-500">{t('Ingen treff.')}</p>}
            <ul>{online.map((p, i) => row(p, `o-${i}-${p.name}`))}</ul>
          </section>
        )}
        <p className="px-1 text-[11px] text-slate-500">
          {t('Stedet brukes kun til værvarselet. Runder spilt på manuelt valgt sted gir ikke vær-achievements, fordi vi da ikke kan bekrefte at du står på banen.')}</p>
      </div>
    </Sheet>
  );
}
