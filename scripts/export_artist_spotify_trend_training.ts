// scripts/export_artist_spotify_trend_training.ts
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";

async function main() {
  const stats =
    await db.artistSpotifyReleaseStats.findMany({
      where: {
        popularWithin6m: {
          not: null,
        },
      },
    });

  const header = [
    "artist_id",
    "snapshot_date",
    "num_tracks",
    "window_days",
    "total_streams",
    "avg_streams",
    "median_streams",
    "max_streams",
    "min_streams",
    "std_streams",
    "num_above_100k",
    "num_above_1m",
    "latest_streams_28d",
    "latest_total_streams",
    "avg_days_between_releases",
    "popular_within_6m",
  ].join(",");

  const lines: string[] = [header];

  for (const s of stats) {
    lines.push(
      [
        s.artistId.toString(),
        s.snapshotDate
          .toISOString()
          .slice(0, 10),
        s.numTracks.toString(),
        s.windowDays.toString(),
        s.totalStreams.toString(),
        s.avgStreams.toString(),
        s.medianStreams.toString(),
        s.maxStreams.toString(),
        s.minStreams.toString(),
        s.stdStreams.toString(),
        s.numAbove100k.toString(),
        s.numAbove1M.toString(),
        s.latestStreams28d
          ? s.latestStreams28d.toString()
          : "0",
        s.latestTotalStreams
          ? s.latestTotalStreams.toString()
          : "0",
        s.avgDaysBetweenReleases
          ? s.avgDaysBetweenReleases.toString()
          : "0",
        s.popularWithin6m ? "1" : "0",
      ].join(","),
    );
  }

  const outDir = "output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(
    outDir,
    "artist_spotify_trend_training.csv",
  );
  writeFileSync(outPath, lines.join("\n"));
  console.log(
    "Wrote",
    outPath,
    "rows:",
    lines.length - 1,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
