"use client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RotateCcw } from "lucide-react";
import type { RetrainingRun } from "@/hooks/useMonitor";

interface Props {
  runs: RetrainingRun[];
  lastRunAt: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  pending:    "bg-zinc-800 text-zinc-400",
  training:   "bg-blue-900/40 text-blue-300",
  evaluating: "bg-amber-900/40 text-amber-300",
  promoted:   "bg-emerald-900/40 text-emerald-300",
  rolled_back:"bg-rose-900/40 text-rose-300",
  failed:     "bg-rose-900/60 text-rose-200",
};

const TRIGGER_LABEL: Record<string, string> = {
  weekly_cron:        "Weekly",
  feedback_threshold: "100 new labels",
  manual:             "Manual",
  scheduled_weekly:   "Weekly",
};

export function RetrainingTimeline({ runs, lastRunAt }: Props) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <RotateCcw className="h-4 w-4 text-violet-400" />
          Retraining History
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        {runs.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-4">No retraining runs yet</p>
        ) : (
          runs.map((run, i) => {
            const hasMetrics = run.prevAuroc != null && run.newAuroc != null;
            const delta = run.accuracyDelta;
            const deltaColor = delta == null ? "text-zinc-500" :
              delta >= 0 ? "text-emerald-400" : "text-rose-400";

            return (
              <div key={run.id} className={`relative pl-4 ${i < runs.length - 1 ? "pb-3 border-l border-zinc-800" : ""}`}>
                <div className="absolute -left-1 top-0 w-2 h-2 rounded-full bg-violet-600" />
                <div className="rounded-md border border-zinc-800 bg-zinc-950/40 p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLE[run.status] ?? ""}`}>
                        {run.status.replace("_", " ")}
                      </Badge>
                      <span className="text-[10px] text-zinc-500">
                        {TRIGGER_LABEL[run.triggeredBy] ?? run.triggeredBy}
                      </span>
                      {run.rolledBack && (
                        <span className="text-[10px] text-rose-400 font-semibold">ROLLED BACK</span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(run.startedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {hasMetrics && (
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-zinc-500">
                        AUROC: <span className="text-zinc-300">{run.prevAuroc!.toFixed(3)}</span>
                        {" → "}
                        <span className="text-zinc-100 font-medium">{run.newAuroc!.toFixed(3)}</span>
                      </span>
                      {delta != null && (
                        <span className={`font-semibold ${deltaColor}`}>
                          {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  )}

                  {run.newLabeledCases != null && run.newLabeledCases > 0 && (
                    <p className="text-[10px] text-zinc-500">
                      {run.newLabeledCases} new labeled cases
                    </p>
                  )}

                  {run.rollbackReason && (
                    <p className="text-[10px] text-rose-400">Reason: {run.rollbackReason}</p>
                  )}
                  {run.notes && (
                    <p className="text-[10px] text-zinc-600">{run.notes}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
