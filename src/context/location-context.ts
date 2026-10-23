import { createContext, useContext } from 'react';
import type { GeoFailure, GeoPoint } from '../lib/gps.ts';
import type { Place } from '../lib/locationStore.ts';

/** unknown = ikke sjekket ennå, prompt = ikke spurt, granted/denied = brukerens valg i systemet */
export type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface LocationApi {
  permission: PermissionState;
  /** Ekte GPS-posisjon (null hvis ikke tillatt eller ikke funnet ennå) */
  gps: GeoPoint | null;
  /** Hvorfor GPS ikke ga posisjon sist (for å vise riktig melding) */
  failure: GeoFailure | null;
  locating: boolean;
  /** Manuelt valgt sted */
  manual: Place | null;
  /** Posisjonen appen bruker til vær: GPS først, ellers manuelt sted */
  point: GeoPoint | null;
  source: 'gps' | 'manual' | 'none';
  /** Visningsnavn: «der du er» eller stedsnavnet */
  placeName: string | null;
  /** Har brukeren samtykket til at appen får be om posisjon? */
  consent: boolean;
  /** Viser forklaringen, og ber først deretter om tillatelse. Returnerer posisjonen hvis den ble gitt. */
  requestGps: () => Promise<GeoPoint | null>;
  /** Henter posisjon på nytt (bare hvis samtykke er gitt) */
  refresh: () => Promise<GeoPoint | null>;
  openPicker: () => void;
  setManual: (place: Place | null) => void;
}

export const LocationContext = createContext<LocationApi | null>(null);

export function useLocation(): LocationApi {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation må brukes innenfor <LocationProvider>');
  return ctx;
}
