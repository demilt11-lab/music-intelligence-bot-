// lib/auth/sso/oidc.ts
//
// A minimal, dependency-free OpenID Connect authorization-code + PKCE client.
// We verify the id_token signature against the IdP's published JWKS using
// Node's native crypto (JWK import + RSA verify) — no JWT library, nothing that
// trusts an unsigned token.
import crypto from 'crypto';
import type { SsoConnection } from '@prisma/client';
import { base64urlToString, base64urlToBuffer } from './encoding';
import type { SsoProfile } from './provision';

export type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};

type Jwk = { kid?: string; kty: string; n?: string; e?: string; alg?: string };

const RS_ALGS: Record<string, string> = {
  RS256: 'RSA-SHA256',
  RS384: 'RSA-SHA384',
  RS512: 'RSA-SHA512',
};

export async function discover(issuer: string): Promise<OidcDiscovery> {
  const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status}) for ${url}`);
  const doc = (await res.json()) as OidcDiscovery;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.jwks_uri) {
    throw new Error('OIDC discovery document is missing required endpoints');
  }
  return doc;
}

export function buildAuthorizationUrl(
  conn: SsoConnection,
  discovery: OidcDiscovery,
  opts: { redirectUri: string; state: string; nonce: string; codeChallenge: string },
): string {
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', conn.oidcClientId ?? '');
  url.searchParams.set('redirect_uri', opts.redirectUri);
  url.searchParams.set('scope', conn.oidcScopes || 'openid email profile');
  url.searchParams.set('state', opts.state);
  url.searchParams.set('nonce', opts.nonce);
  url.searchParams.set('code_challenge', opts.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeCode(
  conn: SsoConnection,
  discovery: OidcDiscovery,
  opts: { code: string; redirectUri: string; codeVerifier: string },
): Promise<{ id_token: string; access_token?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: conn.oidcClientId ?? '',
    code_verifier: opts.codeVerifier,
  });
  // Confidential clients also authenticate with the secret; PKCE covers public ones.
  if (conn.oidcClientSecret) body.set('client_secret', conn.oidcClientSecret);

  const res = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!res.ok) {
    throw new Error(`OIDC token exchange failed (${res.status})`);
  }
  const tokens = (await res.json()) as { id_token?: string; access_token?: string };
  if (!tokens.id_token) throw new Error('OIDC token response had no id_token');
  return { id_token: tokens.id_token, access_token: tokens.access_token };
}

/**
 * Verify an id_token's signature and standard claims. Pure given the JWKS, so
 * it is unit-tested against a locally-generated RSA key.
 */
export function verifyIdToken(
  idToken: string,
  jwks: { keys: Jwk[] },
  expect: { issuer: string; audience: string; nonce: string; nowMs?: number },
): Record<string, any> {
  const nowSec = Math.floor((expect.nowMs ?? Date.now()) / 1000);
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('malformed id_token');
  const [h, p, s] = parts;

  const header = JSON.parse(base64urlToString(h)) as { alg: string; kid?: string };
  const nodeAlg = RS_ALGS[header.alg];
  if (!nodeAlg) throw new Error(`unsupported id_token alg: ${header.alg}`);

  const jwk =
    jwks.keys.find((k) => k.kid === header.kid) ??
    (jwks.keys.length === 1 ? jwks.keys[0] : undefined);
  if (!jwk) throw new Error('no matching JWKS key for id_token kid');

  const pub = crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: 'jwk' });
  const ok = crypto.verify(nodeAlg, Buffer.from(`${h}.${p}`), pub, base64urlToBuffer(s));
  if (!ok) throw new Error('id_token signature verification failed');

  const claims = JSON.parse(base64urlToString(p)) as Record<string, any>;

  if (claims.iss !== expect.issuer) throw new Error('id_token issuer mismatch');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(expect.audience)) throw new Error('id_token audience mismatch');
  if (typeof claims.exp === 'number' && claims.exp < nowSec) throw new Error('id_token expired');
  if (typeof claims.nbf === 'number' && claims.nbf > nowSec + 60) throw new Error('id_token not yet valid');
  if (claims.nonce !== expect.nonce) throw new Error('id_token nonce mismatch');

  return claims;
}

export function profileFromClaims(claims: Record<string, any>): SsoProfile {
  const email = (claims.email ?? claims.preferred_username ?? '').toString().trim().toLowerCase();
  if (!email) throw new Error('id_token had no email claim');
  return {
    externalId: String(claims.sub),
    email,
    name: claims.name ?? claims.given_name ?? undefined,
  };
}

export async function fetchJwks(jwksUri: string): Promise<{ keys: Jwk[] }> {
  const res = await fetch(jwksUri);
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
  return (await res.json()) as { keys: Jwk[] };
}
