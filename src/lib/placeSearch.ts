import type { Place } from './locationStore.ts';

/** Filtrerer en liste med steder på tekst (uavhengig av store/små bokstaver). Ren funksjon. */
export function filterPlaces<T extends { name: string }>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.name.toLowerCase().includes(q));
}

/**
 * Søker etter steder på nett (OpenStreetMap Nominatim). Feiler stille (tom liste) hvis nettet er nede.
 * Det brukeren skriver sendes til OpenStreetMap – dette er beskrevet i personvernerklæringen.
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=nb&q=${encodeURIComponent(q)}`,
      { signal }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { display_name?: string; lat?: string; lon?: string }[];
    return rows.flatMap((r): Place[] => {
      const lat = Number(r.lat);
      const lng = Number(r.lon);
      if (!r.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      return [{ name: r.display_name.split(',').slice(0, 2).join(',').trim(), lat, lng }];
    });
  } catch {
    return [];
  }
}
