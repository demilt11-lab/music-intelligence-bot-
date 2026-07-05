// lib/auth/sso/encoding.ts
//
// base64url helpers shared across the SSO flow (PKCE, state, JWT parsing).
import { createHash, randomBytes } from 'crypto';

export function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64urlToBuffer(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export function base64urlToString(s: string): string {
  return base64urlToBuffer(s).toString('utf8');
}

export function sha256(input: string | Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}
