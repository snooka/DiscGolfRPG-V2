import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidEmail, normalizeEmail, validateRegistration } from '../src/lib/auth.ts';
import { passedFriends } from '../src/lib/passing.ts';
import { randomInt } from '../src/lib/random.ts';

describe('validering av registrering', () => {
  const ok = { name: 'Kim', email: 'kim@example.no', password: 'hemmelig', confirm: 'hemmelig' };

  it('godtar gyldig input', () => {
    assert.deepEqual(validateRegistration(ok), {});
  });

  it('finner alle feil', () => {
    const e = validateRegistration({ name: ' K ', email: 'ikke-epost', password: '123', confirm: '456' });
    assert.ok(e.name && e.email && e.password && e.confirm);
  });

  it('e-post normaliseres og valideres', () => {
    assert.equal(normalizeEmail('  Kim@Example.NO '), 'kim@example.no');
    assert.equal(isValidEmail('a@b.no'), true);
    assert.equal(isValidEmail('a@b'), false);
    assert.equal(isValidEmail('a b@c.no'), false);
  });
});

describe('forbigang på topplisten', () => {
  const friends = [
    { id: 'ola', xp: 500 },
    { id: 'truls', xp: 900 },
    { id: 'nils', xp: 100 },
    { id: 'lik', xp: 700 },
  ];

  it('varsler bare venner man faktisk kom forbi', () => {
    assert.deepEqual(passedFriends(400, 800, friends), ['ola', 'lik']);
  });

  it('ingen varsel uten XP-økning, ved lik XP eller for venner som allerede var bak', () => {
    assert.deepEqual(passedFriends(800, 800, friends), []);
    assert.deepEqual(passedFriends(800, 700, friends), []);
    assert.deepEqual(passedFriends(400, 700, friends), ['ola']); // lik XP (700) er ikke passert
    assert.deepEqual(passedFriends(1000, 2000, friends), []);
  });
});

describe('randomInt', () => {
  it('holder seg innenfor [0, max) og dekker alle verdier', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const n = randomInt(6);
      assert.ok(Number.isInteger(n) && n >= 0 && n < 6);
      seen.add(n);
    }
    assert.equal(seen.size, 6);
  });

  it('avviser ugyldig max', () => {
    assert.throws(() => randomInt(0), RangeError);
    assert.throws(() => randomInt(2.5), RangeError);
  });
});
