"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import type { WatchlistItem } from "@/types";

export function useWatchlist() {
  const { user } = useUser();
  return useQuery<WatchlistItem[]>({
    queryKey: ["watchlist", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("watchlist")
        .select("*")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });
      if (error) return [];
      return (data ?? []).map((r) => ({
        id: r.id,
        trackId: r.track_id,
        trackName: r.track_name,
        artistName: r.artist_name,
        addedAt: r.added_at,
        notes: r.notes,
      })) as WatchlistItem[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useAddToWatchlist() {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Omit<WatchlistItem, "id" | "addedAt">) => {
      if (!user) throw new Error("Not authenticated");
      const supabase = createBrowserClient();
      const { error } = await supabase.from("watchlist").insert({
        user_id: user.id,
        track_id: item.trackId,
        track_name: item.trackName,
        artist_name: item.artistName,
        notes: item.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist", user?.id] }),
  });
}

export function useRemoveFromWatchlist() {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createBrowserClient();
      const { error } = await supabase.from("watchlist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist", user?.id] }),
  });
}

export function isOnWatchlist(watchlist: WatchlistItem[], trackId: number): boolean {
  return watchlist.some((w) => w.trackId === trackId);
}
