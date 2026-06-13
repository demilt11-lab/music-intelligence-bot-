/**
 * MCP (Model Context Protocol) server — /api/mcp
 *
 * Exposes music intelligence data as MCP tools that Claude (or any MCP client)
 * can call. Auth: session cookie OR x-api-key header.
 *
 * Tools:
 *   get_breaking_artists   — artists ranked by trajectory/break probability
 *   get_artist_trajectory  — full trajectory snapshot for one artist
 *   get_track_details      — track metadata + streaming stats
 *   get_track_trend        — ML viral/trending predictions for a track
 *   get_talent_scout_list  — daily UGC breakout track list
 *   search_music           — full-text search across artists, tracks, playlists
 *   get_watchlist          — tenant watchlist (requires authenticated session or API key)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getTenantByApiKey } from '@/lib/platform/auth';
import { getSessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function resolveTenant(req: NextRequest): Promise<number | null> {
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) {
    try {
      const { tenantId } = await getTenantByApiKey(apiKey);
      return tenantId;
    } catch {
      return null;
    }
  }
  const user = await getSessionUser();
  return user?.tenantId ?? null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeJson(value: unknown): string {
  return JSON.stringify(
    value,
    (_k, v) => (typeof v === 'bigint' ? Number(v) : v),
    2,
  );
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: safeJson(value) }] };
}

// ── Server factory ────────────────────────────────────────────────────────────

function buildServer(tenantId: number | null) {
  const server = new McpServer({
    name: 'music-intelligence',
    version: '1.0.0',
  });

  // ── get_breaking_artists ──────────────────────────────────────────────────
  server.registerTool(
    'get_breaking_artists',
    {
      title: 'Get Breaking Artists',
      description:
        'Returns a ranked list of artists ordered by their trajectory score and break probability. ' +
        'Filter by status (ABOUT_TO_BREAK, GROWING, STABLE, DECLINING), genre, or country code.',
      inputSchema: z.object({
        status: z
          .enum(['ABOUT_TO_BREAK', 'GROWING', 'STABLE', 'DECLINING'])
          .optional()
          .describe('Filter to a specific trajectory status'),
        genre: z.string().optional().describe('Filter by primary genre (e.g. "Hip-Hop")'),
        code2: z.string().optional().describe('ISO-2 country code (e.g. "US", "BR")'),
        limit: z.number().int().min(1).max(50).default(20).describe('Number of results (max 50)'),
      }),
    },
    async ({ status, genre, code2, limit }) => {
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (genre) where.primaryGenre = genre;
      if (code2) where.primaryCode2 = code2.toUpperCase();

      const rows = await db.artistTrajectorySnapshot.findMany({
        where,
        orderBy: { statusScore: 'desc' },
        take: limit,
        distinct: ['artistId'],
      });

      const artists = await db.artist.findMany({
        where: { id: { in: rows.map((r) => r.artistId) } },
        select: { id: true, name: true, country: true },
      });
      const artistMap = new Map(artists.map((a) => [a.id, a]));

      return text(
        rows.map((row) => {
          const a = artistMap.get(row.artistId);
          return {
            artistId: row.artistId,
            name: a?.name ?? null,
            country: a?.country ?? null,
            status: row.status,
            statusScore: row.statusScore,
            breakProbability: row.breakProbability,
            modelBreakProbability: row.spotifyBreakProb,
            primaryGenre: row.primaryGenre,
            primaryCode2: row.primaryCode2,
            streams28dDelta: row.streams28dDelta,
            playlistsDelta28d: row.playlistsDelta28d,
            tiktokVelocityScore: row.tiktokVelocityScore,
            snapshotDate: row.date,
          };
        }),
      );
    },
  );

  // ── get_artist_trajectory ─────────────────────────────────────────────────
  server.registerTool(
    'get_artist_trajectory',
    {
      title: 'Get Artist Trajectory',
      description:
        'Returns the latest trajectory snapshot for a specific artist, including ' +
        'streaming deltas, playlist growth, follower changes, and ML break probability.',
      inputSchema: z.object({
        artistId: z.number().int().describe('Internal artist ID'),
      }),
    },
    async ({ artistId }) => {
      const [artist, snapshot] = await Promise.all([
        db.artist.findUnique({
          where: { id: artistId },
          select: { id: true, name: true, country: true, bio: true },
        }),
        db.artistTrajectorySnapshot.findFirst({
          where: { artistId },
          orderBy: { date: 'desc' },
        }),
      ]);

      if (!artist) {
        return text({ error: `Artist ${artistId} not found` });
      }

      return text({ artist, trajectory: snapshot });
    },
  );

  // ── get_track_details ─────────────────────────────────────────────────────
  server.registerTool(
    'get_track_details',
    {
      title: 'Get Track Details',
      description:
        'Returns full track metadata including artists, release date, ISRC, ' +
        'and latest streaming statistics (Spotify streams, TikTok creations, YouTube views).',
      inputSchema: z.object({
        trackId: z.number().int().describe('Internal track ID'),
      }),
    },
    async ({ trackId }) => {
      const track = await db.track.findUnique({
        where: { id: trackId },
        include: {
          trackArtists: { include: { artist: { select: { id: true, name: true } } }, orderBy: { position: 'asc' } },
          statisticsLatest: true,
        },
      });

      if (!track) return text({ error: `Track ${trackId} not found` });

      return text({
        id: track.id,
        title: track.title,
        isrc: track.isrc,
        releaseDate: track.releaseDate,
        explicit: track.explicit,
        artists: track.trackArtists.map((ta) => ta.artist),
        stats: track.statisticsLatest
          ? {
              spotifyStreams: Number(track.statisticsLatest.totalStreams ?? 0),
              tiktokCreations: Number(track.statisticsLatest.tiktokCreations ?? 0),
              youtubeViews: Number(track.statisticsLatest.youtubeViews ?? 0),
              shazamCount: Number(track.statisticsLatest.shazamCount ?? 0),
              spotifyPopularity: track.statisticsLatest.spotifyPopularity,
            }
          : null,
      });
    },
  );

  // ── get_track_trend ───────────────────────────────────────────────────────
  server.registerTool(
    'get_track_trend',
    {
      title: 'Get Track Trend Prediction',
      description:
        'Returns the latest ML model predictions for a track: probability of going viral, ' +
        'trending, or popular, plus the current ground-truth trend label.',
      inputSchema: z.object({
        trackId: z.number().int().describe('Internal track ID'),
      }),
    },
    async ({ trackId }) => {
      const [prediction, label] = await Promise.all([
        db.trackTrendPrediction.findFirst({
          where: { trackId },
          orderBy: { predictedAt: 'desc' },
        }),
        db.trackTrendLabel.findFirst({
          where: { trackId },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      return text({
        trackId,
        prediction: prediction
          ? {
              label: prediction.label,
              probViral: prediction.probViral,
              probTrending: prediction.probTrending,
              probPopular: prediction.probPopular,
              probNone: prediction.probNone,
              modelName: prediction.modelName,
              modelVersion: prediction.modelVersion,
              predictedAt: prediction.predictedAt,
            }
          : null,
        currentLabel: label?.label ?? null,
      });
    },
  );

  // ── get_talent_scout_list ─────────────────────────────────────────────────
  server.registerTool(
    'get_talent_scout_list',
    {
      title: 'Get Talent Scout List',
      description:
        'Returns the daily UGC breakout track list — tracks with the highest viral scores ' +
        'combining ML signals, TikTok UGC momentum, streaming data, and Luminate metrics.',
      inputSchema: z.object({
        date: z
          .string()
          .optional()
          .describe('YYYY-MM-DD date to fetch (defaults to today)'),
        code2: z
          .string()
          .optional()
          .default('GLOBAL')
          .describe('ISO-2 country code or GLOBAL'),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    },
    async ({ date, code2, limit }) => {
      const queryDate = date ?? new Date().toISOString().slice(0, 10);
      const d = new Date(queryDate);
      const rows = await db.talentScoutScore.findMany({
        where: {
          date: { gte: d, lt: new Date(d.getTime() + 86_400_000) },
          ...(code2 !== 'GLOBAL' ? { code2: code2.toUpperCase() } : {}),
        },
        orderBy: { viralScore: 'desc' },
        take: limit,
      });

      const trackIds = rows.map((r) => r.trackId);
      const tracks = await db.track.findMany({
        where: { id: { in: trackIds } },
        include: {
          trackArtists: { include: { artist: { select: { name: true } } }, orderBy: { position: 'asc' } },
        },
      });
      const trackMap = new Map(tracks.map((t) => [t.id, t]));

      return text(
        rows.map((row) => {
          const t = trackMap.get(row.trackId);
          return {
            trackId: row.trackId,
            title: t?.title ?? null,
            artists: t?.trackArtists.map((ta) => ta.artist.name) ?? [],
            code2: row.code2,
            viralScore: row.viralScore,
            rightsComplexityScore: row.rightsComplexityScore,
            date: row.date,
          };
        }),
      );
    },
  );

  // ── search_music ──────────────────────────────────────────────────────────
  server.registerTool(
    'search_music',
    {
      title: 'Search Music',
      description:
        'Full-text search across artists, tracks, playlists, and albums. ' +
        'Returns the top matching results with basic metadata.',
      inputSchema: z.object({
        query: z.string().min(1).max(100).describe('Search term'),
        type: z
          .enum(['all', 'artist', 'track', 'playlist', 'album'])
          .default('all')
          .describe('Entity type to search'),
        limit: z.number().int().min(1).max(20).default(10),
      }),
    },
    async ({ query, type, limit }) => {
      const q = `%${query}%`;
      const results: Record<string, unknown[]> = {};

      if (type === 'all' || type === 'artist') {
        results.artists = await db.artist.findMany({
          where: { name: { contains: query, mode: 'insensitive' } },
          take: limit,
          select: { id: true, name: true, country: true },
        });
      }

      if (type === 'all' || type === 'track') {
        results.tracks = (await db.track.findMany({
          where: { title: { contains: query, mode: 'insensitive' } },
          take: limit,
          include: {
            trackArtists: {
              include: { artist: { select: { name: true } } },
              orderBy: { position: 'asc' },
            },
          },
        })).map((t) => ({
          id: t.id,
          title: t.title,
          isrc: t.isrc,
          artists: t.trackArtists.map((ta) => ta.artist.name),
        }));
      }

      if (type === 'all' || type === 'album') {
        results.albums = await db.album.findMany({
          where: { title: { contains: query, mode: 'insensitive' } },
          take: limit,
          select: { id: true, title: true, releaseDate: true, label: true },
        });
      }

      return text(results);
    },
  );

  // ── get_watchlist ─────────────────────────────────────────────────────────
  server.registerTool(
    'get_watchlist',
    {
      title: 'Get Watchlist',
      description:
        'Returns the authenticated tenant\'s watchlist — artists and tracks being actively ' +
        'monitored. Requires a valid API key (x-api-key header) or session cookie.',
      inputSchema: z.object({}),
    },
    async () => {
      if (!tenantId) {
        return text({ error: 'Authentication required: provide x-api-key header or sign in.' });
      }

      const items = await db.watchlistItem.findMany({
        where: { tenantId },
        orderBy: { addedAt: 'desc' },
      });

      return text(items);
    },
  );

  return server;
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handle(req: NextRequest): Promise<Response> {
  const tenantId = await resolveTenant(req);

  // For non-initialization requests, require auth
  const body = req.method === 'POST' ? await req.clone().json().catch(() => null) : null;
  const isInit = body?.method === 'initialize';
  if (!tenantId && !isInit) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: provide x-api-key header or sign in' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no server-side session state
    enableJsonResponse: true,       // return JSON instead of SSE for simple calls
  });

  const server = buildServer(tenantId);
  await server.connect(transport);

  return transport.handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function DELETE(req: NextRequest) {
  return handle(req);
}
