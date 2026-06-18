// app/api/artists/breaking/route.ts
//
// Breaking-artists leaderboard for the UI. Uses each artist's LATEST
// trajectory snapshot only — querying snapshots across all dates produced
// duplicate artists in the leaderboard (one row per historical snapshot).
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { Cache, TTL } from "@/lib/cache";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set([
  "ABOUT_TO_BREAK",
  "GROWING",
  "STABLE",
  "DECLINING",
]);

type LeaderboardRow = {
  artistId: number;
  date: Date;
  primaryGenre: string | null;
  primaryCode2: string | null;
  status: string;
  statusScore: number;
  breakProbability: number | null;
  spotifyBreakProb: number | null;
  streams28dDelta: number;
  playlistsDelta28d: number | null;
  followersDelta28d: number | null;
  total: bigint;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const statusParam = searchParams.get("status");
    const status =
      statusParam && VALID_STATUSES.has(statusParam) ? statusParam : null;
    const genre = searchParams.get("genre");
    const code2 = searchParams.get("code2");
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1),
      200,
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") || "0", 10) || 0,
      0,
    );

    const cacheKey = `breaking:${status ?? "all"}:${genre ?? ""}:${code2 ?? ""}:${limit}:${offset}`;
    const cached = Cache.get<object>(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { "x-cache": "hit" } });
    }

    const filters: Prisma.Sql[] = [];
    if (status) filters.push(Prisma.sql`latest.status = ${status}`);
    if (genre)
      filters.push(
        Prisma.sql`latest."primaryGenre" ILIKE ${"%" + genre + "%"}`,
      );
    if (code2) filters.push(Prisma.sql`latest."primaryCode2" = ${code2}`);

    const whereClause = filters.length
      ? Prisma.sql`WHERE ${Prisma.join(filters, " AND ")}`
      : Prisma.empty;

    const rows = await db.$queryRaw<LeaderboardRow[]>(Prisma.sql`
      WITH latest AS (
        SELECT DISTINCT ON ("artistId") *
        FROM "ArtistTrajectorySnapshot"
        ORDER BY "artistId", "date" DESC
      )
      SELECT
        latest."artistId",
        latest."date",
        latest."primaryGenre",
        latest."primaryCode2",
        latest.status,
        latest."statusScore",
        latest."breakProbability",
        latest."spotifyBreakProb",
        latest."streams28dDelta",
        latest."playlistsDelta28d",
        latest."followersDelta28d",
        COUNT(*) OVER ()::bigint AS total
      FROM latest
      ${whereClause}
      ORDER BY latest."statusScore" DESC, latest."artistId" ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const total = rows.length ? Number(rows[0].total) : 0;
    const artistIds = Array.from(new Set(rows.map((r) => r.artistId)));

    const artists = artistIds.length
      ? await db.artist.findMany({ where: { id: { in: artistIds } } })
      : [];
    const artistMap = new Map(artists.map((a) => [a.id, a]));

    const obj = rows.map((row) => {
      const a = artistMap.get(row.artistId);
      return {
        artistId: row.artistId.toString(),
        name: a?.name ?? null,
        code2: a?.country ?? null,
        primaryGenre: row.primaryGenre,
        primaryCode2: row.primaryCode2,
        status: row.status,
        statusScore: row.statusScore,
        breakProbability: row.breakProbability,
        // Model-backed probability when available; the plain breakProbability
        // is a heuristic momentum tier (see snapshot ETL).
        modelBreakProbability: row.spotifyBreakProb,
        breakProbabilitySource: row.spotifyBreakProb != null ? "model" : "heuristic",
        snapshotDate: row.date,
        streams28dDelta: row.streams28dDelta,
        playlistsDelta28d: row.playlistsDelta28d,
        followersDelta28d: row.followersDelta28d,
      };
    });

    const payload = { obj, offset, total };
    Cache.set(cacheKey, payload, TTL.SHORT);
    return NextResponse.json(payload, { headers: { "x-cache": "miss" } });
  } catch (err) {
    logger.error("[api/artists/breaking]", err);
    return NextResponse.json(
      { error: "Failed to load breaking artists" },
      { status: 500 },
    );
  }
}
