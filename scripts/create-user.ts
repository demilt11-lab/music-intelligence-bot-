// scripts/create-user.ts
//
// Provision a workspace user for the web UI.
// Usage: npx tsx scripts/create-user.ts <email> <password> [role] [tenantSlug]
//   role:       ADMIN | ANALYST | VIEWER   (default ANALYST)
//   tenantSlug: defaults to UI_TENANT_SLUG or "workspace"
import 'dotenv/config';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';

async function main() {
  const [email, password, roleArg, slugArg] = process.argv.slice(2);

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/create-user.ts <email> <password> [ADMIN|ANALYST|VIEWER] [tenantSlug]');
    process.exit(1);
  }

  const role = (roleArg ?? 'ANALYST').toUpperCase();
  if (!['ADMIN', 'ANALYST', 'VIEWER'].includes(role)) {
    console.error(`Invalid role "${roleArg}". Use ADMIN, ANALYST, or VIEWER.`);
    process.exit(1);
  }

  const slug = slugArg ?? process.env.UI_TENANT_SLUG ?? 'workspace';
  const tenant = await db.tenant.upsert({
    where: { slug },
    update: {},
    create: { name: 'Workspace', slug, environment: 'PROD' },
  });

  const passwordHash = hashPassword(password);

  const user = await db.tenantUser.upsert({
    where: {
      tenantId_email: { tenantId: tenant.id, email: email.toLowerCase() },
    },
    update: { role: role as 'ADMIN' | 'ANALYST' | 'VIEWER', passwordHash },
    create: {
      tenantId: tenant.id,
      email: email.toLowerCase(),
      role: role as 'ADMIN' | 'ANALYST' | 'VIEWER',
      passwordHash,
    },
  });

  console.log(`✓ User ready: ${user.email} (${user.role}) on tenant "${slug}"`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
