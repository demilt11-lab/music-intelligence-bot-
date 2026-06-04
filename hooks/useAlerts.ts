"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/hooks/useUser";
import type { Alert } from "@/types";

export type AlertFormData = {
  track_id: number;
  track_name: string;
  threshold_type: "viral_score" | "momentum" | "breakout";
  threshold_value: number;
};

export function useAlerts() {
  const { user } = useUser();
  return useQuery<Alert[]>({
    queryKey: ["alerts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data ?? []) as Alert[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useCreateAlert(onSuccess?: () => void) {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (form: AlertFormData) => {
      if (!user) throw new Error("Not authenticated");
      const supabase = createBrowserClient();
      const { error } = await supabase.from("alerts").insert({
        user_id: user.id,
        ...form,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts", user?.id] });
      onSuccess?.();
    },
  });
}

export function useDeleteAlert() {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createBrowserClient();
      const { error } = await supabase.from("alerts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts", user?.id] }),
  });
}

export function useToggleAlert() {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const supabase = createBrowserClient();
      const { error } = await supabase.from("alerts").update({ is_active: isActive }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts", user?.id] }),
  });
}
