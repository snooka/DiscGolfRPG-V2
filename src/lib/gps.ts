import { KNOWN_COURSES_DB } from '../data/courses.ts';
import { getDistanceKm } from './geo.ts';
import { coarse, hasLocationConsent } from './locationStore.ts';
import type { CourseItem } from '../types.ts';
import { t } from '../i18n/index.ts';

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Hvor nær banen man må stå (km) for å regnes som «på banen». */
export const ON_COURSE_KM = 0.6;

export type GeoFailure = 'no-consent' | 'denied' | 'unavailable' | 'timeout' | 'unsupported';
export type GeoResult = { ok: true; point: GeoPoint } | { ok: false; reason: GeoFailure };

/**
 * Henter nåværende posisjon, med årsak hvis det ikke gikk. Spør ALDRI systemet om tillatelse
 * før brukeren har sett forklaringen og samtykket (`force` brukes rett etter at brukeren har trykket «Tillat»).
 */
export function locate(timeoutMs = 8000, maxAgeMs = 30_000, force = false): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ ok: false, reason: 'unsupported' });
      return;
    }
    if (!force && !hasLocationConsent()) {
      resolve({ ok: false, reason: 'no-consent' });
      return;
    }
    let done = false;
    const finish = (r: GeoResult) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    // Sikkerhetsnett hvis nettleseren aldri svarer
    window.setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs + 1500);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish({ ok: true, point: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
        (err) =>
          finish({
            ok: false,
            reason: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable',
          }),
        { timeout: timeoutMs, maximumAge: maxAgeMs, enableHighAccuracy: true }
      );
    } catch {
      finish({ ok: false, reason: 'unavailable' });
    }
  });
}

/** Som `locate`, men bare selve punktet (null hvis nektet, utilgjengelig eller tidsavbrudd). */
export async function getPosition(timeoutMs = 8000, maxAgeMs = 30_000): Promise<GeoPoint | null> {
  const r = await locate(timeoutMs, maxAgeMs);
  return r.ok ? r.point : null;
}

export interface CourseMatch {
  course: CourseItem;
  km: number;
}

/**
 * Finner banen man står på: nærmeste kjente bane (eller en tidligere spilt
 * bane) innenfor ON_COURSE_KM. Ren funksjon.
 */
export function detectCourse(
  pos: GeoPoint,
  extra: CourseItem[] = [],
  known: CourseItem[] = KNOWN_COURSES_DB
): CourseMatch | null {
  const byId = new Map<string, CourseItem>();
  for (const c of [...known, ...extra]) byId.set(c.id, c);
  let best: CourseMatch | null = null;
  for (const course of byId.values()) {
    const km = getDistanceKm(pos.lat, pos.lng, course.lat, course.lng);
    if (km <= ON_COURSE_KM && (!best || km < best.km)) best = { course, km };
  }
  return best;
}

/** Banen som brukes når man ikke står på en kjent bane. Lagres aldri. */
export function freeRoundCourse(pos: GeoPoint | null): CourseItem {
  return {
    id: 'free-round',
    name: t('Fri runde'),
    location: t('Ukjent bane'),
    holes: 9,
    par: 27,
    image: '📍',
    // Grov posisjon (≈1 km): fri runde lagres i skyen hvis den deles med venner
    lat: pos ? coarse(pos.lat) : 0,
    lng: pos ? coarse(pos.lng) : 0,
  };
}
