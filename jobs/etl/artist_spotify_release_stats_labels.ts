// jobs/etl/artist_spotify_release_stats_labels.ts
//
// Backfills the `popularWithin6m` outcome label on ArtistSpotifyReleaseStats:
// did any of the artist's tracks appear on a Spotify chart within 180 days
// after the snapshot? Used as the training target for the Spotify trend model,
// so it must only look FORWARD from the snapshot date (no feature leakage).
import { db } from "@/lib/db";
import { runTrackedJob } from '@/lib/jobs/tracker';

const LABEL_WINDOW_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function labelArtistSpotifyReleaseStats(
  sinceDateStr: string,
  untilDateStr: string,
) {
  const sinceDate = new Date(sinceDateStr);
  const untilDate = new Date(untilDateStr);
  if (Number.isNaN(sinceDate.getTime()) || Number.isNaN(untilDate.getTime())) {
    throw new Error(`Invalid date range: ${sinceDateStr}..${untilDateStr}`);
  }

  const stats = await db.artistSpotifyReleaseStats.findMany({
    where: {
      snapshotDate: { gte: sinceDate, lte: untilDate },
    },
  });

  let labeled = 0;

  for (const s of stats) {
    const windowStart = s.snapshotDate;
    const windowEnd = new Date(
      s.snapshotDate.getTime() + LABEL_WINDOW_DAYS * MS_PER_DAY,
    );

    // Only label snapshots whose full outcome window has elapsed — labeling
    // a window that hasn't finished yet would bias the target toward 0.
    if (windowEnd > new Date()) continue;

    // Did any track by this artist hit a Spotify chart inside the window?
    const chartRow = await db.chartRow.findFirst({
      where: {
        track: {
          trackArtists: { some: { artistId: s.artistId } },
        },
        snapshot: {
          platform: "spotify",
          snapshotDate: { gte: windowStart, lte: windowEnd },
        },
      },
      select: { id: true },
    });

    await db.artistSpotifyReleaseStats.update({
      where: { id: s.id },
      data: { popularWithin6m: !!chartRow },
    });
    labeled++;
  }

  console.log(
    `[release-stats-labels] window=${sinceDateStr}..${untilDateStr} snapshots=${stats.length} labeled=${labeled}`,
  );
  return { snapshots: stats.length, labeled };
}

if (require.main === module) {
  const sinceArg = process.argv[2];
  const untilArg = process.argv[3];
  if (!sinceArg || !untilArg) {
    console.error(
      "Usage: tsx jobs/etl/artist_spotify_release_stats_labels.ts YYYY-MM-DD YYYY-MM-DD",
    );
    process.exit(1);
  }
  runTrackedJob('etl:release-stats-labels', () => labelArtistSpotifyReleaseStats(sinceArg, untilArg))
    .then(({ snapshots, labeled }) => {
      console.log(`Labeled ${labeled}/${snapshots} ArtistSpotifyReleaseStats`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
