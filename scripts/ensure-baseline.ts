// scripts/ensure-baseline.ts
//
// Makes `prisma migrate deploy` safe regardless of how the database was
// previously managed:
//
//   1. Fresh/empty database        → no-op (migrate deploy creates everything)
//   2. Already-migrated database   → no-op (baseline recorded)
//   3. db-push DB, CURRENT schema  → record the baseline, deploy is a no-op
//   4. db-push DB, LEGACY schema   → catch up first: dedupe trajectory
//      snapshots (the unique index requires it), `prisma db push` to align
//      the schema, then record the baseline.
//
// State 4 is detected via a new-schema sentinel (the sessions table): a DB
// with `tracks` but without `sessions` predates the auth/observability
// migration and must not have the baseline resolved blindly — that would
// mark changes as applied that the database never received.
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { db } from '@/lib/db';

// Prisma CLI subcommands need DIRECT_URL resolvable; fall back to the
// pooled URL when a caller only provides DATABASE_URL.
const childEnv = {
  ...process.env,
  DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL,
};

const BASELINE = '20260611000000_baseline';

async function tableExists(name: string): Promise<boolean> {
  // Quote the identifier — mixed-case tables (ArtistTrajectorySnapshot) are
  // invisible to to_regclass otherwise.
  const [{ exists }] = await db.$queryRawUnsafe<[{ exists: boolean }]>(
    `SELECT to_regclass('public."${name}"') IS NOT NULL AS exists`,
  );
  return exists;
}

async function main() {
  if (!(await tableExists('tracks'))) {
    console.log('[ensure-baseline] Fresh database — migrate deploy will create the schema.');
    return;
  }

  let baselineRecorded = false;
  if (await tableExists('_prisma_migrations')) {
    const rows = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM _prisma_migrations
       WHERE migration_name = '${BASELINE}' AND finished_at IS NOT NULL`,
    );
    baselineRecorded = (rows[0]?.n ?? 0) > 0;
  }

  const schemaIsCurrent = await tableExists('sessions');

  if (baselineRecorded && schemaIsCurrent) {
    console.log('[ensure-baseline] Baseline recorded and schema current — nothing to do.');
    return;
  }

  // NOTE: a recorded baseline with a legacy schema means a previous resolve
  // ran against a database that never received the changes — fall through
  // to the catch-up so the schema matches what the record claims.
  if (!schemaIsCurrent) {
    console.log(
      '[ensure-baseline] Legacy db-push schema detected (no sessions table). ' +
        'Catching the database up before recording the baseline…',
    );

    // The baseline's unique index on (artistId, date) requires deduping any
    // historical duplicate snapshots first.
    if (await tableExists('ArtistTrajectorySnapshot')) {
      const result = await db.$executeRawUnsafe(`
        DELETE FROM "ArtistTrajectorySnapshot" a
        USING "ArtistTrajectorySnapshot" b
        WHERE a."artistId" = b."artistId"
          AND a."date" = b."date"
          AND a."id" < b."id"
      `);
      console.log(`[ensure-baseline] Deduped ${result} duplicate trajectory snapshot(s).`);

      // Create the unique index ourselves (post-dedupe) so the subsequent
      // db push sees it in place and raises no data-loss warning — keeping
      // --accept-data-loss permanently out of automated workflows.
      await db.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS "ArtistTrajectorySnapshot_artistId_date_key"
        ON "ArtistTrajectorySnapshot"("artistId", "date")
      `);
      console.log('[ensure-baseline] Unique (artistId, date) index ensured.');
    }

    // Additive schema catch-up. db push aborts on destructive changes, which
    // is exactly the safety we want against a production database.
    execSync('npx prisma db push --skip-generate', { stdio: 'inherit', env: childEnv });
    console.log('[ensure-baseline] Schema caught up via db push.');
  }

  if (!baselineRecorded) {
    console.log(`[ensure-baseline] Recording ${BASELINE} as applied…`);
    execSync(`npx prisma migrate resolve --applied ${BASELINE}`, { stdio: 'inherit', env: childEnv });
    console.log('[ensure-baseline] Baseline resolved.');
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
