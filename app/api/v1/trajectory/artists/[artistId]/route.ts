import { withAuth, AuthContext } from "@/lib/auth/middleware";
import { predictTrajectory } from "@/lib/trajectory/model";
import { handleApiError, badRequest } from "@/lib/shared/errors";
import { successResponse } from "@/lib/shared/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  "trajectory:read",
  async (req: NextRequest, ctx: AuthContext, routeCtx: { params: { artistId: string } }) => {
    try {
      const { artistId: artistIdStr } = await (routeCtx as any).params;
      const artistId = parseInt(artistIdStr, 10);
      if (isNaN(artistId)) {
        throw badRequest("artistId must be a valid integer");
      }

      const prediction = await predictTrajectory("artist", artistId);

      return successResponse({
        entityType: "artist",
        entityId: artistId,
        prediction,
      });
    } catch (err) {
      return handleApiError(err);
    }
  },
);
