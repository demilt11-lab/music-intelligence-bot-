// lib/auth/sso/pkce.ts
//
// PKCE (RFC 7636) for the OIDC authorization-code flow. The verifier is kept in
// the signed state token; only the S256 challenge ever hits the IdP.
import { randomBytes } from 'crypto';
import { base64url, sha256 } from './encoding';

/** 32 random bytes → 43-char base64url verifier (inside RFC 7636's 43–128). */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

export function codeChallengeS256(verifier: string): string {
  return base64url(sha256(verifier));
}
