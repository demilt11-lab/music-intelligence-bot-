import 'dotenv/config';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { E2E_EMAIL, E2E_PASSWORD, E2E_TENANT_SLUG } from './fixtures';

export default async function globalSetup() {
  const tenant = await db.tenant.upsert({
    where: { slug: E2E_TENANT_SLUG },
    update: {},
    create: { name: 'Workspace', slug: E2E_TENANT_SLUG, environment: 'PROD' },
  });

  await db.tenantUser.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: E2E_EMAIL } },
    update: { passwordHash: hashPassword(E2E_PASSWORD), role: 'ADMIN' },
    create: {
      tenantId: tenant.id,
      email: E2E_EMAIL,
      role: 'ADMIN',
      passwordHash: hashPassword(E2E_PASSWORD),
    },
  });

  await db.$disconnect();
}
