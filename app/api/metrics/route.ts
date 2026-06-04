import { NextResponse } from "next/server";
import { metrics } from "@/lib/monitoring/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  // Only allow from internal/monitoring networks in production
  const enabled = process.env.METRICS_ENABLED !== "false";
  if (!enabled) {
    return new NextResponse("Metrics disabled", { status: 404 });
  }

  return new NextResponse(metrics.toPrometheusText(), {
    status: 200,
    headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
