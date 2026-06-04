import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "music-intelligence-api",
      version: process.env.npm_package_version ?? "unknown",
      buildSha: process.env.BUILD_SHA ?? "dev",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
