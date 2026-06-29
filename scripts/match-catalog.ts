// scripts/match-catalog.ts
import { db as prisma } from '@/lib/db';
import { matchTenantCatalogToCanonicalTracks } from '@/lib/catalog/matcher';

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
