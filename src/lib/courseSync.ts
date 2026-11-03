import { createClient } from '@supabase/supabase-js';
import type { CourseItem, CourseHole } from '../types.ts';
import defaultLocalCourses from '../data/courses.json';

const CACHE_KEY = 'discgolf_courses_cache';
const LAST_SYNC_KEY = 'discgolf_courses_last_sync';

// Henter nøkler trygt fra miljøvariabler
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
    // Ignorer ved parsing-feil
  }

  return (defaultLocalCourses as unknown as CourseItem[]) || [];
}

export async function syncCoursesWithCloud(): Promise<CourseItem[]> {
  if (!client) {
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

    localStorage.setItem(CACHE_KEY, JSON.stringify(remoteCourses));
    localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());

    return remoteCourses;
  } catch (err) {
    console.warn('Frakoblet: Bruker lokale banedata.', err);
    return getActiveCourses();
  }
}