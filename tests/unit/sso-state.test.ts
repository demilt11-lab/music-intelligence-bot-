/**
 * Tests for the SSO PKCE + signed-state primitives. The signed state is the
 * spine of the stateless SSO flow: if a forged or stale state were accepted at
 * the callback, an attacker could complete a login they didn't start. These
 * lock down the signature, the TTL, and the browser-pin comparison.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeState, decodeState, statesMatch } from '@/lib/auth/sso/state';
import { generateCodeVerifier, codeChallengeS256 } from '@/lib/auth/sso/pkce';

// state.ts reads AUTH_SECRET lazily (inside the signer, called only from the
// test bodies below), so setting it during module load is sufficient.
process.env.AUTH_SECRET = 'test-auth-secret-for-sso-state';

test('PKCE verifier is RFC-7636-length and the S256 challenge is deterministic', () => {
  const v = generateCodeVerifier();
  assert.ok(v.length >= 43 && v.length <= 128, `verifier length ${v.length}`);
  assert.equal(codeChallengeS256(v), codeChallengeS256(v));
  assert.notEqual(codeChallengeS256(v), v, 'challenge is a hash, not the verifier');
});

test('state round-trips through encode/decode', () => {
  const token = encodeState({ connectionId: 12, nonce: 'n1', returnTo: '/watchlist', codeVerifier: 'ver' });
  const decoded = decodeState(token);
  assert.equal(decoded?.connectionId, 12);
  assert.equal(decoded?.nonce, 'n1');
  assert.equal(decoded?.returnTo, '/watchlist');
  assert.equal(decoded?.codeVerifier, 'ver');
});

test('a tampered payload is rejected (signature check)', () => {
  const token = encodeState({ connectionId: 12, nonce: 'n1', returnTo: '/' });
  const [payload, mac] = token.split('.');
  const forged = `${payload}x.${mac}`;
  assert.equal(decodeState(forged), null);
});

test('a forged signature is rejected', () => {
  const token = encodeState({ connectionId: 12, nonce: 'n1', returnTo: '/' });
  const [payload] = token.split('.');
  assert.equal(decodeState(`${payload}.${'0'.repeat(64)}`), null);
});

test('an expired state (older than the TTL) is rejected', () => {
  const elevenMinAgo = Date.now() - 11 * 60 * 1000;
  const token = encodeState({ connectionId: 1, nonce: 'n', returnTo: '/' }, elevenMinAgo);
  assert.equal(decodeState(token), null);
  // still valid a moment after issue
  const fresh = encodeState({ connectionId: 1, nonce: 'n', returnTo: '/' }, Date.now());
  assert.ok(decodeState(fresh));
});

test('statesMatch is true only for identical non-empty tokens', () => {
  assert.equal(statesMatch('abc', 'abc'), true);
  assert.equal(statesMatch('abc', 'abd'), false);
  assert.equal(statesMatch('', ''), false);
  assert.equal(statesMatch('abc', undefined), false);
});
