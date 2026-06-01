// app/api/artists/breaking/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const status = searchParams.get("status"); // ABOUT_TO_BREAK | GROWING | DECLINING | STABLE
  const genre = searchParams.get("genre");
  const code2 = searchParams.get("code2");
  const limit = Math.min(
    parseInt(searchParams.get("limit") || "50", 10),
    200,
  );
  const offset = parseInt(
    searchParams.get("offset") || "0",
    10,
  );

  const where: any = {};
  if (status) where.status = status;
  if (genre) where.primaryGenre = genre;
  if (code2) where.primaryCode2 = code2;

  const [rows, total] = await Promise.all([
    db.artistTrajectorySnapshot.findMany({
      where,
      orderBy: { statusScore: "desc" },
      take: limit,
      skip: offset,
    }),
    db.artistTrajectorySnapshot.count({ where }),
  ]);

  const artistIds = [
    ...new Set(rows.map((r) => r.artistId)),
  ];

  const artists = await db.artists.findMany({
    where: { id: { in: artistIds } },
  });

  const artistMap = new Map(
    artists.map((a) => [a.id.toString(), a]),
  );

  const obj = rows.map((row) => {
    const a = artistMap.get(row.artistId.toString());
    return {
      artistId: row.artistId.toString(),
      name: a?.name ?? null,
      code2: a?.code2 ?? null,
      primaryGenre: row.primaryGenre,
      primaryCode2: row.primaryCode2,
      status: row.status,
      statusScore: row.statusScore,
      breakProbability: row.breakProbability,
      streams28dDelta: row.streams28dDelta,
      playlistsDelta28d: row.playlistsDelta28d,
      followersDelta28d: row.followersDelta28d,
    };
  });

  return NextResponse.json({
    obj,
    offset,
    total,
  });
}
