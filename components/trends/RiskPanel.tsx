"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock } from "lucide-react";
import type { RiskFactor, MonitoringSignal } from "@/hooks/useTrends";

interface Props {
  riskFactors: RiskFactor[];
  monitoringSignals: MonitoringSignal[];
}

const SEV_COLOR = { high: "bg-rose-900/40 text-rose-300", medium: "bg-amber-900/40 text-amber-300", low: "bg-zinc-800 text-zinc-400" };
const PROB_COLOR = { likely: "text-rose-400", possible: "text-amber-400", unlikely: "text-zinc-500" };
const FREQ_ICON = { daily: "D", weekly: "W" };

export function RiskPanel({ riskFactors, monitoringSignals }: Props) {
  const high   = riskFactors.filter(r => r.severity === "high");
  const medium = riskFactors.filter(r => r.severity === "medium");
  const low    = riskFactors.filter(r => r.severity === "low");

  return (
    <div className="space-y-4">
      {/* Risk factors */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Risk Factors
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3">
          {[...high, ...medium, ...low].map((r, i) => (
            <div key={i} className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-200">{r.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge className={`text-[10px] px-1.5 py-0 ${SEV_COLOR[r.severity]}`}>{r.severity}</Badge>
                  <span className={`text-[10px] ${PROB_COLOR[r.probability]}`}>{r.probability}</span>
                </div>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">{r.impactOnForecast}</p>
              <p className="text-[10px] text-zinc-600">
                Watch: <span className="text-zinc-400">{r.monitoringSignal}</span>
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Monitoring signals */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Clock className="h-4 w-4 text-violet-400" />
            Weekly Monitoring Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3">
          {monitoringSignals.map((ms, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-zinc-800/50 last:border-0">
              <span className="text-[10px] font-bold text-violet-400 bg-violet-900/30 rounded px-1 py-0.5 mt-0.5 shrink-0">
                {FREQ_ICON[ms.checkFrequency]}
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-medium text-zinc-200">{ms.signal.replace(/_/g, " ")}</p>
                <p className="text-[10px] text-zinc-500">Alert: {ms.alertThreshold}</p>
                <p className="text-[10px] text-zinc-600">{ms.whyImportant}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
