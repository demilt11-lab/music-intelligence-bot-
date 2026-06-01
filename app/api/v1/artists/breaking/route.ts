import { NextRequest, NextResponse } from 'next/server';
import { buildRequestContext, requireScope } from '@/lib/platform/context';
import { enforceRateLimit } from '@/lib/platform/rate-limit';
import { logRequest } from '@/lib/platform/logging';
import { db } from '@/lib/db';

const VALID_STATUSES = ['ABOUT_TO_BREAK', 'GROWING', 'STABLE', 'DECLINING'];
const endpoint = '/api/v1/artists/breaking';

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;

  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, 'artists:read');
    await enforceRateLimit(ctx, `tenant:${ctx.tenantId}:artists:breaking`);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const genre = searchParams.get('genre');
    const code2 = searchParams.get('code2');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10), 0);

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    const where: Record<string, any> = {};
    if (status) where.status = status;
    if (genre) where.primaryGenre = genre;
    if (code2) where.primaryCode2 = code2.toUpperCase();

    const [rows, total] = await Promise.all([
      db.artistTrajectorySnapshot.findMany({
        where,
        orderBy: { statusScore: 'desc' },
        take: limit,
        skip: offset,
        distinct: ['artistId'],
      }),
      db.artistTrajectorySnapshot.groupBy({
        by: ['artistId'],
        where,
        _count: true,
      }).then((r) => r.length),
    ]);

    const artistIds = rows.map((r) => r.artistId);
    const artists = await db.artists.findMany({ where: { id: { in: artistIds } } });
    const artistMap = new Map(artists.map((a) => [a.id.toString(), a]));

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
        tiktokVelocityScore: row.tiktokVelocityScore,
        airplayVelocityScore: row.airplayVelocityScore,
        date: row.date,
      };
    });

    await logRequest(ctx, endpoint, 'GET', 200, startedAt);
    return NextResponse.json({ obj, offset, total }, { status: 200 });
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? 'Internal server error' : (err.message ?? 'Error');
    if (ctx) await logRequest(ctx, endpoint, 'GET', status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
