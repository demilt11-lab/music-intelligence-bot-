// lib/platform/tenant-scope.ts
import type { RequestContext } from './context';

type TenantScopedWhere = { tenantId: number } & Record<string, any>;

// helper to ensure tenantId is always applied in queries
export function tenantWhere(
  ctx: RequestContext,
  where: Record<string, any>,
): TenantScopedWhere {
  return { tenantId: ctx.tenantId, ...where };
}
