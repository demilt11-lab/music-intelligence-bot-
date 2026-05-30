// lib/services/radios.ts

import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RadioItem {
  id: string;
  slug: string;
  name: string;
  countryCode?: string | null;
  market?: string | null;
  genre?: string | null;
}

export interface ListRadiosParams {
  offset?: number;
  limit?: number;
  countryCode?: string;
  search?: string;
}

export interface ListRadiosResult {
  items: RadioItem[];
  offset: number;
  total: number;
}

export interface RadioLiveFeedParams {
  radioSlug: string;
  startDate?: string; // ISO datetime e.g. 2024-01-01T00:00:00Z
  endDate?: string;   // ISO datetime
  offset?: number;
  limit?: number;
}

export interface RadioLiveFeedItem {
  id: string;
  radioId: string;
  songUuid: string;
  airedAtUtc: string;
  countryCode?: string | null;
  payload?: unknown;
}

export interface RadioLiveFeedResult {
  items: RadioLiveFeedItem[];
  offset: number;
  total: number;
}

// ─── List Radios ─────────────────────────────────────────────────────────────

export async function listRadios(
  params: ListRadiosParams = {},
): Promise<ListRadiosResult> {
  const offset = params.offset ?? 0;
  const limit  = Math.min(params.limit ?? 25, 100);

  const where: Parameters<typeof db.radio.findMany>[0]['where'] = {};

  if (params.countryCode) {
    where.countryCode = params.countryCode;
  }

  if (params.search?.trim()) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { slug: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    db.radio.findMany({
      where,
      skip:    offset,
      take:    limit,
      orderBy: { name: 'asc' },
      select: {
        id:          true,
        slug:        true,
        name:        true,
        countryCode: true,
        market:      true,
        genre:       true,
      },
    }),
    db.radio.count({ where }),
  ]);

  return { items, offset, total };
}

// ─── Radio Live Feed (from your own RadioSpin table) ─────────────────────────

export async function getRadioLiveFeed(
  params: RadioLiveFeedParams,
): Promise<RadioLiveFeedResult> {
  const offset = params.offset ?? 0;
  const limit  = Math.min(params.limit ?? 100, 100);

  // resolve slug → id
  const radio = await db.radio.findUnique({
    where:  { slug: params.radioSlug },
    select: { id: true },
  });

  if (!radio) {
    return { items: [], offset, total: 0 };
  }

  const where: Parameters<typeof db.radioSpin.findMany>[0]['where'] = {
    radioId: radio.id,
  };

  if (params.startDate || params.endDate) {
    where.airedAtUtc = {
      ...(params.startDate ? { gte: new Date(params.startDate) } : {}),
      ...(params.endDate   ? { lte: new Date(params.endDate)   } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    db.radioSpin.findMany({
      where,
      skip:    offset,
      take:    limit,
      orderBy: { airedAtUtc: 'desc' },
    }),
    db.radioSpin.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id:          row.id,
      radioId:     row.radioId,
      songUuid:    row.songUuid,
      airedAtUtc:  row.airedAtUtc.toISOString(),
      countryCode: row.countryCode ?? null,
      payload:     row.payload ?? undefined,
    })),
    offset,
    total,
  };
}
