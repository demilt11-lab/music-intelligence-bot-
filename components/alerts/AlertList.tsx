"use client";
import { AlertItem } from "./AlertItem";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell } from "lucide-react";
import type { Alert } from "@/types";

interface Props {
  alerts: Alert[];
  isLoading?: boolean;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
}

export function AlertList({ alerts, isLoading, onDelete, onToggle }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Bell className="h-10 w-10 text-zinc-600 mb-3" />
        <p className="text-zinc-400 text-sm">No alerts configured.</p>
        <p className="text-zinc-500 text-xs mt-1">Create one to get notified when a song hits your threshold.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((a) => (
        <AlertItem key={a.id} alert={a} onDelete={onDelete} onToggle={onToggle} />
      ))}
    </div>
  );
}
