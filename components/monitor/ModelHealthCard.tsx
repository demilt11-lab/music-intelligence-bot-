"use client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cpu, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { MonitorData } from "@/hooks/useMonitor";

interface Props {
  model: MonitorData["model"];
  accuracy: MonitorData["accuracy"];
}

const METRIC_FMT = (v: number | null | undefined, pct = false) =>
  v == null ? "—" : pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(3);

export function ModelHealthCard({ model, accuracy }: Props) {
  const active = model.active;
  const m30 = accuracy["30d"];
  const m90 = accuracy["90d"];

  const accDelta = m30 && m90 && m90.accuracy > 0
    ? m30.accuracy - m90.accuracy
    : null;

  const DeltaIcon = accDelta == null ? Minus :
    accDelta >= 0 ? TrendingUp : TrendingDown;
  const deltaColor = accDelta == null ? "text-zinc-500" :
    accDelta >= 0 ? "text-emerald-400" : "text-rose-400";

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Cpu className="h-4 w-4 text-violet-400" />
          Active Model
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {active ? (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-bold text-white font-mono">{active.version}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{active.modelType} · {active.trainSamples?.toLocaleString() ?? "?"} training samples</p>
              </div>
              <Badge className="bg-emerald-900/40 text-emerald-300 text-[10px]">active</Badge>
            </div>

            {/* Key model metrics */}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(active.metrics ?? {}).slice(0, 4).map(([k, v]) => (
                <div key={k} className="rounded-md bg-zinc-950/50 border border-zinc-800 p-2">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{k.replace(/_/g, " ")}</p>
                  <p className="text-sm font-semibold text-white mt-0.5">
                    {typeof v === "number" ? (v < 1 ? (v * 100).toFixed(1) + "%" : v.toFixed(2)) : String(v)}
                  </p>
                </div>
              ))}
            </div>

            {/* Accuracy delta vs 90d baseline */}
            <div className="flex items-center gap-2 text-xs">
              <DeltaIcon className={`h-3.5 w-3.5 ${deltaColor}`} />
              <span className={deltaColor}>
                {accDelta != null
                  ? `${accDelta >= 0 ? "+" : ""}${(accDelta * 100).toFixed(1)}% vs 90d baseline`
                  : "Insufficient data for trend"}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-500 py-4 text-center">No active model deployed</p>
        )}

        {/* Accuracy windows */}
        <div className="border-t border-zinc-800 pt-3 grid grid-cols-3 gap-2 text-center">
          {(["7d", "30d", "90d"] as const).map((w) => {
            const m = accuracy[w];
            return (
              <div key={w}>
                <p className="text-[10px] text-zinc-500 uppercase">{w} Accuracy</p>
                <p className="text-sm font-bold text-white mt-0.5">{METRIC_FMT(m?.accuracy ?? null, true)}</p>
                <p className="text-[10px] text-zinc-600">{m?.n ?? 0} evaluated</p>
              </div>
            );
          })}
        </div>

        {/* Precision / Recall / F1 */}
        {m30 && (
          <div className="grid grid-cols-3 gap-2 text-center border-t border-zinc-800 pt-3">
            {[
              ["Precision", m30.precision],
              ["Recall", m30.recall],
              ["F1", m30.f1],
            ].map(([label, val]) => (
              <div key={label as string}>
                <p className="text-[10px] text-zinc-500 uppercase">{label}</p>
                <p className="text-sm font-bold text-white mt-0.5">{METRIC_FMT(val as number, true)}</p>
              </div>
            ))}
          </div>
        )}

        {m30?.precisionAt10 != null && (
          <div className="rounded-md bg-violet-950/30 border border-violet-800/30 p-2 text-center">
            <p className="text-[10px] text-violet-400 uppercase tracking-wider">Precision@10</p>
            <p className="text-xl font-bold text-white">{METRIC_FMT(m30.precisionAt10, true)}</p>
            <p className="text-[10px] text-zinc-500">of top-10 predicted artists actually broke out</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
