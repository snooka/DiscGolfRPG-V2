import { readJson, STORAGE_KEYS, writeJson } from './storage.ts';

// ==========================================
// POSISJONSVALG PÅ DENNE ENHETEN
// ==========================================
// Samtykke og manuelt valgt sted er innstillinger for én enhet (ikke spillerprogresjon),
// så de ligger lokalt. Alt er pakket i try/catch via storage.ts.

export interface Place {
  name: string;
  lat: number;
  lng: number;
}

interface Stored {
  /** Brukeren har sett forklaringen og sagt ja til at appen ber om posisjon. */
  consent: boolean;
  manual: Place | null;
}

const isPlace = (p: unknown): p is Place =>
  typeof p === 'object' &&
  p !== null &&
  typeof (p as Place).name === 'string' &&
  Number.isFinite((p as Place).lat) &&
  Number.isFinite((p as Place).lng);

export function loadLocationPrefs(): Stored {
  const raw = readJson<Partial<Stored>>(STORAGE_KEYS.location, {});
  return { consent: raw.consent === true, manual: isPlace(raw.manual) ? raw.manual : null };
}

export function saveLocationPrefs(next: Stored): void {
  writeJson(STORAGE_KEYS.location, next);
}

/** Har brukeren samtykket til at appen får be om posisjon? Sjekkes av all GPS-bruk. */
export const hasLocationConsent = (): boolean => loadLocationPrefs().consent;

export function setLocationConsent(consent: boolean): void {
  saveLocationPrefs({ ...loadLocationPrefs(), consent });
}

export function setManualPlace(manual: Place | null): void {
  saveLocationPrefs({ ...loadLocationPrefs(), manual });
}

/** Grov posisjon (≈1 km) – nok til vær, og gir ikke bort hvor man bor. */
export const coarse = (n: number): number => Math.round(n * 100) / 100;
