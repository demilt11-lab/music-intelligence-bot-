// scripts/export_artist_trajectory_features.ts
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";

async function main() {
  const sinceArg = process.argv[2];
  const untilArg = process.argv[3];

  const sinceDate = sinceArg
    ? new Date(sinceArg)
    : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const untilDate = untilArg
    ? new Date(untilArg)
    : new Date();

  const snapshots =
    await db.artistTrajectorySnapshot.findMany({
      where: {
        date: {
          gte: sinceDate,
          lte: untilDate,
        },
      },
      orderBy: [
        { artistId: "asc" },
        { date: "asc" },
      ],
    });

  const header = [
    "artist_id",
    "snapshot_date",
    "streams7d",
    "streams28d",
    "streams90d",
    "streams7dDelta",
    "streams28dDelta",
    "streams90dDelta",
    "playlistsDelta28d",
    "followersDelta28d",
    "tiktokVelocityScore",
    "airplayVelocityScore",
    "maxTrackProbViral",
    "spotifyBreakProb",
    "status",            // current rule-based label (optional for training)
    "primaryGenre",
    "primaryCode2",
  ].join(",");

  const lines: string[] = [header];

  for (const s of snapshots) {
    // read Spotify break prob directly from snapshot if present
    const spotifyBreakProb =
      s.spotifyBreakProb ?? 0;

    // compute tiktokVelocityScore & airplayVelocityScore from snapshot if you’ve stored them
    const tiktokVelocityScore =
      s.tiktokVelocityScore ?? 0;
    const airplayVelocityScore =
      s.airplayVelocityScore ?? 0;

    // derive maxTrackProbViral from associated TrackTrendPrediction rows
    const artistTracks =
      await db.track.findMany({
        where: {
          trackArtists: {
            some: { artistId: s.artistId },
          },
        },
        orderBy: { releaseDate: "desc" },
        take: 10,
      });

    const trackIds = artistTracks.map((t) => t.id);

    let maxTrackProbViral = 0;
    if (trackIds.length) {
      const preds =
        await db.trackTrendPrediction.findMany({
          where: {
            trackId: { in: trackIds },
          },
        });
      for (const p of preds) {
        if (p.probViral > maxTrackProbViral) {
          maxTrackProbViral = p.probViral;
        }
      }
    }

    lines.push(
      [
        s.artistId.toString(),
        s.date.toISOString().slice(0, 10),
        s.streams7d.toString(),
        s.streams28d.toString(),
        s.streams90d.toString(),
        s.streams7dDelta.toString(),
        s.streams28dDelta.toString(),
        s.streams90dDelta.toString(),
        (s.playlistsDelta28d ?? 0).toString(),
        (s.followersDelta28d ?? 0).toString(),
        tiktokVelocityScore.toString(),
        airplayVelocityScore.toString(),
        maxTrackProbViral.toString(),
        spotifyBreakProb.toString(),
        s.status,
        s.primaryGenre ?? "",
        s.primaryCode2 ?? "",
      ].join(","),
    );
  }

  const outDir = "output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(
    outDir,
    "artist_trajectory_features.csv",
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
