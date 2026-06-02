/**
 * TikTok ingestion job
 *
 * - Fetches trending videos for music hashtags (#newmusic, #viral, #trending, #music, #fyp)
 * - Resolves sound → canonical Track via ExternalId or creates stubs
 * - Upserts TiktokVideoChartSnapshot + TiktokVideoChartRow (daily snapshot)
 * - Upserts TiktokVideoMetricsDaily per video
 * - Aggregates UGC metrics per track over the past 7 days → UgcTrackMetrics
 * - Updates TrackStatisticsLatest.tiktokCreations
 * - Fetches top TikTok creators/artists → TiktokUserChartSnapshot + TiktokUserChartRow
 */

import { db } from "@/lib/db";
import { queryVideos, queryCreators } from "@/lib/tiktok/client";
import { resolveTiktokSound } from "@/lib/tiktok/resolver";

// ─── Config ───────────────────────────────────────────────────────────────────

const MUSIC_HASHTAGS = ["newmusic", "viral", "trending", "music", "fyp"];
const TOP_CREATORS = [
  "charlidamelio",
  "addisonre",
  "khaby.lame",
  "bellapoarch",
  "itsjojosiwa",
];

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Video ingestion ──────────────────────────────────────────────────────────

interface VideoRecord {
  videoId: string;
  soundId: string;
  soundTitle: string;
  soundAuthor: string;
  views: bigint;
  likes: bigint;
  shares: bigint;
  comments: bigint;
  rank: number;
}

async function fetchTrendingVideos(): Promise<VideoRecord[]> {
  const today = new Date();
  const endDate = formatDate(today);
  const startDate = formatDate(new Date(today.getTime() - 7 * 86_400_000));

  const all: VideoRecord[] = [];
  let rank = 1;

  for (const hashtag of MUSIC_HASHTAGS) {
    console.log(`[tiktok] Fetching videos for #${hashtag}…`);
    try {
      const resp = await queryVideos({
        query: {
          and: [
            {
              field_name: "hashtag_name",
              field_values: [hashtag],
              operation: "EQ",
            },
          ],
        },
        start_date: startDate,
        end_date: endDate,
        max_count: 100,
      });

      if (resp.error?.code && resp.error.code !== "ok" && resp.error.code !== "") {
        console.warn(`[tiktok] API error for #${hashtag}: ${resp.error.message}`);
        continue;
      }

      for (const v of resp.data?.videos ?? []) {
        all.push({
          videoId: v.id,
          soundId: v.music_id ?? v.music?.id ?? "",
          soundTitle: v.music?.title ?? "Unknown",
          soundAuthor: v.music?.author_name ?? v.username ?? "Unknown",
          views: BigInt(v.view_count ?? 0),
          likes: BigInt(v.like_count ?? 0),
          shares: BigInt(v.share_count ?? 0),
          comments: BigInt(v.comment_count ?? 0),
          rank: rank++,
        });
      }
    } catch (err) {
      console.error(`[tiktok] Failed to fetch #${hashtag}:`, err);
    }

    await sleep(200);
  }

  return all;
}

// ─── Chart snapshot upsert ────────────────────────────────────────────────────

async function upsertVideoChartSnapshot(
  videos: VideoRecord[],
  snapshotDate: Date
): Promise<void> {
  const dateOnly = new Date(
    Date.UTC(snapshotDate.getUTCFullYear(), snapshotDate.getUTCMonth(), snapshotDate.getUTCDate())
  );

  const snapshot = await db.tiktokVideoChartSnapshot.upsert({
    where: {
      chartName_countryCode_snapshotDate: {
        chartName: "tiktok_trending_sounds",
        countryCode: null as unknown as string,
        snapshotDate: dateOnly,
      },
    },
    create: {
      chartName: "tiktok_trending_sounds",
      countryCode: null,
      snapshotDate: dateOnly,
    },
    update: {},
  });

  // Deduplicate by rank (keep first occurrence per rank)
  const seen = new Set<number>();
  for (const v of videos) {
    if (seen.has(v.rank)) continue;
    seen.add(v.rank);

    await db.tiktokVideoChartRow.upsert({
      where: {
        snapshotId_rank: {
          snapshotId: snapshot.id,
          rank: v.rank,
        },
      },
      create: {
        snapshotId: snapshot.id,
        videoId: v.videoId,
        rank: v.rank,
        views: v.views,
        likes: v.likes,
        shares: v.shares,
      },
      update: {
        videoId: v.videoId,
        views: v.views,
        likes: v.likes,
        shares: v.shares,
      },
    });
  }

  console.log(`[tiktok] Upserted chart snapshot id=${snapshot.id} with ${seen.size} rows`);
}

// ─── Per-video daily metrics ───────────────────────────────────────────────────

async function upsertVideoMetrics(
  videos: VideoRecord[],
  snapshotDate: Date
): Promise<void> {
  const dateOnly = new Date(
    Date.UTC(snapshotDate.getUTCFullYear(), snapshotDate.getUTCMonth(), snapshotDate.getUTCDate())
  );

  for (const v of videos) {
    await db.tiktokVideoMetricsDaily.upsert({
      where: {
        videoId_date: {
          videoId: v.videoId,
          date: dateOnly,
        },
      },
      create: {
        videoId: v.videoId,
        date: dateOnly,
        views: v.views,
        likes: v.likes,
        shares: v.shares,
        comments: v.comments,
      },
      update: {
        views: v.views,
        likes: v.likes,
        shares: v.shares,
        comments: v.comments,
      },
    });
  }

  console.log(`[tiktok] Upserted ${videos.length} video metric rows`);
}

// ─── Sound → Track resolution ─────────────────────────────────────────────────

async function resolveAllSounds(
  videos: VideoRecord[]
): Promise<Map<string, number>> {
  const soundToTrackId = new Map<string, number>();

  // Deduplicate sounds
  const uniqueSounds = new Map<
    string,
    { id: string; title: string; authorName: string }
  >();
  for (const v of videos) {
    if (v.soundId && !uniqueSounds.has(v.soundId)) {
      uniqueSounds.set(v.soundId, {
        id: v.soundId,
        title: v.soundTitle,
        authorName: v.soundAuthor,
      });
    }
  }

  console.log(`[tiktok] Resolving ${uniqueSounds.size} unique sounds…`);

  for (const sound of uniqueSounds.values()) {
    try {
      const resolved = await resolveTiktokSound(sound);
      soundToTrackId.set(sound.id, resolved.trackId);
      if (resolved.isNew) {
        console.log(`[tiktok] Created stub track id=${resolved.trackId} for sound "${sound.title}"`);
      }
    } catch (err) {
      console.error(`[tiktok] Failed to resolve sound ${sound.id}:`, err);
    }
  }

  return soundToTrackId;
}

// ─── UGC metrics (in-memory) ──────────────────────────────────────────────────

async function upsertUgcMetrics(
  videos: VideoRecord[],
  soundToTrackId: Map<string, number>,
  today: Date
): Promise<void> {
  const dateOnly = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  const sevenDaysAgo = new Date(dateOnly.getTime() - 7 * 86_400_000);

  // Get previous 7-day window metrics from DB for growth calculation
  const prevDate = new Date(sevenDaysAgo.getTime() - 7 * 86_400_000);

  const prevMetrics = await db.ugcTrackMetrics.findMany({
    where: {
      code2: "GLOBAL",
      date: {
        gte: prevDate,
        lt: sevenDaysAgo,
      },
    },
  });
  const prevByTrackId = new Map<number, { videos7d: number; views7d: bigint }>();
  for (const m of prevMetrics) {
    const existing = prevByTrackId.get(m.trackId);
    if (!existing || m.date > (prevByTrackId as unknown as Map<number, typeof m>).get(m.trackId)!.date) {
      prevByTrackId.set(m.trackId, { videos7d: m.videos7d, views7d: m.views7d });
    }
  }

  // Aggregate current window from in-memory videos
  type Agg = { videos7d: number; views7d: bigint };
  const aggByTrackId = new Map<number, Agg>();

  for (const v of videos) {
    const trackId = soundToTrackId.get(v.soundId);
    if (!trackId) continue;

    const cur = aggByTrackId.get(trackId) ?? { videos7d: 0, views7d: BigInt(0) };
    cur.videos7d += 1;
    cur.views7d += v.views;
    aggByTrackId.set(trackId, cur);
  }

  console.log(`[tiktok] Upserting UGC metrics for ${aggByTrackId.size} tracks…`);

  for (const [trackId, agg] of aggByTrackId) {
    const prev = prevByTrackId.get(trackId);

    const videos7dGrowth =
      prev && prev.videos7d > 0
        ? (agg.videos7d - prev.videos7d) / prev.videos7d
        : 0;

    const views7dGrowth =
      prev && prev.views7d > BigInt(0)
        ? Number(agg.views7d - prev.views7d) / Number(prev.views7d)
        : 0;

    await db.ugcTrackMetrics.upsert({
      where: {
        trackId_code2_date: {
          trackId,
          code2: "GLOBAL",
          date: dateOnly,
        },
      },
      create: {
        trackId,
        code2: "GLOBAL",
        date: dateOnly,
        videos7d: agg.videos7d,
        videos7dGrowth,
        views7d: agg.views7d,
        views7dGrowth,
        rankDelta7d: 0,
      },
      update: {
        videos7d: agg.videos7d,
        videos7dGrowth,
        views7d: agg.views7d,
        views7dGrowth,
      },
    });
  }
}

// ─── track_statistics_latest update ──────────────────────────────────────────

async function updateTrackStatistics(
  videos: VideoRecord[],
  soundToTrackId: Map<string, number>
): Promise<void> {
  // Aggregate total video count per trackId
  const countByTrackId = new Map<number, number>();
  for (const v of videos) {
    const trackId = soundToTrackId.get(v.soundId);
    if (!trackId) continue;
    countByTrackId.set(trackId, (countByTrackId.get(trackId) ?? 0) + 1);
  }

  console.log(`[tiktok] Updating track_statistics_latest for ${countByTrackId.size} tracks…`);

  for (const [trackId, count] of countByTrackId) {
    await db.trackStatisticsLatest.upsert({
      where: { trackId },
      create: {
        trackId,
        tiktokCreations: BigInt(count),
      },
      update: {
        tiktokCreations: BigInt(count),
      },
    });
  }
}

// ─── Creator chart ingestion ───────────────────────────────────────────────────

async function ingestCreators(today: Date): Promise<void> {
  const dateOnly = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );

  const snapshot = await db.tiktokUserChartSnapshot.upsert({
    where: {
      chartName_countryCode_snapshotDate: {
        chartName: "tiktok_top_music_creators",
        countryCode: null as unknown as string,
        snapshotDate: dateOnly,
      },
    },
    create: {
      chartName: "tiktok_top_music_creators",
      countryCode: null,
      snapshotDate: dateOnly,
    },
    update: {},
  });

  let rank = 1;
  for (const username of TOP_CREATORS) {
    console.log(`[tiktok] Fetching creator info for @${username}…`);
    try {
      const resp = await queryCreators({ username });

      if (resp.error?.code && resp.error.code !== "ok" && resp.error.code !== "") {
        console.warn(`[tiktok] Creator API error for @${username}: ${resp.error.message}`);
        rank++;
        continue;
      }

      const info = resp.data;
      if (!info) {
        rank++;
        continue;
      }

      // Try to find an existing artist by TikTok username ExternalId
      let artistId: number | null = null;
      const extId = await db.externalId.findFirst({
        where: {
          entityType: "artist",
          platform: "tiktok",
          externalId: username,
        },
      });

      if (extId) {
        artistId = extId.entityId;
      } else {
        // Try to find by display name
        const artist = await db.artist.findFirst({
          where: {
            name: { equals: info.display_name, mode: "insensitive" },
          },
        });
        if (artist) {
          artistId = artist.id;
          // Attach ExternalId
          await db.externalId.create({
            data: {
              entityType: "artist",
              entityId: artistId,
              platform: "tiktok",
              externalId: username,
            },
          }).catch(() => {
            // Ignore duplicate key errors
          });
        }
      }

      await db.tiktokUserChartRow.upsert({
        where: {
          snapshotId_rank: {
            snapshotId: snapshot.id,
            rank,
          },
        },
        create: {
          snapshotId: snapshot.id,
          artistId,
          tiktokUserId: username,
          rank,
          followers: BigInt(info.follower_count ?? 0),
          likes: BigInt(info.likes_count ?? 0),
        },
        update: {
          artistId,
          tiktokUserId: username,
          followers: BigInt(info.follower_count ?? 0),
          likes: BigInt(info.likes_count ?? 0),
        },
      });

      rank++;
    } catch (err) {
      console.error(`[tiktok] Failed to fetch creator @${username}:`, err);
      rank++;
    }

    await sleep(200);
  }

  console.log(`[tiktok] Upserted creator chart snapshot id=${snapshot.id} with ${rank - 1} rows`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("[tiktok] Starting TikTok ingestion job…");

  const today = new Date();

  // 1. Fetch trending videos
  let videos: VideoRecord[] = [];
  try {
    videos = await fetchTrendingVideos();
    console.log(`[tiktok] Fetched ${videos.length} total video records`);
  } catch (err) {
    console.warn("[tiktok] [WARN] Could not fetch trending videos:", (err as Error).message);
  }

  if (videos.length > 0) {
    // 2. Upsert chart snapshot + rows
    try {
      await upsertVideoChartSnapshot(videos, today);
    } catch (err) {
      console.warn("[tiktok] [WARN] Chart snapshot upsert failed:", (err as Error).message);
    }

    // 3. Upsert per-video daily metrics
    try {
      await upsertVideoMetrics(videos, today);
    } catch (err) {
      console.warn("[tiktok] [WARN] Video metrics upsert failed:", (err as Error).message);
    }

    // 4. Resolve sounds → canonical tracks
    let soundToTrackId = new Map<string, number>();
    try {
      soundToTrackId = await resolveAllSounds(videos);
    } catch (err) {
      console.warn("[tiktok] [WARN] Sound resolution failed:", (err as Error).message);
    }

    if (soundToTrackId.size > 0) {
      // 5. Aggregate and upsert UGC metrics
      try {
        await upsertUgcMetrics(videos, soundToTrackId, today);
      } catch (err) {
        console.warn("[tiktok] [WARN] UGC metrics upsert failed:", (err as Error).message);
      }

      // 6. Update track_statistics_latest
      try {
        await updateTrackStatistics(videos, soundToTrackId);
      } catch (err) {
        console.warn("[tiktok] [WARN] Track statistics update failed:", (err as Error).message);
      }
    }
  } else {
    console.warn("[tiktok] No videos fetched — skipping downstream steps");
  }

  // 7. Ingest top creators (independent of video data)
  try {
    await ingestCreators(today);
  } catch (err) {
    console.warn("[tiktok] [WARN] Creator ingestion failed:", (err as Error).message);
  }

  console.log("[tiktok] Ingestion job complete.");
  await db.$disconnect();
}

main().catch((err) => {
  console.error("[tiktok] Fatal error:", err);
  process.exit(1);
});
