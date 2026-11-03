import type { CourseItem } from '../types.ts';

// Reell standardbane på Austevoll (Kolbeinsvik)
export const DEFAULT_HOME_COURSE: CourseItem = {
  id: 'kolbeinsvik-austevoll',
  name: 'Kolbeinsvik Frisbeegolfbane',
  location: 'Kolbeinsvik, Austevoll',
  holes: 12,
  par: 36,
  image: '🌲',
  lat: 60.0385,
  lng: 5.2105,
  layout: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, par: 3 })),
};

// Kun faktiske baner – resten hentes direkte fra Supabase
export const KNOWN_COURSES_DB: CourseItem[] = [DEFAULT_HOME_COURSE];