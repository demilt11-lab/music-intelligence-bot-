import { NextResponse } from "next/server";
import db from "@/lib/db";
import { metrics } from "@/lib/monitoring/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ComponentStatus {
  status: "ok" | "degraded" | "down";
  latencyMs?: number;
  error?: string;
}

async function checkDatabase(): Promise<ComponentStatus> {
  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - t0 };
  } catch (err) {
    return { status: "down", error: err instanceof Error ? err.message : "unknown", latencyMs: Date.now() - t0 };
  }
}

export async function GET() {
  const t0 = Date.now();
  const [db_status] = await Promise.all([checkDatabase()]);

  const allOk = db_status.status === "ok";
  const overallStatus = allOk ? "ok" : "degraded";
  const httpStatus = allOk ? 200 : 503;

  const body = {
    status: overallStatus,
    components: {
      database: db_status,
    },
    metrics: metrics.snapshot(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - t0,
  };

  return NextResponse.json(body, { status: httpStatus });
}
