import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LocationRationaleSheet, PlacePickerSheet } from '../components/LocationSheets.tsx';
import { locate } from '../lib/gps.ts';
import type { GeoFailure, GeoPoint } from '../lib/gps.ts';
import { loadLocationPrefs, setLocationConsent, setManualPlace } from '../lib/locationStore.ts';
import type { Place } from '../lib/locationStore.ts';
import { LocationContext } from './location-context.ts';
import type { LocationApi, PermissionState } from './location-context.ts';
import { useI18n } from '../i18n/i18n-context.ts';
import { t } from '../i18n/index.ts';

const REFRESH_AFTER_MS = 5 * 60_000;

/**
 * Eier alt som har med posisjon å gjøre:
 *  - ber ALDRI systemet om tillatelse før brukeren har lest forklaringen og trykket «Tillat»
 *  - krasjer ikke og blokkerer ikke noe hvis posisjon nektes – da kan man velge sted manuelt
 *  - fungerer likt i Android-appen (Capacitor WebView) og som PWA i nettleseren
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const initial = useRef(loadLocationPrefs()).current;
  const [consent, setConsent] = useState(initial.consent);
  const [manual, setManualState] = useState<Place | null>(initial.manual);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [gps, setGps] = useState<GeoPoint | null>(null);
  const [failure, setFailure] = useState<GeoFailure | null>(null);
  const [locating, setLocating] = useState(false);
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const lastFix = useRef(0);
  const pending = useRef<((p: GeoPoint | null) => void) | null>(null);

  // Hva sier systemet om tillatelsen akkurat nå? (Permissions API finnes ikke overalt)
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let alive = true;
    const apply = () => {
      if (!status || !alive) return;
      setPermission(status.state === 'granted' ? 'granted' : status.state === 'denied' ? 'denied' : 'prompt');
    };
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermission('unsupported');
      return;
    }
    try {
      void navigator.permissions
        ?.query({ name: 'geolocation' })
        .then((s) => {
          status = s;
          apply();
          s.addEventListener('change', apply);
        })
        .catch(() => alive && setPermission('unknown'));
    } catch {
      setPermission('unknown');
    }
    return () => {
      alive = false;
      status?.removeEventListener('change', apply);
    };
  }, []);

  const fix = useCallback(async (force: boolean): Promise<GeoPoint | null> => {
    setLocating(true);
    const r = await locate(8000, 60_000, force);
    setLocating(false);
    if (r.ok) {
      lastFix.current = Date.now();
      setGps(r.point);
      setFailure(null);
      setPermission('granted');
      return r.point;
    }
    setFailure(r.reason);
    if (r.reason === 'denied') setPermission('denied');
    return null;
  }, []);

  // Har brukeren allerede gitt tillatelse i systemet (tidligere versjon / annen enhet), regnes det som samtykke
  useEffect(() => {
    if (permission === 'granted' && !consent) {
      setLocationConsent(true);
      setConsent(true);
    }
  }, [permission, consent]);

  // Hent posisjon stille ved oppstart og når appen åpnes igjen – men bare med samtykke
  useEffect(() => {
    if (!consent || permission === 'denied' || permission === 'unsupported') return;
    void fix(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFix.current > REFRESH_AFTER_MS) {
        void fix(false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [consent, permission === 'denied', fix]); // eslint-disable-line react-hooks/exhaustive-deps

  const settle = (p: GeoPoint | null) => {
    pending.current?.(p);
    pending.current = null;
  };

  const requestGps = useCallback((): Promise<GeoPoint | null> => {
    if (permission === 'unsupported') return Promise.resolve(null);
    if (consent && permission !== 'denied') return fix(false);
    // Forklaring først (Google Play: «prominent disclosure»); systemdialogen kommer først etter «Tillat»
    return new Promise((resolve) => {
      pending.current = resolve;
      setRationaleOpen(true);
    });
  }, [consent, permission, fix]);

  const accept = async () => {
    setRationaleOpen(false);
    setLocationConsent(true);
    setConsent(true);
    settle(await fix(true));
  };

  const decline = () => {
    setRationaleOpen(false);
    settle(null);
  };

  const chooseManual = () => {
    setRationaleOpen(false);
    settle(null);
    setPickerOpen(true);
  };

  const setManual = useCallback((place: Place | null) => {
    setManualPlace(place);
    setManualState(place);
  }, []);

  const { lang } = useI18n(); // placeName er oversatt: regnes ut på nytt når språket byttes
  const api = useMemo<LocationApi>(() => {
    const point: GeoPoint | null = gps ?? (manual ? { lat: manual.lat, lng: manual.lng } : null);
    return {
      permission,
      gps,
      failure,
      locating,
      manual,
      point,
      source: gps ? 'gps' : manual ? 'manual' : 'none',
      placeName: gps ? t('der du er') : (manual?.name ?? null),
      consent,
      requestGps,
      refresh: () => (consent ? fix(false) : Promise.resolve(null)),
      openPicker: () => setPickerOpen(true),
      setManual,
    };
  }, [permission, gps, failure, locating, manual, consent, requestGps, fix, setManual, lang]);

  return (
    <LocationContext.Provider value={api}>
      {children}
      <LocationRationaleSheet
        open={rationaleOpen}
        denied={permission === 'denied'}
        onAccept={() => void accept()}
        onManual={chooseManual}
        onClose={decline}
      />
      <PlacePickerSheet
        open={pickerOpen}
        current={manual}
        hasGps={gps !== null}
        onPick={(p) => {
          setManual(p);
          setPickerOpen(false);
        }}
        onClear={() => {
          setManual(null);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </LocationContext.Provider>
  );
}
