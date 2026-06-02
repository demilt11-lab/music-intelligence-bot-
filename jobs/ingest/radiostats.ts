// jobs/ingest/radiostats.ts
// Ingests radio airplay data from the Radiostats/SongStats API into the DB.
// Schedule: daily at 06:00 UTC via .github/workflows/ingest_radiostats.yml

import 'dotenv/config';
import { db } from '@/lib/db';
import {
  getRadiostatsTrackStats,
  RadiostatsTrackStats,
} from '@/lib/radiostats/tracks';
import { getRadiostatsArtistStats } from '@/lib/radiostats/artists';
import { RadiostatsError } from '@/lib/radiostats/client';

// ─── helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

/** Only process tracks updated within the last 30 days to preserve quota. */
function thirtyDaysAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
}

// ─── track ingestion ──────────────────────────────────────────────────────────

async function ingestTracks(): Promise<void> {
  console.log('[radiostats] Starting track airplay ingestion…');

  // Load tracks that have a Spotify external ID and were updated in the last 30
  // days.  We fetch ISRC via the track row (if present) or fall back to the
  // Spotify external ID for the Radiostats lookup.
  const tracks = await db.track.findMany({
    where: {
      updatedAt: { gte: thirtyDaysAgo() },
      externalIds: {
        some: { platform: 'spotify' },
      },
    },
    select: {
      id: true,
      isrc: true,
      externalIds: {
        where: { platform: 'spotify' },
        select: { externalId: true },
      },
    },
  });

  console.log(`[radiostats] ${tracks.length} tracks to process`);

  const today = new Date(todayDateStr());
  const fromDate = sevenDaysAgoStr();
  const toDate = todayDateStr();

  for (const track of tracks) {
    const spotifyId = track.externalIds[0]?.externalId ?? null;
    const isrc = track.isrc ?? null;

    if (!isrc && !spotifyId) continue;

    await sleep(300);

    let stats: RadiostatsTrackStats;
    try {
      stats = await getRadiostatsTrackStats({
        ...(isrc ? { isrc } : { spotify_id: spotifyId! }),
        from: fromDate,
        to: toDate,
      });
    } catch (err) {
      if (err instanceof RadiostatsError) {
        if (err.status === 404) {
          console.log(
            `[radiostats] track ${track.id} (isrc=${isrc ?? spotifyId}) not found — skipping`,
          );
          continue;
        }
        if (err.status === 429) {
          console.warn('[radiostats] Rate limit hit — pausing 60 s…');
          await sleep(60_000);
          continue;
        }
        console.warn(
          `[radiostats] track ${track.id} error ${err.status} — skipping`,
        );
        continue;
      }
      throw err;
    }

    // ── Upsert track_platform_stats_daily (platform='radio') ──────────────
    const plays7d =
      typeof stats.plays_7d === 'number' ? BigInt(stats.plays_7d) : null;

    if (plays7d !== null) {
      await db.trackPlatformStatsDaily.upsert({
        where: {
          trackId_platform_date: {
            trackId: track.id,
            platform: 'radio',
            date: today,
          },
        },
        update: { radioPlays: plays7d },
        create: {
          trackId: track.id,
          platform: 'radio',
          date: today,
          radioPlays: plays7d,
        },
      });
    }

    // ── Upsert airplay_track_chart_snapshots + rows ────────────────────────
    // stats.stations is expected to be an array of per-station objects.
    // The exact shape is [{ station_name, spins, audience, ... }] based on
    // Radiostats docs; we use [key: string]: any to access them safely.
    const stations: Array<Record<string, unknown>> = Array.isArray(
      stats.stations,
    )
      ? (stats.stations as Array<Record<string, unknown>>)
      : [];

    if (stations.length > 0) {
      const snapshot = await db.airplayTrackChartSnapshot.upsert({
        where: {
          chartName_countryCode_format_snapshotDate: {
            chartName: `track:${track.id}:top_stations`,
            countryCode: null,
            format: null,
            snapshotDate: today,
          },
        },
        update: {},
        create: {
          chartName: `track:${track.id}:top_stations`,
          countryCode: null,
          format: null,
          snapshotDate: today,
        },
      });

      // Delete stale rows for this snapshot before re-inserting so we don't
      // accumulate duplicates when re-running the job on the same day.
      await db.airplayTrackChartRow.deleteMany({
        where: { snapshotId: snapshot.id },
      });

      const rowsToCreate = stations.slice(0, 50).map((s, i) => ({
        snapshotId: snapshot.id,
        trackId: track.id,
        rank: i + 1,
        spins: typeof s.spins === 'number' ? (s.spins as number) : null,
        audience:
          typeof s.audience === 'number'
            ? BigInt(s.audience as number)
            : null,
      }));

      if (rowsToCreate.length > 0) {
        await db.airplayTrackChartRow.createMany({ data: rowsToCreate });
      }
    }

    console.log(
      `[radiostats] track ${track.id}: plays_7d=${plays7d ?? 'n/a'}, stations=${stations.length}`,
    );
  }

  console.log('[radiostats] Track ingestion complete.');
}

// ─── artist ingestion ─────────────────────────────────────────────────────────

async function ingestArtists(): Promise<void> {
  console.log('[radiostats] Starting artist airplay ingestion…');

  const artists = await db.artist.findMany({
    where: {
      updatedAt: { gte: thirtyDaysAgo() },
      externalIds: {
        some: { platform: 'spotify' },
      },
    },
    select: {
      id: true,
      externalIds: {
        where: { platform: 'spotify' },
        select: { externalId: true },
      },
    },
  });

  console.log(`[radiostats] ${artists.length} artists to process`);

  const today = new Date(todayDateStr());
  const fromDate = sevenDaysAgoStr();
  const toDate = todayDateStr();

  for (const artist of artists) {
    const spotifyId = artist.externalIds[0]?.externalId ?? null;
    if (!spotifyId) continue;

    await sleep(300);

    let stats: Record<string, unknown>;
    try {
      stats = await getRadiostatsArtistStats({
        spotify_id: spotifyId,
        from: fromDate,
        to: toDate,
      });
    } catch (err) {
      if (err instanceof RadiostatsError) {
        if (err.status === 404) {
          console.log(
            `[radiostats] artist ${artist.id} (spotify=${spotifyId}) not found — skipping`,
          );
          continue;
        }
        if (err.status === 429) {
          console.warn('[radiostats] Rate limit hit — pausing 60 s…');
          await sleep(60_000);
          continue;
        }
        console.warn(
          `[radiostats] artist ${artist.id} error ${err.status} — skipping`,
        );
        continue;
      }
      throw err;
    }

    const plays7d =
      typeof stats.plays_7d === 'number'
        ? BigInt(stats.plays_7d as number)
        : null;

    if (plays7d !== null) {
      await db.artistDailyStats.upsert({
        where: {
          artistId_date: {
            artistId: BigInt(artist.id),
            date: today,
          },
        },
        update: { airplayPlays: plays7d },
        create: {
          artistId: BigInt(artist.id),
          date: today,
          totalStreams: BigInt(0),
          airplayPlays: plays7d,
        },
      });

      console.log(
        `[radiostats] artist ${artist.id}: airplay_plays_7d=${plays7d}`,
      );
    }
  }

  console.log('[radiostats] Artist ingestion complete.');
}

// ─── entrypoint ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await ingestTracks();
  await ingestArtists();
  await db.$disconnect();
  console.log('[radiostats] Done.');
}

main().catch((err) => {
  console.error('[radiostats] Fatal error:', err);
  process.exit(1);
});
