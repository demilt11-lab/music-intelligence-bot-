// scripts/import_track_trend_predictions.ts
import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "@/lib/db";

type Row = {
  track_id: string;
  genre: string;
  code2: string;
  pred_label: string;
  prob_viral: string;
  prob_trending: string;
  prob_popular: string;
  prob_none: string;
  model_name: string;
  model_version: string;
};

function parseCsv(path: string): Row[] {
  const text = readFileSync(path, "utf8");
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
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
    "output/track_trend_predictions.csv";
  const rows = parseCsv(csvPath);

  for (const row of rows) {
    const trackId = parseInt(row.track_id, 10);
    if (!trackId) continue;

    await db.trackTrendPrediction.upsert({
      where: {
        trackId_genre_code2_modelName_modelVersion: {
          trackId,
          genre: row.genre || null,
          code2: row.code2 || null,
          modelName: row.model_name,
          modelVersion: row.model_version,
        },
      },
      update: {
        label: row.pred_label,
        probViral: parseFloat(row.prob_viral || "0"),
        probTrending: parseFloat(
          row.prob_trending || "0",
        ),
        probPopular: parseFloat(
          row.prob_popular || "0",
        ),
        probNone: parseFloat(row.prob_none || "0"),
        predictedAt: new Date(),
      },
      create: {
        trackId,
        genre: row.genre || null,
        code2: row.code2 || null,
        label: row.pred_label,
        probViral: parseFloat(row.prob_viral || "0"),
        probTrending: parseFloat(
          row.prob_trending || "0",
        ),
        probPopular: parseFloat(
          row.prob_popular || "0",
        ),
        probNone: parseFloat(row.prob_none || "0"),
        modelName: row.model_name,
        modelVersion: row.model_version,
        predictedAt: new Date(),
      },
    });
  }

  console.log(
    `Imported ${rows.length} track trend predictions`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
