"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { ModelHealthCard } from "./ModelHealthCard";
import { DriftPanel } from "./DriftPanel";
import { RetrainingTimeline } from "./RetrainingTimeline";
import { AccuracyTrendChart } from "./AccuracyTrendChart";
import { useMonitor } from "@/hooks/useMonitor";

const HEALTH_CONFIG = {
  healthy:  { icon: CheckCircle2, label: "Healthy",  bg: "bg-emerald-900/40 text-emerald-300", dot: "bg-emerald-400" },
  degraded: { icon: AlertTriangle, label: "Degraded", bg: "bg-amber-900/40 text-amber-300",     dot: "bg-amber-400"   },
  critical: { icon: AlertCircle,  label: "Critical", bg: "bg-rose-900/40 text-rose-300",       dot: "bg-rose-400"    },
};

export function MonitorDashboard() {
  const { data, isLoading, error } = useMonitor();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
        {error instanceof Error ? error.message : "Monitor data unavailable."}
      </div>
    );
  }

  const health = HEALTH_CONFIG[data.healthStatus];
  const HealthIcon = health.icon;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-white">Continuous Learning Monitor</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Updated {new Date(data.generatedAt).toLocaleString()} ·{" "}
            {data.predictions.total.toLocaleString()} total predictions ·{" "}
            {data.predictions.pendingEvaluation} pending 90-day evaluation
          </p>
        </div>
        <Badge className={`flex items-center gap-1.5 ${health.bg}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${health.dot}`} />
          <HealthIcon className="h-3 w-3" />
          {health.label}
        </Badge>
      </div>

      {/* Human review callout */}
      {data.humanReview.pendingCount > 0 && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-900/20 p-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <div className="text-xs text-amber-300">
            <span className="font-semibold">{data.humanReview.pendingCount} predictions</span>
            {" "}awaiting human A&R review (confidence 40–60% or contradictory signals).{" "}
            <span className="text-amber-400/70">{data.humanReview.completedLast7d} reviewed in past 7 days.</span>
          </div>
        </div>
      )}

      {/* Top row: model health + drift */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ModelHealthCard model={data.model} accuracy={data.accuracy} />
        <DriftPanel drift={data.drift} />
      </div>

      {/* Accuracy trend chart */}
      <AccuracyTrendChart trend={data.weeklyTrend} />

      {/* Retraining timeline */}
      <RetrainingTimeline
        runs={data.retraining.runs}
        lastRunAt={data.retraining.lastRunAt}
      />

      {/* Model version history table */}
      {data.model.history.length > 1 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              Version History
            </h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Version", "Type", "Samples", "AUROC", "F1", "Trained", "Status"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-zinc-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {data.model.history.map((v) => {
                const m = v.metrics as Record<string, number>;
                return (
                  <tr key={v.id} className={v.isActive ? "bg-violet-950/20" : ""}>
                    <td className="px-3 py-2 font-mono text-white">{v.version}</td>
                    <td className="px-3 py-2 text-zinc-400">{v.modelType}</td>
                    <td className="px-3 py-2 text-zinc-400">{v.trainSamples?.toLocaleString() ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-300">{m.auroc != null ? (m.auroc * 100).toFixed(1) + "%" : "—"}</td>
                    <td className="px-3 py-2 text-zinc-300">{m.f1 != null ? (m.f1 * 100).toFixed(1) + "%" : "—"}</td>
                    <td className="px-3 py-2 text-zinc-500">{new Date(v.trainedAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2">
                      {v.isActive
                        ? <span className="text-emerald-400 font-medium">active</span>
                        : v.isBaseline
                        ? <span className="text-blue-400">baseline</span>
                        : <span className="text-zinc-600">retired</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-zinc-600 text-right">
        Auto-refreshes every 2 minutes. Retraining triggers: accuracy drop &gt;5%, or 100+ new labeled cases.
      </p>
    </div>
  );
}
