// lib/auth/sso/provision.ts
//
// Just-in-time provisioning: turn a verified IdP profile into a TenantUser,
// creating the account on first login and re-linking it on subsequent ones.
import { db } from '@/lib/db';
import type { SsoConnection, TenantUser } from '@prisma/client';

export type SsoProfile = {
  externalId: string;
  email: string;
  name?: string;
};

/**
 * Resolve (and create if needed) the TenantUser for an SSO login. Matching
 * prefers the stable IdP subject (`externalId`) so a user survives an email
 * change at the IdP, then falls back to email for the first login of a user
 * that was pre-provisioned (e.g. via SCIM) without one.
 *
 * A deactivated user (SCIM `active=false`) is refused — SSO cannot resurrect a
 * deprovisioned account.
 */
export async function jitProvisionSsoUser(
  conn: SsoConnection,
  profile: SsoProfile,
): Promise<TenantUser> {
  const email = profile.email.trim().toLowerCase();
  const via = conn.protocol.toLowerCase(); // 'oidc' | 'saml'

  const user =
    (await db.tenantUser.findFirst({
      where: { tenantId: conn.tenantId, externalId: profile.externalId },
    })) ??
    (await db.tenantUser.findFirst({
      where: { tenantId: conn.tenantId, email },
    }));

  if (user) {
    if (!user.isActive) {
      const err: any = new Error('This account has been deactivated');
      err.status = 403;
      throw err;
    }
    return db.tenantUser.update({
      where: { id: user.id },
      data: {
        externalId: profile.externalId,
        ssoConnectionId: conn.id,
        provisionedVia: via,
        email,
      },
    });
  }

  return db.tenantUser.create({
    data: {
      tenantId: conn.tenantId,
      email,
      role: conn.defaultRole,
      externalId: profile.externalId,
      ssoConnectionId: conn.id,
      provisionedVia: via,
    },
  });
}
