import { withAuth, AuthContext } from "@/lib/auth/middleware";
import { getSignals } from "@/lib/trajectory/signals";
import { handleApiError, badRequest } from "@/lib/shared/errors";
import { successResponse } from "@/lib/shared/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  "trajectory:read",
  async (
    req: NextRequest,
    ctx: AuthContext,
    routeCtx: { params: { entityType: string; entityId: string } },
  ) => {
    try {
      const { entityType, entityId: entityIdStr } = await (routeCtx as any).params;

      if (entityType !== "track" && entityType !== "artist") {
        throw badRequest("entityType must be 'track' or 'artist'");
      }

      const entityId = parseInt(entityIdStr, 10);
      if (isNaN(entityId)) {
        throw badRequest("entityId must be a valid integer");
      }

      const { searchParams } = req.nextUrl;
      const sinceParam = searchParams.get("since");
      let sinceDate: Date;
      if (sinceParam) {
        sinceDate = new Date(sinceParam);
        if (isNaN(sinceDate.getTime())) {
          throw badRequest("since must be a valid ISO date string");
        }
      } else {
        // Default: 30 days ago
        sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      const signals = await getSignals(entityType, entityId, sinceDate);

      return successResponse({
        entityType,
        entityId,
        signals,
        since: sinceDate.toISOString(),
        count: signals.length,
      });
    } catch (err) {
      return handleApiError(err);
    }
  },
);
