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

// GET /api/v1/watchlist — list user's watchlist
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await db.watchlist.findMany({
    where: { userId: user.id },
    include: {
      artist: {
        select: { id: true, name: true, slug: true, imageUrl: true, popularity: true },
      },
    },
    orderBy: [{ priority: "desc" }, { addedAt: "desc" }],
  });

  return NextResponse.json({ watchlist: entries });
}

// POST /api/v1/watchlist — add artist to watchlist
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { artistId, notes, priority = "normal" } = body;

  if (!artistId || typeof artistId !== "number") {
    return NextResponse.json({ error: "artistId (number) required" }, { status: 400 });
  }
  if (!["high", "normal", "low"].includes(priority)) {
    return NextResponse.json({ error: "priority must be high | normal | low" }, { status: 400 });
  }

  const entry = await db.watchlist.upsert({
    where: { userId_artistId: { userId: user.id, artistId } },
    create: { userId: user.id, artistId, notes, priority },
    update: { notes, priority },
    include: {
      artist: { select: { id: true, name: true, slug: true, imageUrl: true } },
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}

// DELETE /api/v1/watchlist?artistId=123 — remove from watchlist
export async function DELETE(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const artistId = Number(req.nextUrl.searchParams.get("artistId"));
  if (!artistId) return NextResponse.json({ error: "artistId required" }, { status: 400 });

  await db.watchlist.deleteMany({ where: { userId: user.id, artistId } });
  return NextResponse.json({ removed: true });
}
