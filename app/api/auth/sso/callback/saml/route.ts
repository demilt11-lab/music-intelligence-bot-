// app/api/auth/sso/callback/saml/route.ts
//
// SAML Assertion Consumer Service (HTTP-POST binding). The IdP posts a signed
// SAMLResponse here; node-saml validates the signature, audience, conditions
// and timestamps. Our own `state` rides in RelayState (HMAC-signed, TTL-bound).
//
// Note on the browser-pin cookie: a SAML POST is a cross-site top-level POST,
// so a SameSite=Lax cookie is not delivered. We therefore treat the sso_state
// cookie as best-effort here (enforced only when present) and rely on the
// signed RelayState + signed assertion as the primary integrity controls.
import { NextRequest, NextResponse } from 'next/server';
import {
  createSession,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '@/lib/auth/session';
import { decodeState, statesMatch, SSO_STATE_COOKIE } from '@/lib/auth/sso/state';
import { getEnabledConnection } from '@/lib/auth/sso/connection';
import { validateSamlResponse, profileFromSaml } from '@/lib/auth/sso/saml';
import { jitProvisionSsoUser } from '@/lib/auth/sso/provision';
import { captureError } from '@/lib/platform/observability';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fail(req: NextRequest, reason: string): NextResponse {
  const url = new URL('/login', req.nextUrl.origin);
  url.searchParams.set('sso_error', reason);
  const res = NextResponse.redirect(url, 303);
  res.cookies.delete(SSO_STATE_COOKIE);
  return res;
}

export async function POST(req: NextRequest) {
  let samlResponse: string | null;
  let relayState: string | null;
  try {
    const form = await req.formData();
    samlResponse = form.get('SAMLResponse')?.toString() ?? null;
    relayState = form.get('RelayState')?.toString() ?? null;
  } catch {
    return fail(req, 'bad_saml_post');
  }

  if (!samlResponse || !relayState) return fail(req, 'missing_saml_response');

  const cookieState = req.cookies.get(SSO_STATE_COOKIE)?.value;
  // Enforce the browser pin only when the cookie survived (see header note).
  if (cookieState && !statesMatch(relayState, cookieState)) return fail(req, 'state_mismatch');

  const state = decodeState(relayState);
  if (!state) return fail(req, 'invalid_state');

  try {
    const conn = await getEnabledConnection(state.connectionId);
    if (!conn || conn.protocol !== 'SAML') return fail(req, 'sso_misconfigured');

    const profile = await validateSamlResponse(conn, samlResponse);
    const user = await jitProvisionSsoUser(conn, profileFromSaml(profile));
    const { token, expiresAt } = await createSession({ id: user.id, tenantId: user.tenantId });

    const res = NextResponse.redirect(new URL(state.returnTo, req.nextUrl.origin), 303);
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
    res.cookies.delete(SSO_STATE_COOKIE);
    return res;
  } catch (err) {
    console.error('[sso/callback/saml]', err);
    void captureError(err, { route: '/api/auth/sso/callback/saml', statusCode: 500 });
    return fail(req, 'saml_validation_failed');
  }
}
