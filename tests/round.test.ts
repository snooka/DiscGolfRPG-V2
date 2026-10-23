import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_HOME_COURSE } from '../src/data/courses.ts';
import { createProfile } from '../src/lib/profile.ts';
import {
  adjustPutts,
  adjustScore,
  allHolesPlayed,
  confirmHole,
  createRound,
  finishRound,
  goToHole,
  holeBlockReason,
  MAX_SCORE,
  playerTotals,
  recordSpin,
  roundDistanceKm,
  setHolePar,
  setTeePick,
  unconfirmedHoles,
} from '../src/lib/round.ts';
import { segmentAtPointer, slicePath, spinTarget } from '../src/lib/wheel.ts';
import type { GameMode, Profile, RoundPlayer } from '../src/types.ts';

const players: RoundPlayer[] = [
  { key: 'p0', name: 'Kim', userId: 'u1' },
  { key: 'p1', name: 'Gjest (Gjest)', userId: null },
];

const make = (mode: GameMode, holeCount = 3) =>
  createRound({
    mode,
    course: DEFAULT_HOME_COURSE,
    holeCount,
    players,
    segments: ['putter', 'midrange', 'fairway', 'distance'],
    weather: null,
    courseVerified: true,
  });

describe('rundestatus', () => {
  it('oppretter en gyldig runde med par som standardscore', () => {
    const r = make('normal');
    assert.equal(r.layout.length, 3);
    assert.deepEqual(r.scores, [
      [3, 3, 3],
      [3, 3, 3],
    ]);
  });

  it('justerer score innenfor grensene og muterer ikke originalen', () => {
    const r = make('normal');
    const up = adjustScore(r, 0, 1);
    assert.equal(up.scores[0][0], 4);
    assert.equal(r.scores[0][0], 3);
    assert.equal(up.scores[1][0], 3);

    let low = r;
    for (let i = 0; i < 10; i++) low = adjustScore(low, 0, -1);
    assert.equal(low.scores[0][0], 1);
    let high = r;
    for (let i = 0; i < 30; i++) high = adjustScore(high, 0, 1);
    assert.equal(high.scores[0][0], MAX_SCORE);
  });

  it('par-endring flytter med uberørte scorer, men ikke endrede', () => {
    let r = make('normal');
    r = adjustScore(r, 0, 1); // Kim: 4, gjest: 3
    r = setHolePar(r, 5);
    assert.equal(r.layout[0].par, 5);
    assert.equal(r.scores[0][0], 4); // rørt – beholdes
    assert.equal(r.scores[1][0], 5); // urørt – følger par
  });

  it('navigerer og klemmer hull-indeks', () => {
    const r = make('normal');
    assert.equal(goToHole(r, 99).currentHole, 2);
    assert.equal(goToHole(r, -4).currentHole, 0);
  });

  it('lagrer hull og går videre; teller ulagrede', () => {
    let r = make('normal');
    r = confirmHole(r, 0);
    assert.equal(r.currentHole, 1);
    assert.deepEqual(unconfirmedHoles(r), [1, 2]);
    assert.deepEqual(playerTotals(r, 0), { throws: 3, par: 3, diff: 0 });
  });
});

describe('modus-regler', () => {
  it('Disc Roulette krever spinn før hullet kan lagres, og bare én spinn per hull', () => {
    let r = make('roulette');
    assert.equal(holeBlockReason(r, 0), 'Spinn hjulet først.');
    assert.equal(confirmHole(r, 0).confirmed[0], false);

    r = recordSpin(r, 0, 'putter');
    assert.equal(holeBlockReason(r, 0), null);
    r = recordSpin(r, 0, 'distance'); // forsøk på omspinn
    assert.equal(r.spins[0], 'putter');
    assert.equal(confirmHole(r, 0).confirmed[0], true);
  });

  it('Dual Tee krever tee-valg for alle spillere', () => {
    let r = make('dual_tee');
    assert.ok(holeBlockReason(r, 0));
    r = setTeePick(r, 0, 2);
    assert.ok(holeBlockReason(r, 0));
    r = setTeePick(r, 1, 1);
    assert.equal(holeBlockReason(r, 0), null);
    assert.deepEqual(r.teePicks[0], [2, null, null]);
  });

  it('Normal Game har ingen blokkeringer', () => {
    assert.equal(holeBlockReason(make('normal'), 0), null);
  });
});

describe('fullføre runden', () => {
  const profiles = (): Record<string, Profile> => ({ u1: createProfile('u1', 1) });

  it('oppdaterer bare registrerte spillere og rangerer etter kast', () => {
    let r = make('normal', 2);
    r = adjustScore(r, 1, -1); // gjest: 2 på hull 1
    r = confirmHole(r, 0);
    r = confirmHole(r, 1);
    const { result, updatedProfiles } = finishRound(r, profiles(), 9000);

    assert.deepEqual(Object.keys(updatedProfiles), ['u1']);
    assert.equal(updatedProfiles.u1.stats.modes.normal.rounds, 1);
    assert.equal(updatedProfiles.u1.stats.modes.normal.holes, 2);
    assert.equal(result.players[0].player.userId, null); // gjesten vant (5 vs 6)
    assert.equal(result.players[0].throws, 5);
    assert.equal(result.players[1].outcome?.profile.xp, updatedProfiles.u1.xp);
    assert.equal(result.players[0].outcome, null);
  });

  it('fører Disc Roulette-utfall på hullene', () => {
    let r = make('roulette', 2);
    r = recordSpin(r, 0, 'putter');
    r = recordSpin(r, 1, 'distance');
    r = confirmHole(r, 0);
    r = confirmHole(r, 1);
    const { updatedProfiles } = finishRound(r, profiles(), 9000);
    const m = updatedProfiles.u1.stats.modes;
    assert.equal(m.roulette.rounds, 1);
    assert.equal(m.roulette.byOutcome.putter.holes, 1);
    assert.equal(m.roulette.byOutcome.distance.holes, 1);
    assert.equal(m.normal.rounds, 0);
  });

  it('ignorerer spillere uten profil', () => {
    const r = confirmHole(make('normal', 1), 0);
    const { updatedProfiles, result } = finishRound(r, {}, 9000);
    assert.deepEqual(updatedProfiles, {});
    assert.equal(result.players.length, 2);
  });

  it('kan ikke fullføres før alle hull er spilt og lagret', () => {
    let r = make('normal', 3);
    r = confirmHole(r, 0); // bare hull 1 lagres
    assert.equal(allHolesPlayed(r), false);
    assert.throws(() => finishRound(r, profiles(), 9000));
    r = confirmHole(confirmHole(r, 1), 2);
    assert.equal(allHolesPlayed(r), true);
    assert.equal(finishRound(r, profiles(), 9000).result.holes, 3);
  });

  it('baner lagres bare når GPS har bekreftet at man stod på banen', () => {
    const play = (verified: boolean) => {
      const r = { ...make('normal', 1), courseVerified: verified };
      return finishRound(confirmHole(r, 0), profiles(), 9000).updatedProfiles.u1.stats.courses;
    };
    assert.equal(Object.keys(play(true)).length, 1);
    assert.equal(Object.keys(play(false)).length, 0);
  });

  it('Putter Game: putts føres i egen statistikk og kan ikke overstige antall kast', () => {
    let r = make('putter', 2);
    r = adjustPutts(r, 0, 5); // maks = score (3)
    assert.equal(r.putts[0][0], 3);
    r = adjustScore(r, 0, -1); // score 2 -> putts klippes til 2
    assert.equal(r.putts[0][0], 2);
    r = confirmHole(r, 0);
    r = adjustPutts(r, 0, 1);
    r = confirmHole(r, 1);
    const m = finishRound(r, profiles(), 9000).updatedProfiles.u1.stats.modes;
    assert.equal(m.putter.rounds, 1);
    assert.equal(m.putter.putts, 3);
    assert.equal(m.putter.onePutts, 1);
    assert.equal(m.normal.putts, 0);
  });

  it('Disc Roulette med bag-hjul lagrer disken og fører utfallet på disktypen', () => {
    let r = make('roulette', 1);
    const disc = (id: string) => ({ id, name: id, brand: 'X', type: 'Fairway Driver' as const, speed: 7, glide: 5, turn: -1, fade: 2, plastic: 'Z', color: '#fff' });
    r = recordSpin(r, 0, 'fairway', disc('disc-1'));
    assert.equal(r.spinDiscs[0], 'disc-1');
    assert.equal(r.spinDiscItems[0]?.name, 'disc-1');
    r = recordSpin(r, 0, 'putter', disc('disc-2')); // kan ikke spinnes på nytt
    assert.equal(r.spins[0], 'fairway');
    assert.equal(r.spinDiscs[0], 'disc-1');
  });

  it('distanse: bruker skritt, ellers anslag', () => {
    assert.equal(roundDistanceKm(5000, 9), 3.8);
    assert.equal(roundDistanceKm(10, 9), 1.26);
  });
});

describe('hjul-geometri', () => {
  it('lander alltid på valgt felt, uansett startrotasjon og jitter', () => {
    for (const count of [2, 3, 4, 5, 6]) {
      for (let index = 0; index < count; index++) {
        for (const jitter of [-0.35, -0.1, 0, 0.2, 0.35]) {
          for (const start of [0, 37.5, 360, 1234.5, -90]) {
            const end = spinTarget(start, index, count, jitter, 5);
            assert.equal(
              segmentAtPointer(end, count),
              index,
              `count=${count} index=${index} jitter=${jitter} start=${start}`
            );
            assert.ok(end >= start + 5 * 360, 'roterer fremover');
            assert.ok(end < start + 6 * 360 + 1);
          }
        }
      }
    }
  });

  it('lager gyldig SVG-sti', () => {
    const d = slicePath(100, 0, 90);
    assert.match(d, /^M 0 0 L 0\.000 -100\.000 A 100 100 0 0 1 100\.000 -0\.000 Z$/);
    assert.match(slicePath(100, 0, 270), / 0 1 1 /);
  });
});
