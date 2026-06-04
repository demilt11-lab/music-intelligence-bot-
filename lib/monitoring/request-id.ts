import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

export function getOrCreateRequestId(req: NextRequest): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

export function withRequestId<T extends Record<string, unknown>>(
  data: T,
  requestId: string
): T & { requestId: string } {
  return { ...data, requestId };
}
