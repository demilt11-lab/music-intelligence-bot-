// scripts/cleanup-markdown-names.ts
//
// Remediates artist/track rows whose name/title leaked raw markdown, image
// syntax, or share-link fragments from the Billboard scraper (see BUG-001).
//
// Strategy per row:
//   1. Salvage — if the name strips down to a clean value (e.g. "[Drake](url)"
//      → "Drake"), UPDATE it in place.
//   2. Delete  — if nothing usable remains AND the row is a scraper stub (no
//      external platform IDs), remove it. Cascades clean up junction rows.
//
// Safe by default: runs as a DRY RUN and only reports. Pass `--apply` to write.
//
//   npx tsx scripts/cleanup-markdown-names.ts            # report only
//   npx tsx scripts/cleanup-markdown-names.ts --apply    # perform changes

import { db } from '@/lib/db';
import {
  looksLikeMarkdownJunk,
  sanitizeNameForStorage,
} from '@/lib/shared/text';

const APPLY = process.argv.includes('--apply');

type Counts = { salvaged: number; deleted: number; skipped: number };

function log(line: string): void {
  console.log(`[cleanup]${APPLY ? '' : ' (dry-run)'} ${line}`);
}

async function cleanupArtists(): Promise<Counts> {
  const counts: Counts = { salvaged: 0, deleted: 0, skipped: 0 };

  // Candidate junk rows: name carries a link/image fragment or a bare URL.
  const suspects = await db.artist.findMany({
    where: {
      OR: [
        { name: { contains: '](' } },
        { name: { contains: '![' } },
        { name: { contains: 'http' } },
      ],
    },
    include: { _count: { select: { externalIds: true } } },
  });

  for (const a of suspects) {
    if (!looksLikeMarkdownJunk(a.name)) continue; // false positive, leave it

    const salvaged = sanitizeNameForStorage(a.name);
    if (salvaged) {
      log(`artist ${a.id}: salvage ${JSON.stringify(a.name)} → ${JSON.stringify(salvaged)}`);
      if (APPLY) await db.artist.update({ where: { id: a.id }, data: { name: salvaged } });
      counts.salvaged++;
    } else if (a._count.externalIds === 0) {
      log(`artist ${a.id}: delete stub ${JSON.stringify(a.name)}`);
      if (APPLY) await db.artist.delete({ where: { id: a.id } });
      counts.deleted++;
    } else {
      // Has real platform IDs but an unsalvageable name — flag, don't delete.
      log(`artist ${a.id}: SKIP (has external IDs, unsalvageable name) ${JSON.stringify(a.name)}`);
      counts.skipped++;
    }
  }

  return counts;
}

async function cleanupTracks(): Promise<Counts> {
  const counts: Counts = { salvaged: 0, deleted: 0, skipped: 0 };

  const suspects = await db.track.findMany({
    where: {
      OR: [
        { title: { contains: '](' } },
        { title: { contains: '![' } },
        { title: { contains: 'http' } },
      ],
    },
    include: { externalIds: { select: { platform: true } } },
  });

  for (const t of suspects) {
    if (!looksLikeMarkdownJunk(t.title)) continue;

    const salvaged = sanitizeNameForStorage(t.title);
    const isStub = t.externalIds.every((e) => e.platform === 'billboard');

    if (salvaged) {
      log(`track ${t.id}: salvage ${JSON.stringify(t.title)} → ${JSON.stringify(salvaged)}`);
      if (APPLY) await db.track.update({ where: { id: t.id }, data: { title: salvaged } });
      counts.salvaged++;
    } else if (isStub) {
      log(`track ${t.id}: delete stub ${JSON.stringify(t.title)}`);
      if (APPLY) await db.track.delete({ where: { id: t.id } });
      counts.deleted++;
    } else {
      log(`track ${t.id}: SKIP (has external IDs, unsalvageable title) ${JSON.stringify(t.title)}`);
      counts.skipped++;
    }
  }

  return counts;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('Missing required env var: DATABASE_URL');

  log('scanning for markdown-corrupted artist & track names…');

  const artists = await cleanupArtists();
  const tracks = await cleanupTracks();

  log(
    `artists — salvaged ${artists.salvaged}, deleted ${artists.deleted}, skipped ${artists.skipped}`,
  );
  log(
    `tracks  — salvaged ${tracks.salvaged}, deleted ${tracks.deleted}, skipped ${tracks.skipped}`,
  );

  if (!APPLY) {
    log('no changes written. Re-run with --apply to perform the cleanup.');
  } else {
    log('cleanup complete.');
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error('[cleanup] Fatal error:', err);
  process.exit(1);
});
