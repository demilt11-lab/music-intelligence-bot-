/**
 * Tests for the SCIM 2.0 <-> TenantUser mapping (lib/auth/scim/user.ts). These
 * cover the wire-format contract Okta/Entra rely on: serialization, create/
 * replace parsing, the PATCH shapes IdPs actually send (especially the
 * `active=false` deprovisioning op), and the userName filter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toScimUser,
  mutationFromScimBody,
  mutationFromScimPatch,
  parseUserNameFilter,
  roleFromScim,
  emailFromScim,
} from '@/lib/auth/scim/user';
import type { TenantUser } from '@prisma/client';

const user: TenantUser = {
  id: 7,
  tenantId: 3,
  email: 'analyst@acme.com',
  role: 'ANALYST',
  passwordHash: null,
  externalId: 'ext-99',
  isActive: true,
  ssoConnectionId: null,
  provisionedVia: 'scim',
  createdAt: new Date(),
  updatedAt: new Date(),
};

test('toScimUser emits a spec-shaped resource', () => {
  const r = toScimUser(user, 'https://app.example') as any;
  assert.deepEqual(r.schemas, ['urn:ietf:params:scim:schemas:core:2.0:User']);
  assert.equal(r.id, '7');
  assert.equal(r.userName, 'analyst@acme.com');
  assert.equal(r.active, true);
  assert.equal(r.externalId, 'ext-99');
  assert.equal(r.emails[0].value, 'analyst@acme.com');
  assert.equal(r.meta.location, 'https://app.example/api/scim/v2/Users/7');
});

test('emailFromScim prefers userName, falls back to primary email, lowercases', () => {
  assert.equal(emailFromScim({ userName: 'A@B.com' }), 'a@b.com');
  assert.equal(
    emailFromScim({ emails: [{ value: 'x@y.com' }, { value: 'p@q.com', primary: true }] }),
    'p@q.com',
  );
  assert.equal(emailFromScim({ userName: 'not-an-email', emails: [{ value: 'z@w.com' }] }), 'z@w.com');
});

test('mutationFromScimBody extracts email, externalId, active, role', () => {
  const m = mutationFromScimBody({
    userName: 'New@Acme.com',
    externalId: 'ext-1',
    active: false,
    roles: [{ value: 'admin' }],
  });
  assert.equal(m.email, 'new@acme.com');
  assert.equal(m.externalId, 'ext-1');
  assert.equal(m.isActive, false);
  assert.equal(m.role, 'ADMIN');
});

test('roleFromScim only accepts the known roles', () => {
  assert.equal(roleFromScim([{ value: 'VIEWER' }]), 'VIEWER');
  assert.equal(roleFromScim(['ANALYST']), 'ANALYST');
  assert.equal(roleFromScim([{ value: 'superuser' }]), undefined);
  assert.equal(roleFromScim([]), undefined);
});

test('PATCH: path-scoped active=false is a deprovision (Okta shape)', () => {
  const m = mutationFromScimPatch({
    Operations: [{ op: 'replace', path: 'active', value: false }],
  } as any);
  assert.equal(m.isActive, false);
});

test('PATCH: value-object replace (Entra shape) is understood', () => {
  const m = mutationFromScimPatch({
    Operations: [{ op: 'replace', value: { active: false } }],
  } as any);
  assert.equal(m.isActive, false);
});

test('PATCH: string "true"/"false" active values are coerced', () => {
  assert.equal(mutationFromScimPatch({ Operations: [{ op: 'replace', path: 'active', value: 'false' }] } as any).isActive, false);
  assert.equal(mutationFromScimPatch({ Operations: [{ op: 'replace', path: 'active', value: 'true' }] } as any).isActive, true);
});

test('PATCH: userName change updates email', () => {
  const m = mutationFromScimPatch({
    Operations: [{ op: 'replace', path: 'userName', value: 'Renamed@Acme.com' }],
  } as any);
  assert.equal(m.email, 'renamed@acme.com');
});

test('parseUserNameFilter extracts the value from `userName eq "x"`', () => {
  assert.equal(parseUserNameFilter('userName eq "User@Acme.com"'), 'user@acme.com');
  assert.equal(parseUserNameFilter('displayName eq "x"'), null);
  assert.equal(parseUserNameFilter(null), null);
});
