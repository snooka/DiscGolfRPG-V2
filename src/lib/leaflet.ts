import { t } from '../i18n/index.ts';
// Leaflet lastes fra CDN første gang kartet trengs (samme som før). Vi
// beskriver bare den lille delen av API-et vi bruker, så koden er typet
// uten ekstra npm-pakker.

export type LatLng = [number, number];

export interface LeafletLayer {
  addTo(target: LeafletMap | LeafletLayerGroup): LeafletLayer;
  on(event: string, handler: () => void): LeafletLayer;
}

export interface LeafletLayerGroup {
  addTo(map: LeafletMap): LeafletLayerGroup;
  clearLayers(): void;
}

export interface LeafletMap {
  setView(center: LatLng, zoom: number): LeafletMap;
  invalidateSize(): void;
  remove(): void;
}

export interface LeafletLib {
  map(el: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(
    url: string,
    options: Record<string, unknown>
  ): { addTo(map: LeafletMap): unknown };
  layerGroup(): LeafletLayerGroup;
  marker(position: LatLng, options?: Record<string, unknown>): LeafletLayer;
  circleMarker(position: LatLng, options?: Record<string, unknown>): LeafletLayer;
  divIcon(options: Record<string, unknown>): unknown;
}

const VERSION = '1.9.4';
const CSS_URL = `https://unpkg.com/leaflet@${VERSION}/dist/leaflet.css`;
const JS_URL = `https://unpkg.com/leaflet@${VERSION}/dist/leaflet.js`;

let loading: Promise<LeafletLib> | null = null;

const getGlobal = (): LeafletLib | undefined =>
  (window as unknown as { L?: LeafletLib }).L;

export function loadLeaflet(): Promise<LeafletLib> {
  const existing = getGlobal();
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;

  loading = new Promise<LeafletLib>((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = CSS_URL;
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = JS_URL;
    script.async = true;
    script.onload = () => {
      const lib = getGlobal();
      if (lib) resolve(lib);
      else reject(new Error('Leaflet ble lastet, men ikke funnet'));
    };
    script.onerror = () => {
      loading = null; // tillat nytt forsøk senere
      reject(new Error(t('Kunne ikke laste kartet (er du på nett?)')));
    };
    document.body.appendChild(script);
  });
  return loading;
}
