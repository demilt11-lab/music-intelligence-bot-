// app/api/ui/pipeline-status/route.ts
//
// Operational status for the data pipeline: latest run per job, recent
// failures, and source freshness. Session-protected — this is the page an
// operator opens first when something looks wrong.
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireSession, AuthError } from '@/lib/auth/guard';
import { freshnessStatus, FRESHNESS_SLA_HOURS } from '@/lib/jobs/freshness';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireSession(req);

    const [latestRuns, recentFailures, lastReconcile, latestUgcDate, latestUgcGenreDate, latestPlaylistGenreDate, recentAnomalies] = await Promise.all([
      db.$queryRawUnsafe<
        {
          jobName: string;
          status: string;
          startedAt: Date;
          durationMs: number | null;
          rowsWritten: number | null;
          error: string | null;
        }[]
      >(
        `SELECT DISTINCT ON ("jobName")
           "jobName", status, "startedAt", "durationMs", "rowsWritten", error
         FROM job_runs
         ORDER BY "jobName", "startedAt" DESC`,
      ),
      db.jobRun.findMany({
        where: {
          status: 'failed',
          startedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
        },
        orderBy: { startedAt: 'desc' },
        take: 20,
        select: {
          jobName: true,
          startedAt: true,
          durationMs: true,
          error: true,
        },
      }),
      db.jobRun.findFirst({
        where: { jobName: 'etl:reconcile', status: { in: ['success', 'failed'] } },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true, status: true, meta: true },
      }),
      db.ugcTrackMetrics.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
      db.ugcGenreMetrics.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
      db.genrePlaylistMetrics.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
      // anomaly_detection.ts computes real rolling z-scores every 2 hours
      // (severity: low/medium/high), but nothing surfaced them anywhere
      // before this — high-severity, unacknowledged, last 7 days.
      db.anomalyLog.findMany({
        where: {
          severity: 'high',
          acknowledged: false,
          detectedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
        },
        orderBy: { detectedAt: 'desc' },
        take: 25,
      }),
    ]);

    const freshness = {
      slaHours: FRESHNESS_SLA_HOURS,
      ugcTrackMetrics: freshnessStatus(latestUgcDate?.date),
      ugcGenreMetrics: freshnessStatus(latestUgcGenreDate?.date),
      genrePlaylistMetrics: freshnessStatus(latestPlaylistGenreDate?.date),
    };

    const anomalyTrackIds = recentAnomalies
      .map((a: { trackId: number | null }) => a.trackId)
      .filter((id: number | null): id is number => id != null);
    const anomalyArtistIds = recentAnomalies
      .map((a: { artistId: number | null }) => a.artistId)
      .filter((id: number | null): id is number => id != null);
    const [anomalyTracks, anomalyArtists] = await Promise.all([
      anomalyTrackIds.length
        ? db.track.findMany({ where: { id: { in: anomalyTrackIds } }, select: { id: true, title: true } })
        : Promise.resolve([] as Array<{ id: number; title: string }>),
      anomalyArtistIds.length
        ? db.artist.findMany({ where: { id: { in: anomalyArtistIds } }, select: { id: true, name: true } })
        : Promise.resolve([] as Array<{ id: number; name: string }>),
    ]);
    const trackNameById = new Map(anomalyTracks.map((t: { id: number; title: string }) => [t.id, t.title]));
    const artistNameById = new Map(anomalyArtists.map((a: { id: number; name: string }) => [a.id, a.name]));

    const anomalies = recentAnomalies.map((a: {
      id: number;
      trackId: number | null;
      artistId: number | null;
      metric: string;
      zScore: number;
      currentValue: number;
      baselineMean: number;
      severity: string;
      detectedAt: Date;
    }) => ({
      id: a.id,
      entityType: a.trackId != null ? 'track' : 'artist',
      entityId: a.trackId ?? a.artistId,
      entityName:
        (a.trackId != null ? trackNameById.get(a.trackId) : artistNameById.get(a.artistId!)) ?? null,
      metric: a.metric,
      zScore: a.zScore,
      currentValue: a.currentValue,
      baselineMean: a.baselineMean,
      severity: a.severity,
      detectedAt: a.detectedAt,
    }));

    return NextResponse.json({
      obj: {
        jobs: latestRuns,
        recentFailures,
        lastReconcile,
        freshness,
        anomalies,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[ui/pipeline-status]', err);
    return NextResponse.json({ error: 'Failed to load pipeline status' }, { status: 500 });
  }
}
