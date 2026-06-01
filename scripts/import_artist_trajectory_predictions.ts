// scripts/import_artist_trajectory_predictions.ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";

type Row = {
  artist_id: string;
  snapshot_date: string;
  pred_status: string;
  pred_break_prob: string;
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
    "output/artist_trajectory_predictions.csv";
  const rows = parseCsv(csvPath);

  for (const row of rows) {
    const artistId = parseInt(row.artist_id, 10);
    if (!artistId) continue;

    const snapshotDate = new Date(row.snapshot_date);

    const snapshot =
      await db.artistTrajectorySnapshot.findFirst({
        where: {
          artistId,
          date: snapshotDate,
        },
      });

    if (!snapshot) continue;

    const breakProb = parseFloat(
      row.pred_break_prob || "0",
    );

    await db.artistTrajectorySnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: row.pred_status,
        statusScore: breakProb,
        breakProbability: breakProb,
        // keep spotifyBreakProb etc. as separate fields
      },
    });
  }

  console.log(
    `Imported artist trajectory predictions for ${rows.length} snapshots`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
