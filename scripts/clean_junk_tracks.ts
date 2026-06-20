// scripts/clean_junk_tracks.ts
//
// Guarded cleanup of scraped non-song rows in the `tracks` catalog (chart/
// calendar fragments like "WEEKS", "PEAK", "1 | 3 | 4 | …", "June 2026").
//
//   DATABASE_URL=... npx tsx scripts/clean_junk_tracks.ts             # DRY RUN (default)
//   DATABASE_URL=... CONFIRM_DELETE=1 npx tsx scripts/clean_junk_tracks.ts   # actually delete
//
// Safety:
//   • DRY RUN is the default — it prints every candidate plus the exact
//     cascade blast radius (child-row counts) and deletes NOTHING.
//   • Deletion criteria are conservative: a row is junk only if it has NO real
//     identifier (isrc AND iswc are null) AND its title has an obvious non-song
//     shape. Anything with an ISRC/ISWC is never touched.
//   • APPLY prints the full list being removed (recovery record in the run log),
//     then runs a single atomic DELETE. Deleting a track cascades to its child
//     rows; if any FK is non-cascading the DELETE fails as a whole (no partial
//     deletion) and reports the constraint.
//
// Uses only single-statement queries, so it works over the connection pooler.

export {} // module marker (db is imported dynamically below)

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
    console.log(`  #${r.id}  ${JSON.stringify(r.title)}  — artists: ${r.artists ?? '∅'}  extIds:${Number(r.ext_ids)}`)
  })
  if (junkCount > rows.length) {
    console.log(`  … and ${junkCount - rows.length} more (showing first ${SAMPLE}).`)
  }

  if (junkCount === 0) {
    console.log('')
    console.log('  Nothing to clean. ✅')
    return
  }

  // Cascade blast radius — child rows that would be removed along with the tracks.
  const [bl] = await db.$queryRawUnsafe<Record<string, bigint>[]>(`
    WITH junk AS (SELECT t.id FROM tracks t WHERE ${JUNK_WHERE})
    SELECT
      (SELECT COUNT(*) FROM track_platform_stats_daily x WHERE x."trackId" IN (SELECT id FROM junk)) AS stats_daily,
      (SELECT COUNT(*) FROM playlist_membership_events  x WHERE x."trackId" IN (SELECT id FROM junk)) AS membership_events,
      (SELECT COUNT(*) FROM playlist_tracks             x WHERE x."trackId" IN (SELECT id FROM junk)) AS playlist_tracks,
      (SELECT COUNT(*) FROM track_artists               x WHERE x."trackId" IN (SELECT id FROM junk)) AS track_artists,
      (SELECT COUNT(*) FROM chart_rows                  x WHERE x."trackId" IN (SELECT id FROM junk)) AS chart_rows,
      (SELECT COUNT(*) FROM external_ids                x WHERE x."entityType"='track' AND x."entityId" IN (SELECT id FROM junk)) AS external_ids
  `)
  console.log('')
  console.log('  Cascade blast radius (child rows removed with these tracks):')
  for (const [k, v] of Object.entries(bl)) console.log(`     ${k}: ${Number(v)}`)
  console.log('')

  if (!APPLY) {
    console.log(`  DRY RUN — would delete ${junkCount} track(s) and the child rows above. Nothing changed.`)
    console.log('  Re-run with apply=true (CONFIRM_DELETE=1) to delete.')
    return
  }

  // APPLY: log the full set being removed (recovery record), then atomic delete.
  const allDeleted = await db.$queryRawUnsafe<{ id: number; title: string; artists: string | null }[]>(`
    SELECT t.id, t.title,
      (SELECT string_agg(a.name, ', ')
         FROM track_artists ta JOIN artists a ON a.id = ta."artistId"
        WHERE ta."trackId" = t.id) AS artists
    FROM tracks t WHERE ${JUNK_WHERE} ORDER BY t.id
  `)
  console.log('  Removing (recovery record):')
  console.log(JSON.stringify(allDeleted))

  const deleted = await db.$executeRawUnsafe(`DELETE FROM tracks AS t WHERE ${JUNK_WHERE}`)
  console.log('')
  console.log(`  ✅ Deleted ${deleted} junk track(s) (child rows cascaded).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
