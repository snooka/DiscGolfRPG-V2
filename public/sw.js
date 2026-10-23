/* Enkel service worker for PWA (iPhone/Android i nettleseren).
 *  - Appskallet (HTML, JS, CSS, ikoner) caches slik at appen starter raskt og åpner uten nett.
 *  - ALL data (Supabase, vær, kart) går alltid direkte til nettet og caches aldri her.
 *    All spillerdata ligger i Supabase, aldri i denne cachen.
 *  Bytt CACHE-navnet ved behov for å tvinge frisk cache. Nye bygg får uansett nye filnavn (hash).
 */
const CACHE = 'dgrpg-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, MET, OSM: aldri via cache

  // Sidenavigasjon: nett først (får alltid siste versjon), cache som reserve ved offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }

  // Statiske filer (hash i filnavnet): cache først, fyll på fra nettet
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
