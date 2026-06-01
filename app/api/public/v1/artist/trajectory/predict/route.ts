// app/api/public/v1/artist/trajectory/predict/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const INTERNAL_URL =
  process.env.INTERNAL_ARTIST_TRAJECTORY_URL ||
  "http://localhost:3000/api/v1/artist/trajectory/predict";

async function validateApiKey(apiKey: string | null) {
  if (!apiKey) return null;

  // Adjust field names to your actual api_keys schema
  const keyRecord = await db.apiKeys.findFirst({
    where: {
      key: apiKey,
      active: true,
    },
  });

  return keyRecord;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");
    const keyRecord = await validateApiKey(apiKey);

    if (!keyRecord) {
      return NextResponse.json(
        { error: "Invalid or missing API key" },
        { status: 401 },
      );
    }

    const body = await req.json();

    // Optionally enforce tenant/limit rules here based on keyRecord
    // e.g., enforce max artistIds per request, etc.
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
