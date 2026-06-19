// scripts/clean_junk_tracks.ts
//
// Guarded cleanup of scraped non-song rows in the `tracks` catalog (chart/
// calendar fragments like "WEEKS", "PEAK", "1 | 3 | 4 | …", "June 2026").
//
//   DATABASE_URL=... npx tsx scripts/clean_junk_tracks.ts             # DRY RUN (default)
//   DATABASE_URL=... CONFIRM_DELETE=1 npx tsx scripts/clean_junk_tracks.ts   # actually delete
//
// Safety:
//   • DRY RUN is the default. It prints every candidate and then performs the
//     DELETE inside a transaction that is ROLLED BACK — so it verifies the
//     cascade actually works (no FK blocks) without persisting anything.
//   • Deletion criteria are conservative: a row is junk only if it has NO real
//     identifier (isrc AND iswc are null) AND its title has an obvious non-song
//     shape. Anything with an ISRC/ISWC is never touched.
//   • APPLY mode prints the full list of rows being removed (recovery record in
//     the run log) before deleting, inside a single transaction.
//
// Deleting a track cascades to its child rows (stats, playlist events, etc.).

export {} // mark as a module (dynamic db import below means no top-level import)

const APPLY = process.env.CONFIRM_DELETE === '1' || process.argv.includes('--apply')
const SAMPLE = 100

// A row is junk only when it has no real identifier AND a non-song title shape.
const JUNK_WHERE = `
  t.isrc IS NULL AND t.iswc IS NULL AND (
    t.title ~ '^[[:space:][:digit:][:punct:]]+$'                       -- no letters at all
    OR t.title LIKE '%|%'                                              -- pipe-delimited scrape fragment
    OR upper(btrim(t.title)) IN
       ('WEEKS','PEAK','LAST WEEK','THIS WEEK','WKS','LW','TW','POS','POSITION','RANK')
    OR t.title ~* '^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\s+[0-9]{4}$'  -- "June 2026"
  )
`

type JunkRow = {
  id: number
  title: string
  isrc: string | null
  artists: string | null
  ext_ids: number | bigint
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('✗ DATABASE_URL is not set — aborting (this script only runs against a DB).')
    process.exit(1)
  }

  const { db } = await import('@/lib/db')
  try {
    await run(db)
  } finally {
    await db.$disconnect()
  }
}

async function run(db: typeof import('@/lib/db').db) {
  const [{ total }] = await db.$queryRawUnsafe<{ total: bigint }[]>(
    `SELECT COUNT(*)::bigint AS total FROM tracks`,
  )
  const [{ junk }] = await db.$queryRawUnsafe<{ junk: bigint }[]>(
    `SELECT COUNT(*)::bigint AS junk FROM tracks t WHERE ${JUNK_WHERE}`,
  )

  const rows = await db.$queryRawUnsafe<JunkRow[]>(`
    SELECT
      t.id, t.title, t.isrc,
      (SELECT string_agg(a.name, ', ')
         FROM track_artists ta JOIN artists a ON a.id = ta."artistId"
        WHERE ta."trackId" = t.id) AS artists,
      (SELECT COUNT(*) FROM external_ids e
        WHERE e."entityType" = 'track' AND e."entityId" = t.id) AS ext_ids
    FROM tracks t
    WHERE ${JUNK_WHERE}
    ORDER BY t.id
    LIMIT ${SAMPLE}
  `)

  const junkCount = Number(junk)
  const withIds = rows.filter((r) => Number(r.ext_ids) > 0).length

  console.log('')
  console.log('═'.repeat(78))
  console.log(`  🧹  JUNK CATALOG CLEANUP — ${APPLY ? 'APPLY (will delete)' : 'DRY RUN'}`)
  console.log('═'.repeat(78))
  console.log(`  Catalog total: ${Number(total)} tracks`)
  console.log(`  Junk candidates (no isrc/iswc + non-song title): ${junkCount}`)
  console.log(`  …of the ${rows.length} shown, ${withIds} have external IDs (expected: 0)`)
  console.log('─'.repeat(78))
  rows.forEach((r) => {
    const title = JSON.stringify(r.title)
    console.log(`  #${r.id}  ${title}  — artists: ${r.artists ?? '∅'}  extIds:${Number(r.ext_ids)}`)
  })
  if (junkCount > rows.length) {
    console.log(`  … and ${junkCount - rows.length} more (showing first ${SAMPLE}).`)
  }
  console.log('')

  if (junkCount === 0) {
    console.log('  Nothing to clean. ✅')
    return
  }

  if (!APPLY) {
    // Exercise the cascade in a transaction, then roll back — verifies the
    // delete will succeed (no FK restriction) without persisting anything.
    const ROLLBACK = Symbol('rollback')
    let deleted = 0
    try {
      await db.$transaction(async (tx) => {
        deleted = await tx.$executeRawUnsafe(`DELETE FROM tracks AS t WHERE ${JUNK_WHERE}`)
        throw ROLLBACK
      })
    } catch (e) {
      if (e !== ROLLBACK) {
        console.error('  ✗ DRY RUN delete failed (likely a non-cascading FK):')
        console.error(`    ${(e as Error).message}`)
        process.exit(1)
      }
    }
    console.log(`  DRY RUN: would delete ${deleted} track(s) (cascade verified, transaction rolled back).`)
    console.log('  Re-run with CONFIRM_DELETE=1 to apply.')
    return
  }

  // APPLY: log the full set being removed (recovery record), then delete.
  const allDeleted = await db.$queryRawUnsafe<{ id: number; title: string; artists: string | null }[]>(`
    SELECT t.id, t.title,
      (SELECT string_agg(a.name, ', ')
         FROM track_artists ta JOIN artists a ON a.id = ta."artistId"
        WHERE ta."trackId" = t.id) AS artists
    FROM tracks t WHERE ${JUNK_WHERE} ORDER BY t.id
  `)
  console.log('  Removing (recovery record):')
  console.log(JSON.stringify(allDeleted, null, 0))

  const deleted = await db.$transaction(async (tx) =>
    tx.$executeRawUnsafe(`DELETE FROM tracks AS t WHERE ${JUNK_WHERE}`),
  )
  console.log('')
  console.log(`  ✅ Deleted ${deleted} junk track(s) (child rows cascaded).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
