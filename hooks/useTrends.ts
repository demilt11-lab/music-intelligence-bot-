"use client";
import { useQuery } from "@tanstack/react-query";

export interface RollingStats {
  signal: string;
  ma7: number | null;
  ma14: number | null;
  ma30: number | null;
  wowPct: number | null;
  momPct: number | null;
  velocity: number | null;
  acceleration: number | null;
  trendDirection: "up" | "down" | "flat";
  trendStrength: number;
}

export interface SpikeEvent {
  date: string;
  signal: string;
  value: number;
  zScore: number;
  spikeType: "organic" | "algorithmic" | "viral_meme" | "noise" | "unknown";
  magnitude: "major" | "moderate" | "minor";
  isSustained: boolean;
  daysSustained: number;
  likelyCause: string;
  breakoutSignal: boolean;
  explanation: string;
}

export interface LeadingIndicatorResult {
  signal: string;
  role: "leading" | "lagging" | "coincident";
  avgLeadDays: number;
  predictiveValue: "high" | "medium" | "low";
  explanation: string;
}

export interface Forecast {
  horizonDays: number;
  breakoutProbability: number;
  probabilityLower: number;
  probabilityUpper: number;
  expectedBreakoutDay: number | null;
  timelineUncertaintyDays: number;
  confidenceLevel: "high" | "medium" | "low";
  keyDrivers: string[];
  explanation: string;
}

export interface RiskFactor {
  name: string;
  category: string;
  severity: "high" | "medium" | "low";
  probability: "likely" | "possible" | "unlikely";
  impactOnForecast: string;
  monitoringSignal: string;
}

export interface MonitoringSignal {
  signal: string;
  checkFrequency: "daily" | "weekly";
  alertThreshold: string;
  whyImportant: string;
}

export interface TrendsResult {
  artistId: number;
  artistName: string;
  predictionDate: string;
  rollingStats: RollingStats[];
  spikeEvents: SpikeEvent[];
  leadingIndicators: LeadingIndicatorResult[];
  forecast30d: Forecast;
  forecast90d: Forecast;
  riskFactors: RiskFactor[];
  monitoringSignals: MonitoringSignal[];
  dataPointsUsed: number;
  temporalLeakageCheck: string;
  analyzedAt: string;
}

export function useTrends(artistId: number | null, predictionDate?: string) {
  return useQuery<TrendsResult>({
    queryKey: ["trends", artistId, predictionDate],
    queryFn: async () => {
      const params = predictionDate ? `?prediction_date=${predictionDate}` : "";
      const res = await fetch(`/api/v1/trends/${artistId}${params}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!artistId,
    staleTime: 60_000,
  });
}
