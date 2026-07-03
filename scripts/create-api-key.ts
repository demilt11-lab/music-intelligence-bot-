// scripts/create-api-key.ts
import { db as prisma } from '@/lib/db';
import crypto from 'crypto';

function generateApiKey(): { raw: string; hash: string } {
  const raw = `mi_${crypto.randomBytes(32).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

async function main() {
  const tenantIdArg = process.argv[2];
  const label = process.argv[3] ?? 'API key';
  const scopes =
    process.argv[4] ??
    'search:read,tracks:read,tracks:charts:read,tracks:radio:read,catalog:write';

  if (!tenantIdArg) {
    console.error(
      'Usage: npx tsx scripts/create-api-key.ts <tenantId> [label] [scopes]',
    );
    process.exit(1);
  }

  const tenantId = Number(tenantIdArg);
  if (!Number.isFinite(tenantId)) {
    console.error('Invalid tenantId');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    console.error(`Tenant ${tenantId} not found`);
    process.exit(1);
  }

  const { raw, hash } = generateApiKey();

  const key = await prisma.apiKey.create({
    data: {
      tenantId,
      keyHash: hash,
      label,
      scopes,
    },
  });

  console.log('API key created:');
  console.log(`  id:        ${key.id}`);
  console.log(`  tenantId:  ${tenantId}`);
  console.log(`  label:     ${label}`);
  console.log(`  scopes:    ${scopes}`);
  console.log('');
  console.log('Raw API key (save now, only shown once):');
  console.log(`  ${raw}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
