import { normalizeBag, normalizeProfile } from './profile.ts';
import { readJson, readString, STORAGE_KEYS, writeString } from './storage.ts';
import type { Profile } from '../types.ts';

// ==========================================
// OVERFØRING FRA DEN GAMLE, LOKALE VERSJONEN
// ==========================================
// Tidligere lå brukere og profiler i nettleseren (localStorage). Første gang noen
// logger inn med en e-post som også finnes lokalt, hentes den gamle profilen
// (XP, bag, statistikk, achievements) over til skyen. Passord overføres ikke –
// kontoen er ny og har sitt eget passord. Venner må legges til på nytt.

const importedKey = (email: string) => `dgrpg:legacy-imported:${email}`;

interface LegacyAccount {
  id?: unknown;
  email?: unknown;
}

export function findLegacyProfile(email: string, userId: string): Profile | null {
  const key = email.trim().toLowerCase();
  if (readString(importedKey(key))) return null;
  const accounts = readJson<Record<string, LegacyAccount>>(STORAGE_KEYS.accounts, {});
  const profiles = readJson<Record<string, unknown>>(STORAGE_KEYS.profiles, {});
  const found = Object.entries(accounts).find(
    ([, a]) => typeof a?.email === 'string' && a.email.toLowerCase() === key
  );
  if (!found || !profiles[found[0]]) return null;
  return normalizeProfile(profiles[found[0]], userId);
}

/** Bagen fra den aller første versjonen av appen (før brukere fantes). */
export function findLegacyBag() {
  return normalizeBag(readJson<unknown>(STORAGE_KEYS.legacyBag, []));
}

export function markLegacyImported(email: string): void {
  writeString(importedKey(email.trim().toLowerCase()), String(Date.now()));
}
