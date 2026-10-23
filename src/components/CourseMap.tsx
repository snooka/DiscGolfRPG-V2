import { useEffect, useRef, useState } from 'react';
import { loadLeaflet } from '../lib/leaflet.ts';
import type { LeafletLayerGroup, LeafletLib, LeafletMap } from '../lib/leaflet.ts';
import type { CourseItem } from '../types.ts';
import { t } from '../i18n/index.ts';

export interface MapCourse {
  course: CourseItem;
  played: boolean;
}

interface CourseMapProps {
  courses: MapCourse[];
  /** GPS-posisjon hvis tilgjengelig */
  userPosition: { lat: number; lng: number } | null;
  /** Flytter kartet hit (f.eks. etter søk) */
  focus: { lat: number; lng: number } | null;
  fallbackCenter: { lat: number; lng: number };
  onSelect: (course: CourseItem) => void;
}

/** Kart med banene som markører (OpenStreetMap-fliser). */
export function CourseMap({
  courses,
  userPosition,
  focus,
  fallbackCenter,
  onSelect,
}: CourseMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const libRef = useRef<LeafletLib | null>(null);
  const layerRef = useRef<LeafletLayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialCenter = useRef(userPosition ?? fallbackCenter);

  // Opprett kartet én gang
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        const el = containerRef.current;
        if (cancelled || !el) return;
        const map = L.map(el, { zoomControl: true, attributionControl: true }).setView(
          [initialCenter.current.lat, initialCenter.current.lng],
          11
        );
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: t('© OpenStreetMap-bidragsytere'),
        }).addTo(map);
        libRef.current = L;
        mapRef.current = map;
        layerRef.current = L.layerGroup().addTo(map);
        setReady(true);
        // Containeren kan ha endret størrelse mens Leaflet lastet
        window.setTimeout(() => map.invalidateSize(), 50);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t('Kartet kunne ikke lastes'));
      });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      setReady(false);
    };
  }, []);

  // Tegn markører når banene (eller posisjonen) endres
  useEffect(() => {
    const L = libRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    for (const { course, played } of courses) {
      L.marker([course.lat, course.lng], {
        title: course.name,
        icon: L.divIcon({
          className: `course-marker${played ? ' is-played' : ''}`,
          html: `<span><i>${course.image}</i></span>`,
          iconSize: [36, 36],
          iconAnchor: [18, 36],
        }),
      })
        .on('click', () => onSelect(course))
        .addTo(layer);
    }
    if (userPosition) {
      L.circleMarker([userPosition.lat, userPosition.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 1,
      }).addTo(layer);
    }
  }, [ready, courses, userPosition, onSelect]);

  useEffect(() => {
    if (ready && focus) mapRef.current?.setView([focus.lat, focus.lng], 13);
  }, [ready, focus]);

  return (
    <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div ref={containerRef} className="h-full w-full" role="application" aria-label={t('Kart over diskgolfbaner')} />
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          {t('Laster kart…')}</div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-amber-300">
          {t('{error}. Du kan fortsatt velge bane fra listen under.', { error })}</div>
      )}
    </div>
  );
}
