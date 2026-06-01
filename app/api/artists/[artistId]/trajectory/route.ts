import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { artistId: string } },
) {
  const artistId = Number(params.artistId);
  if (!Number.isFinite(artistId)) {
    return NextResponse.json({ error: 'Invalid artistId' }, { status: 400 });
  }

  const [artist, snapshot, history] = await Promise.all([
    db.artist.findUnique({ where: { id: artistId } }),
    db.artistTrajectorySnapshot.findFirst({
      where: { artistId: artistId },
      orderBy: { date: 'desc' },
    }),
    db.artistDailyStats.findMany({
      where: { artistId: artistId },
      orderBy: { date: 'asc' },
      take: 120,
    }),
  ]);

  if (!artist) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }

  return NextResponse.json({
    obj: {
      artist: { id: artist.id, name: artist.name },
      snapshot,
      history: history.map((h) => ({
        ...h,
        artistId: h.artistId.toString(),
        totalStreams: h.totalStreams.toString(),
        totalListeners: h.totalListeners?.toString() ?? null,
        totalFollowers: h.totalFollowers?.toString() ?? null,
      })),
    },
  });
}
