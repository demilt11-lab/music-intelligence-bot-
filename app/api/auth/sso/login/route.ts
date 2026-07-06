// app/api/auth/sso/login/route.ts
//
// Entry point for SSO. Resolves the tenant's IdP connection (by ?connection=<id>
// or by the domain of ?email=), then redirects the browser to that IdP. All
// per-login parameters travel in an HMAC-signed `state` token that is also
// pinned to the browser via a short-lived httpOnly cookie.
import { NextRequest, NextResponse } from 'next/server';
import { authEnabled } from '@/lib/auth/session';
import {
  findConnectionForEmail,
  getEnabledConnection,
  oidcCallbackUrl,
} from '@/lib/auth/sso/connection';
import { encodeState, SSO_STATE_COOKIE } from '@/lib/auth/sso/state';
import { randomToken } from '@/lib/auth/sso/encoding';
import { generateCodeVerifier, codeChallengeS256 } from '@/lib/auth/sso/pkce';
import { discover, buildAuthorizationUrl } from '@/lib/auth/sso/oidc';
import { samlLoginUrl } from '@/lib/auth/sso/saml';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Only allow returning to a same-site path, never an absolute/off-site URL. */
function safeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

function backToLogin(req: NextRequest, reason: string): NextResponse {
  const url = new URL('/login', req.nextUrl.origin);
  url.searchParams.set('sso_error', reason);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  if (!authEnabled()) return backToLogin(req, 'auth_disabled');

  const connectionParam = req.nextUrl.searchParams.get('connection');
  const email = req.nextUrl.searchParams.get('email');
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get('returnTo'));

  const conn = connectionParam
    ? await getEnabledConnection(Number(connectionParam))
    : email
      ? await findConnectionForEmail(email)
      : null;

  if (!conn) return backToLogin(req, 'no_sso_connection');

  const nonce = randomToken(16);

  try {
    let redirectUrl: string;
    let stateToken: string;

    if (conn.protocol === 'OIDC') {
      if (!conn.oidcIssuer || !conn.oidcClientId) return backToLogin(req, 'sso_misconfigured');
      const codeVerifier = generateCodeVerifier();
      stateToken = encodeState({ connectionId: conn.id, nonce, returnTo, codeVerifier });
      const discovery = await discover(conn.oidcIssuer);
      redirectUrl = buildAuthorizationUrl(conn, discovery, {
        redirectUri: oidcCallbackUrl(),
        state: stateToken,
        nonce,
        codeChallenge: codeChallengeS256(codeVerifier),
      });
    } else {
      stateToken = encodeState({ connectionId: conn.id, nonce, returnTo });
      redirectUrl = await samlLoginUrl(conn, stateToken);
    }

    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set(SSO_STATE_COOKIE, stateToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/auth/sso',
      maxAge: 600,
    });
    return res;
  } catch (err) {
    console.error('[sso/login]', err);
    return backToLogin(req, 'sso_start_failed');
  }
}
