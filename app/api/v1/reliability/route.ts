/**
 * GET /api/v1/reliability
 *
 * Returns per-signal source reliability metrics for monitoring:
 * - % of each signal type from official vs unofficial sources
 * - Staleness rates per signal
 * - Missing signal rates per artist cohort
 *
 * Used by the ops dashboard to detect when a data source has gone dark.
 */
import { NextRequest, NextResponse } from "next/server";
import { withOptionalAuth } from "@/lib/auth/middleware";
import { prisma } from "@/lib/prisma";

const SIGNAL_TTL_HOURS_RELIABILITY: Record<string, number> = {
  tiktok_growth: 6, stream_velocity: 48, save_rate: 72,
  follower_velocity: 24, chart_momentum: 168, radio_spike: 168,
  playlist_signal: 24, pre_save_normalized: 72,
};

export const GET = withOptionalAuth(async (_req: NextRequest) => {
  const since = new Date(Date.now() - 7 * 24 * 3_600_000); // last 7 days

  const signals = await prisma.predictionSignal.findMany({
    where: { recordedAt: { gte: since } },
    select: { signalType: true, source: true, recordedAt: true, entityId: true },
  });

  // Group by signalType
  const byType: Record<string, typeof signals> = {};
  for (const s of signals) {
    (byType[s.signalType] ??= []).push(s);
  }

  const report = Object.entries(byType).map(([signalType, rows]) => {
    const total = rows.length;
    const official = rows.filter(r => {
      const src = (r.source ?? "").toLowerCase();
      return src.includes("official") || src.includes("spotify") || src.includes("distributor");
    }).length;
    const unofficial = rows.filter(r => {
      const src = (r.source ?? "").toLowerCase();
      return src.includes("unofficial") || src.includes("scrape") || src.includes("har");
    }).length;
    const unknown = total - official - unofficial;

    const ttl = SIGNAL_TTL_HOURS_RELIABILITY[signalType] ?? 24;
    const now = Date.now();
    const stale = rows.filter(r => (now - r.recordedAt.getTime()) / 3_600_000 > ttl).length;
    const uniqueArtists = new Set(rows.map(r => r.entityId)).size;

    return {
      signalType,
      total,
      uniqueArtists,
      officialPct: total > 0 ? Math.round((official / total) * 100) : 0,
      unofficialPct: total > 0 ? Math.round((unofficial / total) * 100) : 0,
      unknownPct: total > 0 ? Math.round((unknown / total) * 100) : 0,
      stalePct: total > 0 ? Math.round((stale / total) * 100) : 0,
      ttlHours: ttl,
      healthStatus: (
        stale / Math.max(total, 1) > 0.5 ? "degraded" :
        unofficial / Math.max(total, 1) > 0.5 ? "at_risk" :
        "healthy"
      ) as "healthy" | "at_risk" | "degraded",
    };
  });

  // Overall health
  const degraded = report.filter(r => r.healthStatus === "degraded").length;
  const atRisk = report.filter(r => r.healthStatus === "at_risk").length;
  const overallHealth = degraded > 0 ? "degraded" : atRisk > 0 ? "at_risk" : "healthy";

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    windowDays: 7,
    overallHealth,
    signals: report.sort((a, b) => b.total - a.total),
    alerts: [
      ...report.filter(r => r.healthStatus === "degraded").map(r =>
        `DEGRADED: ${r.signalType} — ${r.stalePct}% stale signals`
      ),
      ...report.filter(r => r.healthStatus === "at_risk").map(r =>
        `AT RISK: ${r.signalType} — ${r.unofficialPct}% unofficial sources`
      ),
    ],
  });
});
