/**
 * Tests for OIDC id_token verification (lib/auth/sso/oidc.ts). We generate a
 * real RSA keypair, sign a JWT, publish the matching JWKS, and assert that a
 * valid token passes while every tampered / mismatched variant is rejected.
 * This is the security core of OIDC SSO: an unverified id_token must never be
 * trusted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyIdToken, profileFromClaims } from '@/lib/auth/sso/oidc';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as crypto.JsonWebKey;
const JWKS = { keys: [{ ...jwk, kid: 'test-key', alg: 'RS256' } as any] };

const ISSUER = 'https://idp.example.com';
const AUDIENCE = 'client-123';
const NONCE = 'nonce-abc';

function signJwt(claims: Record<string, any>, kid = 'test-key'): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid })));
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey));
  return `${header}.${payload}.${sig}`;
}

function validClaims(over: Record<string, any> = {}) {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: 'user-sub-1',
    email: 'Analyst@ACME.com',
    name: 'Acme Analyst',
    nonce: NONCE,
    exp: Math.floor(Date.now() / 1000) + 300,
    ...over,
  };
}

const expect = { issuer: ISSUER, audience: AUDIENCE, nonce: NONCE };

test('a correctly-signed id_token with valid claims verifies', () => {
  const claims = verifyIdToken(signJwt(validClaims()), JWKS, expect);
  assert.equal(claims.sub, 'user-sub-1');
});

test('profileFromClaims lowercases email and uses sub as externalId', () => {
  const claims = verifyIdToken(signJwt(validClaims()), JWKS, expect);
  const profile = profileFromClaims(claims);
  assert.equal(profile.externalId, 'user-sub-1');
  assert.equal(profile.email, 'analyst@acme.com');
});

test('a tampered signature is rejected', () => {
  const token = signJwt(validClaims());
  const tampered = token.slice(0, -4) + 'AAAA';
  assert.throws(() => verifyIdToken(tampered, JWKS, expect), /signature verification failed/);
});

test('a token signed by a DIFFERENT key is rejected', () => {
  const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })));
  const payload = b64url(Buffer.from(JSON.stringify(validClaims())));
  const sig = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), other.privateKey));
  assert.throws(() => verifyIdToken(`${header}.${payload}.${sig}`, JWKS, expect), /signature/);
});

test('issuer mismatch is rejected', () => {
  assert.throws(() => verifyIdToken(signJwt(validClaims({ iss: 'https://evil.example' })), JWKS, expect), /issuer mismatch/);
});

test('audience mismatch is rejected', () => {
  assert.throws(() => verifyIdToken(signJwt(validClaims({ aud: 'someone-else' })), JWKS, expect), /audience mismatch/);
});

test('nonce mismatch is rejected (replay/interleave defense)', () => {
  assert.throws(() => verifyIdToken(signJwt(validClaims({ nonce: 'wrong' })), JWKS, expect), /nonce mismatch/);
});

test('an expired token is rejected', () => {
  assert.throws(
    () => verifyIdToken(signJwt(validClaims({ exp: Math.floor(Date.now() / 1000) - 10 })), JWKS, expect),
    /expired/,
  );
});

test('an unsupported alg (e.g. none/HS256) is rejected', () => {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'none' })));
  const payload = b64url(Buffer.from(JSON.stringify(validClaims())));
  assert.throws(() => verifyIdToken(`${header}.${payload}.`, JWKS, expect), /unsupported id_token alg/);
});
