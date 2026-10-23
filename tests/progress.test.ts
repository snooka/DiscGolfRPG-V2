import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ACHIEVEMENTS } from '../src/data/achievements.ts';
import { DEFAULT_HOME_COURSE } from '../src/data/courses.ts';
import { getDisplayTitle, TITLES } from '../src/data/titles.ts';
import {
  applyRoundToProfile,
  createProfile,
  findNewUnlocks,
  normalizeProfile,
} from '../src/lib/profile.ts';
import {
  getLevelInfo,
  MAX_LEVEL,
  xpForLevel,
  xpForRound,
} from '../src/lib/progress.ts';
import { emptyPlayerStats } from '../src/lib/stats.ts';
import type { PlayedHole, PlayerRoundInput } from '../src/types.ts';

const hole = (score: number, extra: Partial<PlayedHole> = {}): PlayedHole => ({
  par: 3,
  score,
  outcomeId: null,
  teePick: null,
  putts: 0,
  ...extra,
});

const roundInput = (
  mode: PlayerRoundInput['mode'],
  holes: PlayedHole[]
): PlayerRoundInput => ({
  mode,
  course: DEFAULT_HOME_COURSE,
  at: 5000,
  holes,
  km: 0.5,
  weather: null,
  verified: true,
  xp: xpForRound(mode, holes.length),
});

describe('nivåer', () => {
  it('ny spiller starter på level 1 med 0 XP', () => {
    const info = getLevelInfo(0);
    assert.equal(info.level, 1);
    assert.equal(info.progress, 0);
    assert.equal(info.tier.title, 'Tornekrattets Herre');
  });

  it('terskler er økende og level-info stemmer', () => {
    for (let l = 2; l <= MAX_LEVEL; l++) {
      assert.ok(xpForLevel(l) > xpForLevel(l - 1), `level ${l}`);
    }
    assert.equal(getLevelInfo(xpForLevel(5)).level, 5);
    assert.equal(getLevelInfo(xpForLevel(5) - 1).level, 4);
    assert.equal(getLevelInfo(1e12).level, MAX_LEVEL);
    assert.equal(getLevelInfo(1e12).progress, 1);
    assert.equal(getLevelInfo(-50).level, 1);
  });

  it('XP per runde følger modus', () => {
    assert.equal(xpForRound('normal', 9), 100 + 15 * 9);
    assert.ok(xpForRound('roulette', 9) > xpForRound('normal', 9));
  });
});

describe('titler og achievements', () => {
  it('id-er er unike', () => {
    assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
    assert.equal(new Set(TITLES.map((t) => t.id)).size, TITLES.length);
  });

  it('ny profil har bare tittelen Rekrutt og ingen achievements', () => {
    const p = createProfile('u1');
    const unlocks = findNewUnlocks(p, emptyPlayerStats());
    assert.equal(unlocks.achievements.length, 0);
    assert.equal(getDisplayTitle(p).id, 'rookie');
  });

  it('første runde låser opp «Første Kastet» og gir bonus-XP', () => {
    const p = createProfile('u1', 1);
    const out = applyRoundToProfile(
      p,
      roundInput('normal', [hole(3), hole(3), hole(3)]),
      'r1'
    );
    const ids = out.unlocks.achievements.map((a) => a.id);
    assert.ok(ids.includes('first_round'));
    assert.ok(ids.includes('under_par_round'));
    assert.equal(out.profile.achievements.first_round, 5000);
    assert.equal(
      out.profile.xp,
      out.xpFromRound + out.xpFromAchievements + out.xpFromQuests
    );
    assert.equal(out.profile.history.length, 1);
    assert.equal(out.profile.history[0].mode, 'normal');
    // original er ikke mutert
    assert.equal(p.xp, 0);
  });

  it('opplåste ting låses ikke opp på nytt', () => {
    const p = createProfile('u1', 1);
    const first = applyRoundToProfile(p, roundInput('normal', [hole(3)]), 'r1');
    const second = applyRoundToProfile(
      first.profile,
      roundInput('normal', [hole(3)]),
      'r2'
    );
    assert.ok(!second.unlocks.achievements.some((a) => a.id === 'first_round'));
  });

  it('Disc Roulette låser opp roulette-ting, men ikke Normal Game-ting', () => {
    const p = createProfile('u1', 1);
    const out = applyRoundToProfile(
      p,
      roundInput('roulette', [
        hole(3, { outcomeId: 'putter' }),
        hole(3, { outcomeId: 'midrange' }),
      ]),
      'r1'
    );
    const ids = out.unlocks.achievements.map((a) => a.id);
    assert.ok(ids.includes('roulette_first'));
    assert.ok(!ids.includes('under_par_round'));
    assert.equal(out.profile.stats.modes.normal.rounds, 0);
  });

  it('ace gir ace-achievement og legendarisk tittel som standardvisning', () => {
    const p = createProfile('u1', 1);
    const out = applyRoundToProfile(p, roundInput('normal', [hole(1)]), 'r1');
    assert.ok(out.unlocks.achievements.some((a) => a.id === 'ace_first'));
    assert.ok(out.unlocks.titles.some((t) => t.id === 'ace_hunter'));
    assert.equal(getDisplayTitle(out.profile).id, 'ace_hunter');
  });

  it('valgt tittel overstyrer, men bare hvis den er låst opp', () => {
    const p = createProfile('u1', 1);
    assert.equal(getDisplayTitle({ ...p, equippedTitle: 'ace_hunter' }).id, 'rookie');
    const unlocked = { ...p, titles: { ...p.titles, birdie_hunter: 1, ace_hunter: 2 } };
    assert.equal(getDisplayTitle({ ...unlocked, equippedTitle: 'birdie_hunter' }).id, 'birdie_hunter');
    assert.equal(getDisplayTitle(unlocked).id, 'ace_hunter');
  });

  it('level-opp registreres', () => {
    const p = { ...createProfile('u1', 1), xp: xpForLevel(2) - 10 };
    const out = applyRoundToProfile(p, roundInput('normal', [hole(3)]), 'r1');
    assert.equal(out.levelBefore, 1);
    assert.ok(out.levelAfter >= 2);
  });
});

describe('normalizeProfile', () => {
  it('tåler søppel og manglende felt', () => {
    for (const junk of [null, undefined, 42, 'x', [], {}]) {
      const p = normalizeProfile(junk, 'u9');
      assert.equal(p.userId, 'u9');
      assert.equal(p.xp, 0);
      assert.equal(p.stats.modes.roulette.rounds, 0);
      assert.ok(p.titles.rookie);
    }
  });

  it('beholder gyldig data og fyller inn resten', () => {
    const p = normalizeProfile(
      {
        xp: 1234,
        stats: { modes: { normal: { rounds: 4, counts: { birdie: 7 } } } },
        bag: [
          { id: 'a', name: 'River', type: 'Fairway Driver', speed: 7 },
          { id: 'b', type: 'Putter' },
          'ikke en disk',
        ],
        friendIds: ['x', 5, 'y'], // gammelt felt – ignoreres (venner ligger nå i skyen)
        equippedTitle: 'birdie_hunter',
      },
      'u2'
    );
    assert.equal(p.xp, 1234);
    assert.equal(p.stats.modes.normal.rounds, 4);
    assert.equal(p.stats.modes.normal.counts.birdie, 7);
    assert.equal(p.stats.modes.normal.counts.ace, 0);
    assert.equal(p.bag.length, 1);
    assert.equal(p.bag[0].glide, 5);
    assert.equal('friendIds' in p, false);
    assert.equal(p.equippedTitle, 'birdie_hunter');
  });
});
