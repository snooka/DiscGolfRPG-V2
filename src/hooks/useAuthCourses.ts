import { useMemo } from 'react';
import { useSession } from '../context/auth-context.ts';
import type { CourseItem } from '../types.ts';

/** Banene innlogget bruker har spilt (GPS-verifisert). */
export function useAuthCourses(): CourseItem[] {
  const { profile } = useSession();
  return useMemo(
    () => Object.values(profile.stats.courses).map((c) => c.course),
    [profile.stats.courses]
  );
}
