"use client";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RollingStats, LeadingIndicatorResult } from "@/hooks/useTrends";

interface Props {
  rollingStats: RollingStats[];
  leadingIndicators: LeadingIndicatorResult[];
}

const ROLE_BADGE = {
  leading:    "bg-emerald-900/40 text-emerald-300",
  lagging:    "bg-zinc-800 text-zinc-400",
  coincident: "bg-blue-900/40 text-blue-300",
};

const SIGNAL_LABELS: Record<string, string> = {
  stream_velocity: "Stream Velocity",
  tiktok_growth: "TikTok Growth",
  save_rate: "Save Rate",
  follower_velocity: "Follower Velocity",
  chart_momentum: "Chart Momentum",
  playlist_signal: "Playlist Signal",
  radio_spike: "Radio Spike",
  skip_rate: "Skip Rate",
  listener_follower_conversion: "Listener → Follower",
};

function fmt(v: number | null, suffix = "%"): string {
  if (v === null) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}${suffix}`;
}

function TrendIcon({ dir, strength }: { dir: string; strength: number }) {
  if (dir === "up")   return <TrendingUp   className="h-3.5 w-3.5 text-emerald-400" />;
  if (dir === "down") return <TrendingDown className="h-3.5 w-3.5 text-rose-400" />;
  return <Minus className="h-3.5 w-3.5 text-zinc-500" />;
}

function AccelBadge({ accel }: { accel: number | null }) {
  if (accel === null) return <span className="text-zinc-600">—</span>;
  const label = accel > 2 ? "↑↑" : accel > 0 ? "↑" : accel < -2 ? "↓↓" : "↓";
  const color = accel > 0 ? "text-emerald-400" : "text-rose-400";
  return <span className={`text-xs font-mono ${color}`}>{label}</span>;
}

export function SignalTrendTable({ rollingStats, leadingIndicators }: Props) {
  const roleMap = Object.fromEntries(leadingIndicators.map(li => [li.signal, li]));

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-300">Signal Trend Analysis</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="text-left px-4 py-2 font-medium">Signal</th>
                <th className="text-left px-3 py-2 font-medium">Role</th>
                <th className="text-right px-3 py-2 font-medium">MA-7</th>
                <th className="text-right px-3 py-2 font-medium">WoW%</th>
                <th className="text-right px-3 py-2 font-medium">MoM%</th>
                <th className="text-center px-3 py-2 font-medium">Trend</th>
                <th className="text-center px-3 py-2 font-medium">Accel</th>
              </tr>
            </thead>
            <tbody>
              {rollingStats.map((rs) => {
                const li = roleMap[rs.signal];
                const hasData = rs.ma7 !== null;
                return (
                  <tr key={rs.signal} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className={hasData ? "text-zinc-200" : "text-zinc-600"}>
                        {SIGNAL_LABELS[rs.signal] ?? rs.signal}
                      </span>
                      {li?.predictiveValue === "high" && (
                        <AlertTriangle className="inline h-3 w-3 ml-1.5 text-amber-400" />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {li ? (
                        <Badge className={`text-[10px] px-1.5 py-0 ${ROLE_BADGE[li.role]}`}>
                          {li.role}
                          {li.avgLeadDays !== 0 && (
                            <span className="ml-1 opacity-70">
                              {li.avgLeadDays > 0 ? `+${li.avgLeadDays}d` : `${li.avgLeadDays}d`}
                            </span>
                          )}
                        </Badge>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-zinc-300">
                      {rs.ma7 !== null ? rs.ma7.toFixed(3) : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono ${
                      rs.wowPct === null ? "text-zinc-600" :
                      rs.wowPct > 5 ? "text-emerald-400" :
                      rs.wowPct < -5 ? "text-rose-400" : "text-zinc-300"
                    }`}>
                      {fmt(rs.wowPct)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono ${
                      rs.momPct === null ? "text-zinc-600" :
                      rs.momPct > 10 ? "text-emerald-400" :
                      rs.momPct < -10 ? "text-rose-400" : "text-zinc-300"
                    }`}>
                      {fmt(rs.momPct)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <TrendIcon dir={rs.trendDirection} strength={rs.trendStrength} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <AccelBadge accel={rs.acceleration} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
