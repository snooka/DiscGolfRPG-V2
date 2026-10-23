import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_HOME_COURSE } from '../src/data/courses.ts';
import {
  applyRoundToStats,
  classifyHole,
  describeHole,
  emptyPlayerStats,
  formatDiff,
  allTotals,
  underParHoles,
} from '../src/lib/stats.ts';
import type { PlayedHole, PlayerRoundInput } from '../src/types.ts';

const hole = (
  score: number,
  extra: Partial<PlayedHole> = {}
): PlayedHole => ({ par: 3, score, outcomeId: null, teePick: null, putts: 0, ...extra });

const input = (
  mode: PlayerRoundInput['mode'],
  holes: PlayedHole[],
  extra: Partial<PlayerRoundInput> = {}
): PlayerRoundInput => ({
  mode,
  course: DEFAULT_HOME_COURSE,
  at: 1000,
  holes,
  km: 1.5,
  weather: null,
  verified: true,
  xp: 200,
  ...extra,
});

describe('classifyHole', () => {
  it('klassifiserer relativt til par', () => {
    assert.equal(classifyHole(1, 3), 'ace');
    assert.equal(classifyHole(1, 4), 'ace');
    assert.equal(classifyHole(2, 4), 'eagle');
    assert.equal(classifyHole(2, 3), 'birdie');
    assert.equal(classifyHole(3, 3), 'par');
    assert.equal(classifyHole(4, 3), 'bogey');
    assert.equal(classifyHole(5, 3), 'double');
    assert.equal(classifyHole(6, 3), 'triple');
    assert.equal(classifyHole(9, 3), 'triple');
  });

  it('beskriver hull og formaterer differanse', () => {
    assert.equal(describeHole(1, 3), 'ACE! 🌟');
    assert.equal(describeHole(7, 3), '+4');
    assert.equal(formatDiff(0), 'E');
    assert.equal(formatDiff(3), '+3');
    assert.equal(formatDiff(-2), '-2');
  });
});

describe('applyRoundToStats', () => {
  it('fører alt på riktig modus og lar de andre være urørt', () => {
    const before = emptyPlayerStats();
    const after = applyRoundToStats(
      before,
      input('roulette', [
        hole(2, { outcomeId: 'putter' }),
        hole(3, { outcomeId: 'distance' }),
        hole(5, { outcomeId: 'distance' }),
      ])
    );

    // original er ikke mutert
    assert.equal(before.modes.roulette.rounds, 0);

    assert.equal(after.modes.roulette.rounds, 1);
    assert.equal(after.modes.roulette.holes, 3);
    assert.equal(after.modes.roulette.throws, 10);
    assert.equal(after.modes.roulette.counts.birdie, 1);
    assert.equal(after.modes.roulette.counts.par, 1);
    assert.equal(after.modes.roulette.counts.double, 1);
    assert.equal(after.modes.roulette.bestRoundDiff, 1);
    assert.equal(after.modes.roulette.byOutcome.putter.holes, 1);
    assert.equal(after.modes.roulette.byOutcome.distance.holes, 2);
    assert.equal(after.modes.roulette.byOutcome.distance.diff, 2);

    // Normal Game og Dual Tee er helt urørt
    assert.deepEqual(after.modes.normal, before.modes.normal);
    assert.deepEqual(after.modes.dual_tee, before.modes.dual_tee);
    assert.equal(after.extras.underParRounds, 0);
  });

  it('Normal Game: beste runde, under-par-runder, vær og kilometer', () => {
    let s = emptyPlayerStats();
    s = applyRoundToStats(
      s,
      input('normal', [hole(3), hole(2), hole(3)], {
        weather: { isRain: true, rainMm: 0.5, isSunny: false, isWindy: false, windSpeed: 3, temp: 10, desc: '' },
      })
    );
    s = applyRoundToStats(
      s,
      input('normal', [hole(4), hole(4), hole(4)], {
        weather: { isRain: false, rainMm: 0, isSunny: false, isWindy: true, windSpeed: 9, temp: 10, desc: '' },
      })
    );
    assert.equal(s.modes.normal.rounds, 2);
    assert.equal(s.modes.normal.bestRoundDiff, -1);
    assert.equal(s.extras.underParRounds, 1);
    assert.equal(s.extras.rainRounds, 1);
    assert.equal(s.extras.windRounds, 1);
    assert.equal(s.totalKm, 3);
    assert.equal(s.courses[DEFAULT_HOME_COURSE.id].rounds, 2);
    assert.equal(s.modes.normal.xpEarned, 400);
  });

  it('Dual Tee: teller valgt tee-kast og ekstra kastet disk', () => {
    const s = applyRoundToStats(
      emptyPlayerStats(),
      input('dual_tee', [
        hole(3, { teePick: 1 }),
        hole(2, { teePick: 2 }),
        hole(3, { teePick: 2 }),
      ])
    );
    assert.deepEqual(s.modes.dual_tee.teePicks, { first: 1, second: 2 });
    assert.equal(s.modes.dual_tee.throws, 8);
    // 8 scorede kast + 3 gratis ekstra tee-kast
    assert.equal(s.modes.dual_tee.discsThrown, 11);
    assert.equal(s.modes.normal.rounds, 0);
  });

  it('teller «furutrær»-runder (3+ hull på +2 eller verre)', () => {
    const s = applyRoundToStats(
      emptyPlayerStats(),
      input('normal', [hole(5), hole(6), hole(7), hole(3)])
    );
    assert.equal(s.extras.treeRounds, 1);
  });

  it('aggregerer på tvers av modi', () => {
    let s = emptyPlayerStats();
    s = applyRoundToStats(s, input('normal', [hole(2), hole(1)]));
    s = applyRoundToStats(s, input('roulette', [hole(2, { outcomeId: 'putter' })]));
    const t = allTotals(s);
    assert.equal(t.rounds, 2);
    assert.equal(t.holes, 3);
    assert.equal(underParHoles(t.counts), 3);
    assert.equal(t.counts.ace, 1);
  });
});
