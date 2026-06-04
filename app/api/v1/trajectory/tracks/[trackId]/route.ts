import { withAuth, AuthContext } from "@/lib/auth/middleware";
import { predictTrajectory } from "@/lib/trajectory/model";
import { handleApiError, badRequest } from "@/lib/shared/errors";
import { successResponse } from "@/lib/shared/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  "trajectory:read",
  async (req: NextRequest, ctx: AuthContext, routeCtx: { params: { trackId: string } }) => {
    try {
      const { trackId: trackIdStr } = await (routeCtx as any).params;
      const trackId = parseInt(trackIdStr, 10);
      if (isNaN(trackId)) {
        throw badRequest("trackId must be a valid integer");
      }

      const prediction = await predictTrajectory("track", trackId);

      return successResponse({
        entityType: "track",
        entityId: trackId,
        prediction,
      });
    } catch (err) {
      return handleApiError(err);
    }
  },
);
