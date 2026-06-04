// Types for the ingestion and self-teaching loop
export interface ArtistMetrics {
  artistId: number;
  date: string;  // ISO date YYYY-MM-DD
  streamVelocity: number | null;
  playlistRate: number | null;
  ugcCount: number | null;
  followerGrowth: number | null;
  saveRate: number | null;
  skipRate: number | null;
  tiktokUses7d: number | null;
  preSaveCount: number | null;
  radioSpins: number | null;
  chartRank: number | null;
}

export interface IngestionResult {
  jobId: number;
  artistsTotal: number;
  artistsDone: number;
  artistsFailed: number;
  durationMs: number;
  errors: Array<{ artistId: number; error: string }>;
}

export interface ModelMetrics {
  auroc: number;
  auprc: number;
  f1: number;
  precision: number;
  recall: number;
  accuracy: number;
  valLoss: number;
}

export interface PredictionRequest {
  artistId: number;
  useCache?: boolean;
}

export interface PredictionResponse {
  artistId: number;
  breakoutProbability: number;  // 0-100 (percentage)
  confidenceScore: number;      // 0-1
  modelVersion: string;
  topSignals: TopSignal[];
  cachedAt?: string;
  warning?: string;  // set when using stale/cached data
}

export interface TopSignal {
  signal: string;
  value: number;
  weight: number;
  interpretation: string;  // human-readable: "Strong TikTok growth"
}

export interface FeedbackRecord {
  predictionId: number;
  actualBrokeOut: boolean;
  chartedAt?: string;
  chartName?: string;
  peakChartRank?: number;
  source: string;
}
