// scripts/create-tenant.ts
import { db as prisma } from '@/lib/db';
import crypto from 'crypto';

function generateApiKey(): { raw: string; hash: string } {
  const raw = `mi_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

async function main() {
  const name = process.argv[2];
  const slug = process.argv[3];
  const label = process.argv[4] ?? 'Default API key';
  const scopes =
    process.argv[5] ??
    'search:read,tracks:read,tracks:charts:read,tracks:radio:read,catalog:write';

  if (!name || !slug) {
    console.error(
      'Usage: ts-node scripts/create-tenant.ts "<Tenant Name>" <slug> [label] [scopes]',
    );
    process.exit(1);
  }

  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
    },
  });

  const { raw, hash } = generateApiKey();

  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      keyHash: hash,
      label,
      scopes,
    },
  });

  console.log('Tenant created:');
  console.log(`  id:   ${tenant.id}`);
  console.log(`  name: ${tenant.name}`);
  console.log(`  slug: ${tenant.slug}`);
  console.log('');
  console.log('API key (save this now, it is only shown once):');
  console.log(`  ${raw}`);
  console.log('');
  console.log('Scopes:');
  console.log(`  ${scopes}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
