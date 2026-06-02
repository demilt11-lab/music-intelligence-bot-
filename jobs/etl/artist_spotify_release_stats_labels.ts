// jobs/etl/artist_spotify_release_stats_labels.ts
import { db } from "@/lib/db";

export async function labelArtistSpotifyReleaseStats(
  sinceDateStr: string,
  untilDateStr: string,
) {
  const sinceDate = new Date(sinceDateStr);
  const untilDate = new Date(untilDateStr);

  const stats =
    await db.artistSpotifyReleaseStats.findMany({
      where: {
        snapshotDate: {
          gte: sinceDate,
          lte: untilDate,
        },
      },
    });

  for (const s of stats) {
    const windowStart = s.snapshotDate;
    const windowEnd = new Date(
      s.snapshotDate.getTime() +
        180 * 24 * 60 * 60 * 1000,
    ); // 6 months

    // Did this artist hit a Spotify top chart in that window?
    const chartRow =
      await db.chartRows.findFirst({
        where: {
          artistId: s.artistId,
          platform: "spotify",
          chartType: {
            in: [
              "spotify_top_daily",
              "spotify_top_weekly",
            ],
          },
          date: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
      });

    const popularWithin6m = !!chartRow;

    await db.artistSpotifyReleaseStats.update({
      where: { id: s.id },
      data: {
        popularWithin6m,
      },
    });
  }
}

if (require.main === module) {
  const sinceArg = process.argv[2];
  const untilArg = process.argv[3];
  if (!sinceArg || !untilArg) {
    console.error(
      "Usage: ts-node jobs/etl/artist_spotify_release_stats_labels.ts YYYY-MM-DD YYYY-MM-DD",
    );
    process.exit(1);
  }
  labelArtistSpotifyReleaseStats(
    sinceArg,
    untilArg,
  )
    .then(() => {
      console.log(
        "Labeled ArtistSpotifyReleaseStats",
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
