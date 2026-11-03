import { Compass, Loader2, MapPin, Navigation, PlusCircle, Search } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { DEFAULT_HOME_COURSE, KNOWN_COURSES_DB } from '../data/courses.ts';
import { useSession } from '../context/auth-context.ts';
import type { CourseItem } from '../types.ts';
import { CourseMap } from './CourseMap.tsx';
import { CreateCustomCourseModal } from './CreateCustomCourseModal.tsx';
import { calculateDistanceMeters } from '../lib/geo.ts';
import { t } from '../i18n/index.ts';

interface CoursesTabProps {
  userPosition: { lat: number; lng: number } | null;
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .trim();
}

export function CoursesTab({ userPosition }: CoursesTabProps) {
  const { profile } = useSession();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourseItem[]>([]);
  const [selected, setSelected] = useState<CourseItem | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const played = useMemo(
    () => Object.values(profile.stats.courses).sort((a, b) => b.lastPlayed - a.lastPlayed),
    [profile.stats.courses]
  );

  const mapCourses = useMemo(() => {
    const map = new Map<string, { course: CourseItem; played: boolean }>();
    for (const c of KNOWN_COURSES_DB) {
      map.set(c.id, { course: c, played: false });
    }
    for (const p of played) {
      map.set(p.course.id, { course: p.course, played: true });
    }
    return [...map.values()];
  }, [played]);

  const select = useCallback((course: CourseItem) => {
    setSelected(course);
    setFocus({ lat: course.lat, lng: course.lng });
  }, []);

  const openGoogleMapsDirections = (course: CourseItem) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${course.lat},${course.lng}`;
    window.open(url, '_blank');
  };

  const onSearch = async (e: FormEvent) => {
    e.preventDefault();
    const rawQ = query.trim();
    if (!rawQ) {
      setResults([]);
      setSearchError(null);
      return;
    }

    setSearching(true);
    setSearchError(null);

    const clean = normalize(rawQ);
    const stripped = clean.replace(/(disc|golf|bane|bana|frisbee|frisbeegolf|diskgolf)/g, '').trim();
    const searchTerms = (stripped.length >= 2 ? stripped : clean).split(/\s+/).filter(Boolean);

    // 1. Direkte tekst-treff
    const textMatches = KNOWN_COURSES_DB.filter((c) => {
      const nameNorm = normalize(c.name);
      const locNorm = normalize(c.location);

      if (nameNorm.includes(clean) || locNorm.includes(clean)) return true;

      return searchTerms.some((term) => {
        if (nameNorm.includes(term) || locNorm.includes(term)) return true;
        if (term.length >= 4) {
          const root = term.slice(0, term.length - 1);
          if (nameNorm.includes(root) || locNorm.includes(root)) return true;
        }
        return false;
      });
    });

    let combined = [...textMatches];

    // 2. Geografisk søk etter kommune/bydel via Nominatim
    try {
      const geoRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(rawQ)}&countrycodes=no,se&limit=1`,
        { headers: { 'User-Agent': 'DiscGolfRPG/2.0' } }
      );

      if (geoRes.ok) {
        const places = await geoRes.json();
        if (places && places.length > 0) {
          const targetLat = parseFloat(places[0].lat);
          const targetLng = parseFloat(places[0].lon);

          const nearby = KNOWN_COURSES_DB.map((c) => {
            const distM = calculateDistanceMeters(targetLat, targetLng, c.lat, c.lng);
            return { course: c, distKm: distM / 1000 };
          })
            .filter((item) => item.distKm <= 25)
            .sort((a, b) => a.distKm - b.distKm)
            .map((item) => item.course);

          for (const c of nearby) {
            if (!combined.some((existing) => existing.id === c.id)) {
              combined.push(c);
            }
          }

          setFocus({ lat: targetLat, lng: targetLng });
        }
      }
    } catch {
      // Ignorer ved nettverkstrøbbel
    }

    setSearching(false);
    setResults(combined);

    if (combined.length > 0) {
      setSelected(combined[0]);
    } else {
      setSearchError(t('Fant ingen baner i eller ved «{query}». Bruk knappen under for å opprette den!', { query: rawQ }));
    }
  };

  const handleCustomCourseCreated = (course: CourseItem) => {
    setResults((prev) => [course, ...prev]);
    setSelected(course);
    if (course.lat !== 0 && course.lng !== 0) {
      setFocus({ lat: course.lat, lng: course.lng });
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
          {t('Banesøk & kart')}
        </h2>
        <span className="flex items-center gap-1 text-xs font-bold text-slate-400">
          <Compass className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
          {t('{count} baner i databasen', { count: KNOWN_COURSES_DB.length })}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <form onSubmit={onSearch} className="flex gap-2" role="search">
          <label htmlFor="course-search" className="sr-only">
            {t('Søk etter område eller banenavn')}
          </label>
          <input
            id="course-search"
            type="search"
            className="field"
            placeholder={t('Søk kommune, bydel eller navn (f.eks. Åsane, Buråsen)…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" disabled={searching} className="btn btn-primary shrink-0 min-w-[70px] flex items-center justify-center">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" aria-hidden />}
            <span className="ml-1">{t('Søk')}</span>
          </button>
        </form>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="btn btn-secondary flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-400 border-emerald-500/30"
        >
          <PlusCircle className="h-4 w-4" />
          {t('Opprett manuell bane')}
        </button>
      </div>

      {searchError && <p className="field-error">{searchError}</p>}

      {results.length > 0 && (
        <section className="card card-hi space-y-2" aria-label={t('Søkeresultater')}>
          <div className="flex items-center justify-between">
            <h3 className="eyebrow text-emerald-400">
              {t('Funnet ({length}) baner', { length: results.length })}
            </h3>
            <button
              type="button"
              className="text-xs font-bold text-slate-400"
              onClick={() => setResults([])}
            >
              {t('Lukk ✕')}
            </button>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {results.map((c) => (
              <CourseRow
                key={c.id}
                course={c}
                onShow={() => select(c)}
              />
            ))}
          </div>
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
        <section className="card card-hi space-y-3" aria-label={t('Valgt bane')}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow text-emerald-400">{t('Valgt bane')}</div>
              <div className="truncate text-base font-black text-white">
                {selected.image} {selected.name}
              </div>
              <div className="text-xs text-slate-300">
                {t('{location} • {holes} hull • Par {par}', {
                  location: selected.location,
                  holes: selected.holes,
                  par: selected.par,
                })}
              </div>
            </div>

            {selected.lat !== 0 && selected.lng !== 0 && (
              <button
                type="button"
                onClick={() => openGoogleMapsDirections(selected)}
                className="btn btn-primary btn-sm flex shrink-0 items-center gap-1.5"
                title="Åpne rute i Google Maps"
              >
                <Navigation className="h-3.5 w-3.5" />
                <span>{t('Veibeskrivelse')}</span>
              </button>
            )}
          </div>

          {selected.layout && selected.layout.length > 0 && (
            <div className="mt-2 border-t border-slate-800 pt-2">
              <span className="text-[11px] font-bold text-slate-400">
                {t('Layout ({count} hull):', { count: selected.layout.length })}
              </span>
              <div className="mt-1 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {selected.layout.map((h) => (
                  <span
                    key={h.number}
                    className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-200"
                  >
                    H{h.number}: P{h.par}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="space-y-2" aria-label={t('Dine baner')}>
        <h3 className="eyebrow text-emerald-400">
          {t('Dine spilte baner ({length})', { length: played.length })}
        </h3>
        {played.length === 0 ? (
          <div className="card text-center">
            <p className="text-sm font-bold text-slate-200">
              {t('Ingen spilte baner ennå')}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {t('Baner legges til her automatisk når du fullfører en runde på banen.')}
            </p>
          </div>
        ) : (
          played.map((p) => (
            <CourseRow
              key={p.course.id}
              course={p.course}
              note={t('Spilt {rounds}×', { rounds: p.rounds })}
              onShow={() => select(p.course)}
            />
          ))
        )}
      </section>

      <CreateCustomCourseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCourseCreated={handleCustomCourseCreated}
        initialName={query}
        userPosition={userPosition}
      />
    </div>
  );
}

export default CoursesTab;

function CourseRow({
  course,
  note,
  onShow,
}: {
  course: CourseItem;
  note?: string;
  onShow: () => void;
}) {
  const openDirections = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${course.lat},${course.lng}`, '_blank');
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3">
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-bold text-white">
          {course.image} {course.name}
        </h4>
        <p className="truncate text-xs text-slate-400">
          {t('{location} • {holes} hull • Par {par}', {
            location: course.location,
            holes: course.holes,
            par: course.par,
          })}{' '}
          {note && <span className="font-bold text-emerald-400">{note}</span>}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={openDirections}
          className="btn btn-secondary btn-sm p-2 text-emerald-400"
          title="Veibeskrivelse"
        >
          <Navigation className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onShow}
          className="btn btn-secondary btn-sm"
        >
          {t('Vis på kart')}
        </button>
      </div>
    </div>
  );
}