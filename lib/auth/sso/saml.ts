// lib/auth/sso/saml.ts
//
// SAML 2.0 (HTTP-Redirect for the AuthnRequest, HTTP-POST for the response).
// Signature validation, audience/condition/timestamp checks, and replay
// protection are delegated to @node-saml/node-saml — the maintained, security-
// focused successor to passport-saml. We never accept an unsigned assertion.
import { SAML } from '@node-saml/node-saml';
import type { Profile } from '@node-saml/node-saml';
import type { SsoConnection } from '@prisma/client';
import { samlCallbackUrl, spEntityId } from './connection';
import type { SsoProfile } from './provision';

function buildSaml(conn: SsoConnection): SAML {
  if (!conn.samlEntryPoint || !conn.samlCert) {
    throw new Error('SAML connection is missing entryPoint or signing certificate');
  }
  return new SAML({
    entryPoint: conn.samlEntryPoint,
    issuer: spEntityId(), // our SP entityID
    callbackUrl: samlCallbackUrl(),
    idpCert: conn.samlCert,
    audience: conn.samlAudience ?? spEntityId(),
    // Require the assertion itself to be signed. (Response-level signing varies
    // by IdP; the assertion signature is the one that actually protects claims.)
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    disableRequestedAuthnContext: true,
  });
}

/** Build the IdP redirect URL for a login, carrying `relayState` (our state). */
export async function samlLoginUrl(conn: SsoConnection, relayState: string): Promise<string> {
  const saml = buildSaml(conn);
  return saml.getAuthorizeUrlAsync(relayState, undefined, {});
}

/** Validate a POSTed SAMLResponse and return the verified profile. */
export async function validateSamlResponse(
  conn: SsoConnection,
  samlResponse: string,
): Promise<Profile> {
  const saml = buildSaml(conn);
  const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
  if (!profile) throw new Error('SAML response contained no profile');
  return profile;
}

export function profileFromSaml(profile: Profile): SsoProfile {
  const email = (
    profile.email ??
    profile.mail ??
    (profile['urn:oid:0.9.2342.19200300.100.1.3'] as string | undefined) ??
    profile.nameID
  )
    ?.toString()
    .trim()
    .toLowerCase();
  if (!email) throw new Error('SAML assertion had no email / NameID');
  const displayName = (profile.displayName ?? profile.cn ?? undefined) as string | undefined;
  return {
    externalId: profile.nameID,
    email,
    name: displayName,
  };
}
