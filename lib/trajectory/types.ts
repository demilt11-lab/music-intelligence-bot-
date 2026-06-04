// All TypeScript types for trajectory prediction

export type TrajectorySignal = {
  entityType: 'track' | 'artist';
  entityId: number;
  signalType:
    | 'stream_velocity'
    | 'tiktok_growth'
    | 'chart_entry'
    | 'playlist_add'
    | 'radio_spike';
  value: number;
  recordedAt: Date;
  source?: string;
};

export type TrajectoryScore = {
  momentum: number;
  breakoutProb: number;
  viralityScore: number;
  estimatedDaysToViral: number;
  peakScoreEstimate: number;
  confidence: number;
};

export type TrajectoryPrediction = {
  entityType: 'track' | 'artist';
  entityId: number;
  score: TrajectoryScore;
  signals: TrajectorySignal[];
  computedAt: Date;
  modelVersion: string;
};

export type TrendingEntry = {
  entityType: 'track' | 'artist';
  entityId: number;
  rank: number;
  score: TrajectoryScore;
  deltaRank: number;
  sparkline: number[];
};
