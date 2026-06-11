/**
 * Instagram/Meta Reels music ingestion job
 *
 * - Searches trending music hashtags on Instagram Reels
 * - Resolves audio → canonical Track via caption/hashtag fuzzy matching
 * - Aggregates per-track engagement (likes, comments, plays) over current batch
 * - Upserts TrackPlatformStatsDaily with platform='instagram'
 * - Computes instagramReels7d, instagramPlays7d, instagramGrowth7d per track
 */

import { db } from '@/lib/db';
import {
  searchHashtagId,
  getHashtagTopMedia,
  getHashtagRecentMedia,
} from '@/lib/instagram/client';
import { resolveInstagramAudio } from '@/lib/instagram/resolver';
import { runTrackedJob } from '@/lib/jobs/tracker';

// ─── Config ────────────────────────────────────────────────────────────────────

const MUSIC_HASHTAGS = [
  'newmusic',
  'viral',
  'viralmusic',
  'reelsmusic',
  'musicreels',
  'trending',
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MediaRecord {
  mediaId: string;
  caption: string;
  hashtags: string[];
  likes: bigint;
  comments: bigint;
  plays: bigint;
  timestamp: string;
}

interface TrackAggregate {
  reelCount: number;
  totalLikes: bigint;
  totalComments: bigint;
  totalPlays: bigint;
}

// ─── Fetch media for hashtags ──────────────────────────────────────────────────

async function fetchTrendingReels(): Promise<MediaRecord[]> {
  const all: MediaRecord[] = [];

  for (const hashtag of MUSIC_HASHTAGS) {
    console.log(`[instagram] Fetching media for #${hashtag}…`);

    try {
      const hashtagId = await searchHashtagId(hashtag);
      if (!hashtagId) {
        console.warn(`[instagram] No hashtag ID found for #${hashtag} — skipping`);
        await sleep(200);
        continue;
      }

      await sleep(200);

      // Fetch both top and recent media
      const [topMedia, recentMedia] = await Promise.allSettled([
        getHashtagTopMedia(hashtagId, 'id,like_count,comments_count,media_type,timestamp,caption'),
        getHashtagRecentMedia(hashtagId, 'id,like_count,comments_count,media_type,timestamp,caption'),
      ]);

      const items = [
        ...(topMedia.status === 'fulfilled' ? topMedia.value : []),
        ...(recentMedia.status === 'fulfilled' ? recentMedia.value : []),
      ];

      // Deduplicate by media ID
      const seen = new Set<string>();
      for (const item of items) {
        if (!item.id || seen.has(item.id)) continue;
        seen.add(item.id);

        // Only ingest Reels (video posts)
        if (item.media_type && item.media_type !== 'VIDEO') continue;

        const caption = item.caption ?? '';
        // Extract hashtags from caption
        const captionHashtags = (caption.match(/#\w+/g) ?? []).map((h) => h.toLowerCase());

        all.push({
          mediaId: item.id,
          caption,
          hashtags: captionHashtags,
          likes: BigInt(item.like_count ?? 0),
          comments: BigInt(item.comments_count ?? 0),
          plays: BigInt(item.plays ?? 0),
          timestamp: item.timestamp ?? new Date().toISOString(),
        });
      }

      console.log(`[instagram] #${hashtag}: fetched ${seen.size} unique media items`);
    } catch (err) {
      console.error(`[instagram] Failed to process #${hashtag}:`, err);
    }

    await sleep(200);
  }

  return all;
}

// ─── Resolve tracks from media ─────────────────────────────────────────────────

async function resolveTracksFromMedia(
  media: MediaRecord[],
): Promise<Map<number, TrackAggregate>> {
  const aggByTrackId = new Map<number, TrackAggregate>();

  console.log(`[instagram] Resolving tracks from ${media.length} media items…`);

  for (const item of media) {
    try {
      const trackId = await resolveInstagramAudio(item.caption, item.hashtags);
      if (!trackId) continue;

      const cur = aggByTrackId.get(trackId) ?? {
        reelCount: 0,
        totalLikes: BigInt(0),
        totalComments: BigInt(0),
        totalPlays: BigInt(0),
      };

      cur.reelCount += 1;
      cur.totalLikes += item.likes;
      cur.totalComments += item.comments;
      cur.totalPlays += item.plays;

      aggByTrackId.set(trackId, cur);
    } catch (err) {
      console.error(`[instagram] Failed to resolve track for media ${item.mediaId}:`, err);
    }

    await sleep(200);
  }

  console.log(`[instagram] Resolved ${aggByTrackId.size} unique tracks`);
  return aggByTrackId;
}

// ─── Upsert platform stats ─────────────────────────────────────────────────────

async function upsertPlatformStats(
  aggByTrackId: Map<number, TrackAggregate>,
  today: Date,
): Promise<void> {
  const dateOnly = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const sevenDaysAgo = new Date(dateOnly.getTime() - 7 * 86_400_000);

  console.log(`[instagram] Upserting platform stats for ${aggByTrackId.size} tracks…`);

  for (const [trackId, agg] of aggByTrackId) {
    // Fetch prior 7-day window to compute growth
    const prevStats = await db.trackPlatformStatsDaily.findMany({
      where: {
        trackId,
        platform: 'instagram',
        date: {
          gte: new Date(sevenDaysAgo.getTime() - 7 * 86_400_000),
          lt: sevenDaysAgo,
        },
      },
    });

    let prevPlays = BigInt(0);
    let prevReels = 0;
    for (const s of prevStats) {
      prevPlays += s.videoViews ?? BigInt(0);
      // Each day row represents the reels ingested that day — use shares as proxy
      // for reel count (we store reelCount in shares field as a workaround since
      // there is no dedicated reels column)
      prevReels += Number(s.shares ?? 0);
    }

    // instagramGrowth7d: relative growth of plays vs prior window
    const instagramGrowth7d =
      prevPlays > BigInt(0)
        ? Number(agg.totalPlays - prevPlays) / Number(prevPlays)
        : 0;

    await db.trackPlatformStatsDaily.upsert({
      where: {
        trackId_platform_date: {
          trackId,
          platform: 'instagram',
          date: dateOnly,
        },
      },
      create: {
        trackId,
        platform: 'instagram',
        date: dateOnly,
        videoViews: agg.totalPlays,
        likes: agg.totalLikes,
        comments: agg.totalComments,
        // Repurpose `shares` to store reel count for this day's batch
        shares: BigInt(agg.reelCount),
      },
      update: {
        videoViews: agg.totalPlays,
        likes: agg.totalLikes,
        comments: agg.totalComments,
        shares: BigInt(agg.reelCount),
      },
    });

    // Log computed metrics
    const instagramReels7d = agg.reelCount + prevReels;
    const instagramPlays7d = agg.totalPlays + prevPlays;

    console.log(
      `[instagram] trackId=${trackId} reels7d=${instagramReels7d} ` +
        `plays7d=${instagramPlays7d} growth=${(instagramGrowth7d * 100).toFixed(1)}%`,
    );
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('[instagram] Starting Instagram Reels ingestion job…');

  const today = new Date();

  // 1. Fetch trending Reels media for music hashtags
  let media: MediaRecord[] = [];
  try {
    media = await fetchTrendingReels();
    console.log(`[instagram] Fetched ${media.length} total Reel records`);
  } catch (err) {
    console.warn('[instagram] [WARN] Could not fetch trending reels:', (err as Error).message);
  }

  if (media.length === 0) {
    console.warn('[instagram] No media fetched — Instagram API may require user token or hashtag permissions. Completing without data.');
    await db.$disconnect();
    return;
  }

  // 2. Resolve tracks from media captions and hashtags
  let aggByTrackId = new Map<number, TrackAggregate>();
  try {
    aggByTrackId = await resolveTracksFromMedia(media);
  } catch (err) {
    console.warn('[instagram] [WARN] Track resolution failed:', (err as Error).message);
  }

  if (aggByTrackId.size === 0) {
    console.warn('[instagram] No tracks resolved — completing without stats upsert.');
    await db.$disconnect();
    return;
  }

  // 3. Upsert platform stats daily
  try {
    await upsertPlatformStats(aggByTrackId, today);
  } catch (err) {
    console.warn('[instagram] [WARN] Platform stats upsert failed:', (err as Error).message);
  }

  console.log('[instagram] Ingestion job complete.');
  await db.$disconnect();
}

runTrackedJob('ingest:instagram', main).catch((err) => {
  console.error('[instagram] Fatal error:', err);
  process.exit(1);
});
