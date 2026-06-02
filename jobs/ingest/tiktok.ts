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

import "dotenv/config";
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

// ─── UGC metrics aggregation ──────────────────────────────────────────────────

async function aggregateUgcMetrics(
  soundToTrackId: Map<string, number>,
  today: Date
): Promise<void> {
  const dateOnly = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  const sevenDaysAgo = new Date(dateOnly.getTime() - 7 * 86_400_000);

  // Group video metrics by soundId over the past 7 days
  type SoundAgg = { videos7d: number; views7d: bigint };
  const aggBySoundId = new Map<string, SoundAgg>();

  // We need a mapping from videoId → soundId to aggregate
  // Re-derive it from the in-memory videos list (passed via closure via main())
  // Instead, query TiktokVideoMetricsDaily for the 7-day window
  const rows = await db.tiktokVideoMetricsDaily.findMany({
    where: {
      date: {
        gte: sevenDaysAgo,
        lte: dateOnly,
      },
    },
  });

  // We can't directly join to soundId from TiktokVideoMetricsDaily since it only
  // stores videoId. We rely on the in-memory snapshot we just ingested to map
  // videoId → soundId. For videos not in today's batch, we skip (no mapping available).
  // This is acceptable: we refresh mappings on each run.
  const videoIdToSoundId = new Map<string, string>();
  // Re-read from chart rows for today's snapshot
  const todaySnapshot = await db.tiktokVideoChartSnapshot.findFirst({
    where: {
      chartName: "tiktok_trending_sounds",
      snapshotDate: dateOnly,
    },
    include: { chartRows: true },
  });

  if (todaySnapshot) {
    // We stored videoId in chart rows; match against today's video list
    // Use a raw query to join chart rows with metrics
    for (const row of todaySnapshot.chartRows) {
      // We don't have soundId stored in chart rows. Use the in-memory mapping from
      // resolveAllSounds input. Since we can't pass it here easily, re-build from
      // today's metric rows that overlap with chart rows.
      // Mark videoId as "known" — actual soundId mapping comes from resolveAllSounds.
    }
  }

  // Simpler approach: aggregate directly from resolved soundToTrackId map.
  // For each sound that was resolved, aggregate its videos' metrics from today's rows.
  // Build videoId → soundId mapping from today's video records stored in chart snapshot.
  // We'll derive it from tiktok_video_chart_rows and tiktok_video_metrics_daily joined.
  // Since schema doesn't store soundId in chart rows, we use the passed-in resolvedMap
  // and the in-memory video list. We aggregate at call time from main().
  // NOTE: This function is restructured below in main() to pass videos directly.

  console.log(
    `[tiktok] UGC aggregation: ${rows.length} metric rows in 7-day window`
  );

  // Accumulate by trackId
  type TrackAgg = { videos7d: number; views7d: bigint };
  const aggByTrackId = new Map<number, TrackAgg>();

  // We need videoId → soundId. For rows in our current window, we can only do this
  // for videos whose soundId we know from today's batch (soundToTrackId keys).
  // Build a reverse lookup from trackId → soundId (first occurrence)
  const trackIdToSoundId = new Map<number, string>();
  for (const [soundId, trackId] of soundToTrackId) {
    if (!trackIdToSoundId.has(trackId)) {
      trackIdToSoundId.set(trackId, soundId);
    }
  }

  // For each metric row, check if videoId belongs to a known chart row
  // We don't have that mapping persisted. Best effort: aggregate all metrics
  // grouped by trackId using ExternalId lookup for the videos in today's batch.
  // Since we don't have a per-video → soundId mapping in the DB, we do a bulk
  // aggregation per trackId from today's rows only.
  for (const row of rows) {
    // We can't determine trackId from videoId alone without a stored mapping.
    // Skip — handled in main() where we have the in-memory videos list.
  }

  void aggBySoundId;
  void aggByTrackId;
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
  const videos = await fetchTrendingVideos();
  console.log(`[tiktok] Fetched ${videos.length} total video records`);

  if (videos.length === 0) {
    console.warn("[tiktok] No videos fetched — exiting early");
    await db.$disconnect();
    return;
  }

  // 2. Upsert chart snapshot + rows
  await upsertVideoChartSnapshot(videos, today);

  // 3. Upsert per-video daily metrics
  await upsertVideoMetrics(videos, today);

  // 4. Resolve sounds → canonical tracks
  const soundToTrackId = await resolveAllSounds(videos);

  // 5. Aggregate and upsert UGC metrics
  await upsertUgcMetrics(videos, soundToTrackId, today);

  // 6. Update track_statistics_latest
  await updateTrackStatistics(videos, soundToTrackId);

  // 7. Ingest top creators
  await ingestCreators(today);

  console.log("[tiktok] Ingestion job complete.");
  await db.$disconnect();
}

main().catch((err) => {
  console.error("[tiktok] Fatal error:", err);
  process.exit(1);
});
