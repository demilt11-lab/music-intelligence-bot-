"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import type { DriftEvent } from "@/hooks/useMonitor";

interface Props {
  drift: {
    recentEvents: DriftEvent[];
    unresolvedCount: number;
    highSeverityCount: number;
  };
}

const SEV_STYLE: Record<string, string> = {
  none:       "bg-zinc-800 text-zinc-400",
  investigate:"bg-amber-900/40 text-amber-300",
  retrain:    "bg-rose-900/40 text-rose-300",
  alert_team: "bg-rose-600/40 text-rose-200",
};

const TYPE_STYLE: Record<string, string> = {
  data:        "text-blue-400",
  performance: "text-rose-400",
  feature:     "text-amber-400",
};

function psiBar(psi: number | null) {
  if (psi == null) return null;
  const pct = Math.min(psi / 0.3, 1) * 100;
  const color = psi < 0.1 ? "bg-emerald-500" : psi < 0.2 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="h-1.5 w-full rounded-full bg-zinc-800 mt-1">
      <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function DriftPanel({ drift }: Props) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-amber-400" />
            Drift Events
          </div>
          <div className="flex items-center gap-2">
            {drift.highSeverityCount > 0 && (
              <Badge className="bg-rose-900/40 text-rose-300 text-[10px]">
                {drift.highSeverityCount} critical
              </Badge>
            )}
            <span className="text-[10px] text-zinc-500">{drift.unresolvedCount} unresolved</span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-3">
        {drift.recentEvents.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-4">No drift events detected</p>
        ) : (
          drift.recentEvents.map((e) => (
            <div
              key={e.id}
              className={`rounded-md border border-zinc-800 p-3 space-y-1 ${e.resolvedAt ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold uppercase ${TYPE_STYLE[e.driftType] ?? "text-zinc-400"}`}>
                    {e.driftType}
                  </span>
                  {e.affectedFeature && (
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {e.affectedFeature.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <Badge className={`text-[10px] px-1.5 py-0 ${SEV_STYLE[e.severity] ?? ""}`}>
                  {e.severity.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{e.summary}</p>
              {e.psiScore != null && (
                <div>
                  <span className="text-[10px] text-zinc-500">PSI: {e.psiScore.toFixed(3)}</span>
                  {psiBar(e.psiScore)}
                </div>
              )}
              {e.delta != null && (
                <p className="text-[10px] text-zinc-500">
                  Δ {e.delta >= 0 ? "+" : ""}{(e.delta * 100).toFixed(1)}%
                  {e.currentValue != null && ` (current: ${(e.currentValue * 100).toFixed(1)}%)`}
                </p>
              )}
              <p className="text-[10px] text-zinc-600">
                {new Date(e.detectedAt).toLocaleString()}
                {e.triggeredRetrain && <span className="text-violet-400 ml-2">→ triggered retrain</span>}
                {e.resolvedAt && <span className="text-emerald-400 ml-2">resolved</span>}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
