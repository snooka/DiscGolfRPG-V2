import type { Weather } from '../types.ts';
import { t } from '../i18n/index.ts';

/** Vindkast over dette (m/s) gir «Stormkast». */
export const GUST_LIMIT = 8;

const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: Weather }>();

/**
 * Henter nåværende vær fra Yr/MET Norway (locationforecast «complete», som har vindkast).
 * Returnerer null hvis det ikke lar seg hente – da gis det heller ingen vær-achievements
 * (ingen gjetting). Svar mellomlagres i 10 minutter per sted for å skåne API-et.
 */
export async function fetchWeather(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<Weather | null> {
  // Grov posisjon (2 desimaler ≈ 1 km) er nok til vær og gir minst mulig personopplysning
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  try {
    const res = await fetch(
      `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(2)}&lon=${lng.toFixed(2)}`,
      { signal }
    );
    if (!res.ok) return null;
    const value = parseWeather(await res.json());
    if (value) cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}

/** Ren funksjon: gjør MET-svaret om til appens Weather. null hvis svaret ikke er brukbart. */
export function parseWeather(data: unknown): Weather | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const first = (data as any)?.properties?.timeseries?.[0]?.data;
  const details = first?.instant?.details;
  if (!details || typeof details.air_temperature !== 'number') return null;

  const symbol: string = first?.next_1_hours?.summary?.symbol_code ?? '';
  const windSpeed = round1(Number(details.wind_speed) || 0);
  const rawGust = Number(details.wind_speed_of_gust);
  const windGust = Number.isFinite(rawGust) ? Math.max(round1(rawGust), windSpeed) : windSpeed;
  const isRain = symbol.includes('rain') || symbol.includes('sleet') || symbol.includes('showers');
  const rainMm = Math.max(0, Number(first?.next_1_hours?.details?.precipitation_amount) || 0);
  const isSunny = symbol.startsWith('clearsky') || symbol.startsWith('fair');
  return {
    isRain,
    rainMm,
    isSunny,
    isWindy: windSpeed >= 8,
    windSpeed,
    windGust,
    temp: Math.round(details.air_temperature),
    desc: describeWeather(isRain, isSunny, rainMm),
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Slår sammen vær ved start og slutt av en runde: har det vært regn/sol/vind i løpet av
 * runden, teller det. Brukes slik at en runde som startet tørt men endte i regn får regn-merket.
 */
export function mergeWeather(a: Weather | null, b: Weather | null): Weather | null {
  if (!a) return b;
  if (!b) return a;
  const windSpeed = Math.max(a.windSpeed, b.windSpeed);
  const windGust = Math.max(a.windGust ?? a.windSpeed, b.windGust ?? b.windSpeed);
  const rainMm = Math.max(a.rainMm, b.rainMm);
  const isRain = a.isRain || b.isRain;
  const isSunny = a.isSunny || b.isSunny;
  return {
    isRain,
    rainMm,
    isSunny,
    isWindy: a.isWindy || b.isWindy,
    windSpeed,
    windGust,
    temp: b.temp, // siste måling
    desc: describeWeather(isRain, isSunny, rainMm),
  };
}

/** Kort værbeskrivelse. */
export function describeWeather(isRain: boolean, isSunny: boolean, rainMm: number): string {
  if (isRain) return rainMm >= 2 ? t('Styrtregn 🌧️') : t('Regn 🌦️');
  if (isSunny) return t('Sol ☀️');
  return t('Opphold 🌤️');
}
