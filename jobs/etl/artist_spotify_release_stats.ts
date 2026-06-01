// jobs/etl/artist_spotify_release_stats.ts
import "dotenv/config";
import { db } from "@/lib/db";

type ArtistTrackRow = {
  trackId: number;
  releaseDate: Date | null;
  spotifyStreamsTotal: bigint;
  spotifyStreams28d: bigint;
};

function bigintToNum(b: bigint | null | undefined): number {
  if (!b) return 0;
  return Number(b);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function std(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

export async function buildArtistSpotifyReleaseStats(
  snapshotDateStr: string,
  windowDays = 365,
) {
  const snapshotDate = new Date(snapshotDateStr);

  // Get all artists (or subset)
  const artists = await db.artists.findMany({
    select: { id: true },
  });

  const sinceDate = new Date(
    snapshotDate.getTime() -
      windowDays * 24 * 60 * 60 * 1000,
  );

  for (const artist of artists) {
    // Get tracks for this artist in the last year
    const tracks = await db.track.findMany({
      where: {
        trackArtists: {
          some: { artistId: artist.id },
        },
        releaseDate: {
          gte: sinceDate,
          lte: snapshotDate,
        },
      },
      include: {
        track_statistics_latest: true,
      },
      orderBy: {
        releaseDate: "desc",
      },
      take: 10,
    });

    if (!tracks.length) continue;

    const rows: ArtistTrackRow[] = tracks.map((t) => ({
      trackId: t.id,
      releaseDate: t.releaseDate,
      spotifyStreamsTotal:
        t.track_statistics_latest
          ?.spotifyStreams ?? 0n,
      spotifyStreams28d:
        t.track_statistics_latest
          ?.spotifyStreams28d ?? 0n, // add this field if needed
    }));

    const streamsNums = rows.map((r) =>
      bigintToNum(r.spotifyStreamsTotal),
    );
    const totalStreams = streamsNums.reduce(
      (a, b) => a + b,
      0,
    );
    const avgStreams =
      streamsNums.length
        ? totalStreams / streamsNums.length
        : 0;
    const medianStreams = median(streamsNums);
    const maxStreams = BigInt(
      Math.max(...streamsNums),
    );
    const minStreams = BigInt(
      Math.min(...streamsNums),
    );
    const stdStreams = std(streamsNums);

    const numAbove100k = streamsNums.filter(
      (s) => s >= 100_000,
    ).length;
    const numAbove1M = streamsNums.filter(
      (s) => s >= 1_000_000,
    ).length;

    // latest track is first in sorted list
    const latest = rows[0];

    // average days between releases
    let avgDaysBetweenReleases: number | null = null;
    if (rows.length > 1) {
      const dates = rows
        .map((r) => r.releaseDate)
        .filter(
          (d): d is Date => d instanceof Date,
        )
        .sort(
          (a, b) =>
            a.getTime() - b.getTime(),
        );
      const gaps: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        const diffMs =
          dates[i].getTime() -
          dates[i - 1].getTime();
        gaps.push(diffMs / (1000 * 60 * 60 * 24));
      }
      if (gaps.length) {
        avgDaysBetweenReleases =
          gaps.reduce((a, b) => a + b, 0) /
          gaps.length;
      }
    }

    await db.artistSpotifyReleaseStats.upsert({
      where: {
        artistId_snapshotDate: {
          artistId: artist.id,
          snapshotDate,
        },
      },
      update: {
        numTracks: rows.length,
        windowDays,
        totalStreams: BigInt(totalStreams),
        avgStreams,
        medianStreams,
        maxStreams,
        minStreams,
        stdStreams,
        numAbove100k,
        numAbove1M,
        latestTrackId: latest.trackId,
        latestReleaseDate: latest.releaseDate,
        latestStreams28d:
          latest.spotifyStreams28d,
        latestTotalStreams:
          latest.spotifyStreamsTotal,
        avgDaysBetweenReleases:
          avgDaysBetweenReleases,
      },
      create: {
        artistId: artist.id,
        snapshotDate,
        numTracks: rows.length,
        windowDays,
        totalStreams: BigInt(totalStreams),
        avgStreams,
        medianStreams,
        maxStreams,
        minStreams,
        stdStreams,
        numAbove100k,
        numAbove1M,
        latestTrackId: latest.trackId,
        latestReleaseDate: latest.releaseDate,
        latestStreams28d:
          latest.spotifyStreams28d,
        latestTotalStreams:
          latest.spotifyStreamsTotal,
        avgDaysBetweenReleases:
          avgDaysBetweenReleases,
      },
    });
  }
}

if (require.main === module) {
  const dateArg = process.argv[2];
  if (!dateArg) {
    console.error(
      "Usage: ts-node jobs/etl/artist_spotify_release_stats.ts YYYY-MM-DD",
    );
    process.exit(1);
  }
  buildArtistSpotifyReleaseStats(dateArg)
    .then(() => {
      console.log(
        "ArtistSpotifyReleaseStats built for",
        dateArg,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
