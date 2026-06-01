// scripts/export_artist_trajectory_training.ts
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { db } from "@/lib/db";

async function main() {
  const snapshots =
    await db.artistTrajectorySnapshot.findMany({
      where: {
        // optional filters, e.g., last year
      },
    });

  const rows: string[] = [];
  rows.push(
    [
      "artist_id",
      "date",
      "streams28dDelta",
      "streams7dDelta",
      "playlistsDelta28d",
      "followersDelta28d",
      "status",
    ].join(","),
  );

  for (const s of snapshots) {
    rows.push(
      [
        s.artistId.toString(),
        s.date.toISOString().slice(0, 10),
        s.streams28dDelta.toString(),
        s.streams7dDelta.toString(),
        (s.playlistsDelta28d ?? 0).toString(),
        (s.followersDelta28d ?? 0).toString(),
        s.status,
      ].join(","),
    );
  }

  const csv = rows.join("\n");
  writeFileSync("output/artist_trajectory_training.csv", csv);
  console.log(
    "Wrote output/artist_trajectory_training.csv",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
