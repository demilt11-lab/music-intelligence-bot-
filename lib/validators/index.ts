// lib/validators/index.ts
import { z } from 'zod';

// ─── Shared ────────────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit:  z.coerce.number().int().min(1).max(100).default(25),
});

export const DateRangeSchema = z.object({
  startDate: z.string().optional(),
  endDate:   z.string().optional(),
});

// ─── Radio ─────────────────────────────────────────────────────────────────────

export const ListRadiosSchema = PaginationSchema.extend({
  countryCode: z.string().length(2).toUpperCase().optional(),
  search:      z.string().min(1).max(100).optional(),
  genre:       z.string().min(1).max(100).optional(),
});

export const RadioSpinsSchema = PaginationSchema.merge(DateRangeSchema);

// ─── Tracks ────────────────────────────────────────────────────────────────────

export const ListTracksSchema = PaginationSchema.extend({
  search:     z.string().min(1).max(100).optional(),
  isrc:       z.string().optional(),
  popularity: z.coerce.number().int().min(0).max(100).optional(),
});

// ─── Artists ───────────────────────────────────────────────────────────────────

export const ListArtistsSchema = PaginationSchema.extend({
  search:  z.string().min(1).max(100).optional(),
  country: z.string().length(2).toUpperCase().optional(),
});

// ─── Search ───────────────────────────────────────────────────────────────────

export const GlobalSearchSchema = z.object({
  q:    z.string().min(1).max(200),
  type: z.enum(['all', 'tracks', 'artists', 'radios']).default('all'),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

// ─── Charts ───────────────────────────────────────────────────────────────────

export const ListChartsSchema = z.object({
  platform:    z.string().optional(),
  countryCode: z.string().length(2).toUpperCase().optional(),
  limit:       z.coerce.number().int().min(1).max(100).default(50),
});

// ─── Type exports ─────────────────────────────────────────────────────────────────

export type ListRadiosInput   = z.infer<typeof ListRadiosSchema>;
export type RadioSpinsInput   = z.infer<typeof RadioSpinsSchema>;
export type ListTracksInput   = z.infer<typeof ListTracksSchema>;
export type ListArtistsInput  = z.infer<typeof ListArtistsSchema>;
export type GlobalSearchInput = z.infer<typeof GlobalSearchSchema>;
export type ListChartsInput   = z.infer<typeof ListChartsSchema>;
