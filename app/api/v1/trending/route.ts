import { withAuth, AuthContext } from "@/lib/auth/middleware";
import { getTrending } from "@/lib/trajectory/trending";
import { handleApiError, badRequest } from "@/lib/shared/errors";
import { successResponse } from "@/lib/shared/response";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  "trajectory:read",
  async (req: NextRequest, ctx: AuthContext) => {
    try {
      const { searchParams } = req.nextUrl;

      const entityTypeParam = searchParams.get("entityType") ?? "track";
      if (entityTypeParam !== "track" && entityTypeParam !== "artist") {
        throw badRequest("entityType must be 'track' or 'artist'");
      }
      const entityType = entityTypeParam as "track" | "artist";

      const limitParam = searchParams.get("limit") ?? "20";
      let limit = parseInt(limitParam, 10);
      if (isNaN(limit)) {
        throw badRequest("limit must be a valid integer");
      }
      if (limit < 1) limit = 1;
      if (limit > 100) limit = 100;

      const entries = await getTrending(entityType, limit);

      return successResponse({
        entityType,
        limit,
        items: entries,
        computedAt: new Date().toISOString(),
      });
    } catch (err) {
      return handleApiError(err);
    }
  },
);
