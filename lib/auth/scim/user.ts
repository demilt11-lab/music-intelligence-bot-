// lib/auth/scim/user.ts
//
// Pure SCIM 2.0 <-> TenantUser mapping and request parsing (RFC 7643/7644).
// Kept free of DB/HTTP so the wire format is unit-testable in isolation.
import type { TenantRole, TenantUser } from '@prisma/client';

export const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_PATCH_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

const VALID_ROLES: TenantRole[] = ['ADMIN', 'ANALYST', 'VIEWER'];

export type ScimError = {
  schemas: [typeof SCIM_ERROR_SCHEMA];
  status: string;
  detail: string;
  scimType?: string;
};

export function scimError(status: number, detail: string, scimType?: string): ScimError {
  return { schemas: [SCIM_ERROR_SCHEMA], status: String(status), detail, ...(scimType ? { scimType } : {}) };
}

/** Serialize a TenantUser as a SCIM User resource. */
export function toScimUser(user: TenantUser, baseUrl: string): Record<string, unknown> {
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: String(user.id),
    externalId: user.externalId ?? undefined,
    userName: user.email,
    name: { formatted: user.email },
    emails: [{ value: user.email, primary: true, type: 'work' }],
    roles: [{ value: user.role, primary: true }],
    active: user.isActive,
    meta: {
      resourceType: 'User',
      location: `${baseUrl}/api/scim/v2/Users/${user.id}`,
    },
  };
}

export function scimListResponse(
  resources: Record<string, unknown>[],
  opts: { totalResults: number; startIndex: number; itemsPerPage: number },
): Record<string, unknown> {
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults: opts.totalResults,
    startIndex: opts.startIndex,
    itemsPerPage: opts.itemsPerPage,
    Resources: resources,
  };
}

function coerceRole(input: unknown): TenantRole | undefined {
  if (typeof input !== 'string') return undefined;
  const upper = input.toUpperCase() as TenantRole;
  return VALID_ROLES.includes(upper) ? upper : undefined;
}

/** Pull a role out of a SCIM `roles` multi-valued attribute, if present/valid. */
export function roleFromScim(roles: unknown): TenantRole | undefined {
  if (!Array.isArray(roles) || roles.length === 0) return undefined;
  const first = roles[0];
  const value = typeof first === 'string' ? first : (first?.value as unknown);
  return coerceRole(value);
}

export type ScimUserInput = {
  userName?: string;
  emails?: Array<{ value?: string; primary?: boolean }>;
  externalId?: string;
  active?: boolean;
  roles?: unknown;
};

/** Best email for a SCIM payload: userName, else the primary/first email. */
export function emailFromScim(body: ScimUserInput): string | undefined {
  if (body.userName && body.userName.includes('@')) return body.userName.trim().toLowerCase();
  const emails = body.emails ?? [];
  const primary = emails.find((e) => e.primary) ?? emails[0];
  return primary?.value?.trim().toLowerCase();
}

export type UserMutation = {
  email?: string;
  externalId?: string;
  isActive?: boolean;
  role?: TenantRole;
};

/** Parse a create/replace (POST/PUT) SCIM body into a user mutation. */
export function mutationFromScimBody(body: ScimUserInput): UserMutation {
  const mutation: UserMutation = {};
  const email = emailFromScim(body);
  if (email) mutation.email = email;
  if (body.externalId != null) mutation.externalId = body.externalId;
  if (typeof body.active === 'boolean') mutation.isActive = body.active;
  const role = roleFromScim(body.roles);
  if (role) mutation.role = role;
  return mutation;
}

type ScimPatchOp = { op?: string; path?: string; value?: unknown };

/**
 * Translate a SCIM PatchOp document into a user mutation. Supports the
 * operations IdPs actually send: toggling `active` (deprovisioning), updating
 * emails/userName, and role changes. Both `path`-scoped and value-object forms.
 */
export function mutationFromScimPatch(body: { Operations?: ScimPatchOp[] }): UserMutation {
  const mutation: UserMutation = {};
  for (const op of body.Operations ?? []) {
    const kind = (op.op ?? '').toLowerCase();
    if (kind === 'remove') {
      if ((op.path ?? '').toLowerCase() === 'active') mutation.isActive = false;
      continue;
    }
    // add / replace
    const path = (op.path ?? '').toLowerCase();
    if (path === 'active') {
      mutation.isActive = op.value === true || op.value === 'true';
    } else if (path === 'username' || path === 'emails' || path === 'emails[type eq "work"].value') {
      const v = typeof op.value === 'string' ? op.value : (op.value as any)?.[0]?.value;
      if (typeof v === 'string' && v.includes('@')) mutation.email = v.trim().toLowerCase();
    } else if (path === 'roles') {
      const role = roleFromScim(op.value);
      if (role) mutation.role = role;
    } else if (!op.path && op.value && typeof op.value === 'object') {
      // Value-object form: { op:'replace', value:{ active:false, ... } }
      Object.assign(mutation, mutationFromScimBody(op.value as ScimUserInput));
    }
  }
  return mutation;
}

/** Parse a minimal SCIM filter — `userName eq "value"` — used by list/upsert. */
export function parseUserNameFilter(filter: string | null | undefined): string | null {
  if (!filter) return null;
  const m = /userName\s+eq\s+"([^"]+)"/i.exec(filter);
  return m ? m[1].trim().toLowerCase() : null;
}
