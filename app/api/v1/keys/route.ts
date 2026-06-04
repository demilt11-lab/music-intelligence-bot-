import { withAuth, AuthContext } from "@/lib/auth/middleware";
import { generateApiKey, hashApiKey } from "@/lib/auth/api-key";
import { handleApiError, badRequest } from "@/lib/shared/errors";
import { successResponse } from "@/lib/shared/response";
import db from "@/lib/db";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export const GET = withAuth(
  "keys:read",
  async (req: NextRequest, ctx: AuthContext) => {
    try {
      const keys = await db.apiKey.findMany({
        where: {
          ownerId: ctx.key.ownerId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          scopes: true,
          rateLimit: true,
          createdAt: true,
          lastUsedAt: true,
          expiresAt: true,
        },
      });

      return successResponse({ keys, count: keys.length });
    } catch (err) {
      return handleApiError(err);
    }
  },
);

export const POST = withAuth(
  "keys:admin",
  async (req: NextRequest, ctx: AuthContext) => {
    try {
      let body: any;
      try {
        body = await req.json();
      } catch {
        throw badRequest("Invalid JSON body");
      }

      if (!body.name || typeof body.name !== "string") {
        throw badRequest("name is required");
      }

      if (!body.scopes || !Array.isArray(body.scopes) || body.scopes.length === 0) {
        throw badRequest("scopes must be a non-empty array");
      }

      const name: string = body.name;
      const scopes: string[] = body.scopes;
      const rateLimit: number | undefined = body.rateLimit;
      const expiresAt: string | undefined = body.expiresAt;

      const rawKey = generateApiKey();
      const hashedKey = hashApiKey(rawKey);

      const created = await db.apiKey.create({
        data: {
          name,
          hashedKey,
          ownerId: ctx.key.ownerId,
          scopes,
          ...(rateLimit !== undefined ? { rateLimit } : {}),
          ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
        },
        select: {
          id: true,
          name: true,
          scopes: true,
        },
      });

      return successResponse(
        {
          key: rawKey,
          id: created.id,
          name: created.name,
          scopes: created.scopes,
        },
        201,
      );
    } catch (err) {
      return handleApiError(err);
    }
  },
);
