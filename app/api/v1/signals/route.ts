import { withAuth, AuthContext } from "@/lib/auth/middleware";
import { ingestSignals } from "@/lib/trajectory/signals";
import { handleApiError, badRequest } from "@/lib/shared/errors";
import { successResponse } from "@/lib/shared/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const POST = withAuth(
  "signals:write",
  async (req: NextRequest, ctx: AuthContext) => {
    try {
      let body: any;
      try {
        body = await req.json();
      } catch {
        throw badRequest("Invalid JSON body");
      }

      if (!body.signals || !Array.isArray(body.signals)) {
        throw badRequest("signals must be a non-empty array");
      }

      const rawSignals: any[] = body.signals;

      if (rawSignals.length === 0) {
        throw badRequest("signals must be a non-empty array");
      }

      if (rawSignals.length > 500) {
        throw badRequest("max 500 signals per request");
      }

      // Parse recordedAt as Date for each signal
      const signals = rawSignals.map((s: any) => ({
        ...s,
        recordedAt: new Date(s.recordedAt),
      }));

      const count = await ingestSignals(signals);

      return successResponse(
        {
          inserted: count,
          receivedAt: new Date().toISOString(),
        },
        201,
      );
    } catch (err) {
      return handleApiError(err);
    }
  },
);
