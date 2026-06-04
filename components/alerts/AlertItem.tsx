"use client";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";
import type { Alert } from "@/types";

interface Props {
  alert: Alert;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
}

export function AlertItem({ alert, onDelete, onToggle }: Props) {
  const labelMap: Record<string, string> = {
    viral_score: "Viral Score",
    momentum: "Momentum",
    breakout: "Breakout Prob",
  };

  return (
    <div className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white truncate">{alert.trackName}</p>
        <p className="text-xs text-zinc-400 mt-0.5">
          {labelMap[alert.thresholdType] ?? alert.thresholdType} &gt; {alert.thresholdValue}
          {" · "}
          {timeAgo(alert.createdAt)}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-4 shrink-0">
        <Badge variant={alert.isActive ? "success" : "secondary"}>
          {alert.isActive ? "Active" : "Paused"}
        </Badge>
        <button
          onClick={() => onToggle(alert.id, !alert.isActive)}
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
            alert.isActive ? "bg-violet-600" : "bg-zinc-700"
          )}
          aria-label="Toggle alert"
        >
          <span
            className={cn(
              "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
              alert.isActive ? "translate-x-4" : "translate-x-1"
            )}
          />
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(alert.id)}
          className="text-zinc-500 hover:text-rose-400"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
