"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart2 } from "lucide-react";

interface WeekPoint {
  weekStart: string;
  accuracy: number | null;
  n: number;
}

interface Props {
  trend: WeekPoint[];
}

export function AccuracyTrendChart({ trend }: Props) {
  if (!trend.length) return null;

  const maxAcc = 1.0;
  const minAcc = Math.min(...trend.filter((t) => t.accuracy != null).map((t) => t.accuracy!), 0.5);

  function pct(acc: number | null) {
    if (acc == null) return 0;
    return ((acc - minAcc) / (maxAcc - minAcc)) * 100;
  }

  // Detect performance regression (last week vs second-to-last week)
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  const regressionThreshold = 0.05;
  const isRegressing =
    last?.accuracy != null &&
    prev?.accuracy != null &&
    prev.accuracy - last.accuracy > regressionThreshold;

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-violet-400" />
            Weekly Accuracy Trend
          </div>
          {isRegressing && (
            <span className="text-[10px] text-rose-400 font-semibold bg-rose-900/30 px-2 py-0.5 rounded">
              ▼ Regression detected
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {/* Bar chart */}
        <div className="flex items-end gap-1.5 h-24">
          {trend.map((point, i) => {
            const height = pct(point.accuracy);
            const color = point.accuracy == null
              ? "bg-zinc-800"
              : isRegressing && i === trend.length - 1
              ? "bg-rose-500"
              : "bg-violet-600";
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={
                point.accuracy != null
                  ? `${(point.accuracy * 100).toFixed(1)}% (n=${point.n})`
                  : "No data"
              }>
                <div className="w-full flex flex-col justify-end" style={{ height: "88px" }}>
                  <div
                    className={`w-full rounded-t ${color} transition-all min-h-[2px]`}
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="flex gap-1.5 mt-1">
          {trend.map((point, i) => (
            <div key={i} className="flex-1 text-center">
              <span className="text-[9px] text-zinc-600">
                {point.weekStart.slice(5)} {/* MM-DD */}
              </span>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div className="flex justify-between mt-3 text-xs text-zinc-500 border-t border-zinc-800 pt-2">
          <span>
            Latest:{" "}
            <span className={`font-medium ${isRegressing ? "text-rose-400" : "text-white"}`}>
              {last?.accuracy != null ? `${(last.accuracy * 100).toFixed(1)}%` : "—"}
            </span>
          </span>
          <span>
            8-week avg:{" "}
            <span className="font-medium text-white">
              {(() => {
                const valid = trend.filter((t) => t.accuracy != null);
                if (!valid.length) return "—";
                const avg = valid.reduce((s, t) => s + t.accuracy!, 0) / valid.length;
                return `${(avg * 100).toFixed(1)}%`;
              })()}
            </span>
          </span>
          <span>
            Total evaluated:{" "}
            <span className="font-medium text-white">
              {trend.reduce((s, t) => s + t.n, 0).toLocaleString()}
            </span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
