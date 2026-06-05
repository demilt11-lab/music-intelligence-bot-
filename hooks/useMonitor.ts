"use client";
import { useQuery } from "@tanstack/react-query";

export interface WindowMetrics {
  n: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  precisionAt10: number | null;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

export interface DriftEvent {
  id: number;
  detectedAt: string;
  driftType: "data" | "performance" | "feature";
  severity: "none" | "investigate" | "retrain" | "alert_team";
  affectedFeature: string | null;
  psiScore: number | null;
  currentValue: number | null;
  referenceValue: number | null;
  delta: number | null;
  summary: string;
  resolvedAt: string | null;
  triggeredRetrain: boolean;
}

export interface RetrainingRun {
  id: number;
  triggeredBy: string;
  status: string;
  prevAuroc: number | null;
  newAuroc: number | null;
  accuracyDelta: number | null;
  rolledBack: boolean;
  rollbackReason: string | null;
  newLabeledCases: number | null;
  startedAt: string;
  completedAt: string | null;
  notes: string | null;
}

export interface MonitorData {
  generatedAt: string;
  healthStatus: "healthy" | "degraded" | "critical";
  model: {
    active: {
      id: number;
      version: string;
      modelType: string;
      metrics: Record<string, number>;
      trainedAt: string;
      promotedAt: string | null;
      trainSamples: number | null;
      notes: string | null;
    } | null;
    history: Array<{
      id: number;
      version: string;
      modelType: string;
      metrics: Record<string, number>;
      isActive: boolean;
      isBaseline: boolean;
      trainedAt: string;
      trainSamples: number | null;
    }>;
  };
  accuracy: {
    "7d": WindowMetrics | null;
    "30d": WindowMetrics | null;
    "90d": WindowMetrics | null;
  };
  weeklyTrend: Array<{ weekStart: string; accuracy: number | null; n: number }>;
  drift: {
    recentEvents: DriftEvent[];
    unresolvedCount: number;
    highSeverityCount: number;
  };
  retraining: {
    runs: RetrainingRun[];
    lastRunAt: string | null;
    lastRunStatus: string | null;
  };
  humanReview: {
    pendingCount: number;
    completedLast7d: number;
  };
  predictions: {
    total: number;
    pendingEvaluation: number;
  };
}

export function useMonitor() {
  return useQuery<MonitorData>({
    queryKey: ["monitor"],
    queryFn: async () => {
      const res = await fetch("/api/v1/monitor");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
