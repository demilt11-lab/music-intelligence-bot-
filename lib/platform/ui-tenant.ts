// lib/platform/ui-tenant.ts
//
// Tenant resolution for the first-party web UI. The product UI is a single
// workspace (no end-user login yet), so UI routes operate against one tenant
// resolved server-side. This keeps tenant API keys out of the browser bundle
// entirely — the public v1 API remains key-authenticated for integrations.
import { db } from '@/lib/db';

const UI_TENANT_SLUG = process.env.UI_TENANT_SLUG ?? 'workspace';

let cachedTenantId: number | null = null;

export async function getUiTenantId(): Promise<number> {
  if (cachedTenantId != null) return cachedTenantId;

  const tenant = await db.tenant.upsert({
    where: { slug: UI_TENANT_SLUG },
    update: {},
    create: {
      name: 'Workspace',
      slug: UI_TENANT_SLUG,
      environment: 'PROD',
    },
  });

  cachedTenantId = tenant.id;
  return tenant.id;
}
