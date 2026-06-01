// app/api/artists/[artistId]/trajectory/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { artistId: string } },
) {
  const artistId = BigInt(params.artistId);

  const [artist, snapshot, history, releases] =
    await Promise.all([
      db.artists.findUnique({
        where: { id: artistId },
      }),
      db.artistTrajectorySnapshot.findFirst({
        where: { artistId },
        orderBy: { date: "desc" },
      }),
      db.artistDailyStats.findMany({
        where: { artistId },
        orderBy: { date: "asc" },
        take: 120,
      }),
      db.tracks.findMany({
        where: {
          trackArtists: {
            some: { artistId },
          },
        },
        include: {
          track_statistics_latest: true,
          albums: true,
        },
      }),
    ]);

  if (!artist) {
    return NextResponse.json(
      { error: "Artist not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    obj: {
      artist: {
        id: artist.id.toString(),
        name: artist.name,
        code2: artist.code2,
      },
      snapshot,
      history: history.map((h) => ({
        ...h,
        totalStreams: h.totalStreams.toString(),
        playlistReach: h.playlistReach
          ? h.playlistReach.toString()
          : null,
      })),
      releases: releases.map((t) => ({
        id: t.id.toString(),
        name: t.name,
        isrc: t.isrc,
        albums: t.albums,
        statistics: t.track_statistics_latest
          ? {
              ...t.track_statistics_latest,
              spotifyStreams:
                t.track_statistics_latest.spotifyStreams?.toString() ??
                null,
            }
          : null,
      })),
    },
  });
}
