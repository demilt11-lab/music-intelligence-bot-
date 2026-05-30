// lib/platform/auth.ts
import { db } from '@/lib/db';
import crypto from 'crypto';

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export type ApiKeyRecord = {
  tenantId: number;
  scopes: string[];
};

export async function getTenantByApiKey(apiKey: string): Promise<ApiKeyRecord> {
  const keyHash = hashApiKey(apiKey);

  const record = await db.apiKey.findFirst({
    where: {
      keyHash,
      isRevoked: false,
    },
  });

  if (!record) {
    const err: any = new Error('Invalid API key');
    err.status = 401;
    throw err;
  }

  if (record.expiresAt && record.expiresAt < new Date()) {
    const err: any = new Error('API key expired');
    err.status = 401;
    throw err;
  }

  const scopes =
    typeof record.scopes === 'string'
      ? record.scopes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

  return {
    tenantId: record.tenantId,
    scopes,
  };
}
