// app/api/auth/sso/callback/oidc/route.ts
//
// OIDC redirect_uri. Exchanges the authorization code, verifies the id_token,
// JIT-provisions the user, and mints a first-party session — the same session
// primitive the password login uses, so everything downstream is identical.
import { NextRequest, NextResponse } from 'next/server';
import {
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '@/lib/auth/session';
import { decodeState, statesMatch, SSO_STATE_COOKIE } from '@/lib/auth/sso/state';
import { getEnabledConnection, oidcCallbackUrl } from '@/lib/auth/sso/connection';
import { discover, exchangeCode, fetchJwks, verifyIdToken, profileFromClaims } from '@/lib/auth/sso/oidc';
import { jitProvisionSsoUser } from '@/lib/auth/sso/provision';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fail(req: NextRequest, reason: string): NextResponse {
  const url = new URL('/login', req.nextUrl.origin);
  url.searchParams.set('sso_error', reason);
  const res = NextResponse.redirect(url);
  res.cookies.delete(SSO_STATE_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const stateParam = req.nextUrl.searchParams.get('state');
  const cookieState = req.cookies.get(SSO_STATE_COOKIE)?.value;

  if (req.nextUrl.searchParams.get('error')) {
    return fail(req, 'idp_error');
  }
  if (!code || !stateParam) return fail(req, 'missing_code');
  // Bind the callback to the browser that started the flow.
  if (!statesMatch(stateParam, cookieState)) return fail(req, 'state_mismatch');

  const state = decodeState(stateParam);
  if (!state || !state.codeVerifier) return fail(req, 'invalid_state');

  try {
    const conn = await getEnabledConnection(state.connectionId);
    if (!conn || conn.protocol !== 'OIDC' || !conn.oidcIssuer) return fail(req, 'sso_misconfigured');

    const discovery = await discover(conn.oidcIssuer);
    const { id_token } = await exchangeCode(conn, discovery, {
      code,
      redirectUri: oidcCallbackUrl(),
      codeVerifier: state.codeVerifier,
    });

    const jwks = await fetchJwks(discovery.jwks_uri);
    const claims = verifyIdToken(id_token, jwks, {
      issuer: discovery.issuer,
      audience: conn.oidcClientId ?? '',
      nonce: state.nonce,
    });

    const user = await jitProvisionSsoUser(conn, profileFromClaims(claims));
    const { token, expiresAt } = await createSession({ id: user.id, tenantId: user.tenantId });

    const res = NextResponse.redirect(new URL(state.returnTo, req.nextUrl.origin));
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    res.cookies.delete(SSO_STATE_COOKIE);
    return res;
  } catch (err) {
    console.error('[sso/callback/oidc]', err);
    return fail(req, 'sso_callback_failed');
  }
}
