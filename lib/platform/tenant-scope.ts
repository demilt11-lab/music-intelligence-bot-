// lib/platform/tenant-scope.ts
//
// The single choke point for tenant scoping. Every tenant-owned query should
// build its `where` through `tenantScopedWhere` so that:
//
//   1. the tenant id is validated (a missing/garbage tenant fails closed, loudly,
//      instead of silently querying across every tenant), and
//   2. a caller can never *override* the scope — any `tenantId` a caller passes
//      in the where object must match the authoritative one, or the query is
//      rejected.
//
// The previous implementation (`{ tenantId: ctx.tenantId, ...where }`) had the
// spread in the wrong order: a `where.tenantId` would have shadowed the scoped
// id, turning the "helper" into an escape hatch. This version forces the scoped
// id to win and rejects the ambiguous input outright.
import type { RequestContext } from './context';

/** Anything we can pull an authoritative tenant id from. */
type TenantSource = number | Pick<RequestContext, 'tenantId'>;

function resolveTenantId(source: TenantSource): number {
  const tenantId = typeof source === 'number' ? source : source?.tenantId;
  if (
    typeof tenantId !== 'number' ||
    !Number.isInteger(tenantId) ||
    tenantId <= 0
  ) {
    const err: any = new Error(
      `Refusing to build an unscoped query: invalid tenantId (${String(tenantId)})`,
    );
    err.status = 500;
    throw err;
  }
  return tenantId;
}

/**
 * Build a Prisma `where` clause scoped to a single tenant.
 *
 * The scoped `tenantId` always wins: if the caller's `where` also carries a
 * `tenantId`, it must match the authoritative one, otherwise this throws (an
 * attempt to read/write another tenant's rows is a bug or an attack, never a
 * silent no-op).
 */
export function tenantScopedWhere<T extends Record<string, any>>(
  source: TenantSource,
  where: T = {} as T,
): T & { tenantId: number } {
  const tenantId = resolveTenantId(source);

  if ('tenantId' in where && where.tenantId !== tenantId) {
    const err: any = new Error(
      `Cross-tenant query blocked: where.tenantId=${String(
        where.tenantId,
      )} does not match scoped tenantId=${tenantId}`,
    );
    err.status = 403;
    throw err;
  }

  // Enforced id is written last so it can never be shadowed by the spread.
  return { ...where, tenantId };
}

/**
 * Defense in depth for fetch-then-use code paths that can't express the scope
 * in the query itself: assert a row we already loaded actually belongs to the
 * acting tenant before returning or mutating it.
 */
export function assertOwnedByTenant<T extends { tenantId: number }>(
  source: TenantSource,
  row: T | null | undefined,
): T | null {
  if (!row) return null;
  const tenantId = resolveTenantId(source);
  if (row.tenantId !== tenantId) {
    const err: any = new Error('Resource not found');
    err.status = 404; // do not leak that the row exists under another tenant
    throw err;
  }
  return row;
}
