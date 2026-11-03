import type { CourseItem } from '../types.ts';
import localCourses from './courses.json';

export const DEFAULT_HOME_COURSE: CourseItem = {
  id: 'custom_austevoll',
  name: 'Austevoll Frisbeegolfbane',
  location: 'Storebø, Austevoll',
  holes: 12,
  par: 36,
  image: '🌲',
  lat: 60.0125,
  lng: 5.2268,
  layout: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, par: 3 })),
};

export const KNOWN_COURSES_DB: CourseItem[] = localCourses as CourseItem[];