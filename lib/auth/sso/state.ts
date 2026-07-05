// lib/auth/sso/state.ts
//
// The SSO flow is stateless: instead of a server-side session store, the
// per-login parameters (which connection, the PKCE verifier, the nonce, where
// to return the user) travel in an HMAC-signed, short-lived `state` token. The
// signature (keyed by AUTH_SECRET) means a tampered or forged state is rejected
// at the callback, and the TTL bounds the window for a stolen state.
//
// The same token is also dropped in an httpOnly cookie at login and compared on
// callback, binding the round-trip to the browser that started it (defeats
// login-CSRF / state fixation).
import { createHmac, timingSafeEqual } from 'crypto';
import { base64url, base64urlToString } from './encoding';

export type SsoState = {
  connectionId: number;
  nonce: string;
  returnTo: string;
  codeVerifier?: string; // OIDC PKCE only
  iat: number; // issued-at, epoch seconds
};

export const SSO_STATE_COOKIE = 'sso_state';
const STATE_TTL_SECONDS = 600; // 10 minutes

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not configured');
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

export function encodeState(state: Omit<SsoState, 'iat'>, nowMs = Date.now()): string {
  const full: SsoState = { ...state, iat: Math.floor(nowMs / 1000) };
  const payload = base64url(Buffer.from(JSON.stringify(full)));
  return `${payload}.${sign(payload)}`;
}

export function decodeState(token: string | undefined | null, nowMs = Date.now()): SsoState | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, mac] = parts;

  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let state: SsoState;
  try {
    state = JSON.parse(base64urlToString(payload));
  } catch {
    return null;
  }
  if (
    typeof state.iat !== 'number' ||
    typeof state.connectionId !== 'number' ||
    nowMs / 1000 - state.iat > STATE_TTL_SECONDS
  ) {
    return null;
  }
  return state;
}

/** Constant-time equality for the state param vs. the browser-bound cookie. */
export function statesMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
