import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACHIEVEMENTS } from '../src/data/achievements.ts';
import { TITLES } from '../src/data/titles.ts';
import { detectCourse, ON_COURSE_KM } from '../src/lib/gps.ts';
import { createProfile } from '../src/lib/profile.ts';
import { awardQuests, dayKey, questStatuses, questsForDay } from '../src/lib/quests.ts';
import { calcRating } from '../src/lib/rating.ts';
import { DEFAULT_HOME_COURSE } from '../src/data/courses.ts';
import type { RoundHistoryEntry } from '../src/types.ts';

const entry = (over: Partial<RoundHistoryEntry>): RoundHistoryEntry => ({
  id: 'r', at: Date.now(), mode: 'normal', courseName: 'X', holes: 9, throws: 27, diff: 0, xp: 0, birdies: 0, putts: 0, ...over,
});

test('daily quests rotate: deterministic per day, different between days', () => {
  const a = questsForDay('2026-10-20').map((q) => q.id);
  assert.deepEqual(a, questsForDay('2026-10-20').map((q) => q.id));
  assert.equal(new Set(a).size, 3);
  const days = Array.from({ length: 10 }, (_, i) => questsForDay(`2026-11-${String(i + 1).padStart(2, '0')}`).map((q) => q.id).join());
  assert.ok(new Set(days).size > 1);
});

test('quests are verified automatically from round results – no manual claim', () => {
  const now = Date.now();
  const p0 = createProfile('u');
  // Ingen runder = ingenting å belønne
  assert.equal(awardQuests(p0, now).completed.length, 0);

  // En rik dag som fullfører alle typer oppdrag
  const history = [
    entry({ at: now, holes: 18, diff: -5, birdies: 5, mode: 'normal' }),
    entry({ at: now, mode: 'dual_tee', holes: 18, diff: -2, birdies: 3 }),
    entry({ at: now, mode: 'roulette', holes: 18, diff: -2, birdies: 3 }),
    entry({ at: now, mode: 'putter', holes: 18, diff: 0, birdies: 3, putts: 30 }),
  ];
  const full = { ...p0, history };
  const done = questStatuses(full, now).filter((s) => s.done);
  assert.equal(done.length, 3);

  const first = awardQuests(full, now);
  const reward = first.completed.reduce((a, q) => a + q.reward, 0);
  assert.equal(first.completed.length, 3);
  assert.equal(first.profile.xp, reward);

  // Belønnes kun én gang
  const again = awardQuests(first.profile, now);
  assert.equal(again.completed.length, 0);
  assert.equal(again.profile, first.profile);
  assert.deepEqual(Object.keys(first.profile.questClaims), [dayKey(now)]);
});

test('rating uses only normal rounds', () => {
  assert.equal(calcRating([]).rating, null);
  assert.equal(calcRating([entry({ mode: 'roulette', diff: -9 })]).rating, null);
  assert.equal(calcRating([entry({ mode: 'putter', diff: -9 })]).rating, null);
  assert.equal(calcRating([entry({ diff: 0 })]).rating, 1000);
  assert.equal(calcRating([entry({ diff: -9 })]).rating, 1300);
});

test('GPS: bane gjenkjennes bare nær banen', () => {
  const here = { lat: DEFAULT_HOME_COURSE.lat, lng: DEFAULT_HOME_COURSE.lng };
  assert.equal(detectCourse(here)?.course.id, DEFAULT_HOME_COURSE.id);
  // ~0.2 km unna (0.002 grader bredde ≈ 0.22 km)
  assert.ok(detectCourse({ lat: here.lat + 0.002, lng: here.lng })!.km < ON_COURSE_KM);
  // 10 km unna
  assert.equal(detectCourse({ lat: here.lat + 0.1, lng: here.lng }), null);
});

test('data: unike id-er, positive mål og alle rariteter finnes', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ACHIEVEMENTS.every((a) => a.target > 0 && a.xp > 0));
  const titleIds = TITLES.map((t) => t.id);
  assert.equal(new Set(titleIds).size, titleIds.length);
  assert.ok(TITLES.every((t) => t.quip.length > 10));
  for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
    assert.ok(ACHIEVEMENTS.some((a) => a.rarity === rarity), rarity);
    assert.ok(TITLES.some((t) => t.rarity === rarity), rarity);
  }
  assert.ok(ACHIEVEMENTS.filter((a) => a.id.startsWith('putts_')).length >= 5);
});

test('vær-achievements og baner krever GPS-verifisert runde', async () => {
  const { applyRoundToStats, emptyPlayerStats } = await import('../src/lib/stats.ts');
  const weather = { isRain: true, rainMm: 3, isSunny: false, isWindy: true, windSpeed: 13, temp: -2, desc: '' };
  const base = {
    mode: 'normal' as const,
    course: DEFAULT_HOME_COURSE,
    at: Date.UTC(2026, 9, 20, 12),
    holes: [{ par: 3, score: 3, outcomeId: null, teePick: null, putts: 0 }],
    km: 1,
    weather,
    xp: 100,
  };
  const off = applyRoundToStats(emptyPlayerStats(), { ...base, verified: false });
  assert.equal(off.extras.heavyRainRounds + off.extras.stormRounds + off.extras.coldRounds, 0);
  assert.deepEqual(off.courses, {});
  assert.equal(off.extras.playDays, 1); // dager telles uansett
  const on = applyRoundToStats(emptyPlayerStats(), { ...base, verified: true });
  assert.equal(on.extras.heavyRainRounds, 1);
  assert.equal(on.extras.stormRounds, 1);
  assert.equal(on.extras.coldRounds, 1);
  assert.equal(on.extras.windRounds, 1);
  // Samme dag igjen teller ikke som ny dag
  const twice = applyRoundToStats(on, { ...base, verified: true });
  assert.equal(twice.extras.playDays, 1);
});
