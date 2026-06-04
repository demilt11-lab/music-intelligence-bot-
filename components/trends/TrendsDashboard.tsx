"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";
import { ForecastCard } from "./ForecastCard";
import { SignalTrendTable } from "./SignalTrendTable";
import { SpikeLog } from "./SpikeLog";
import { RiskPanel } from "./RiskPanel";
import { useTrends } from "@/hooks/useTrends";

interface Props {
  artistId: number;
  artistName?: string;
}

const LEAK_COLOR = (check: string) =>
  check === "passed" ? "bg-emerald-900/40 text-emerald-300" : "bg-amber-900/40 text-amber-300";

export function TrendsDashboard({ artistId, artistName }: Props) {
  const { data, isLoading, error } = useTrends(artistId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
        {error instanceof Error ? error.message : "No trend data available for this artist."}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {data.artistName ?? artistName ?? `Artist #${artistId}`}
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            {data.dataPointsUsed} data points · Prediction date: {data.predictionDate}
          </p>
        </div>
        <Badge className={`text-[10px] ${LEAK_COLOR(data.temporalLeakageCheck)}`}>
          Temporal guard: {data.temporalLeakageCheck}
        </Badge>
      </div>

      {/* Forecasts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ForecastCard forecast={data.forecast30d} horizon="30d" />
        <ForecastCard forecast={data.forecast90d} horizon="90d" />
      </div>

      {/* Signal trend table */}
      <SignalTrendTable rollingStats={data.rollingStats} leadingIndicators={data.leadingIndicators} />

      {/* Leading indicators explanation */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
        <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Leading vs Lagging Indicators
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.leadingIndicators
            .filter(li => li.role !== "coincident")
            .sort((a, b) => (b.avgLeadDays > 0 ? 1 : -1) - (a.avgLeadDays > 0 ? 1 : -1))
            .map((li, i) => (
              <div key={i} className="text-xs text-zinc-500 leading-relaxed">
                <span className={`font-medium ${li.role === "leading" ? "text-emerald-400" : "text-zinc-400"}`}>
                  {li.signal.replace(/_/g, " ")}
                </span>
                {li.avgLeadDays > 0 && (
                  <span className="text-zinc-600"> (+{li.avgLeadDays}d lead)</span>
                )}
                {li.avgLeadDays < 0 && (
                  <span className="text-zinc-600"> ({li.avgLeadDays}d lag)</span>
                )}
                {" — "}{li.explanation}
              </div>
            ))}
        </div>
      </div>

      {/* Spike log + Risk panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SpikeLog spikes={data.spikeEvents} />
        <RiskPanel riskFactors={data.riskFactors} monitoringSignals={data.monitoringSignals} />
      </div>

      <p className="text-[10px] text-zinc-600 text-right">
        Analyzed at {new Date(data.analyzedAt).toLocaleString()}
      </p>
    </div>
  );
}
