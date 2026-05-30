// lib/services/radios.ts

import { prisma } from '@/lib/prisma'; // adjust if your prisma client is elsewhere

export interface Radio {
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
  items: Radio[];
  offset: number;
  total: number;
}

export interface RadioLiveFeedParams {
  radioSlug: string;
  startDate?: string; // ISO string (e.g. 2024-01-01T00:00:00Z)
  endDate?: string;   // ISO string
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

// LIST RADIOS ------------------------------------------------------------

export async function listRadios(params: ListRadiosParams = {}): Promise<ListRadiosResult> {
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 25;

  const where: Parameters<typeof prisma.radio.findMany>[0]['where'] = {};

  if (params.countryCode) {
    where.countryCode = params.countryCode;
  }

  if (params.search && params.search.trim()) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { slug: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.radio.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { name: 'asc' },
    }),
    prisma.radio.count({ where }),
  ]);

  return {
    items,
    offset,
    total,
  };
}

// LIVE FEED (from your own radio spins table) ----------------------------

export async function getRadioLiveFeed(
  params: RadioLiveFeedParams,
): Promise<RadioLiveFeedResult> {
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 100;

  const radio = await prisma.radio.findUnique({
    where: { slug: params.radioSlug },
    select: { id: true },
  });

  if (!radio) {
    return { items: [], offset, total: 0 };
  }

  const where: Parameters<typeof prisma.radioSpin.findMany>[0]['where'] = {
    radioId: radio.id,
  };

  if (params.startDate || params.endDate) {
    where.airedAtUtc = {};
    if (params.startDate) {
      (where.airedAtUtc as any).gte = new Date(params.startDate);
    }
    if (params.endDate) {
      (where.airedAtUtc as any).lte = new Date(params.endDate);
    }
  }

  const [rows, total] = await Promise.all([
    prisma.radioSpin.findMany({
      where,
      skip: offset,
      take: limit,
      orderBy: { airedAtUtc: 'desc' },
    }),
    prisma.radioSpin.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      radioId: row.radioId,
      songUuid: row.songUuid,
      airedAtUtc: row.airedAtUtc.toISOString(),
      countryCode: row.countryCode,
      payload: row.payload ?? undefined,
    })),
    offset,
    total,
  };
}
