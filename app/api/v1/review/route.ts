/**
 * Human Review Queue API
 *
 * GET  /api/v1/review          — list pending review items
 * POST /api/v1/review/:id      — submit A&R decision on a review item
 *
 * Items are routed here when model confidence is 40–60% (uncertain zone)
 * or when contradictory signals are detected (high TikTok + low save_rate).
 *
 * Decisions are stored as high-weight training signals (weight=1.0 confirmed,
 * weight=0.5 uncertain) and used in the next retraining run.
 *
 * IMPORTANT: Human decisions are NEVER used as the sole training label.
 * They are blended with chart-monitor outcomes via label_weight.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const runtime = "nodejs";

async function getAuthUser(req: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET /api/v1/review — fetch pending review items (A&R team only)
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status = req.nextUrl.searchParams.get("status") ?? "pending";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 50);

  const items = await db.humanReviewItem.findMany({
    where: { status },
    include: {
      artist: { select: { id: true, name: true, slug: true, imageUrl: true } },
      decision: {
        select: { decision: true, decidedAt: true, labelWeight: true },
      },
    },
    orderBy: { enqueuedAt: "asc" },
    take: limit,
  });

  const pendingCount = await db.humanReviewItem.count({ where: { status: "pending" } });

  return NextResponse.json({ items, pendingCount });
}

// POST /api/v1/review — submit a decision on a review item
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { reviewId, decision, notes } = body as {
    reviewId?: string;
    decision?: string;
    notes?: string;
  };

  if (!reviewId || !decision) {
    return NextResponse.json(
      { error: "reviewId and decision required" },
      { status: 400 }
    );
  }

  const validDecisions = ["breakout", "no_breakout", "uncertain"];
  if (!validDecisions.includes(decision)) {
    return NextResponse.json(
      { error: `decision must be one of: ${validDecisions.join(", ")}` },
      { status: 400 }
    );
  }

  const item = await db.humanReviewItem.findUnique({
    where: { id: reviewId },
    select: { id: true, artistId: true, breakoutProb: true, status: true },
  });

  if (!item) return NextResponse.json({ error: "Review item not found" }, { status: 404 });
  if (item.status !== "pending") {
    return NextResponse.json({ error: "Review item already resolved" }, { status: 409 });
  }

  // Label weight: confirmed decisions (breakout/no_breakout) = 1.0, uncertain = 0.5
  const labelWeight = decision === "uncertain" ? 0.5 : 1.0;

  const [reviewDecision] = await db.$transaction([
    db.humanReviewDecision.create({
      data: {
        reviewId,
        artistId: item.artistId,
        reviewerId: user.id,
        decision,
        notes: notes ?? null,
        originalProb: item.breakoutProb,
        labelWeight,
        usedInTraining: false,
      },
    }),
    db.humanReviewItem.update({
      where: { id: reviewId },
      data: { status: "reviewed" },
    }),
  ]);

  return NextResponse.json({ decision: reviewDecision }, { status: 201 });
}
