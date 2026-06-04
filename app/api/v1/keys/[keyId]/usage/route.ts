import { withAuth, AuthContext } from "@/lib/auth/middleware";
import { handleApiError, badRequest, notFound } from "@/lib/shared/errors";
import { successResponse } from "@/lib/shared/response";
import db from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  "keys:read",
  async (
    req: NextRequest,
    ctx: AuthContext,
    routeCtx: { params: { keyId: string } },
  ) => {
    try {
      const { keyId: keyIdStr } = await (routeCtx as any).params;
      const keyId = parseInt(keyIdStr, 10);
      if (isNaN(keyId)) {
        throw badRequest("keyId must be a valid integer");
      }

      // Verify key ownership
      const key = await db.apiKey.findUnique({
        where: { id: keyId },
        select: { id: true, ownerId: true },
      });

      if (!key) {
        throw notFound(`API key ${keyId} not found`);
      }

      if (key.ownerId !== ctx.key.ownerId) {
        throw notFound(`API key ${keyId} not found`);
      }

      const { searchParams } = req.nextUrl;

      const limitParam = searchParams.get("limit") ?? "100";
      let limit = parseInt(limitParam, 10);
      if (isNaN(limit)) {
        throw badRequest("limit must be a valid integer");
      }
      if (limit < 1) limit = 1;
      if (limit > 1000) limit = 1000;

      const sinceParam = searchParams.get("since");
      let since: Date;
      if (sinceParam) {
        since = new Date(sinceParam);
        if (isNaN(since.getTime())) {
          throw badRequest("since must be a valid ISO date string");
        }
      } else {
        // Default: 7 days ago
        since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }

      const usage = await db.apiKeyUsage.findMany({
        where: {
          keyId,
          createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      return successResponse({
        keyId,
        usage,
        count: usage.length,
        since: since.toISOString(),
      });
    } catch (err) {
      return handleApiError(err);
    }
  },
);
