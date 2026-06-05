"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ArtistWatchlistEntry {
  id: number;
  artistId: number;
  userId: string;
  notes: string | null;
  priority: "high" | "normal" | "low";
  addedAt: string;
  artist: {
    id: number;
    name: string;
    slug: string | null;
    imageUrl: string | null;
    popularity: number | null;
  };
}

export function useArtistWatchlist() {
  return useQuery<{ watchlist: ArtistWatchlistEntry[] }>({
    queryKey: ["artist-watchlist"],
    queryFn: async () => {
      const res = await fetch("/api/v1/watchlist");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useAddArtistToWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { artistId: number; notes?: string; priority?: "high" | "normal" | "low" }) => {
      const res = await fetch("/api/v1/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["artist-watchlist"] }),
  });
}

export function useRemoveArtistFromWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (artistId: number) => {
      const res = await fetch(`/api/v1/watchlist?artistId=${artistId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["artist-watchlist"] }),
  });
}

export function isArtistOnWatchlist(watchlist: ArtistWatchlistEntry[], artistId: number): boolean {
  return watchlist.some((w) => w.artistId === artistId);
}
