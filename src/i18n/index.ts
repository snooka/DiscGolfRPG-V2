// ==========================================
// SPRÅK (norsk / English)
// ==========================================
// Norsk er hovedspråket og står som kildetekst i koden: t('Norsk tekst'). Den engelske oversettelsen
// ligger i en.ts, nøklet på den norske teksten. Mangler en oversettelse vises norsk i stedet for tom tekst.
// Variabler skrives {navn}: t('Hull {n} av {total}', { n, total }).
// Språket lagres på enheten (ikke i skyen) og byttes ved at app-treet monteres på nytt (se App.tsx).
import { en } from './en.ts';

export type Lang = 'no' | 'en';
export const LANGS: readonly { id: Lang; label: string }[] = [
  { id: 'no', label: 'Norsk' },
  { id: 'en', label: 'English' },
];

export const LANG_STORAGE_KEY = 'discgolf-rpg:lang';
export const DEFAULT_LANG: Lang = 'no';

export const isLang = (v: unknown): v is Lang => v === 'no' || v === 'en';

function readStored(): Lang {
  try {
    const v = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(v)) return v;
  } catch {
    /* lagring kan være blokkert – norsk er standard */
  }
  return DEFAULT_LANG;
}

let current: Lang = readStored();
let switchedAt = 0;

/** Ble språket nettopp byttet? Da monteres appen på nytt, og en pågående runde skal ikke åpnes av seg selv. */
export const justSwitchedLang = (): boolean => Date.now() - switchedAt < 3000;
const listeners = new Set<(lang: Lang) => void>();

export const getLang = (): Lang => current;

/** BCP 47-kode for datoformat og <html lang>. */
export const localeOf = (lang: Lang = current): string => (lang === 'en' ? 'en-GB' : 'nb-NO');

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  switchedAt = Date.now();
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignorer */
  }
  applyDocumentLang();
  listeners.forEach((cb) => cb(lang));
}

export function subscribeLang(cb: (lang: Lang) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function applyDocumentLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current === 'en' ? 'en' : 'nb';
}

export type Vars = Record<string, string | number>;

export function format(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Oversetter en norsk kildetekst til gjeldende språk. */
export function translate(source: string, lang: Lang, vars?: Vars): string {
  const text = lang === 'en' ? (en[source] ?? source) : source;
  return format(text, vars);
}

export function t(source: string, vars?: Vars): string {
  return translate(source, current, vars);
}

/** Rendrer dato/tall i gjeldende språk. */
export const dateFormat = (opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  new Intl.DateTimeFormat(localeOf(), opts);

/** Norsk entall/flertall: plural(n, 'runde', 'runder'). Engelsk går via t() på hele setningen. */
export const pick = (n: number, one: string, many: string): string => (n === 1 ? one : many);
