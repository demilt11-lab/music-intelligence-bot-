// scripts/export_track_trend_training.ts
import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";

async function main() {
  const labels = await db.trackTrendLabel.findMany({
    where: {
      label: {
        in: ["VIRAL", "TRENDING", "POPULAR", "NONE"],
      },
    },
    include: {
      track: {
        include: {
          audioFeatures: true,
          trackTags: {
            include: { tag: true },
          },
        },
      },
    },
  });

  const rows: string[] = [];
  rows.push(
    [
      "track_id",
      "genre",
      "code2",
      "label",
      "tempo",
      "key",
      "mode",
      "energy",
      "danceability",
      "valence",
      "loudness",
      "instrumentalness",
      "primary_tag",
      "playlist_streams7d",
      "ugc_views7d",
      "viral_score",
    ].join(","),
  );

  // Preload latest GenrePlaylistMetrics and UgcTrackMetrics per track/region if you want
  // For simplicity, we use aggregated genre/country metrics from today
  const today = new Date().toISOString().slice(0, 10);

  const genreMetrics =
    await db.genrePlaylistMetrics.findMany({
      where: { date: new Date(today) },
    });

  const genreMap = new Map<string, number>();
  for (const g of genreMetrics) {
    const key = `${g.genre}-${g.country}`;
    genreMap.set(key, Number(g.streams7d));
  }

  const talentScores = await db.talentScoutScore.findMany({
    where: { date: new Date(today) },
  });

  const talentMap = new Map<string, number>();
  for (const t of talentScores) {
    const key = `${t.trackId}-${t.code2}`;
    talentMap.set(key, t.viralScore);
  }

  for (const l of labels) {
    const af = l.track.audioFeatures;
    if (!af) continue;

    const primaryTag =
      l.track.trackTags?.[0]?.tag?.name ?? "";

    const genreKey = `${l.genre ?? "unknown"}-${
      l.code2 ?? "GLOBAL"
    }`;
    const playlistStreams7d =
      genreMap.get(genreKey) ?? 0;

    const talentKey = `${l.trackId}-${l.code2 ?? "GLOBAL"}`;
    const viralScore = talentMap.get(talentKey) ?? 0;

    rows.push(
      [
        l.trackId.toString(),
        l.genre ?? "",
        l.code2 ?? "",
        l.label,
        (af.tempo ?? 0).toString(),
        (af.key ?? 0).toString(),
        (af.mode ?? 0).toString(),
        (af.energy ?? 0).toString(),
        (af.danceability ?? 0).toString(),
        (af.valence ?? 0).toString(),
        (af.loudness ?? 0).toString(),
        (af.instrumentalness ?? 0).toString(),
        primaryTag,
        playlistStreams7d.toString(),
        "0", // you can join in UgcTrackMetrics per track/region here if needed
        viralScore.toString(),
      ].join(","),
    );
  }

  const outDir = "output";
  mkdirSync(outDir, { recursive: true });
  const outPath = join(
    outDir,
    "track_trend_training.csv",
  );
  writeFileSync(outPath, rows.join("\n"));
  console.log(
    "Wrote",
    outPath,
    "rows:",
    rows.length - 1,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
