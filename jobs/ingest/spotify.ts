// jobs/ingest/spotify.ts
//
// Standalone Node.js ingestion script — run via:
//   npx tsx jobs/ingest/spotify.ts
//
// Requires env vars: DATABASE_URL, DIRECT_URL, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET

import { db } from '@/lib/db';
import {
  getTrackAudioFeatures,
  getTrackDetails,
  getPlaylistTracks,
  getPopularTracks,
  delay,
  SpotifyPlaylistItem,
  SpotifyTrack,
} from '@/lib/spotify/client';
import { resolveSpotifyTrack } from '@/lib/spotify/resolver';
import { runTrackedJob } from '@/lib/jobs/tracker';

// ─── Editorial playlists to monitor ──────────────────────────────────────────

const EDITORIAL_PLAYLISTS: Array<{ id: string; name: string }> = [
  { id: '37i9dQZF1DX0XUsuxWHRQd', name: 'RapCaviar' },
  { id: '37i9dQZF1DX4dyzvuaRJ0n', name: 'mint' },
  { id: '37i9dQZF1DX4JAvHpjipBk', name: 'New Music Friday' },
  { id: '37i9dQZF1DWXRqgorJj26U', name: 'Rock This' },
  { id: '37i9dQZF1DX1lVhptIYRda', name: 'Hot Country' },
  { id: '37i9dQZF1DX4SBhb3fqCJd', name: 'Are & Be' },
  { id: '37i9dQZF1DX10zKzsJ2jva', name: 'Viva Latino' },
  { id: '37i9dQZF1DXcBWIGoYBM5M', name: 'Today\'s Top Hits' },
  { id: '37i9dQZF1DX4o1oenSJRJd', name: 'Pop Rising' },
  { id: '37i9dQZF1DWUZv12GM5bny', name: 'Young & Free' },
];


// ─── Counters ─────────────────────────────────────────────────────────────────

interface Stats {
  audioFeaturesUpserted: number;
  popularityUpdated: number;
  chartTracksProcessed: number;
  chartSnapshotsCreated: number;
  membershipEventsCreated: number;
  editorialTracksProcessed: number;
  tracksCreated: number;
  errors: number;
}

const stats: Stats = {
  audioFeaturesUpserted: 0,
  popularityUpdated: 0,
  chartTracksProcessed: 0,
  chartSnapshotsCreated: 0,
  membershipEventsCreated: 0,
  editorialTracksProcessed: 0,
  tracksCreated: 0,
  errors: 0,
};

// ─── Phase 1: Audio features + popularity for existing DB tracks ──────────────

async function ingestExistingTracks(): Promise<void> {
  console.log('\n[Phase 1] Fetching audio features & popularity for existing DB tracks...');

  const externalIds = await db.externalId.findMany({
    where: { entityType: 'track', platform: 'spotify' },
    select: { entityId: true, externalId: true },
  });

  console.log(`  Found ${externalIds.length} tracks with Spotify external IDs`);

  // Process in batches of 50
  const batchSize = 50;
  for (let i = 0; i < externalIds.length; i += batchSize) {
    const batch = externalIds.slice(i, i + batchSize);
    console.log(`  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(externalIds.length / batchSize)} (${batch.length} tracks)`);

    for (const { entityId: trackId, externalId: spotifyId } of batch) {
      try {
        // Fetch audio features
        const features = await getTrackAudioFeatures(spotifyId);
        if (features) {
          await db.trackAudioFeatures.upsert({
            where: { trackId },
            create: {
              trackId,
              danceability: features.danceability,
              energy: features.energy,
              loudness: features.loudness,
              speechiness: features.speechiness,
              acousticness: features.acousticness,
              instrumentalness: features.instrumentalness,
              liveness: features.liveness,
              valence: features.valence,
              tempo: features.tempo,
              timeSignature: features.time_signature,
              key: features.key,
              mode: features.mode,
            },
            update: {
              danceability: features.danceability,
              energy: features.energy,
              loudness: features.loudness,
              speechiness: features.speechiness,
              acousticness: features.acousticness,
              instrumentalness: features.instrumentalness,
              liveness: features.liveness,
              valence: features.valence,
              tempo: features.tempo,
              timeSignature: features.time_signature,
              key: features.key,
              mode: features.mode,
            },
          });
          stats.audioFeaturesUpserted++;
        }
        await delay(100);

        // Fetch track details for popularity
        const details = await getTrackDetails(spotifyId);
        if (details && details.popularity !== undefined) {
          await db.trackStatisticsLatest.upsert({
            where: { trackId },
            create: { trackId, spotifyPopularity: details.popularity },
            update: { spotifyPopularity: details.popularity },
          });
          stats.popularityUpdated++;
        }
        await delay(100);
      } catch (err) {
        console.warn(`  [WARN] Failed for trackId=${trackId} spotifyId=${spotifyId}:`, (err as Error).message);
        stats.errors++;
      }
    }
  }

  console.log(`  Done. audioFeatures=${stats.audioFeaturesUpserted}, popularity=${stats.popularityUpdated}`);
}

// ─── Phase 2: Top 50 chart ingestion ─────────────────────────────────────────

async function ingestTopCharts(): Promise<void> {
  console.log('\n[Phase 2] Ingesting trending tracks via search + new releases...');

  const snapshotDate = new Date();
  snapshotDate.setUTCHours(0, 0, 0, 0);

  const markets = ['global', 'US', 'GB', 'AU', 'CA', 'BR', 'DE', 'FR', 'MX'];

  // Seed with popular tracks per market via search
  for (const market of markets) {
    console.log(`  Fetching popular tracks for market: ${market}`);
    try {
      const tracks = await getPopularTracks(market, 30);
      const chartName = `Spotify Popular ${market}`;
      const snapshot = await db.chartSnapshot.upsert({
        where: {
          chartName_platform_countryCode_snapshotDate: {
            chartName,
            platform: 'spotify',
            countryCode: market,
            snapshotDate,
          },
        },
        create: { chartName, platform: 'spotify', countryCode: market, snapshotDate },
        update: {},
      });
      stats.chartSnapshotsCreated++;

      for (let i = 0; i < tracks.length; i++) {
        try {
          const { trackId, created } = await resolveSpotifyTrack(tracks[i]);
          if (created) stats.tracksCreated++;
          await db.chartRow.upsert({
            where: { snapshotId_rank: { snapshotId: snapshot.id, rank: i + 1 } },
            create: { snapshotId: snapshot.id, trackId, rank: i + 1 },
            update: { trackId },
          });
          stats.chartTracksProcessed++;
        } catch {
          // ignore per-track failures
        }
      }
      await delay(500);
    } catch (err) {
      console.warn(`  [WARN] Popular tracks failed for ${market}:`, (err as Error).message);
      stats.errors++;
    }
  }

  console.log(`  Done. snapshots=${stats.chartSnapshotsCreated}, chartTracks=${stats.chartTracksProcessed}`);
}

// ─── Phase 3: Editorial playlist ingestion ────────────────────────────────────

async function ingestEditorialPlaylists(): Promise<void> {
  console.log('\n[Phase 3] Ingesting editorial playlists...');

  const snapshotDate = new Date();
  snapshotDate.setUTCHours(0, 0, 0, 0);

  for (const { id: playlistId, name: playlistName } of EDITORIAL_PLAYLISTS) {
    console.log(`  Processing editorial playlist: ${playlistName} (${playlistId})`);

    try {
      const items = await getPlaylistTracks(playlistId);
      const validItems = items.filter((item): item is SpotifyPlaylistItem & { track: SpotifyTrack } =>
        item.track !== null && item.track.id !== undefined
      );

      const playlist = await upsertPlaylist(playlistId, playlistName, null, true);
      const currentTrackIds = new Set<number>();

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        const spotifyTrack = item.track;

        try {
          const { trackId, created } = await resolveSpotifyTrack(spotifyTrack);
          if (created) stats.tracksCreated++;
          currentTrackIds.add(trackId);

          await db.playlistTrack.upsert({
            where: { playlistId_trackId: { playlistId: playlist.id, trackId } },
            create: { playlistId: playlist.id, trackId, position: i + 1 },
            update: { position: i + 1 },
          });

          stats.editorialTracksProcessed++;
          await delay(100);
        } catch (err) {
          console.warn(`    [WARN] Failed for editorial track ${spotifyTrack.id}:`, (err as Error).message);
          stats.errors++;
        }
      }

      // Membership events for adds/removes
      await createMembershipEvents(playlist.id, currentTrackIds, snapshotDate);

      // Update playlist metrics
      await db.spotifyPlaylistMetricsLatest.upsert({
        where: { playlistId: playlist.id },
        create: { playlistId: playlist.id, trackCount: validItems.length },
        update: { trackCount: validItems.length },
      });

      await delay(100);
    } catch (err) {
      console.warn(`  [WARN] Failed for editorial playlist ${playlistName}:`, (err as Error).message);
      stats.errors++;
    }
  }

  console.log(`  Done. editorialTracks=${stats.editorialTracksProcessed}, membershipEvents=${stats.membershipEventsCreated}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function upsertPlaylist(
  externalId: string,
  name: string,
  countryCode: string | null,
  isEditorial = false,
): Promise<{ id: number }> {
  const existing = await db.playlist.findFirst({
    where: { platform: 'spotify', externalId },
    select: { id: true },
  });

  if (existing) return existing;

  return db.playlist.create({
    data: {
      name,
      platform: 'spotify',
      externalId,
      isOfficial: true,
      isAlgorithmic: !isEditorial,
      countryCode,
      playlistType: isEditorial ? 'editorial' : 'chart',
    },
    select: { id: true },
  });
}

async function createMembershipEvents(
  playlistId: number,
  currentTrackIds: Set<number>,
  eventDate: Date,
): Promise<void> {
  // Fetch previously tracked tracks for this playlist
  const existing = await db.playlistTrack.findMany({
    where: { playlistId },
    select: { trackId: true },
  });
  const previousTrackIds = new Set(existing.map((pt) => pt.trackId));

  // Adds: in current but not in previous
  const adds = [...currentTrackIds].filter((id) => !previousTrackIds.has(id));
  // Removes: in previous but not in current
  const removes = [...previousTrackIds].filter((id) => !currentTrackIds.has(id));

  for (const trackId of adds) {
    await db.playlistMembershipEvent.create({
      data: { playlistId, trackId, eventType: 'add', eventDate },
    });
    stats.membershipEventsCreated++;
  }

  for (const trackId of removes) {
    await db.playlistMembershipEvent.create({
      data: { playlistId, trackId, eventType: 'remove', eventDate },
    });
    stats.membershipEventsCreated++;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== Spotify Ingestion Job ===');
  console.log(`Started at: ${new Date().toISOString()}`);

  // Validate required env vars up front
  const requiredEnvVars = ['DATABASE_URL', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Required environment variable ${envVar} is not set`);
    }
  }

  try {
    await ingestExistingTracks();
    await ingestTopCharts();
    await ingestEditorialPlaylists();
  } finally {
    await db.$disconnect();
  }

  console.log('\n=== Final Stats ===');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nCompleted at: ${new Date().toISOString()}`);

  if (stats.errors > 0) {
    console.warn(`\nCompleted with ${stats.errors} non-fatal warning(s). Check warnings above.`);
  }
}

runTrackedJob('ingest:spotify', main).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
