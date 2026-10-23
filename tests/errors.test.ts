import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translate } from '../src/backend/errors.ts';

const TAKEN = 'Brukernavnet er allerede tatt';

describe('feilmeldinger ved registrering', () => {
  it('«Database error saving new user» betyr IKKE at navnet er tatt', () => {
    const msg = translate('Database error saving new user', 'unexpected_failure');
    assert.ok(!msg.includes(TAKEN));
    assert.match(msg, /schema\.sql/);
  });

  it('sier «tatt» bare ved ekte navnekonflikt', () => {
    assert.ok(translate('duplicate key value violates unique constraint "profiles_name_key"').includes(TAKEN));
    assert.ok(translate('Brukernavnet er allerede tatt. Velg et annet.').includes(TAKEN));
  });

  it('andre duplikat-feil forveksles ikke med brukernavn', () => {
    const msg = translate('duplicate key value violates unique constraint "profile_data_pkey" (username)');
    assert.ok(!msg.includes(TAKEN));
  });

  it('e-post som finnes gir riktig melding', () => {
    for (const [m, c] of [['User already registered', undefined], ['x', 'user_already_exists'], ['x', 'email_exists']] as const) {
      assert.match(translate(m, c), /e-posten er allerede registrert/i);
    }
  });

  it('kjente feil får egne meldinger', () => {
    assert.match(translate('x', 'weak_password'), /svakt/);
    assert.match(translate('x', 'over_email_send_rate_limit'), /For mange forsøk/);
    assert.match(translate('x', 'signup_disabled'), /slått av/);
    assert.match(translate('x', 'email_address_invalid'), /gyldig/);
    assert.match(translate('Failed to fetch'), /kontakt med serveren/);
  });

  it('ukjente feil viser den faktiske årsaken i stedet for å gjette', () => {
    assert.equal(translate('something odd happened'), 'Noe gikk galt: something odd happened');
  });
});
