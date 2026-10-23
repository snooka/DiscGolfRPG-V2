import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACHIEVEMENTS } from '../src/data/achievements.ts';
import { DEFAULT_HOME_COURSE } from '../src/data/courses.ts';
import { freeRoundCourse } from '../src/lib/gps.ts';
import { filterPlaces } from '../src/lib/placeSearch.ts';
import { createProfile, mergeAchievements, newAchievements, normalizeProfile } from '../src/lib/profile.ts';
import { applyRoundToStats, emptyPlayerStats } from '../src/lib/stats.ts';
import { GUST_LIMIT, mergeWeather, parseWeather } from '../src/lib/weather.ts';
import type { PlayerRoundInput, Weather } from '../src/types.ts';
import { MemoryServer } from './helpers/memoryBackend.ts';

const metResponse = (details: Record<string, number>, symbol = 'cloudy', mm = 0) => ({
  properties: {
    timeseries: [
      {
        data: {
          instant: { details: { air_temperature: 11.6, wind_speed: 4.2, ...details } },
          next_1_hours: { summary: { symbol_code: symbol }, details: { precipitation_amount: mm } },
        },
      },
    ],
  },
});

const wx = (p: Partial<Weather> = {}): Weather => ({
  isRain: false,
  rainMm: 0,
  isSunny: false,
  isWindy: false,
  windSpeed: 3,
  windGust: 4,
  temp: 10,
  desc: '',
  ...p,
});

const round = (weather: Weather | null, verified = true): PlayerRoundInput => ({
  mode: 'normal',
  course: DEFAULT_HOME_COURSE,
  at: 5000,
  holes: [{ par: 3, score: 3, outcomeId: null, teePick: null, putts: 0 }],
  km: 1,
  weather,
  verified,
  xp: 100,
});

const unlocked = (stats = emptyPlayerStats()) =>
  new Set(ACHIEVEMENTS.filter((a) => a.metric(stats) >= a.target).map((a) => a.id));

describe('vær fra Yr/MET', () => {
  it('leser temperatur, vind og vindkast', () => {
    const w = parseWeather(metResponse({ wind_speed: 6, wind_speed_of_gust: 11.34 }, 'rain', 1.5));
    assert.ok(w);
    assert.equal(w.temp, 12);
    assert.equal(w.windSpeed, 6);
    assert.equal(w.windGust, 11.3);
    assert.equal(w.isRain, true);
    assert.equal(w.rainMm, 1.5);
  });

  it('bruker vindhastighet som vindkast når kast mangler, og aldri lavere enn vinden', () => {
    assert.equal(parseWeather(metResponse({}))?.windGust, 4.2);
    assert.equal(parseWeather(metResponse({ wind_speed: 7, wind_speed_of_gust: 2 }))?.windGust, 7);
  });

  it('gir null for ubrukelige svar (ingen gjetting)', () => {
    assert.equal(parseWeather({}), null);
    assert.equal(parseWeather(null), null);
    assert.equal(parseWeather({ properties: { timeseries: [{ data: { instant: { details: {} } } }] } }), null);
  });

  it('slår sammen været ved start og slutt av runden', () => {
    const start = wx({ isSunny: true, windGust: 5, temp: 14 });
    const end = wx({ isRain: true, rainMm: 2.4, windGust: 12, windSpeed: 9, isWindy: true, temp: 12 });
    const m = mergeWeather(start, end)!;
    assert.equal(m.isSunny, true);
    assert.equal(m.isRain, true);
    assert.equal(m.rainMm, 2.4);
    assert.equal(m.windGust, 12);
    assert.equal(m.isWindy, true);
    assert.equal(m.temp, 12);
    assert.equal(mergeWeather(null, end), end);
    assert.equal(mergeWeather(start, null), start);
  });
});

describe('vær-achievements', () => {
  it('Stormkast: kast over 8 m/s teller, 8 akkurat teller ikke', () => {
    assert.equal(GUST_LIMIT, 8);
    const gusty = applyRoundToStats(emptyPlayerStats(), round(wx({ windGust: 8.1 })));
    assert.equal(gusty.extras.gustRounds, 1);
    assert.ok(unlocked(gusty).has('storm_gust'));
    const calm = applyRoundToStats(emptyPlayerStats(), round(wx({ windGust: 8 })));
    assert.equal(calm.extras.gustRounds, 0);
    assert.ok(!unlocked(calm).has('storm_gust'));
  });

  it('Solskinnspilt og Regnværshelten krever tre runder', () => {
    let s = emptyPlayerStats();
    for (let i = 0; i < 2; i++) s = applyRoundToStats(s, round(wx({ isSunny: true, isRain: true })));
    assert.ok(!unlocked(s).has('sunshine_player') && !unlocked(s).has('rain_hero'));
    s = applyRoundToStats(s, round(wx({ isSunny: true, isRain: true })));
    assert.ok(unlocked(s).has('sunshine_player') && unlocked(s).has('rain_hero'));
  });

  it('gir ingen vær-achievements uten GPS-verifisering eller uten kjent vær', () => {
    const a = applyRoundToStats(emptyPlayerStats(), round(wx({ windGust: 20, isRain: true }), false));
    assert.equal(a.extras.gustRounds + a.extras.rainRounds, 0);
    const b = applyRoundToStats(emptyPlayerStats(), round(null));
    assert.equal(b.extras.gustRounds, 0);
  });

  it('eldre runder uten vindkast i værdata teller ikke som stormkast', () => {
    const old = wx();
    delete old.windGust;
    assert.equal(applyRoundToStats(emptyPlayerStats(), round(old)).extras.gustRounds, 0);
  });

  it('har unike id-er', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe('datasikkerhet ved oppdateringer', () => {
  it('en profil lagret av en eldre appversjon leses uten tap, og nye felt får standardverdi', () => {
    const p = createProfile('u1', 1000, []);
    p.xp = 777;
    p.achievements = { rain_warrior: 111 };
    p.stats.extras.rainRounds = 4;
    const raw = JSON.parse(JSON.stringify(p));
    delete raw.stats.extras.gustRounds; // eldre versjon kjente ikke feltet
    const back = normalizeProfile(raw, 'u1');
    assert.equal(back.xp, 777);
    assert.equal(back.achievements.rain_warrior, 111);
    assert.equal(back.stats.extras.rainRounds, 4);
    assert.equal(back.stats.extras.gustRounds, 0);
  });

  it('achievements slås sammen (union) og tidligste tidspunkt vinner', () => {
    const m = mergeAchievements({ a: 100, b: 500 }, { b: 300, c: 700 });
    assert.deepEqual(m.achievements, { a: 100, b: 300, c: 700 });
    assert.equal(m.changed, true); // c manglet i profilen
    assert.equal(mergeAchievements({ a: 1 }, { a: 1 }).changed, false);
  });

  it('bare nye achievements sendes til skyen', () => {
    assert.deepEqual(newAchievements({ a: 1, b: 2 }, { a: 1 }), { b: 2 });
  });

  it('achievements overlever at profildata nullstilles (egne rader i skyen)', async () => {
    const server = new MemoryServer();
    const dev = server.device();
    await dev.auth.signUp({ name: 'Kim', email: 'kim@test.no', password: 'hemmelig123' });
    const id = (await dev.auth.getSession())!.id;
    await dev.profiles.saveAchievements(id, { storm_gust: 123, rain_hero: 456 });
    await dev.profiles.saveMine(id, { version: 1 }, { xp: 0, titleId: 'x' });
    // «Feil»: profildata blir overskrevet med tom profil
    await dev.profiles.saveMine(id, { version: 1, achievements: {} }, { xp: 0, titleId: 'x' });
    const cloud = await dev.profiles.loadAchievements(id);
    const merged = mergeAchievements({}, cloud);
    assert.deepEqual(merged.achievements, { storm_gust: 123, rain_hero: 456 });
    // lagring er additiv: tidligere rader forsvinner ikke
    await dev.profiles.saveAchievements(id, { nye: 9 });
    assert.deepEqual(Object.keys(await dev.profiles.loadAchievements(id)).sort(), ['nye', 'rain_hero', 'storm_gust']);
  });
});

describe('posisjon og personvern', () => {
  it('fri runde lagrer bare grov posisjon (≈1 km)', () => {
    const c = freeRoundCourse({ lat: 60.082512, lng: 5.251234 });
    assert.equal(c.lat, 60.08);
    assert.equal(c.lng, 5.25);
    assert.equal(freeRoundCourse(null).lat, 0);
  });

  it('filtrerer steder uten å bry seg om store/små bokstaver', () => {
    const list = [{ name: 'Bergen' }, { name: 'Storebø (Austevoll)' }, { name: 'Oslo' }];
    assert.deepEqual(filterPlaces(list, 'aust'), [{ name: 'Storebø (Austevoll)' }]);
    assert.equal(filterPlaces(list, '  ').length, 3);
    assert.equal(filterPlaces(list, 'zzz').length, 0);
  });
});
