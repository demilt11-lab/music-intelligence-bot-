"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ArtistAlert {
  id: number;
  userId: string;
  artistId: number;
  alertType: "viral_threshold" | "spike_detected" | "forecast_change" | "risk_elevated";
  severity: "high" | "medium" | "low";
  threshold: number | null;
  actualValue: number | null;
  message: string;
  read: boolean;
  resolvedAt: string | null;
  createdAt: string;
  artist: { id: number; name: string; slug: string | null };
}

export function useArtistAlerts(unreadOnly = false) {
  return useQuery<{ alerts: ArtistAlert[]; unreadCount: number }>({
    queryKey: ["artist-alerts", unreadOnly],
    queryFn: async () => {
      const url = unreadOnly ? "/api/v1/alerts?unread=true" : "/api/v1/alerts";
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useMarkArtistAlertsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { ids?: number[]; all?: boolean }) => {
      const res = await fetch("/api/v1/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["artist-alerts"] }),
  });
}
