// ==========================================
// TRYGG LOKAL LAGRING (localStorage)
// ==========================================
// localStorage kan kaste feil (privat modus, full kvote, blokkert). Alt er
// derfor pakket inn i try/catch, og skriving rapporterer om det lyktes.

export const STORAGE_KEYS = {
  /** Gamle, lokale brukere/profiler (kun lest ved overføring til skyen) */
  accounts: 'dgrpg:accounts:v1',
  profiles: 'dgrpg:profiles:v1',
  /** Lokal kopi av pågående runde (overlever reload og dårlig dekning) */
  round: (userId: string, roundId: string) => `dgrpg:round:v2:${userId}:${roundId}`,
  /** Id-er til runder som ligger lokalt for denne brukeren */
  roundIds: (userId: string) => `dgrpg:rounds:v2:${userId}`,
  /** Runder brukeren har forlatt/avvist (vises ikke som invitasjon igjen) */
  dismissed: (userId: string) => `dgrpg:dismissed:v1:${userId}`,
  /** Posisjonsvalg på denne enheten: samtykke + manuelt valgt sted */
  location: 'dgrpg:location:v1',
  /** Nøkkelen den aller første versjonen av appen lagret bagen i. */
  legacyBag: 'disc_rpg_bag_v2',
} as const;

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
