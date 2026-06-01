// scripts/import_artist_spotify_trend_predictions.ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";

type Row = {
  artist_id: string;
  snapshot_date: string;
  prob_popular_within_6m: string;
  model_name: string;
  model_version: string;
};

function parseCsv(path: string): Row[] {
  const text = readFileSync(path, "utf8");
  const [headerLine, ...lines] = text
    .split(/\r?\n/)
    .filter(Boolean);
  const headers = headerLine.split(",");
  return lines.map((line) => {
    const cols = line.split(",");
    const obj: any = {};
    headers.forEach((h, i) => {
      obj[h] = cols[i];
    });
    return obj as Row;
  });
}

async function main() {
  const csvPath =
    process.argv[2] ||
    "output/artist_spotify_trend_predictions.csv";
  const rows = parseCsv(csvPath);

  for (const row of rows) {
    const artistId = parseInt(row.artist_id, 10);
    if (!artistId) continue;

    const snapshotDate = new Date(row.snapshot_date);

    // Find latest trajectory snapshot on or before this date
    const snapshot =
      await db.artistTrajectorySnapshot.findFirst({
        where: {
          artistId,
          date: {
            lte: snapshotDate,
          },
        },
        orderBy: {
          date: "desc",
        },
      });

    if (!snapshot) {
      // No trajectory snapshot yet; you could also choose to create one here
      continue;
    }

    const prob = parseFloat(
      row.prob_popular_within_6m || "0",
    );

    await db.artistTrajectorySnapshot.update({
      where: { id: snapshot.id },
      data: {
        spotifyBreakProb: prob,
        spotifyModelName: row.model_name,
        spotifyModelVersion: row.model_version,
      },
    });
  }

  console.log(
    `Imported Spotify trend predictions for ${rows.length} artists`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
