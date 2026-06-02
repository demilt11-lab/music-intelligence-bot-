/**
 * YouTube ingestion pipeline
 * - Trending music videos for 10 regions
 * - YouTube Shorts trending music
 * - Refreshes video stats for tracks already linked to YouTube videos
 *
 * Quota budget (10,000 units/day):
 *   10 trending calls × 1 unit   =   10 units
 *    1 Shorts search call × 100  =  100 units
 *   batch stats refresh          ≤  200 units (up to 200 × 50-id pages)
 *   Total worst-case             ≈  310 units  (well within limit)
 */

import { db } from '@/lib/db';
import {
  getTrendingMusicVideos,
  getYouTubeShortsCharts,
  getVideoStats,
  YtVideo,
  YtSearchItem,
} from '@/lib/youtube/client';
import { resolveYoutubeVideo } from '@/lib/youtube/resolver';

// ─── Config ──────────────────────────────────────────────────────────────────

const REGIONS = ['US', 'GB', 'AU', 'CA', 'BR', 'DE', 'FR', 'MX', 'KR', 'NG'] as const;
const DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayDate(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Upsert a YoutubeShortssChartSnapshot + rows for a given chart name / region.
 * `videos` can come from either a trending list (YtVideo[]) or search results
 * converted to a common shape.
 */
async function upsertYoutubeChart(
  chartName: string,
  countryCode: string,
  videos: Array<{ videoId: string; views?: bigint; likes?: bigint; comments?: bigint }>,
): Promise<void> {
  const snapshotDate = todayDate();

  const snapshot = await db.youtubeShortssChartSnapshot.upsert({
    where: {
      chartName_countryCode_snapshotDate: {
        chartName,
        countryCode,
        snapshotDate,
      },
    },
    create: { chartName, countryCode, snapshotDate },
    update: {},
  });

  // Delete existing rows for this snapshot so we can re-insert with fresh ranks
  await db.youtubeShortsChartRow.deleteMany({ where: { snapshotId: snapshot.id } });

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    await db.youtubeShortsChartRow.create({
      data: {
        snapshotId: snapshot.id,
        videoId: v.videoId,
        rank: i + 1,
        views: v.views ?? null,
        likes: v.likes ?? null,
        comments: v.comments ?? null,
      },
    });
  }
}

/**
 * Upsert track_platform_stats_daily and track_statistics_latest for a YouTube video.
 */
async function upsertTrackStats(trackId: number, viewCount: bigint): Promise<void> {
  const date = todayDate();

  await db.trackPlatformStatsDaily.upsert({
    where: { trackId_platform_date: { trackId, platform: 'youtube', date } },
    create: { trackId, platform: 'youtube', date, videoViews: viewCount },
    update: { videoViews: viewCount },
  });

  await db.trackStatisticsLatest.upsert({
    where: { trackId },
    create: { trackId, youtubeViews: viewCount },
    update: { youtubeViews: viewCount },
  });
}

// ─── Phase 1: Trending music videos per region ───────────────────────────────

async function ingestTrendingRegion(regionCode: string): Promise<void> {
  console.log(`[youtube] Fetching trending music — region: ${regionCode}`);
  const response = await getTrendingMusicVideos(regionCode);
  await sleep(DELAY_MS);

  const chartVideos: Array<{ videoId: string; views?: bigint; likes?: bigint; comments?: bigint }> = [];

  for (const video of response.items) {
    const snippet = video.snippet;
    const stats = video.statistics;
    if (!snippet) continue;

    const viewCount = stats?.viewCount ? BigInt(stats.viewCount) : undefined;
    const likeCount = stats?.likeCount ? BigInt(stats.likeCount) : undefined;
    const commentCount = stats?.commentCount ? BigInt(stats.commentCount) : undefined;

    chartVideos.push({
      videoId: video.id,
      views: viewCount,
      likes: likeCount,
      comments: commentCount,
    });

    // Resolve to canonical track and update stats
    const trackId = await resolveYoutubeVideo({
      id: video.id,
      title: snippet.title,
      channelTitle: snippet.channelTitle,
      channelId: snippet.channelId,
    });

    if (viewCount !== undefined) {
      await upsertTrackStats(trackId, viewCount);
    }
  }

  await upsertYoutubeChart('youtube_trending_music', regionCode, chartVideos);
  console.log(`[youtube] Region ${regionCode}: ${chartVideos.length} videos ingested`);
}

// ─── Phase 2: YouTube Shorts trending (US only — 100 quota units) ────────────

async function ingestShortsChart(): Promise<void> {
  console.log('[youtube] Fetching YouTube Shorts trending music — US');
  const response = await getYouTubeShortsCharts('US', 25);
  await sleep(DELAY_MS);

  // Collect video IDs so we can fetch stats in one batch (1 quota unit)
  const videoIds = response.items
    .map((item: YtSearchItem) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));

  let statsMap = new Map<string, { views?: bigint; likes?: bigint; comments?: bigint }>();

  if (videoIds.length > 0) {
    const statsResponse = await getVideoStats(videoIds);
    await sleep(DELAY_MS);
    for (const v of statsResponse.items) {
      statsMap.set(v.id, {
        views: v.statistics?.viewCount ? BigInt(v.statistics.viewCount) : undefined,
        likes: v.statistics?.likeCount ? BigInt(v.statistics.likeCount) : undefined,
        comments: v.statistics?.commentCount ? BigInt(v.statistics.commentCount) : undefined,
      });
    }
  }

  const chartVideos: Array<{ videoId: string; views?: bigint; likes?: bigint; comments?: bigint }> = [];

  for (const item of response.items) {
    const videoId = item.id?.videoId;
    if (!videoId || !item.snippet) continue;

    const s = statsMap.get(videoId);
    chartVideos.push({ videoId, views: s?.views, likes: s?.likes, comments: s?.comments });

    const trackId = await resolveYoutubeVideo({
      id: videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      channelId: item.snippet.channelId,
    });

    if (s?.views !== undefined) {
      await upsertTrackStats(trackId, s.views);
    }
  }

  await upsertYoutubeChart('youtube_shorts_trending', 'US', chartVideos);
  console.log(`[youtube] Shorts chart: ${chartVideos.length} videos ingested`);
}

// ─── Phase 3: Refresh stats for existing DB tracks with YouTube external_ids ──

async function refreshExistingTrackStats(): Promise<void> {
  console.log('[youtube] Refreshing stats for tracks already linked to YouTube videos');

  const externalIds = await db.externalId.findMany({
    where: { platform: 'youtube', entityType: 'track' },
    select: { externalId: true, entityId: true },
  });

  if (externalIds.length === 0) {
    console.log('[youtube] No existing YouTube-linked tracks found');
    return;
  }

  // Batch into groups of 50
  const chunkSize = 50;
  let refreshed = 0;

  for (let i = 0; i < externalIds.length; i += chunkSize) {
    const chunk = externalIds.slice(i, i + chunkSize);
    const videoIds = chunk.map((e) => e.externalId);

    const statsResponse = await getVideoStats(videoIds);
    await sleep(DELAY_MS);

    for (const video of statsResponse.items) {
      const linked = chunk.find((e) => e.externalId === video.id);
      if (!linked || !video.statistics?.viewCount) continue;

      const viewCount = BigInt(video.statistics.viewCount);
      await upsertTrackStats(linked.entityId, viewCount);
      refreshed++;
    }
  }

  console.log(`[youtube] Refreshed stats for ${refreshed} tracks`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Validate required env vars up front
  if (!process.env.YOUTUBE_API_KEY) throw new Error('Missing required env var: YOUTUBE_API_KEY');
  if (!process.env.DATABASE_URL) throw new Error('Missing required env var: DATABASE_URL');

  console.log('[youtube] Starting YouTube ingestion pipeline');
  const start = Date.now();

  // Phase 1: Trending music per region
  for (const region of REGIONS) {
    await ingestTrendingRegion(region);
  }

  // Phase 2: Shorts chart
  await ingestShortsChart();

  // Phase 3: Refresh existing track stats
  await refreshExistingTrackStats();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[youtube] Pipeline complete in ${elapsed}s`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error('[youtube] Fatal error:', err);
  process.exit(1);
});
