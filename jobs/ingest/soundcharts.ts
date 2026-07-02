/**
 * Soundcharts ingestion job
 *
 * Fills the two DSP data gaps the first-party crawlers can't reach:
 *   1. Apple Music + Amazon Music playlist placements per track
 *      → playlists / curators / playlist_tracks / playlist_membership_events
 *        (which feed the artist daily-stats rollup and the directory APIs)
 *   2. Artist listener + follower time series (Spotify monthly listeners)
 *      → artist_daily_stats.totalListeners / totalFollowers / platformListeners
 *        and track_statistics_latest.spotifyMonthlyListeners
 *        (which feed trajectory snapshots and the ML feature extractors)
 *
 * Entity resolution is cached in external_ids (platform='soundcharts') so
 * each track/artist is resolved against the Soundcharts API only once.
 * Per-run budgets keep the job inside a predictable API quota; every entity
 * is fail-soft (one bad track/artist never kills the run).
 *
 * Run: npx tsx jobs/ingest/soundcharts.ts
 *
 * Required env vars:
 *   DATABASE_URL
 *   SOUNDCHARTS_APP_ID
 *   SOUNDCHARTS_API_KEY
 * Optional env vars (per-run budgets):
 *   SOUNDCHARTS_RESOLVE_BUDGET          — new track resolutions/run (default 100)
 *   SOUNDCHARTS_PLAYLIST_SONG_BUDGET    — tracks scanned for playlists/run (default 150)
 *   SOUNDCHARTS_ARTIST_BUDGET           — artists refreshed/run (default 75)
 */

import { db } from '@/lib/db';
import { runTrackedJob } from '@/lib/jobs/tracker';
import { createSoundchartsConnector } from '@/lib/integrations/soundcharts';
import {
  PLAYLIST_PLATFORMS,
  toCanonicalPlatform,
  unwrapItems,
  extractUuid,
  normalizePlaylistEntry,
  diffTrackPlaylistMembership,
  normalizeListenerPoint,
  latestListenerPoint,
  type NormalizedPlaylistEntry,
  type ListenerPoint,
} from '@/lib/integrations/soundcharts/ingest-mapping';

// ─── Config ───────────────────────────────────────────────────────────────────

const RESOLVE_BUDGET = intEnv('SOUNDCHARTS_RESOLVE_BUDGET', 100);
const PLAYLIST_SONG_BUDGET = intEnv('SOUNDCHARTS_PLAYLIST_SONG_BUDGET', 150);
const ARTIST_BUDGET = intEnv('SOUNDCHARTS_ARTIST_BUDGET', 75);
const API_DELAY_MS = 250;
const LISTENER_WINDOW_DAYS = 30;

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function utcDateOnly(d: Date = new Date()): Date {
  return new Date(`${d.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

const stats = {
  songsResolved: 0,
  songsUnmatched: 0,
  artistsResolved: 0,
  artistsUnmatched: 0,
  playlistsUpserted: 0,
  curatorsUpserted: 0,
  membershipEventsCreated: 0,
  listenerDaysWritten: 0,
  trackListenerStatsUpdated: 0,
  errors: 0,
};

const soundcharts = createSoundchartsConnector({
  appId: process.env.SOUNDCHARTS_APP_ID ?? '',
  apiKey: process.env.SOUNDCHARTS_API_KEY ?? '',
});

// ─── Phase 1: resolve track ISRCs → Soundcharts song UUIDs ───────────────────

async function resolveSongUuids(): Promise<void> {
  console.log('\n[Phase 1] Resolving Soundcharts song UUIDs by ISRC...');

  const already = await db.externalId.findMany({
    where: { entityType: 'track', platform: 'soundcharts' },
    select: { entityId: true },
  });
  const resolvedIds = new Set(already.map((r) => r.entityId));

  const candidates = await db.track.findMany({
    where: { isrc: { not: null } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, isrc: true },
    take: RESOLVE_BUDGET + resolvedIds.size,
  });

  const toResolve = candidates.filter((t) => !resolvedIds.has(t.id)).slice(0, RESOLVE_BUDGET);
  console.log(`  ${toResolve.length} unresolved tracks in budget (${resolvedIds.size} already resolved)`);

  for (const track of toResolve) {
    try {
      const res = await soundcharts.getSongByIsrc(track.isrc!);
      const uuid = extractUuid(res);
      if (uuid) {
        await db.externalId.upsert({
          where: {
            entityType_entityId_platform: {
              entityType: 'track',
              entityId: track.id,
              platform: 'soundcharts',
            },
          },
          create: {
            entityType: 'track',
            entityId: track.id,
            platform: 'soundcharts',
            externalId: uuid,
          },
          update: { externalId: uuid },
        });
        stats.songsResolved++;
      } else {
        stats.songsUnmatched++;
      }
    } catch (err) {
      // 404 = Soundcharts doesn't know the ISRC — expected for small catalogs
      if (String((err as Error).message).includes(' 404 ')) {
        stats.songsUnmatched++;
      } else {
        console.warn(`  [WARN] ISRC resolve failed for trackId=${track.id}:`, (err as Error).message);
        stats.errors++;
      }
    }
    await delay(API_DELAY_MS);
  }

  console.log(`  Done. resolved=${stats.songsResolved}, unmatched=${stats.songsUnmatched}`);
}

// ─── Phase 2: Apple Music / Amazon playlist placements ───────────────────────

async function upsertPlaylistFromEntry(
  entry: NormalizedPlaylistEntry,
  canonicalPlatform: string,
): Promise<number> {
  const existing = await db.playlist.findFirst({
    where: { platform: canonicalPlatform, externalId: entry.playlistUuid },
    select: { id: true },
  });

  const metadata = {
    name: entry.name,
    followerCount: entry.subscriberCount,
    trackCount: entry.trackCount,
    countryCode: entry.countryCode,
    playlistType: entry.playlistType,
    isOfficial: entry.playlistType === 'editorial',
    isAlgorithmic: entry.playlistType === 'algorithmic' || entry.playlistType === 'algotorial',
  };

  let playlistId: number;
  if (existing) {
    await db.playlist.update({ where: { id: existing.id }, data: metadata });
    playlistId = existing.id;
  } else {
    const created = await db.playlist.create({
      data: { platform: canonicalPlatform, externalId: entry.playlistUuid, ...metadata },
      select: { id: true },
    });
    playlistId = created.id;
    stats.playlistsUpserted++;
  }

  // Keep the generic latest-metrics row in sync — the playlist directory
  // reads followers/trackCount from playlist_metrics_latest for non-Spotify
  // platforms.
  await db.playlistMetricsLatest.upsert({
    where: { playlistId },
    create: {
      playlistId,
      platform: canonicalPlatform,
      followerCount: entry.subscriberCount,
      trackCount: entry.trackCount,
    },
    update: {
      followerCount: entry.subscriberCount,
      trackCount: entry.trackCount,
    },
  });

  if (entry.curatorName) {
    await linkCurator(playlistId, canonicalPlatform, entry.curatorName);
  }

  return playlistId;
}

async function linkCurator(
  playlistId: number,
  canonicalPlatform: string,
  curatorName: string,
): Promise<void> {
  let curator = await db.curator.findFirst({
    where: { platform: canonicalPlatform, name: curatorName },
    select: { id: true },
  });
  if (!curator) {
    curator = await db.curator.create({
      data: { platform: canonicalPlatform, name: curatorName },
      select: { id: true },
    });
    stats.curatorsUpserted++;
  }

  await db.playlistCuratorLink.upsert({
    where: { playlistId_curatorId: { playlistId, curatorId: curator.id } },
    create: { playlistId, curatorId: curator.id },
    update: {},
  });
  await db.curatorPlaylist.upsert({
    where: { curatorId_playlistId: { curatorId: curator.id, playlistId } },
    create: { curatorId: curator.id, playlistId },
    update: {},
  });
}

async function ingestPlaylistPlacements(): Promise<void> {
  console.log('\n[Phase 2] Fetching Apple Music / Amazon playlist placements...');

  const resolved = await db.externalId.findMany({
    where: { entityType: 'track', platform: 'soundcharts' },
    select: { entityId: true, externalId: true },
  });
  if (resolved.length === 0) {
    console.log('  No resolved tracks yet — skipping (run again after Phase 1 has resolved some).');
    return;
  }

  // Most recently updated tracks first, inside the per-run budget.
  const tracks = await db.track.findMany({
    where: { id: { in: resolved.map((r) => r.entityId) } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
    take: PLAYLIST_SONG_BUDGET,
  });
  const uuidByTrack = new Map(resolved.map((r) => [r.entityId, r.externalId]));
  const eventDate = utcDateOnly();

  for (const track of tracks) {
    const uuid = uuidByTrack.get(track.id);
    if (!uuid) continue;

    for (const scPlatform of PLAYLIST_PLATFORMS) {
      const canonical = toCanonicalPlatform(scPlatform);
      if (!canonical) continue;

      try {
        const res = await soundcharts.getSongPlaylistEntries(uuid, scPlatform, {
          currentOnly: 1,
          limit: 100,
        });
        const entries = unwrapItems(res)
          .map(normalizePlaylistEntry)
          .filter((e): e is NormalizedPlaylistEntry => e !== null);

        const currentPlaylistIds: number[] = [];
        for (const entry of entries) {
          const playlistId = await upsertPlaylistFromEntry(entry, canonical);
          currentPlaylistIds.push(playlistId);

          await db.playlistTrack.upsert({
            where: { playlistId_trackId: { playlistId, trackId: track.id } },
            create: { playlistId, trackId: track.id, position: entry.position },
            update: { position: entry.position },
          });
        }

        // Membership diff for THIS track on THIS platform, computed against
        // the durable membership event log (replaying add/remove events gives
        // the pre-run state even though the PlaylistTrack upserts above have
        // already run) — same semantics as the Spotify job's playlist-side
        // diff, taken from the track side.
        const lastEvents = await db.playlistMembershipEvent.findMany({
          where: { trackId: track.id, playlist: { platform: canonical } },
          orderBy: { eventDate: 'asc' },
          select: { playlistId: true, eventType: true },
        });
        const activeBefore = new Set<number>();
        for (const ev of lastEvents) {
          if (ev.eventType === 'add') activeBefore.add(ev.playlistId);
          else if (ev.eventType === 'remove') activeBefore.delete(ev.playlistId);
        }
        const eventDiff = diffTrackPlaylistMembership(activeBefore, currentPlaylistIds);

        for (const playlistId of eventDiff.adds) {
          await db.playlistMembershipEvent.create({
            data: { playlistId, trackId: track.id, eventType: 'add', eventDate },
          });
          stats.membershipEventsCreated++;
        }
        for (const playlistId of eventDiff.removes) {
          await db.playlistMembershipEvent.create({
            data: { playlistId, trackId: track.id, eventType: 'remove', eventDate },
          });
          await db.playlistTrack.deleteMany({ where: { playlistId, trackId: track.id } });
          stats.membershipEventsCreated++;
        }
      } catch (err) {
        if (String((err as Error).message).includes(' 404 ')) {
          // Song unknown to this platform — normal, not an error.
        } else {
          console.warn(
            `  [WARN] playlist fetch failed trackId=${track.id} platform=${scPlatform}:`,
            (err as Error).message,
          );
          stats.errors++;
        }
      }
      await delay(API_DELAY_MS);
    }
  }

  console.log(
    `  Done. playlistsCreated=${stats.playlistsUpserted}, curatorsCreated=${stats.curatorsUpserted}, membershipEvents=${stats.membershipEventsCreated}`,
  );
}

// ─── Phase 3: resolve artists → Soundcharts UUIDs ─────────────────────────────

async function resolveArtistUuids(): Promise<void> {
  console.log('\n[Phase 3] Resolving Soundcharts artist UUIDs via Spotify IDs...');

  const [spotifyIds, already] = await Promise.all([
    db.externalId.findMany({
      where: { entityType: 'artist', platform: 'spotify' },
      select: { entityId: true, externalId: true },
    }),
    db.externalId.findMany({
      where: { entityType: 'artist', platform: 'soundcharts' },
      select: { entityId: true },
    }),
  ]);
  const resolvedIds = new Set(already.map((r) => r.entityId));
  const toResolve = spotifyIds.filter((r) => !resolvedIds.has(r.entityId)).slice(0, ARTIST_BUDGET);
  console.log(`  ${toResolve.length} unresolved artists in budget (${resolvedIds.size} already resolved)`);

  for (const row of toResolve) {
    try {
      const res = await soundcharts.getArtistByPlatformId('spotify', row.externalId);
      const uuid = extractUuid(res);
      if (uuid) {
        await db.externalId.upsert({
          where: {
            entityType_entityId_platform: {
              entityType: 'artist',
              entityId: row.entityId,
              platform: 'soundcharts',
            },
          },
          create: {
            entityType: 'artist',
            entityId: row.entityId,
            platform: 'soundcharts',
            externalId: uuid,
          },
          update: { externalId: uuid },
        });
        stats.artistsResolved++;
      } else {
        stats.artistsUnmatched++;
      }
    } catch (err) {
      if (String((err as Error).message).includes(' 404 ')) {
        stats.artistsUnmatched++;
      } else {
        console.warn(`  [WARN] artist resolve failed artistId=${row.entityId}:`, (err as Error).message);
        stats.errors++;
      }
    }
    await delay(API_DELAY_MS);
  }

  console.log(`  Done. resolved=${stats.artistsResolved}, unmatched=${stats.artistsUnmatched}`);
}

// ─── Phase 4: listener + follower series → artist stats ──────────────────────

async function fetchSeries(
  kind: 'listeners' | 'followers',
  uuid: string,
  startDate: string,
  endDate: string,
): Promise<ListenerPoint[]> {
  const res =
    kind === 'listeners'
      ? await soundcharts.getArtistLocalStreamingAudience(uuid, 'spotify', { startDate, endDate })
      : await soundcharts.getArtistAudience(uuid, 'spotify', { startDate, endDate });
  return unwrapItems(res)
    .map(normalizeListenerPoint)
    .filter((p): p is ListenerPoint => p !== null);
}

async function ingestArtistListeners(): Promise<void> {
  console.log('\n[Phase 4] Fetching Spotify listener/follower series per artist...');

  const resolved = await db.externalId.findMany({
    where: { entityType: 'artist', platform: 'soundcharts' },
    select: { entityId: true, externalId: true },
    take: ARTIST_BUDGET,
    orderBy: { id: 'asc' },
  });
  if (resolved.length === 0) {
    console.log('  No resolved artists yet — skipping.');
    return;
  }

  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - LISTENER_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  for (const artist of resolved) {
    let listeners: ListenerPoint[] = [];
    let followers: ListenerPoint[] = [];

    try {
      listeners = await fetchSeries('listeners', artist.externalId, startDate, endDate);
    } catch (err) {
      if (!String((err as Error).message).includes(' 404 ')) {
        console.warn(`  [WARN] listeners fetch failed artistId=${artist.entityId}:`, (err as Error).message);
        stats.errors++;
      }
    }
    await delay(API_DELAY_MS);

    try {
      followers = await fetchSeries('followers', artist.externalId, startDate, endDate);
    } catch (err) {
      if (!String((err as Error).message).includes(' 404 ')) {
        console.warn(`  [WARN] followers fetch failed artistId=${artist.entityId}:`, (err as Error).message);
        stats.errors++;
      }
    }
    await delay(API_DELAY_MS);

    if (listeners.length === 0 && followers.length === 0) continue;

    // Merge both series by date and upsert one ArtistDailyStats row per day.
    // The stream-rollup ETL never touches these columns, so the two writers
    // are non-conflicting.
    const byDate = new Map<string, { listeners?: bigint; followers?: bigint }>();
    for (const p of listeners) byDate.set(p.date, { ...byDate.get(p.date), listeners: p.value });
    for (const p of followers) byDate.set(p.date, { ...byDate.get(p.date), followers: p.value });

    const artistIdBig = BigInt(artist.entityId);
    for (const [dateStr, vals] of byDate) {
      const date = new Date(`${dateStr}T00:00:00.000Z`);
      const update: Record<string, unknown> = {};
      if (vals.listeners !== undefined) {
        update.totalListeners = vals.listeners;
        update.platformListeners = { spotify: vals.listeners.toString() };
      }
      if (vals.followers !== undefined) {
        update.totalFollowers = vals.followers;
        update.platformFollowers = { spotify: vals.followers.toString() };
      }

      await db.artistDailyStats.upsert({
        where: { artistId_date: { artistId: artistIdBig, date } },
        update,
        create: {
          artistId: artistIdBig,
          date,
          totalStreams: BigInt(0),
          genres: [],
          ...update,
        },
      });
      stats.listenerDaysWritten++;
    }

    // Latest monthly-listeners value → track_statistics_latest for the
    // artist's primary-credit tracks (lights up the existing ML feature).
    const latest = latestListenerPoint(listeners);
    if (latest) {
      const primaryTracks = await db.trackArtist.findMany({
        where: { artistId: artist.entityId, position: 0 },
        select: { trackId: true },
      });
      for (const { trackId } of primaryTracks) {
        await db.trackStatisticsLatest.upsert({
          where: { trackId },
          create: { trackId, spotifyMonthlyListeners: latest.value },
          update: { spotifyMonthlyListeners: latest.value },
        });
        stats.trackListenerStatsUpdated++;
      }
    }
  }

  console.log(
    `  Done. listenerDays=${stats.listenerDaysWritten}, trackStatsUpdated=${stats.trackListenerStatsUpdated}`,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<{ rowsWritten: number }> {
  console.log('=== Soundcharts Ingestion Job ===');
  console.log(`Started at: ${new Date().toISOString()}`);

  const requiredEnvVars = ['DATABASE_URL', 'SOUNDCHARTS_APP_ID', 'SOUNDCHARTS_API_KEY'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Required environment variable ${envVar} is not set`);
    }
  }

  try {
    await resolveSongUuids();
    await ingestPlaylistPlacements();
    await resolveArtistUuids();
    await ingestArtistListeners();
  } finally {
    await db.$disconnect();
  }

  console.log('\n=== Final Stats ===');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nCompleted at: ${new Date().toISOString()}`);

  if (stats.errors > 0) {
    console.warn(`\nCompleted with ${stats.errors} non-fatal warning(s). Check warnings above.`);
  }

  return {
    rowsWritten:
      stats.songsResolved +
      stats.artistsResolved +
      stats.playlistsUpserted +
      stats.membershipEventsCreated +
      stats.listenerDaysWritten +
      stats.trackListenerStatsUpdated,
  };
}

runTrackedJob('ingest:soundcharts', main).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
