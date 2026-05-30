// scripts/match-catalog.ts
import { PrismaClient } from '@prisma/client';
import { matchTenantCatalogToCanonicalTracks } from '@/lib/catalog/matcher';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany();
  for (const tenant of tenants) {
    await matchTenantCatalogToCanonicalTracks({ tenantId: tenant.id });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
