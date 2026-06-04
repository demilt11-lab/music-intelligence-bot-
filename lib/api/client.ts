/**
 * Typed client for the internal Music Intelligence REST API.
 * Uses fetch — works in both browser and server components.
 */

import type {
  TrajectoryPrediction,
  TrendingEntry,
  TrackMeta,
  Signal,
  SearchResult,
  AudioFeatures,
  EntityType,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const V1 = `${BASE}/api/v1`;
const API = `${BASE}/api`;

function apiKey(): string {
  return process.env.NEXT_PUBLIC_MIB_API_KEY ?? "";
}

async function get<T>(url: string, params?: Record<string, string | number>): Promise<T> {
  const u = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = apiKey();
  if (key) headers["Authorization"] = `Bearer ${key}`;

  const res = await fetch(u.toString(), { headers, next: { revalidate: 60 } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Trajectory ────────────────────────────────────────────────────────────────

export async function getTrackTrajectory(trackId: number): Promise<TrajectoryPrediction> {
  const res = await get<{ data: TrajectoryPrediction }>(`${V1}/trajectory/tracks/${trackId}`);
  return res.data;
}

export async function getArtistTrajectory(artistId: number): Promise<TrajectoryPrediction> {
  const res = await get<{ data: TrajectoryPrediction }>(`${V1}/trajectory/artists/${artistId}`);
  return res.data;
}

export async function getTrending(
  entityType: EntityType = "track",
  limit = 50
): Promise<TrendingEntry[]> {
  const res = await get<{ items: TrendingEntry[] }>(`${V1}/trending`, { entityType, limit });
  return res.items;
}

// ── Signals ───────────────────────────────────────────────────────────────────

export async function getSignals(
  entityType: EntityType,
  entityId: number,
  since?: string
): Promise<Signal[]> {
  const params: Record<string, string | number> = {};
  if (since) params.since = since;
  const res = await get<{ signals: Signal[] }>(
    `${V1}/signals/${entityType}/${entityId}`,
    params
  );
  return res.signals;
}

// ── Track metadata ────────────────────────────────────────────────────────────

export async function getTrack(trackId: number): Promise<TrackMeta> {
  const res = await get<{ data: TrackMeta }>(`${API}/tracks/${trackId}`);
  return res.data;
}

export async function getTrackAudioFeatures(trackId: number): Promise<AudioFeatures> {
  const res = await get<{ data: AudioFeatures }>(
    `${API}/tracks/${trackId}/platforms/spotify/stats/audio_features`
  );
  return res.data;
}

// ── Search ────────────────────────────────────────────────────────────────────

export async function search(
  q: string,
  type?: string,
  limit = 20
): Promise<SearchResult[]> {
  const params: Record<string, string | number> = { q, limit };
  if (type) params.type = type;
  const res = await get<{ data: { suggestions: SearchResult[] } }>(`${API}/search`, params);
  return res.data?.suggestions ?? [];
}

// ── Trending chart (time-series) ──────────────────────────────────────────────

export async function getTrendingHistory(): Promise<TrendingEntry[]> {
  return getTrending("track", 100);
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<{ status: string; components?: Record<string, unknown> }> {
  return get(`${V1}/health`);
}
