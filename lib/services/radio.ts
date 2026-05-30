// lib/services/radio.ts
import { db } from '@/lib/db';
import { Cache, CacheKey, TTL } from '@/lib/cache';
import type { RadioItem, RadioSpinItem, PaginatedResponse, PaginationMeta } from '@/lib/types';
import type { ListRadiosInput, RadioSpinsInput } from '@/lib/validators';

function buildMeta(offset: number, limit: number, total: number): PaginationMeta {
  return { offset, limit, total, hasMore: offset + limit < total };
}

// ─── List radios with cache ──────────────────────────────────────────────────────────

export async function listRadios(params: ListRadiosInput): Promise<PaginatedResponse<RadioItem>> {
  const cacheKey = CacheKey.radios(JSON.stringify(params));
  const cached = Cache.get<PaginatedResponse<RadioItem>>(cacheKey);
  if (cached) return cached;

  const where: Parameters<typeof db.radio.findMany>[0]['where'] = { isActive: true };
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
      select: { id:true, slug:true, name:true, countryCode:true, market:true, genre:true, streamUrl:true, imageUrl:true, isActive:true },
    }),
    db.radio.count({ where }),
  ]);

  const result: PaginatedResponse<RadioItem> = {
    data: rows,
    meta: buildMeta(params.offset, params.limit, total),
  };

  Cache.set(cacheKey, result, TTL.MEDIUM);
  return result;
}

// ─── Get single radio ──────────────────────────────────────────────────────────────────

export async function getRadioBySlug(slug: string): Promise<RadioItem | null> {
  const cacheKey = CacheKey.radioDetail(slug);
  const cached = Cache.get<RadioItem>(cacheKey);
  if (cached) return cached;

  const row = await db.radio.findUnique({
    where: { slug },
    select: { id:true, slug:true, name:true, countryCode:true, market:true, genre:true, streamUrl:true, imageUrl:true, isActive:true },
  });

  if (row) Cache.set(cacheKey, row, TTL.MEDIUM);
  return row;
}

// ─── Radio spins (live feed) ─────────────────────────────────────────────────────────────

export async function getRadioSpins(
  slug: string,
  params: RadioSpinsInput,
): Promise<PaginatedResponse<RadioSpinItem>> {
  const cacheKey = CacheKey.radioSpins(slug, JSON.stringify(params));
  const cached = Cache.get<PaginatedResponse<RadioSpinItem>>(cacheKey);
  if (cached) return cached;

  const radio = await db.radio.findUnique({ where: { slug }, select: { id: true } });
  if (!radio) return { data: [], meta: buildMeta(params.offset, params.limit, 0) };

  const where: Parameters<typeof db.radioSpin.findMany>[0]['where'] = { radioId: radio.id };
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
    data: rows.map(r => ({
      id: r.id, radioId: r.radioId, songUuid: r.songUuid,
      songTitle: r.songTitle, artistName: r.artistName, isrc: r.isrc,
      airedAtUtc: r.airedAtUtc.toISOString(),
      durationSec: r.durationSec, countryCode: r.countryCode,
    })),
    meta: buildMeta(params.offset, params.limit, total),
  };

  Cache.set(cacheKey, result, TTL.SHORT);
  return result;
}
