// scripts/ensure-baseline.ts
//
// Makes `prisma migrate deploy` safe on a database that was historically
// managed by `prisma db push`: when the schema already exists but the
// squashed baseline migration isn't recorded, mark it applied (resolve).
//
//   - Fresh/empty database  → do nothing (migrate deploy creates everything)
//   - db-push-managed DB    → resolve the baseline once, then deploy works
//   - Already-migrated DB   → do nothing (idempotent)
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { db } from '@/lib/db';

const BASELINE = '20260611000000_baseline';

async function main() {
  const [{ has_schema }] = await db.$queryRawUnsafe<[{ has_schema: boolean }]>(
    `SELECT to_regclass('public.tracks') IS NOT NULL AS has_schema`,
  );

  if (!has_schema) {
    console.log('[ensure-baseline] Fresh database — migrate deploy will create the schema.');
    return;
  }

  // Check the migrations table exists before querying it — its absence is
  // the signature of a db-push-managed database, not an error.
  const [{ has_migrations }] = await db.$queryRawUnsafe<[{ has_migrations: boolean }]>(
    `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_migrations`,
  );

  let baselineRecorded = false;
  if (has_migrations) {
    const rows = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM _prisma_migrations
       WHERE migration_name = '${BASELINE}' AND finished_at IS NOT NULL`,
    );
    baselineRecorded = (rows[0]?.n ?? 0) > 0;
  }

  if (baselineRecorded) {
    console.log('[ensure-baseline] Baseline already recorded — nothing to do.');
    return;
  }

  console.log(
    '[ensure-baseline] Schema exists but baseline is unrecorded (db-push history). ' +
      `Resolving ${BASELINE} as applied…`,
  );
  execSync(`npx prisma migrate resolve --applied ${BASELINE}`, { stdio: 'inherit' });
  console.log('[ensure-baseline] Baseline resolved.');
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
