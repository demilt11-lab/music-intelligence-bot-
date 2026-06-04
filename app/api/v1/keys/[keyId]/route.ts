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

      const key = await db.apiKey.findUnique({
        where: { id: keyId },
        select: {
          id: true,
          name: true,
          ownerId: true,
          scopes: true,
          rateLimit: true,
          isActive: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
        },
      });

      if (!key) {
        throw notFound(`API key ${keyId} not found`);
      }

      if (key.ownerId !== ctx.key.ownerId) {
        throw notFound(`API key ${keyId} not found`);
      }

      const { ownerId: _ownerId, ...keyData } = key;

      return successResponse({ key: keyData });
    } catch (err) {
      return handleApiError(err);
    }
  },
);

export const DELETE = withAuth(
  "keys:admin",
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

      await db.apiKey.update({
        where: { id: keyId },
        data: { isActive: false },
      });

      return successResponse({ revoked: true, id: keyId });
    } catch (err) {
      return handleApiError(err);
    }
  },
);
