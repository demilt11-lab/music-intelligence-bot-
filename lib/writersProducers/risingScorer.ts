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

  // Fetch all songwriters with their track stats
  const songwriters = await db.songwriter.findMany({
    include: {
      tracks: {
        include: {
          track: {
            include: {
              statisticsLatest: true,
              platformStatsDaily: {
                where: {
                  date: {
                    gte: new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000),
                  },
                },
                orderBy: { date: 'desc' },
                take: 14,
              },
              playlistTracks: {
                include: {
                  playlist: { select: { followerCount: true, isOfficial: true } },
                },
                take: 20,
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
      }

      // Collaboration score — highest collaborator popularity
      for (const ta of t.trackArtists) {
        const pop = ta.artist.popularity ?? 0;
        if (pop > maxCollabPopularity) maxCollabPopularity = pop;
      }
    }

    // Normalise to [0, 1]
    const streamVelocity = softLog(totalStreamVelocity / sw.tracks.length, 200);
    const playlistMomentum = softLog(totalPlaylistFollowers, 10_000_000) * 0.7
      + softLog(officialPlaylistCount, 20) * 0.3;
    const ugcMomentum = softLog(totalUgcViews, 50_000_000);
    const collaborationScore = softLog(maxCollabPopularity, 100);

    // Composite rising score (tuned weights)
    const risingScore =
      streamVelocity * 0.35 +
      playlistMomentum * 0.30 +
      ugcMomentum * 0.25 +
      collaborationScore * 0.10;

    // Signed status — infer from album label data if available
    const labelHint = null; // TODO: join to albums.label when ingested
    const { isSigned, signedLabel } = detectIsSigned(labelHint);

    results.push({
      songwriterId: sw.id,
      risingScore: Math.min(1, Math.max(0, risingScore)),
      streamVelocity: streamVelocity || null,
      playlistMomentum: playlistMomentum || null,
      collaborationScore: collaborationScore || null,
      ugcMomentum: ugcMomentum || null,
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
        isSigned: s.isSigned,
        signedLabel: s.signedLabel,
      },
    });
    written++;
  }

  return written;
}
