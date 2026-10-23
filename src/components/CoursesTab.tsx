import { Compass, MapPin, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { DEFAULT_HOME_COURSE, KNOWN_COURSES_DB } from '../data/courses.ts';
import { useSession } from '../context/auth-context.ts';
import type { CourseItem } from '../types.ts';
import { CourseMap } from './CourseMap.tsx';
import { t } from '../i18n/index.ts';

interface CoursesTabProps {
  /** GPS-posisjon hvis tilgjengelig */
  userPosition: { lat: number; lng: number } | null;
}

interface GeoResult {
  place_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
}

async function searchPlaces(query: string): Promise<CourseItem[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=no&q=${encodeURIComponent(query)}`
  );
  if (!res.ok) return [];
  const data: unknown = await res.json();
  if (!Array.isArray(data)) return [];
  return (data as GeoResult[]).flatMap((item, idx) => {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!item.display_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const parts = item.display_name.split(',').map((s) => s.trim());
    const raw = parts[0];
    const lower = raw.toLowerCase();
    const name = lower.includes('diskgolf') || lower.includes('disc') ? raw : `${raw} Diskgolfbane`;
    return [
      {
        id: `geo_${item.place_id ?? idx}`,
        name,
        location: parts[1] ?? t('Norge'),
        holes: 9,
        par: 27,
        image: '🌲',
        lat,
        lng,
      },
    ];
  });
}

export function CoursesTab({ userPosition }: CoursesTabProps) {
  const { profile } = useSession();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourseItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CourseItem | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);

  const played = useMemo(
    () => Object.values(profile.stats.courses).sort((a, b) => b.lastPlayed - a.lastPlayed),
    [profile.stats.courses]
  );

  // Kartet viser kun dine spilte baner og søketreff – ingen tilfeldige baner
  const mapCourses = useMemo(() => {
    const map = new Map<string, { course: CourseItem; played: boolean }>();
    for (const r of results) map.set(r.id, { course: r, played: false });
    for (const p of played) map.set(p.course.id, { course: p.course, played: true });
    return [...map.values()];
  }, [played, results]);

  const select = useCallback((course: CourseItem) => setSelected(course), []);

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const lower = q.toLowerCase();
    const local = KNOWN_COURSES_DB.filter(
      (c) => c.name.toLowerCase().includes(lower) || c.location.toLowerCase().includes(lower)
    );
    try {
      const geo = await searchPlaces(q);
      const merged = [...local];
      for (const g of geo) {
        if (!merged.some((m) => m.name.toLowerCase() === g.name.toLowerCase())) merged.push(g);
      }
      setResults(merged);
      if (merged[0]) {
        setFocus({ lat: merged[0].lat, lng: merged[0].lng });
        setSelected(merged[0]);
      }
    } catch {
      setResults(local);
      setSearchError(t('Kartsøket feilet. Viser bare kjente baner.'));
    } finally {
      setSearching(false);
    }
  };

  const fallbackCenter = played[0]
    ? { lat: played[0].course.lat, lng: played[0].course.lng }
    : { lat: DEFAULT_HOME_COURSE.lat, lng: DEFAULT_HOME_COURSE.lng };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-black text-white">
          <MapPin className="h-5 w-5 text-emerald-400" aria-hidden />
          {t('Banesøk & kart')}</h2>
        <span className="flex items-center gap-1 text-xs font-bold text-slate-400">
          <Compass className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          {t('OpenStreetMap')}</span>
      </div>

      <form onSubmit={(e) => void onSearch(e)} className="flex gap-2" role="search">
        <label htmlFor="course-search" className="sr-only">
          {t('Søk etter bane eller sted')}</label>
        <input
          id="course-search"
          type="search"
          className="field"
          placeholder={t('Søk etter bane eller sted…')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-primary shrink-0" disabled={searching}>
          <Search className="h-4 w-4" aria-hidden />
          {searching ? '…' : t('Søk')}
        </button>
      </form>
      {searchError && <p className="field-error">{searchError}</p>}

      {results.length > 0 && (
        <section className="card card-hi space-y-2" aria-label={t('Søkeresultater')}>
          <div className="flex items-center justify-between">
            <h3 className="eyebrow text-emerald-400">{t('Søkeresultater ({length})', { length: results.length })}</h3>
            <button type="button" className="text-xs font-bold text-slate-400" onClick={() => setResults([])}>
              {t('Lukk ✕')}</button>
          </div>
          {results.map((c) => (
            <CourseRow
              key={c.id}
              course={c}
              onShow={() => {
                setSelected(c);
                setFocus({ lat: c.lat, lng: c.lng });
              }}
            />
          ))}
        </section>
      )}

      <CourseMap
        courses={mapCourses}
        userPosition={userPosition}
        focus={focus}
        fallbackCenter={fallbackCenter}
        onSelect={select}
      />

      {selected && (
        <section className="card card-hi" aria-label={t('Valgt bane')}>
          <div className="eyebrow text-emerald-400">{t('Valgt på kartet')}</div>
          <div className="truncate text-sm font-black text-white">
            {selected.image} {selected.name}
          </div>
          <div className="text-xs text-slate-400">
            {t('{location} • {holes} hull', { location: selected.location, holes: selected.holes })}</div>
        </section>
      )}

      <section className="space-y-2" aria-label={t('Dine baner')}>
        <h3 className="eyebrow text-emerald-400">{t('Dine spilte baner ({length})', { length: played.length })}</h3>
        {played.length === 0 ? (
          <div className="card text-center">
            <p className="text-sm font-bold text-slate-200">{t('Ingen spilte baner ennå')}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {t('Baner legges til her automatisk når du fullfører en runde mens GPS-en viser at du står på banen.')}</p>
          </div>
        ) : (
          played.map((p) => (
            <CourseRow
              key={p.course.id}
              course={p.course}
              note={t('Spilt {rounds}×', { rounds: p.rounds })}
              onShow={() => {
                setSelected(p.course);
                setFocus({ lat: p.course.lat, lng: p.course.lng });
              }}
            />
          ))
        )}
        <p className="text-xs text-slate-500">
          {t('Tips: «Start spill» finner banen du står på via GPS. Runder uten GPS-treff blir «Fri runde» og lagres ikke her.')}</p>
      </section>
    </div>
  );
}

function CourseRow({
  course,
  note,
  onShow,
}: {
  course: CourseItem;
  note?: string;
  onShow: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3">
      <div className="min-w-0">
        <h4 className="truncate text-sm font-bold text-white">
          {course.image} {course.name}
        </h4>
        <p className="truncate text-xs text-slate-400">
          {t('{location} • {holes} hull', { location: course.location, holes: course.holes })}{' '}{note && <span className="font-bold text-emerald-400"> • {note}</span>}
        </p>
      </div>
      <button type="button" onClick={onShow} className="btn btn-secondary btn-sm shrink-0">
        {t('Vis på kart')}</button>
    </div>
  );
}
