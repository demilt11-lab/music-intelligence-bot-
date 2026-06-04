import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Music Intelligence API",
    version: "1.0.0",
    description: "Viral trajectory prediction API for music tracks and artists.",
  },
  servers: [
    {
      url: "/api/v1",
      description: "Current server",
    },
  ],
  security: [{ BearerAuth: [] }],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
          code: { type: "string" },
        },
      },
      Signal: {
        type: "object",
        required: ["entityType", "entityId", "signalType", "value", "recordedAt"],
        properties: {
          entityType: { type: "string", enum: ["track", "artist"] },
          entityId: { type: "integer" },
          signalType: { type: "string" },
          value: { type: "number" },
          recordedAt: { type: "string", format: "date-time" },
          source: { type: "string" },
        },
      },
      ApiKey: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string" },
          scopes: { type: "array", items: { type: "string" } },
          rateLimit: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
          expiresAt: { type: "string", format: "date-time", nullable: true },
        },
      },
    },
  },
  paths: {
    "/trajectory/tracks/{trackId}": {
      get: {
        summary: "Get trajectory prediction for a track",
        operationId: "getTrackTrajectory",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "trackId",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "The track ID",
          },
        ],
        responses: {
          "200": { description: "Trajectory prediction for the track" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "429": { description: "Rate limit exceeded" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/trajectory/artists/{artistId}": {
      get: {
        summary: "Get trajectory prediction for an artist",
        operationId: "getArtistTrajectory",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "artistId",
            in: "path",
            required: true,
            schema: { type: "integer" },
            description: "The artist ID",
          },
        ],
        responses: {
          "200": { description: "Trajectory prediction for the artist" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "429": { description: "Rate limit exceeded" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/trending": {
      get: {
        summary: "Get trending tracks or artists",
        operationId: "getTrending",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "entityType",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["track", "artist"], default: "track" },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          "200": { description: "Trending entities" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "429": { description: "Rate limit exceeded" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/signals": {
      post: {
        summary: "Ingest signals for tracks or artists",
        operationId: "ingestSignals",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["signals"],
                properties: {
                  signals: {
                    type: "array",
                    minItems: 1,
                    maxItems: 500,
                    items: { $ref: "#/components/schemas/Signal" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Signals ingested" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "429": { description: "Rate limit exceeded" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/signals/{entityType}/{entityId}": {
      get: {
        summary: "Get signals for a specific entity",
        operationId: "getSignals",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "entityType", in: "path", required: true, schema: { type: "string", enum: ["track", "artist"] } },
          { name: "entityId", in: "path", required: true, schema: { type: "integer" } },
          { name: "since", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": { description: "Signals for the entity" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "429": { description: "Rate limit exceeded" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/keys": {
      get: {
        summary: "List all active API keys for the authenticated user",
        operationId: "listApiKeys",
        security: [{ BearerAuth: [] }],
        responses: {
          "200": { description: "List of active API keys" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "429": { description: "Rate limit exceeded" },
          "500": { description: "Internal server error" },
        },
      },
      post: {
        summary: "Create a new API key",
        operationId: "createApiKey",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "scopes"],
                properties: {
                  name: { type: "string" },
                  scopes: { type: "array", minItems: 1, items: { type: "string" } },
                  rateLimit: { type: "integer" },
                  expiresAt: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "API key created — raw key shown only once" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "429": { description: "Rate limit exceeded" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/keys/{keyId}": {
      get: {
        summary: "Get a single API key by ID",
        operationId: "getApiKey",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "keyId", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "API key metadata" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
          "429": { description: "Rate limit exceeded" },
          "500": { description: "Internal server error" },
        },
      },
      delete: {
        summary: "Revoke an API key",
        operationId: "revokeApiKey",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "keyId", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "API key revoked" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
          "429": { description: "Rate limit exceeded" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/keys/{keyId}/usage": {
      get: {
        summary: "Get recent usage for an API key",
        operationId: "getApiKeyUsage",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "keyId", in: "path", required: true, schema: { type: "integer" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 1000, default: 100 } },
          { name: "since", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": { description: "API key usage records" },
          "400": { description: "Bad request" },
          "401": { description: "Unauthorized" },
          "403": { description: "Forbidden" },
          "404": { description: "Not found" },
          "429": { description: "Rate limit exceeded" },
          "500": { description: "Internal server error" },
        },
      },
    },
    "/health": {
      get: {
        summary: "Health check",
        operationId: "healthCheck",
        security: [],
        responses: {
          "200": { description: "Service is healthy" },
          "503": { description: "Service degraded" },
        },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(openApiSpec);
}
