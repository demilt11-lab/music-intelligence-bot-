// app/api/public/v1/artist/trajectory/predict/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getTenantByApiKey } from "@/lib/platform/auth";

const INTERNAL_URL =
  process.env.INTERNAL_ARTIST_TRAJECTORY_URL ||
  "http://localhost:3000/api/v1/artist/trajectory/predict";

export async function POST(req: NextRequest) {
  try {
    const rawKey = req.headers.get("x-api-key");
    if (!rawKey) {
      return NextResponse.json(
        { error: "Invalid or missing API key" },
        { status: 401 },
      );
    }

    try {
      await getTenantByApiKey(rawKey);
    } catch {
      return NextResponse.json(
        { error: "Invalid or missing API key" },
        { status: 401 },
      );
    }

    const body = await req.json();

    const artistIds: number[] = body.artistIds;
    if (!artistIds || !artistIds.length) {
      return NextResponse.json(
        { error: "artistIds array is required" },
        { status: 400 },
      );
    }

    // Forward to internal service
    const res = await fetch(INTERNAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ artistIds }),
    });

    const json = await res.json();

    return NextResponse.json(json, {
      status: res.status,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
