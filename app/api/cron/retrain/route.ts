import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/monitoring/logger";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;  // just triggers async job, doesn't wait

export async function POST(req: NextRequest) {
  // Auth check
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { triggeredBy = "weekly_cron", notes } = body as {
    triggeredBy?: string;
    notes?: string;
  };

  // Find currently active model version for tracking previous
  const activeModel = await prisma.modelVersion.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  // Create a RetrainingRun record with status "pending"
  const run = await prisma.retrainingRun.create({
    data: {
      triggeredBy,
      status: "pending",
      previousVersionId: activeModel?.id ?? null,
      notes: notes ?? null,
    },
    select: { id: true },
  });

  logger.info("Retraining run created", { runId: run.id, triggeredBy });

  // Write trigger file that a Python watchdog picks up
  try {
    const triggerDir = path.join(process.cwd(), "ml", "outputs");
    fs.mkdirSync(triggerDir, { recursive: true });
    const triggerPath = path.join(triggerDir, ".retrain_trigger");
    fs.writeFileSync(
      triggerPath,
      JSON.stringify({ runId: run.id, triggeredBy, createdAt: new Date().toISOString() })
    );
    logger.info("Retrain trigger file written", { path: triggerPath });
  } catch (err) {
    // Non-fatal: the DB record alone is sufficient for monitoring
    logger.error("Failed to write retrain trigger file", { error: String(err) });
  }

  return NextResponse.json({ success: true, runId: run.id, status: "pending" });
}
