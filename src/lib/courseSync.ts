import { createClient } from '@supabase/supabase-js';
import type { CourseItem, CourseHole } from '../types.ts';
import defaultLocalCourses from '../data/courses.json';

const CACHE_KEY = 'discgolf_courses_cache';
const LAST_SYNC_KEY = 'discgolf_courses_last_sync';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 timer mellom automatiske synkroniseringer

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

const client = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

interface SupabaseCourseRow {
  id: string;
  name: string;
  location: string;
  holes: number;
  par: number;
  total_length_meters: number | null;
  lat: number;
  lng: number;
  layout: CourseHole[] | null;
  is_verified: boolean;
  updated_at: string;
}

/**
 * Henter baner umiddelbart fra lokal hurtigbuffer eller fallback-filen.
 * Kjører helt synkront/raskt uten nettverksforsinkelse.
 */
export async function getActiveCourses(): Promise<CourseItem[]> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as CourseItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignorer ved parsing-feil og fall tilbake til JSON
  }

  return (defaultLocalCourses as unknown as CourseItem[]) || [];
}

/**
 * Synkroniserer mot Supabase i bakgrunnen.
 * Hopper over nettverkskall dersom det nylig ble synkronisert (med mindre force = true).
 */
export async function syncCoursesWithCloud(force = false): Promise<CourseItem[]> {
  if (!client) {
    return getActiveCourses();
  }

  const lastSync = localStorage.getItem(LAST_SYNC_KEY);
  const now = Date.now();

  // Hvis det er mindre enn 24 timer siden forrige synk, bruk cachet versjon direkte
  if (!force && lastSync && now - parseInt(lastSync, 10) < SYNC_INTERVAL_MS) {
    return getActiveCourses();
  }

  try {
    const { data, error } = await client
      .from('courses')
      .select('*')
      .order('name', { ascending: true });

    if (error || !data || data.length === 0) {
      return getActiveCourses();
    }

    const rows = data as unknown as SupabaseCourseRow[];
    const remoteCourses: CourseItem[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      location: row.location,
      holes: row.holes,
      par: row.par,
      totalLengthMeters: row.total_length_meters ?? undefined,
      image: '🥏',
      lat: row.lat,
      lng: row.lng,
      layout: Array.isArray(row.layout) ? row.layout : [],
      isCustom: false,
      updatedAt: row.updated_at,
    }));

    // Flett med lokale data slik at ingen forhåndsdefinerte baner forsvinner
    const courseMap = new Map<string, CourseItem>();
    for (const c of (defaultLocalCourses as unknown as CourseItem[]) || []) {
      courseMap.set(c.id, c);
    }
    for (const c of remoteCourses) {
      courseMap.set(c.id, c);
    }

    const merged = Array.from(courseMap.values());

    localStorage.setItem(CACHE_KEY, JSON.stringify(merged));
    localStorage.setItem(LAST_SYNC_KEY, now.toString());

    return merged;
  } catch (err) {
    console.warn('Frakoblet: Bruker lokale banedata.', err);
    return getActiveCourses();
  }
}