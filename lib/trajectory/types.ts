// All TypeScript types for trajectory prediction

export type TrajectorySignal = {
  entityType: 'track' | 'artist';
  entityId: number;
  signalType:
    | 'stream_velocity'
    | 'tiktok_growth'
    | 'chart_entry'
    | 'playlist_add'
    | 'radio_spike'
    | 'save_rate'          // saves/streams ratio (0-1)
    | 'follower_velocity'  // monthly follower growth rate (0-1 normalized)
    | 'pre_save_count'     // pre-release pre-save normalized count
    | 'skip_rate';         // skip rate (lower = better, invert in scoring)
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
