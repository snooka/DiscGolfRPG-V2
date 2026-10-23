import test from 'node:test';
import assert from 'node:assert/strict';
import { signupRedirectUrl } from '../src/backend/redirect.ts';

test('Android-appen sender ingen redirectTo (aldri localhost eller dyp lenke)', () => {
  assert.equal(signupRedirectUrl({ native: true, origin: 'https://localhost', pathname: '/' }), undefined);
});

test('fast offentlig adresse brukes, localhost ignoreres', () => {
  const env = { native: false, origin: 'https://app.no', pathname: '/x' };
  assert.equal(signupRedirectUrl({ ...env, publicUrl: 'https://pwa.no//' }), 'https://pwa.no/');
  assert.equal(signupRedirectUrl({ ...env, publicUrl: 'http://localhost:3000' }), 'https://app.no/x');
  assert.equal(signupRedirectUrl(env), 'https://app.no/x');
});
