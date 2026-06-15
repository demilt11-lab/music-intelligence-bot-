// lib/writersProducers/risingScorer.ts
//
// Computes a rising-talent score for each songwriter/producer using existing
// streaming velocity and playlist momentum signals already in the database.
// Runs as part of the daily ETL; outputs are written to
// writer_producer_rising_scores.
import { db } from '@/lib/db';

interface ScoredCreator {
  songwriterId: number;
  risingScore: number;
  streamVelocity: number | null;
  playlistMomentum: number | null;
  collaborationScore: number | null;
  ugcMomentum: number | null;
  multiTrackPresence: number | null;
  mlBreakoutProb30d: number | null;
  isSigned: boolean;
  signedLabel: string | null;
  region: string;
}

// Normalise a raw value to [0, 1] using a soft log scale.
function softLog(value: number, scale: number): number {
  return Math.min(1, Math.log1p(Math.max(0, value)) / Math.log1p(scale));
}

// Detect whether a label string looks like a major-label entity.
const MAJOR_LABEL_KEYWORDS = [
  'universal',
  'sony',
  'warner',
  'atlantic',
  'def jam',
  'republic',
  'columbia',
  'interscope',
  'capitol',
  'rca',
  'epic',
  'island',
];

function detectIsSigned(label: string | null): { isSigned: boolean; signedLabel: string | null } {
  if (!label) return { isSigned: false, signedLabel: null };
  const lower = label.toLowerCase();
  const isSigned = MAJOR_LABEL_KEYWORDS.some((kw) => lower.includes(kw));
  return { isSigned, signedLabel: isSigned ? label : null };
}

export async function computeRisingScores(date: Date): Promise<ScoredCreator[]> {
  const dateStr = date.toISOString().split('T')[0];

  const weekAgo = new Date(date.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(date.getTime() - 24 * 60 * 60 * 1000);

  // Load yesterday's ML predictions so we can apply them as a ±7.5% modifier
  // to today's raw rising score (same pattern as compute_track_signals.ts).
  // score_writer_producer_daily.py writes these after the scorer runs each day.
  const mlPredRows = await db.writerProducerRisingScore.findMany({
    where: { date: yesterday, mlBreakoutProb30d: { not: null } },
    select: { songwriterId: true, mlBreakoutProb30d: true },
  });
  const mlProbMap = new Map<number, number>();
  for (const r of mlPredRows) {
    if (r.mlBreakoutProb30d != null) mlProbMap.set(r.songwriterId, r.mlBreakoutProb30d);
  }
  console.log(
    `[rising-scorer] Loaded ML predictions for ${mlProbMap.size} songwriters from ${yesterday.toISOString().slice(0, 10)}`
  );

  // Fetch all songwriters with their track stats
  const songwriters = await db.songwriter.findMany({
    include: {
      tracks: {
        include: {
          track: {
            include: {
              statisticsLatest: true,
              platformStatsDaily: {
                where: { date: { gte: twoWeeksAgo } },
                orderBy: { date: 'desc' },
                take: 14,
              },
              playlistTracks: {
                include: {
                  playlist: {
                    select: { id: true, name: true, followerCount: true, isOfficial: true },
                  },
                },
                take: 20,
              },
              trackAlbums: {
                include: {
                  album: { select: { id: true, title: true, releaseDate: true } },
                },
              },
              trackArtists: {
                include: { artist: { select: { id: true, name: true, popularity: true } } },
              },
            },
          },
        },
      },
    },
  });

  const results: ScoredCreator[] = [];

  for (const sw of songwriters) {
    if (sw.tracks.length === 0) continue;

    let totalStreamVelocity = 0;
    let totalPlaylistFollowers = 0;
    let officialPlaylistCount = 0;
    let totalUgcViews = 0;
    let maxCollabPopularity = 0;

    // Maps for multi-track presence cluster detection
    const albumTrackMap = new Map<number, { title: string; trackTitles: string[]; releaseDate: Date | null }>();
    const playlistTrackMap = new Map<number, { name: string; trackTitles: string[]; followerCount: bigint | null; isOfficial: boolean }>();
    let weeklyReleaseCount = 0;
    const weeklyReleaseTitles: string[] = [];

    for (const st of sw.tracks) {
      const t = st.track;
      const stats = t.statisticsLatest;

      // Stream velocity — compute from recent daily stats (last 7d vs prior 7d)
      const dailyStreams = (t.platformStatsDaily as Array<{ streams: bigint | null }>)
        .filter((d) => d.streams != null)
        .map((d) => Number(d.streams));
      if (dailyStreams.length >= 2) {
        const recent = dailyStreams.slice(0, 7).reduce((a: number, b: number) => a + b, 0);
        const prior = dailyStreams.slice(7, 14).reduce((a: number, b: number) => a + b, 0);
        if (prior > 0) totalStreamVelocity += (recent - prior) / prior;
      }

      // UGC momentum — TikTok creations
      if (stats?.tiktokCreations) {
        totalUgcViews += Number(stats.tiktokCreations);
      }

      // Playlist momentum — sum follower counts of playlists
      for (const pt of t.playlistTracks) {
        const followers = Number(pt.playlist.followerCount ?? 0);
        totalPlaylistFollowers += followers;
        if (pt.playlist.isOfficial) officialPlaylistCount++;

        // Playlist cluster: track how many songs this creator has per playlist
        const existing = playlistTrackMap.get(pt.playlist.id);
        if (existing) {
          existing.trackTitles.push(t.title);
        } else {
          playlistTrackMap.set(pt.playlist.id, {
            name: pt.playlist.name,
            trackTitles: [t.title],
            followerCount: pt.playlist.followerCount,
            isOfficial: pt.playlist.isOfficial,
          });
        }
      }

      // Album cluster: track how many songs this creator has per album
      for (const ta of (t as typeof t & { trackAlbums: Array<{ album: { id: number; title: string; releaseDate: Date | null } }> }).trackAlbums) {
        const alb = ta.album;
        const existing = albumTrackMap.get(alb.id);
        if (existing) {
          existing.trackTitles.push(t.title);
        } else {
          albumTrackMap.set(alb.id, {
            title: alb.title,
            trackTitles: [t.title],
            releaseDate: alb.releaseDate,
          });
        }
      }

      // Weekly release burst: tracks released in last 7 days
      if (t.releaseDate && t.releaseDate >= weekAgo) {
        weeklyReleaseCount++;
        weeklyReleaseTitles.push(t.title);
      }

      // Collaboration score — highest collaborator popularity
      for (const ta of t.trackArtists) {
        const pop = ta.artist.popularity ?? 0;
        if (pop > maxCollabPopularity) maxCollabPopularity = pop;
      }
    }

    // ── Multi-track presence score ──────────────────────────────────────
    //
    // Signal 1 — Album cluster: credited on ≥2 songs from an album released
    // this week. The more songs and the more recent the album, the stronger.
    let maxAlbumClusterTracks = 0;
    for (const alb of albumTrackMap.values()) {
      const isNewRelease = alb.releaseDate != null && alb.releaseDate >= weekAgo;
      if (isNewRelease && alb.trackTitles.length > maxAlbumClusterTracks) {
        maxAlbumClusterTracks = alb.trackTitles.length;
      }
    }
    const albumClusterScore = softLog(maxAlbumClusterTracks, 12);

    // Signal 2 — Playlist cluster: multiple tracks on the same playlist.
    // Weight by log-follower count so editorial placement counts more.
    let maxPlaylistClusterScore = 0;
    for (const pl of playlistTrackMap.values()) {
      if (pl.trackTitles.length < 2) continue;
      const followerWeight = softLog(Number(pl.followerCount ?? 0), 5_000_000);
      const editorialBonus = pl.isOfficial ? 1.5 : 1.0;
      const plScore = softLog(pl.trackTitles.length, 10) * (0.5 + 0.5 * followerWeight) * editorialBonus;
      if (plScore > maxPlaylistClusterScore) maxPlaylistClusterScore = Math.min(1, plScore);
    }

    // Signal 3 — Weekly release burst: multiple tracks released this week.
    const weeklyBurstScore = softLog(weeklyReleaseCount, 8);

    const multiTrackPresence = Math.min(
      1,
      albumClusterScore * 0.45 +
      maxPlaylistClusterScore * 0.30 +
      weeklyBurstScore * 0.25,
    );

    // Normalise other signals to [0, 1]
    const streamVelocity = softLog(totalStreamVelocity / sw.tracks.length, 200);
    const playlistMomentum = softLog(totalPlaylistFollowers, 10_000_000) * 0.7
      + softLog(officialPlaylistCount, 20) * 0.3;
    const ugcMomentum = softLog(totalUgcViews, 50_000_000);
    const collaborationScore = softLog(maxCollabPopularity, 100);

    // Composite raw rising score — multiTrackPresence at 0.20; other weights
    // reduced proportionally from prior values so the sum remains 1.0.
    const rawRisingScore =
      streamVelocity * 0.28 +
      playlistMomentum * 0.24 +
      ugcMomentum * 0.20 +
      collaborationScore * 0.08 +
      multiTrackPresence * 0.20;

    // ML modifier: blend in yesterday's breakout probability as a ±7.5% nudge.
    // Neutral (1.0) when no prediction exists yet (first run or model not trained).
    const mlProb = mlProbMap.get(sw.id) ?? 0.5;
    const mlModifier = Math.max(0.85, Math.min(1.15, 1 + 0.15 * (mlProb - 0.5)));
    const risingScore = Math.min(1, Math.max(0, rawRisingScore * mlModifier));

    // Signed status — infer from album label data if available
    const labelHint = null; // TODO: join to albums.label when ingested
    const { isSigned, signedLabel } = detectIsSigned(labelHint);

    results.push({
      songwriterId: sw.id,
      risingScore,
      streamVelocity: streamVelocity || null,
      playlistMomentum: playlistMomentum || null,
      collaborationScore: collaborationScore || null,
      ugcMomentum: ugcMomentum || null,
      multiTrackPresence: multiTrackPresence > 0 ? multiTrackPresence : null,
      mlBreakoutProb30d: mlProbMap.get(sw.id) ?? null,
      isSigned,
      signedLabel,
      region: 'GLOBAL',
    });
  }

  // Sort descending
  results.sort((a, b) => b.risingScore - a.risingScore);

  return results;
}

export async function upsertRisingScores(date: Date): Promise<number> {
  const scores = await computeRisingScores(date);
  if (scores.length === 0) return 0;

  let written = 0;
  for (const s of scores) {
    await db.writerProducerRisingScore.upsert({
      where: {
        songwriterId_date: {
          songwriterId: s.songwriterId,
          date,
        },
      },
      create: {
        songwriterId: s.songwriterId,
        date,
        risingScore: s.risingScore,
        streamVelocity: s.streamVelocity,
        playlistMomentum: s.playlistMomentum,
        collaborationScore: s.collaborationScore,
        ugcMomentum: s.ugcMomentum,
        multiTrackPresence: s.multiTrackPresence,
        mlBreakoutProb30d: s.mlBreakoutProb30d,
        isSigned: s.isSigned,
        signedLabel: s.signedLabel,
        region: s.region,
      },
      update: {
        risingScore: s.risingScore,
        streamVelocity: s.streamVelocity,
        playlistMomentum: s.playlistMomentum,
        collaborationScore: s.collaborationScore,
        ugcMomentum: s.ugcMomentum,
        multiTrackPresence: s.multiTrackPresence,
        mlBreakoutProb30d: s.mlBreakoutProb30d,
        isSigned: s.isSigned,
        signedLabel: s.signedLabel,
      },
    });
    written++;
  }

  return written;
}
