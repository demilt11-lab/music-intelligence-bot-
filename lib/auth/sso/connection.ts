// lib/auth/sso/connection.ts
//
// Resolves which identity-provider connection a login should use, and the
// service-provider URLs the IdP needs to know about.
import { db } from '@/lib/db';
import type { SsoConnection } from '@prisma/client';

/** Extract the lowercased email domain, or null if the address is malformed. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/** Server-side base URL for building callback / entity URLs. */
export function spBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.INTERNAL_API_BASE_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

/** Our SAML service-provider entityID (also the default expected audience). */
export function spEntityId(): string {
  return `${spBaseUrl()}/api/auth/sso/metadata`;
}

export function oidcCallbackUrl(): string {
  return `${spBaseUrl()}/api/auth/sso/callback/oidc`;
}

export function samlCallbackUrl(): string {
  return `${spBaseUrl()}/api/auth/sso/callback/saml`;
}

export async function findConnectionForEmail(
  email: string,
): Promise<SsoConnection | null> {
  const domain = emailDomain(email);
  if (!domain) return null;
  return db.ssoConnection.findFirst({
    where: { emailDomain: domain, enabled: true },
  });
}

export async function getEnabledConnection(id: number): Promise<SsoConnection | null> {
  return db.ssoConnection.findFirst({ where: { id, enabled: true } });
}
