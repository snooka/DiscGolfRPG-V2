import { createClient } from '@supabase/supabase-js';
import type { CourseItem } from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface NewCourseInput {
  name: string;
  city?: string;
  municipality?: string;
  lat: number;
  lng: number;
  holes_count: number;
  layoutName?: string;
  holes?: Array<{
    number: number;
    par: number;
    distance_meters?: number;
  }>;
}

export interface CourseUpdateInput {
  name?: string;
  city?: string;
  municipality?: string;
  holes_count?: number;
  lat?: number;
  lng?: number;
}

/**
 * Søker etter baner i Supabase basert på tekst (navn, by eller kommune).
 */
export async function searchCoursesDb(queryText: string): Promise<CourseItem[]> {
  const clean = queryText.trim();
  if (!clean) return [];

  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .or(`name.ilike.%${clean}%,city.ilike.%${clean}%,municipality.ilike.%${clean}%,location.ilike.%${clean}%`)
    .limit(20);

  if (error) {
    console.error('Feil ved søk i Supabase:', error);
    return [];
  }

  return (data || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    location: c.location || [c.city, c.municipality].filter(Boolean).join(', ') || 'Norge',
    holes: c.holes_count || 18,
    par: (c.holes_count || 18) * 3,
    image: '⛳',
    lat: c.lat,
    lng: c.lng,
    is_verified: c.is_verified ?? false,
    layout: Array.from({ length: c.holes_count || 18 }, (_, idx) => ({
      number: idx + 1,
      par: 3,
    })),
  }));
}

/**
 * Oppretter en ny bane med standard layout og valgfrie hull i databasen.
 */
export async function createCourseWithLayout(course: NewCourseInput) {
  const { data: { user } } = await supabase.auth.getUser();

  const { data: courseData, error: courseError } = await supabase
    .from('courses')
    .insert({
      name: course.name,
      location: [course.city, course.municipality].filter(Boolean).join(', ') || 'Norge',
      city: course.city || null,
      municipality: course.municipality || null,
      lat: course.lat,
      lng: course.lng,
      holes_count: course.holes_count,
      created_by: user ? user.id : null,
      is_verified: false,
      source: 'user',
    })
    .select()
    .single();

  if (courseError) throw courseError;

  const { data: layoutData, error: layoutError } = await supabase
    .from('course_layouts')
    .insert({
      course_id: courseData.id,
      name: course.layoutName || 'Hovedsløyfe',
      holes_count: course.holes_count,
      is_main: true,
    })
    .select()
    .single();

  if (layoutError) {
    console.warn('Kunne ikke opprette layout, fortsetter:', layoutError);
    return courseData;
  }

  if (course.holes && course.holes.length > 0) {
    const holesToInsert = course.holes.map((h) => ({
      layout_id: layoutData.id,
      number: h.number,
      par: h.par || 3,
      distance_meters: h.distance_meters || null,
    }));

    const { error: holesError } = await supabase
      .from('course_holes')
      .insert(holesToInsert);

    if (holesError) {
      console.warn('Kunne ikke lagre hull:', holesError);
    }
  }

  return courseData;
}

/**
 * Oppdaterer eksisterende baneinfo (f.eks. ved endring av navn, antall hull eller by).
 */
export async function updateCourseDb(courseId: string, updates: CourseUpdateInput) {
  const payload: Record<string, unknown> = { ...updates };

  if (updates.city || updates.municipality) {
    payload.location = [updates.city, updates.municipality].filter(Boolean).join(', ') || 'Norge';
  }

  const { data, error } = await supabase
    .from('courses')
    .update(payload)
    .eq('id', courseId)
    .select()
    .single();

  if (error) {
    console.error('Kunne ikke oppdatere banen:', error);
    throw error;
  }

  return data;
}

/**
 * Oppdaterer par og lengde på et spesifikt hull.
 */
export async function updateHoleDb(holeId: string, par: number, distanceMeters?: number) {
  const { data, error } = await supabase
    .from('course_holes')
    .update({
      par,
      distance_meters: distanceMeters ?? null,
    })
    .eq('id', holeId)
    .select()
    .single();

  if (error) {
    console.error('Kunne ikke oppdatere hullet:', error);
    throw error;
  }

  return data;
}