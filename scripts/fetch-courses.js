import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Manuelt kvalitetssikrede baner med korrekte opplysninger
const VERIFIED_COURSES = [
  {
    id: 'custom_burasen_mandal',
    name: 'Buråsen Discgolfbane',
    location: 'Mandal, Lindesnes',
    holes: 18,
    par: 56,
    lat: 58.0315,
    lng: 7.4522,
    layout: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 3 })),
  },
  {
    id: 'custom_lille_leland',
    name: 'Lille Leland Frisbeegolfbane',
    location: 'Vigeland, Lindesnes',
    holes: 18,
    par: 58,
    lat: 58.0841,
    lng: 7.2933,
    layout: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 3 })),
  },
  {
    id: 'custom_krokhol',
    name: 'Krokhol Disc Golf Course',
    location: 'Siggerud, Nordre Follo',
    holes: 18,
    par: 60,
    lat: 59.7825,
    lng: 10.9231,
    layout: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: i % 4 === 0 ? 4 : 3 })),
  },
  {
    id: 'custom_austevoll',
    name: 'Austevoll Frisbeegolfbane',
    location: 'Storebø, Austevoll',
    holes: 12,
    par: 36,
    lat: 60.0125,
    lng: 5.2268,
    layout: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, par: 3 })),
  },
  {
    id: 'custom_kjolnes_porsgrunn',
    name: 'Kjølnes Frisbeegolfbane',
    location: 'Porsgrunn',
    holes: 12,
    par: 36,
    lat: 59.1388,
    lng: 9.6644,
    layout: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, par: 3 })),
  },
  {
    id: 'custom_sukkevann',
    name: 'Sukkevann Frisbeepark',
    location: 'Kristiansand',
    holes: 18,
    par: 56,
    lat: 58.1567,
    lng: 8.0968,
    layout: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 3 })),
  },
];

async function updateCourses() {
  console.log('Kobler til kartserver for å hente alle baner i Norge og Sverige...');

  // Lettere spørring som ikke kveler serveren
  const overpassQuery = `[out:json][timeout:60];
area["ISO3166-1"="NO"][admin_level=2]->.no;
area["ISO3166-1"="SE"][admin_level=2]->.se;
(
  nwr["leisure"="disc_golf_course"](area.no);
  nwr["sport"="disc_golf"](area.no);
  nwr["leisure"="disc_golf_course"](area.se);
);
out center tags;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ];

  let elements = [];
  let fetched = false;

  for (const url of endpoints) {
    try {
      console.log(`Prøver speil: ${url}...`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'DiscGolfRPG/2.0',
        },
        body: 'data=' + encodeURIComponent(overpassQuery),
      });

      if (res.ok) {
        const data = await res.json();
        elements = data.elements || [];
        console.log(`Fant ${elements.length} råelementer fra ${url}!`);
        fetched = true;
        break;
      } else {
        console.warn(`Feil ${res.status} fra ${url}: ${res.statusText}`);
      }
    } catch (err) {
      console.warn(`Kunne ikke nå ${url}:`, err.message);
    }
  }

  const courseList = new Map();

  // 1. Legg inn de verifiserte banene først
  for (const vc of VERIFIED_COURSES) {
    courseList.set(vc.name.toLowerCase(), {
      ...vc,
      image: '🥏',
    });
  }

  // 2. Prosesser banene fra kartet
  for (const el of elements) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) continue;

    const name = tags.name?.trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (courseList.has(key)) continue;

    const rawHoles = parseInt(tags.holes || tags['disc_golf:holes'], 10);
    const holes = !Number.isNaN(rawHoles) && rawHoles > 0 ? rawHoles : 18;

    const location =
      tags['addr:city'] ||
      tags['addr:municipality'] ||
      tags['addr:town'] ||
      tags['addr:village'] ||
      tags['is_in:municipality'] ||
      (lat > 58 ? 'Norge' : 'Sverige');

    const layout = Array.from({ length: holes }, (_, i) => ({
      number: i + 1,
      par: 3,
    }));

    courseList.set(key, {
      id: `osm_${el.id}`,
      name,
      location,
      holes,
      par: holes * 3,
      image: '🥏',
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      layout,
    });
  }

  const finalCourses = [...courseList.values()].sort((a, b) => a.name.localeCompare(b.name));

  const outDir = path.resolve(__dirname, '../src/data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, 'courses.json');
  fs.writeFileSync(outFile, JSON.stringify(finalCourses, null, 2), 'utf-8');

  console.log(`\n=========================================`);
  console.log(`✅ Suksess! ${finalCourses.length} baner lagret til ${outFile}`);
  console.log(`=========================================\n`);
}

updateCourses();