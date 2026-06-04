import { NextRequest, NextResponse } from "next/server";
import { runDailyIngestion } from "@/lib/ingestion/daily-ingest";
import { logger } from "@/lib/monitoring/logger";

export const runtime = "nodejs";
export const maxDuration = 300;  // 5 min Vercel limit

export async function POST(req: NextRequest) {
  // Verify cron secret: check Authorization header = "Bearer {CRON_SECRET}"
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { limit = 10_000, dryRun = false } = body;

  logger.info("Daily ingestion cron triggered", { limit, dryRun });

  try {
    const result = await runDailyIngestion({ limit, dryRun });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error("Daily ingestion failed", { error: String(err) });
    return NextResponse.json(
      { error: "Ingestion failed", details: String(err) },
      { status: 500 }
    );
  }
}
