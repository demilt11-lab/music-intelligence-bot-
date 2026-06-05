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

// GET /api/v1/alerts — list user's alerts (unread first, latest 50)
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "true";

  const alerts = await db.alert.findMany({
    where: { userId: user.id, ...(unreadOnly ? { read: false } : {}) },
    include: {
      artist: { select: { id: true, name: true, slug: true } },
    },
    orderBy: [{ read: "asc" }, { createdAt: "desc" }],
    take: 50,
  });

  const unreadCount = await db.alert.count({ where: { userId: user.id, read: false } });

  return NextResponse.json({ alerts, unreadCount });
}

// PATCH /api/v1/alerts — mark alerts as read
// Body: { ids: number[] } or { all: true }
export async function PATCH(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { ids, all } = body;

  if (all) {
    const { count } = await db.alert.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    return NextResponse.json({ updated: count });
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids[] or all:true required" }, { status: 400 });
  }

  const { count } = await db.alert.updateMany({
    where: { userId: user.id, id: { in: ids } },
    data: { read: true },
  });
  return NextResponse.json({ updated: count });
}
