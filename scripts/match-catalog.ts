// scripts/match-catalog.ts
import { PrismaClient } from '@prisma/client';
import { matchTenantCatalogToCanonicalTracks } from '@/lib/catalog/matcher';

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany();

  for (const tenant of tenants) {
    await matchTenantCatalogToCanonicalTracks({
      tenantId: tenant.id,
      batchSize: 200,
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
