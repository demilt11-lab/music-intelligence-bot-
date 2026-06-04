"use client";
import { useQuery } from "@tanstack/react-query";
import { getTrending } from "@/lib/api/client";
import type { TrendingEntry } from "@/types";

export function useAnalytics() {
  const { data: tracks = [], isLoading } = useQuery({
    queryKey: ["trending", "track", 100],
    queryFn: () => getTrending("track", 100),
    staleTime: 60_000,
  });

  const genreData = computeGenreData(tracks);
  const velocityData = computeVelocityData(tracks);

  return { tracks, genreData, velocityData, isLoading };
}

function computeGenreData(tracks: TrendingEntry[]) {
  const counts: Record<string, number> = {};
  for (const t of tracks) {
    const genre = (t as TrendingEntry & { genre?: string }).genre ?? "Other";
    counts[genre] = (counts[genre] ?? 0) + 1;
  }
  const total = tracks.length || 1;
  return Object.entries(counts)
    .map(([genre, count]) => ({ genre, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function computeVelocityData(tracks: TrendingEntry[]) {
  const days = 30;
  const now = Date.now();
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const velocity = tracks.reduce((sum, t) => {
      const sparkVal = t.sparkline?.[i % (t.sparkline?.length ?? 1)] ?? 0;
      return sum + sparkVal;
    }, 0) / Math.max(tracks.length, 1);
    return { date, velocity: Math.round(velocity * 100) / 100 };
  });
}
