import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createProfile } from '../src/lib/profile.ts';
import { buildSummary, parseSummary, unsyncedRounds } from '../src/lib/publicProfile.ts';
import { calcRating, nextTier, ratingTier, RATING_TIERS, tierProgress } from '../src/lib/rating.ts';
import type { DiscItem, RoundHistoryEntry } from '../src/types.ts';
import { MemoryServer } from './helpers/memoryBackend.ts';

const round = (id: string, diff: number, extra: Partial<RoundHistoryEntry> = {}): RoundHistoryEntry => ({
  id,
  at: Date.now(),
  mode: 'normal',
  courseName: 'Kolbeinsvik',
  holes: 9,
  throws: 27 + diff,
  diff,
  xp: 100,
  birdies: 0,
  putts: 0,
  ...extra,
});

const disc = (id: string): DiscItem => ({
  id,
  name: 'Destroyer',
  brand: 'Innova',
  type: 'Distance Driver',
  speed: 12,
  glide: 5,
  turn: -1,
  fade: 3,
  plastic: 'Star',
  color: '#ff0000',
});

describe('rating (base 1000)', () => {
  it('par hele veien gir 1000, hvert snitt-kast per hull flytter 300', () => {
    assert.equal(calcRating([round('a', 0)]).rating, 1000);
    assert.equal(calcRating([round('a', -9)]).rating, 1300);
    assert.equal(calcRating([round('a', 9)]).rating, 700);
  });

  it('ett kast over par på 18 hull koster ca. 17 poeng', () => {
    assert.equal(calcRating([round('a', 1, { holes: 18 })]).rating, 983);
  });

  it('holdes mellom 400 og 1400', () => {
    assert.equal(calcRating([round('a', -50)]).rating, 1400);
    assert.equal(calcRating([round('a', 90)]).rating, 400);
  });

  it('teller bare Normal Game og de 10 siste rundene (nyeste først)', () => {
    const history = [
      round('r', -9, { mode: 'roulette' }),
      ...Array.from({ length: 10 }, (_, i) => round(`b${i}`, 9)),
      round('old', -9), // eldre enn de 10 siste: teller ikke
    ];
    const r = calcRating(history);
    assert.equal(r.rating, 700);
    assert.equal(r.rounds, 10);
    assert.equal(calcRating([round('x', -9, { mode: 'putter' })]).rating, null);
  });

  it('gir nivå ut fra rating', () => {
    assert.equal(ratingTier(null), null);
    assert.equal(ratingTier(700)?.name, 'Amatør');
    assert.equal(ratingTier(849)?.name, 'Amatør');
    assert.equal(ratingTier(850)?.name, 'Intermediate');
    assert.equal(ratingTier(949)?.name, 'Intermediate');
    assert.equal(ratingTier(950)?.name, 'Advanced');
    assert.equal(ratingTier(1039)?.name, 'Advanced');
    assert.equal(ratingTier(1040)?.name, 'Open / Pro');
    assert.equal(ratingTier(1400)?.id, 'pro');
    assert.deepEqual(RATING_TIERS.map((t) => t.min), [0, 850, 950, 1040]);
  });

  it('viser vei til neste nivå', () => {
    assert.equal(nextTier(900)?.name, 'Advanced');
    assert.equal(nextTier(1100), null);
    assert.equal(tierProgress(900), 0.5);
    assert.equal(tierProgress(1100), 1);
    assert.equal(tierProgress(null), 0);
  });
});

describe('delbar profil', () => {
  it('lager oppsummering som tåler å gå gjennom JSON og parses trygt', () => {
    const p = createProfile('u1', 1000, []);
    p.stats.modes.normal.rounds = 3;
    p.stats.modes.normal.counts.birdie = 4;
    p.stats.modes.normal.counts.par = 10;
    p.stats.modes.normal.bestRoundDiff = -2;
    p.achievements = { rain_hero: 1, finnes_ikke: 2 };
    const s = buildSummary(p);
    assert.equal(s.rounds, 3);
    assert.equal(s.birdies, 4);
    assert.equal(s.bestRoundDiff, -2);
    assert.equal(s.achievements, 1, 'ukjente achievements telles ikke');
    assert.deepEqual(parseSummary(JSON.parse(JSON.stringify(s))), s);
  });

  it('parseSummary avviser søppel og fyller manglende felt', () => {
    assert.equal(parseSummary(null), null);
    assert.equal(parseSummary([]), null);
    assert.equal(parseSummary({ foo: 1 }), null);
    const s = parseSummary({ rounds: 2 })!;
    assert.equal(s.holes, 0);
    assert.equal(s.modeRounds.putter, 0);
    assert.equal(s.bestRoundDiff, null);
  });

  it('sender bare runder som ikke er i skyen', () => {
    const h = [round('a', 0), round('b', 1), round('c', 2)];
    assert.deepEqual(unsyncedRounds(h, new Set(['a', 'c'])).map((r) => r.id), ['b']);
  });
});

describe('venner ser profilen, andre gjør ikke', () => {
  it('rating oppdateres i skyen når runder lagres, og vennens bag/runder kan leses av venner', async () => {
    const server = new MemoryServer();
    const kim = server.device();
    const truls = server.device();
    const ola = server.device();
    await kim.auth.signUp({ name: 'Kim', email: 'kim@t.no', password: 'hemmelig123' });
    await truls.auth.signUp({ name: 'Truls', email: 'truls@t.no', password: 'hemmelig123' });
    await ola.auth.signUp({ name: 'Ola', email: 'ola@t.no', password: 'hemmelig123' });
    const kimId = (await kim.auth.getSession())!.id;
    const trulsId = (await truls.auth.getSession())!.id;

    const p = createProfile(kimId, 1000, []);
    await kim.profiles.syncPublic(kimId, {
      summary: buildSummary(p),
      bag: [disc('d1')],
      rounds: [round('r1', -9), round('r2', 0, { mode: 'roulette' })],
    });
    const dirRow = (await truls.profiles.directory()).find((x) => x.id === kimId)!;
    assert.equal(dirRow.rating, 1300);
    assert.equal(dirRow.ratingRounds, 1);

    // ikke venner ennå: tomt svar
    const before = await truls.profiles.loadPublic(kimId);
    assert.deepEqual(before.bag, []);
    assert.deepEqual(before.rounds, []);

    // bli venner
    await kim.friends.request(trulsId);
    const incoming = (await truls.friends.list())[0];
    await truls.friends.accept(incoming.id);

    const seen = await truls.profiles.loadPublic(kimId);
    assert.equal(seen.bag.length, 1);
    assert.equal(seen.bag[0].name, 'Destroyer');
    assert.equal(seen.rounds.length, 2);
    assert.ok(seen.summary);

    // Ola er ikke venn
    const nope = await ola.profiles.loadPublic(kimId);
    assert.deepEqual(nope, { summary: null, bag: [], rounds: [] });

    // Nye runder legges til uten å røre gamle, og ratingen følger med
    await kim.profiles.syncPublic(kimId, { summary: buildSummary(p), bag: [disc('d1')], rounds: [round('r1', 5), round('r3', 9)] });
    const after = await truls.profiles.loadPublic(kimId);
    assert.equal(after.rounds.length, 3);
    assert.equal(after.rounds.find((r) => r.id === 'r1')!.diff, -9, 'eksisterende runde endres ikke');
    const again = (await truls.profiles.directory()).find((x) => x.id === kimId)!;
    assert.equal(again.rating, 1000 - Math.round((0 / 18) * 300) + 0 - 0, 'to normalrunder: (-9+9)/18 → 1000');
  });
});
