// app/api/public/v1/artist/trajectory/predict/route.ts
import { NextRequest, NextResponse } from "next/server";
import { buildRequestContext, requireScope } from "@/lib/platform/context";
import { enforceRateLimit } from "@/lib/platform/rate-limit";
import { logRequest } from "@/lib/platform/logging";

const endpoint = "/api/public/v1/artist/trajectory/predict";

const BASE = process.env.INTERNAL_API_BASE_URL;
const INTERNAL_URL = BASE
  ? `${BASE}/api/v1/artist/trajectory/predict`
  : null;

const MAX_ARTIST_IDS = 100;

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let ctx;
  try {
    ctx = await buildRequestContext(req);
    requireScope(ctx, "artists:trajectory:read");
    await enforceRateLimit(ctx, "public:trajectory:predict", 30);

    const body = await req.json().catch(() => ({}));

    const artistIds: unknown = body.artistIds;
    if (
      !Array.isArray(artistIds) ||
      artistIds.length === 0 ||
      !artistIds.every((id) => Number.isInteger(id) && id > 0)
    ) {
      return NextResponse.json(
        { error: "artistIds must be a non-empty array of positive integers" },
        { status: 400 },
      );
    }
    if (artistIds.length > MAX_ARTIST_IDS) {
      return NextResponse.json(
        { error: `artistIds cannot exceed ${MAX_ARTIST_IDS} per request` },
        { status: 400 },
      );
    }

    if (!INTERNAL_URL) {
      await logRequest(ctx, endpoint, "POST", 503, startedAt);
      return NextResponse.json({ error: "Service not configured" }, { status: 503 });
    }

    // Forward to the internal prediction service, but never pass its raw
    // response straight through — an internal-only error (stack trace,
    // service host, etc.) must not reach an external API caller.
    let json: unknown;
    let upstreamStatus: number;
    try {
      const res = await fetch(INTERNAL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistIds }),
      });
      upstreamStatus = res.status;
      json = await res.json().catch(() => null);
    } catch (fetchErr) {
      console.error(`[${endpoint}] upstream fetch failed:`, fetchErr);
      await logRequest(ctx, endpoint, "POST", 502, startedAt);
      return NextResponse.json({ error: "Prediction service unavailable" }, { status: 502 });
    }

    await logRequest(ctx, endpoint, "POST", upstreamStatus, startedAt);

    if (upstreamStatus >= 200 && upstreamStatus < 300) {
      // Success shape is unchanged from before — pass the upstream body
      // through directly so existing callers aren't broken.
      return NextResponse.json(json, { status: upstreamStatus });
    }
    // Non-2xx from upstream: return a generic, status-preserving error —
    // not the raw upstream body (which could contain internal stack traces
    // or service details this is a public-facing route).
    return NextResponse.json(
      { error: "Prediction service returned an error" },
      { status: upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : 502 },
    );
  } catch (err: any) {
    const status = err.status ?? 500;
    const message = status === 500 ? "Internal server error" : err.message;
    if (ctx) await logRequest(ctx, endpoint, "POST", status, startedAt);
    return NextResponse.json({ error: message }, { status });
  }
}
