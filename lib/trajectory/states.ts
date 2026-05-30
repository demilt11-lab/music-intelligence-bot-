// lib/trajectory/states.ts

export type TrajectoryState =
  | 'rising'
  | 'peaking'
  | 'declining'
  | 'resurging'
  | 'stable'
  | 'low_signal';

export type Dimension =
  | 'global'
  | 'spotify'
  | 'tiktok'
  | 'youtube'
  | 'radio'
  | 'playlists';

export type TrajectoryLabel = {
  dimension: Dimension;
  state: TrajectoryState;
  confidence: number; // 0-1
  reason: string;
};

export type TrackTrajectory = {
  trackId: number;
  overall: TrajectoryLabel;
  dimensions: TrajectoryLabel[];
};
