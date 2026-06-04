// API key validation, scope checking, and usage logging
import crypto from 'crypto';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/shared/errors';

export type ApiKeyRecord = {
  id: number;
  hashedKey: string;
  name: string;
  ownerId: string;
  scopes: string[];
  rateLimit: number;
  isActive: boolean;
};

export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateApiKey(): string {
  return 'mib_' + crypto.randomBytes(32).toString('hex');
}

export async function validateApiKey(rawKey: string): Promise<ApiKeyRecord | null> {
  const hashed = hashApiKey(rawKey);
  try {
    const record = await db.apiKey.findUnique({ where: { hashedKey: hashed } });
    if (!record || !record.isActive) return null;
    // Update lastUsedAt fire-and-forget
    db.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return {
      id: record.id,
      hashedKey: record.hashedKey,
      name: record.name,
      ownerId: record.ownerId,
      scopes: record.scopes,
      rateLimit: record.rateLimit,
      isActive: record.isActive,
    };
  } catch (err) {
    throw new ApiError('Failed to validate API key', 500, 'INTERNAL_ERROR');
  }
}

export async function requireScope(record: ApiKeyRecord, scope: string): Promise<void> {
  if (!record.scopes.includes(scope)) {
    throw new ApiError(`Missing required scope: ${scope}`, 403, 'FORBIDDEN');
  }
}

export async function logUsage(
  keyId: number,
  endpoint: string,
  statusCode: number,
  latencyMs: number,
): Promise<void> {
  try {
    await db.apiKeyUsage.create({
      data: { keyId, endpoint, statusCode, latencyMs },
    });
  } catch {
    // fire-and-forget: never throw
  }
}
