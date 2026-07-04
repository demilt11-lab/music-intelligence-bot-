import 'dotenv/config';
import { db } from '@/lib/db';
import { E2E_EMAIL } from './fixtures';

export default async function globalTeardown() {
  const user = await db.tenantUser.findFirst({ where: { email: E2E_EMAIL } });
  if (user) {
    await db.session.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await db.tenantUser.delete({ where: { id: user.id } }).catch(() => {});
  }
  await db.$disconnect();
}
