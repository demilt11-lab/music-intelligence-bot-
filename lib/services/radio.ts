// lib/services/radio.ts
import { db } from '@/lib/db';
import { Cache, CacheKey, TTL } from '@/lib/cache';
import type { RadioItem, RadioSpinItem, PaginatedResponse, PaginationMeta } from '@/lib/types';
import type { ListRadiosInput, RadioSpinsInput } from '@/lib/validators';

function buildMeta(offset: number, limit: number, total: number): PaginationMeta {
  return { offset, limit, total, hasMore: offset + limit < total };
}

function toRadioItem(row: { id: string; slug: string; name: string; countryCode: string | null; market: string | null; genre: string | null }): RadioItem {
  return { ...row, streamUrl: null, imageUrl: null, isActive: true };
}

// ─── List radios with cache ──────────────────────────────────────────────────

export async function listRadios(params: ListRadiosInput): Promise<PaginatedResponse<RadioItem>> {
  const cacheKey = CacheKey.radios(JSON.stringify(params));
  const cached = Cache.get<PaginatedResponse<RadioItem>>(cacheKey);
  if (cached) return cached;

  const where: any = {};
  if (params.countryCode) where.countryCode = params.countryCode;
  if (params.genre)       where.genre = { contains: params.genre, mode: 'insensitive' };
  if (params.search)      where.OR = [
    { name: { contains: params.search, mode: 'insensitive' } },
    { slug: { contains: params.search, mode: 'insensitive' } },
  ];

  const [rows, total] = await Promise.all([
    db.radio.findMany({
      where,
      skip: params.offset,
      take: params.limit,
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true, countryCode: true, market: true, genre: true },
    }),
    db.radio.count({ where }),
  ]);

  const result: PaginatedResponse<RadioItem> = {
    data: rows.map(toRadioItem),
    meta: buildMeta(params.offset, params.limit, total),
  };

  Cache.set(cacheKey, result, TTL.MEDIUM);
  return result;
}

// ─── Get single radio ─────────────────────────────────────────────────────────

export async function getRadioBySlug(slug: string): Promise<RadioItem | null> {
  const cacheKey = CacheKey.radioDetail(slug);
  const cached = Cache.get<RadioItem>(cacheKey);
  if (cached) return cached;

  const row = await db.radio.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, countryCode: true, market: true, genre: true },
  });

  if (!row) return null;
  const item = toRadioItem(row);
  Cache.set(cacheKey, item, TTL.MEDIUM);
  return item;
}

// ─── Radio spins ──────────────────────────────────────────────────────────────

export async function getRadioSpins(
  slug: string,
  params: RadioSpinsInput,
): Promise<PaginatedResponse<RadioSpinItem>> {
  const cacheKey = CacheKey.radioSpins(slug, JSON.stringify(params));
  const cached = Cache.get<PaginatedResponse<RadioSpinItem>>(cacheKey);
  if (cached) return cached;

  const radio = await db.radio.findUnique({ where: { slug }, select: { id: true } });
  if (!radio) return { data: [], meta: buildMeta(params.offset, params.limit, 0) };

  const where: any = { radioId: radio.id };
  if (params.startDate || params.endDate) {
    where.airedAtUtc = {
      ...(params.startDate ? { gte: new Date(params.startDate) } : {}),
      ...(params.endDate   ? { lte: new Date(params.endDate)   } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    db.radioSpin.findMany({
      where,
      skip: params.offset,
      take: params.limit,
      orderBy: { airedAtUtc: 'desc' },
    }),
    db.radioSpin.count({ where }),
  ]);

  const result: PaginatedResponse<RadioSpinItem> = {
    data: rows.map((r) => {
      const p = (r.payload ?? {}) as any;
      return {
        id: r.id,
        radioId: r.radioId,
        songUuid: r.songUuid,
        songTitle: p.songTitle ?? null,
        artistName: p.artistName ?? null,
        isrc: p.isrc ?? null,
        airedAtUtc: r.airedAtUtc.toISOString(),
        durationSec: p.durationSec ?? null,
        countryCode: r.countryCode ?? null,
      };
    }),
    meta: buildMeta(params.offset, params.limit, total),
  };

  Cache.set(cacheKey, result, TTL.SHORT);
  return result;
}
