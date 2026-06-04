"use client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Forecast } from "@/hooks/useTrends";

interface Props {
  forecast: Forecast;
  horizon: "30d" | "90d";
}

const CONF_COLOR = { high: "text-emerald-400", medium: "text-amber-400", low: "text-zinc-400" };
const CONF_BADGE = { high: "bg-emerald-900/40 text-emerald-300", medium: "bg-amber-900/40 text-amber-300", low: "bg-zinc-800 text-zinc-400" };

export function ForecastCard({ forecast, horizon }: Props) {
  const pct = Math.round(forecast.breakoutProbability * 100);
  const lo  = Math.round(forecast.probabilityLower * 100);
  const hi  = Math.round(forecast.probabilityUpper * 100);
  const barWidth = `${pct}%`;

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-zinc-300">
            {horizon === "30d" ? "30-Day" : "90-Day"} Breakout Forecast
          </CardTitle>
          <Badge className={`text-xs ${CONF_BADGE[forecast.confidenceLevel]}`}>
            {forecast.confidenceLevel} confidence
          </Badge>
        </div>
        <CardDescription className="text-xs text-zinc-500">
          80% confidence interval
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main probability */}
        <div className="flex items-end gap-2">
          <span className={`text-4xl font-bold tabular-nums ${CONF_COLOR[forecast.confidenceLevel]}`}>
            {pct}%
          </span>
          <span className="text-xs text-zinc-500 pb-1.5">
            ({lo}%–{hi}%)
          </span>
        </div>

        {/* Progress bar with CI shading */}
        <div className="relative h-2 rounded-full bg-zinc-800">
          <div
            className="absolute left-0 top-0 h-2 rounded-full bg-violet-600/30"
            style={{ width: `${hi}%` }}
          />
          <div
            className="absolute left-0 top-0 h-2 rounded-full bg-violet-600"
            style={{ width: barWidth }}
          />
          <div
            className="absolute top-0 h-2 rounded-full bg-violet-500/40"
            style={{ left: `${lo}%`, width: `${hi - lo}%` }}
          />
        </div>
        <p className="text-xs text-zinc-500">
          {lo}% ← 80% CI → {hi}%
        </p>

        {/* Timeline */}
        {forecast.expectedBreakoutDay && (
          <p className="text-sm text-zinc-300">
            Expected in{" "}
            <span className="font-semibold text-white">
              ~{forecast.expectedBreakoutDay} days
            </span>
            <span className="text-zinc-500"> ±{forecast.timelineUncertaintyDays}d</span>
          </p>
        )}

        {/* Key drivers */}
        {forecast.keyDrivers.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Key drivers</p>
            {forecast.keyDrivers.map((d, i) => (
              <p key={i} className="text-xs text-zinc-400 flex gap-1.5">
                <span className="text-violet-500 shrink-0">›</span>
                {d}
              </p>
            ))}
          </div>
        )}

        {/* Explanation */}
        <p className="text-xs text-zinc-500 leading-relaxed border-t border-zinc-800 pt-3">
          {forecast.explanation}
        </p>
      </CardContent>
    </Card>
  );
}
