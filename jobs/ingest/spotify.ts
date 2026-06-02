// jobs/ingest/spotify.ts
//
// Standalone Node.js ingestion script — run via:
//   npx ts-node --project tsconfig.scripts.json jobs/ingest/spotify.ts
//
// Requires env vars: DATABASE_URL, DIRECT_URL, SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET

import { PrismaClient } from '@prisma/client';
import {
  getTrackAudioFeatures,
  getTrackDetails,
  getPlaylistTracks,
  getArtistDetails,
  getPlaylistDetails,
  delay,
  SpotifyPlaylistItem,
  SpotifyTrack,
} from '@/lib/spotify/client';
import { resolveSpotifyTrack } from '@/lib/spotify/resolver';

const db = new PrismaClient();

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

// ─── Top 50 chart markets ─────────────────────────────────────────────────────

const TOP_CHART_MARKETS = ['global', 'US', 'GB', 'AU', 'CA', 'BR', 'DE', 'FR', 'MX'];

const TOP_CHART_PLAYLIST_IDS: Record<string, string> = {
  global: '37i9dQZEVXbMDoHDwVN2tF',
  US: '37i9dQZEVXbLRQDuF5jeBp',
  GB: '37i9dQZEVXbLnolsZ8PSNw',
  AU: '37i9dQZEVXbJPcfkRz0wJ0',
  CA: '37i9dQZEVXbKj23U1GF4IR',
  BR: '37i9dQZEVXbMXbN3EUUhlg',
  DE: '37i9dQZEVXbJiZcmkrIHGU',
  FR: '37i9dQZEVXbIPWwFssbupI',
  MX: '37i9dQZEVXbO3qyFxbkOE1',
};

// ─── Counters ─────────────────────────────────────────────────────────────────

interface Stats {
  audioFeaturesUpserted: number;
  popularityUpdated: number;
  chartTracksProcessed: number;
  chartSnapshotsCreated: number;
  membershipEventsCreated: number;
  editorialTracksProcessed: number;
  tracksCreated: number;
  artistFollowersUpdated: number;
  playlistFollowersUpdated: number;
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
  artistFollowersUpdated: 0,
  playlistFollowersUpdated: 0,
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

// Collects playlist DB IDs processed during Phases 2 & 3 (for Phase 5)
const processedPlaylistDbIds: Array<{ dbId: number; spotifyId: string }> = [];

// ─── Phase 2: Top 50 chart ingestion ─────────────────────────────────────────

async function ingestTopCharts(): Promise<void> {
  console.log('\n[Phase 2] Ingesting Spotify Top 50 charts...');

  const snapshotDate = new Date();
  snapshotDate.setUTCHours(0, 0, 0, 0);

  for (const market of TOP_CHART_MARKETS) {
    const playlistId = TOP_CHART_PLAYLIST_IDS[market];
    console.log(`  Processing chart: ${market} (playlist ${playlistId})`);

    try {
      const items = await getPlaylistTracks(playlistId);
      const validItems = items.filter((item): item is SpotifyPlaylistItem & { track: SpotifyTrack } =>
        item.track !== null && item.track.id !== undefined
      );

      // Upsert chart snapshot
      const chartName = market === 'global' ? 'Spotify Global Top 50' : `Spotify Top 50 ${market}`;
      const countryCode = market === 'global' ? null : market;

      const snapshot = await db.chartSnapshot.upsert({
        where: {
          chartName_platform_countryCode_snapshotDate: {
            chartName,
            platform: 'spotify',
            countryCode: countryCode ?? '',
            snapshotDate,
          },
        },
        create: {
          chartName,
          platform: 'spotify',
          countryCode,
          snapshotDate,
        },
        update: {},
      });
      stats.chartSnapshotsCreated++;

      // Get or upsert the playlist DB record
      const playlist = await upsertPlaylist(playlistId, chartName, market === 'global' ? null : market);
      processedPlaylistDbIds.push({ dbId: playlist.id, spotifyId: playlistId });

      // Track which tracks are currently in the playlist (for membership events)
      const currentTrackIds = new Set<number>();

      for (let rank = 0; rank < validItems.length; rank++) {
        const item = validItems[rank];
        const spotifyTrack = item.track;

        try {
          const { trackId, created } = await resolveSpotifyTrack(spotifyTrack);
          if (created) stats.tracksCreated++;
          currentTrackIds.add(trackId);

          // Upsert chart row
          await db.chartRow.upsert({
            where: { snapshotId_rank: { snapshotId: snapshot.id, rank: rank + 1 } },
            create: {
              snapshotId: snapshot.id,
              trackId,
              rank: rank + 1,
            },
            update: { trackId },
          });

          // Upsert PlaylistTrack
          await db.playlistTrack.upsert({
            where: { playlistId_trackId: { playlistId: playlist.id, trackId } },
            create: { playlistId: playlist.id, trackId, position: rank + 1 },
            update: { position: rank + 1 },
          });

          stats.chartTracksProcessed++;
          await delay(100);
        } catch (err) {
          console.warn(`    [WARN] Failed for chart track ${spotifyTrack.id}:`, (err as Error).message);
          stats.errors++;
        }
      }

      // Create membership events for new additions
      await createMembershipEvents(playlist.id, currentTrackIds, snapshotDate);

      // Upsert SpotifyPlaylistMetricsLatest
      await db.spotifyPlaylistMetricsLatest.upsert({
        where: { playlistId: playlist.id },
        create: {
          playlistId: playlist.id,
          trackCount: validItems.length,
        },
        update: {
          trackCount: validItems.length,
        },
      });

      await delay(100);
    } catch (err) {
      console.warn(`  [WARN] Failed for market ${market}:`, (err as Error).message);
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
      processedPlaylistDbIds.push({ dbId: playlist.id, spotifyId: playlistId });
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

// ─── Phase 4: Artist followers + popularity ───────────────────────────────────

async function ingestArtistFollowers(): Promise<void> {
  console.log('\n[Phase 4] Fetching artist followers & popularity...');

  const externalIds = await db.externalId.findMany({
    where: { entityType: 'artist', platform: 'spotify' },
    select: { entityId: true, externalId: true },
  });

  console.log(`  Found ${externalIds.length} artists with Spotify external IDs`);

  for (const { entityId: artistId, externalId: spotifyArtistId } of externalIds) {
    try {
      const details = await getArtistDetails(spotifyArtistId);
      await db.artist.update({
        where: { id: artistId },
        data: {
          followersCount: BigInt(details.followers.total),
          popularity: details.popularity,
        },
      });
      stats.artistFollowersUpdated++;
      await delay(100);
    } catch (err) {
      console.warn(`  [WARN] Failed for artistId=${artistId} spotifyId=${spotifyArtistId}:`, (err as Error).message);
      stats.errors++;
    }
  }

  console.log(`  Done. artistFollowersUpdated=${stats.artistFollowersUpdated}`);
}

// ─── Phase 5: Playlist follower counts ───────────────────────────────────────

async function ingestPlaylistFollowers(): Promise<void> {
  console.log('\n[Phase 5] Fetching playlist follower counts...');
  console.log(`  Processing ${processedPlaylistDbIds.length} playlists from Phases 2 & 3`);

  for (const { dbId, spotifyId } of processedPlaylistDbIds) {
    try {
      const details = await getPlaylistDetails(spotifyId);
      const followers = BigInt(details.followers.total);

      await db.playlist.update({
        where: { id: dbId },
        data: { followerCount: followers },
      });

      await db.spotifyPlaylistMetricsLatest.upsert({
        where: { playlistId: dbId },
        update: { followers },
        create: { playlistId: dbId, followers, updatedAt: new Date() },
      });

      stats.playlistFollowersUpdated++;
      await delay(100);
    } catch (err) {
      console.warn(`  [WARN] Failed for playlistDbId=${dbId} spotifyId=${spotifyId}:`, (err as Error).message);
      stats.errors++;
    }
  }

  console.log(`  Done. playlistFollowersUpdated=${stats.playlistFollowersUpdated}`);
}

// ─── Phase 6: Daily streams update ───────────────────────────────────────────

async function ingestDailyStreams(): Promise<void> {
  console.log('\n[Phase 6] Daily streams update...');
  // NOTE: The Spotify Web API does not expose raw stream counts to non-Spotify-for-Artists
  // users. The only publicly available popularity signal is the `popularity` field (0–100
  // index), which is already captured in Phase 1 via getTrackDetails → spotifyPopularity.
  // Raw stream counts require Spotify for Artists API access (restricted program).
  // Skipping raw stream ingestion — update spotifyPopularity instead (already done in Phase 1).
  console.log('  NOTE: Spotify Web API does not expose raw stream counts to non-Spotify-for-Artists users.');
  console.log('  Popularity scores are already updated in Phase 1. Skipping raw stream ingestion.');
  console.log('  To ingest raw streams, Spotify for Artists API access is required.');
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
    await ingestArtistFollowers();
    await ingestPlaylistFollowers();
    await ingestDailyStreams();
  } finally {
    await db.$disconnect();
  }

  console.log('\n=== Final Stats ===');
  console.log(JSON.stringify(stats, null, 2));
  console.log(`\nCompleted at: ${new Date().toISOString()}`);

  if (stats.errors > 0) {
    console.warn(`\nCompleted with ${stats.errors} error(s). Check warnings above.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
