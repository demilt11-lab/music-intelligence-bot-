"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, TrendingUp, Volume2, Minus } from "lucide-react";
import type { SpikeEvent } from "@/hooks/useTrends";

interface Props {
  spikes: SpikeEvent[];
}

const TYPE_CONFIG = {
  organic:     { label: "Organic",    color: "bg-emerald-900/40 text-emerald-300", icon: TrendingUp },
  algorithmic: { label: "Algorithmic",color: "bg-blue-900/40 text-blue-300",       icon: Volume2 },
  viral_meme:  { label: "Viral/UGC",  color: "bg-violet-900/40 text-violet-300",   icon: Zap },
  noise:       { label: "Noise",      color: "bg-zinc-800 text-zinc-400",           icon: Minus },
  unknown:     { label: "Unknown",    color: "bg-zinc-800 text-zinc-400",           icon: Minus },
};

const MAG_COLOR = { major: "text-rose-400", moderate: "text-amber-400", minor: "text-zinc-400" };

const SIGNAL_LABELS: Record<string, string> = {
  stream_velocity: "Streams",
  tiktok_growth: "TikTok",
  save_rate: "Saves",
  follower_velocity: "Followers",
  chart_momentum: "Charts",
  playlist_signal: "Playlists",
};

export function SpikeLog({ spikes }: Props) {
  if (spikes.length === 0) {
    return (
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-zinc-300">Anomalous Spike Log</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">No significant spikes detected in available data.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-300">
          Anomalous Spike Log
          <span className="ml-2 text-xs text-zinc-500 font-normal">{spikes.length} events</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-3">
        {spikes.map((spike, i) => {
          const cfg = TYPE_CONFIG[spike.spikeType];
          const Icon = cfg.icon;
          return (
            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <span className="text-xs font-medium text-zinc-200 truncate">
                    {SIGNAL_LABELS[spike.signal] ?? spike.signal}
                  </span>
                  <span className="text-xs text-zinc-500">{spike.date}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge className={`text-[10px] px-1.5 py-0 ${cfg.color}`}>{cfg.label}</Badge>
                  <span className={`text-[10px] font-mono ${MAG_COLOR[spike.magnitude]}`}>
                    Z={spike.zScore.toFixed(1)}
                  </span>
                  {spike.breakoutSignal && (
                    <span className="text-[10px] text-emerald-400 font-medium">✓ Signal</span>
                  )}
                </div>
              </div>

              <p className="text-xs text-zinc-400 leading-relaxed">{spike.explanation}</p>

              {spike.isSustained && (
                <p className="text-xs text-emerald-400/80">
                  Sustained {spike.daysSustained} days above baseline
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
