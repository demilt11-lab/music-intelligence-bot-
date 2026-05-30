// lib/features/trajectory.ts
import type { ViralFeatures } from './viral';
import type {
  TrajectoryLabel,
  TrackTrajectory,
} from '@/lib/trajectory/states';

function classifyDimension(
  dimension: string,
  features: ViralFeatures,
): TrajectoryLabel {
  switch (dimension) {
    case 'spotify': {
      const streams = features.spotifyStreams ?? 0;
      const popularity = features.spotifyPopularity ?? 0;
      const vel = features.streamVelocity7d ?? 0;

      if (!streams && !popularity) {
        return {
          dimension: 'spotify',
          state: 'low_signal',
          confidence: 0.4,
          reason: 'No Spotify streams/popularity.',
        };
      }

      if (vel > 0 && popularity < 80) {
        return {
          dimension: 'spotify',
          state: 'rising',
          confidence: 0.8,
          reason: `Positive 7d stream velocity with sub-peak popularity (${popularity}).`,
        };
      }

      if (vel <= 0 && popularity >= 80) {
        return {
          dimension: 'spotify',
          state: 'peaking',
          confidence: 0.7,
          reason: `High popularity with flattening/negative velocity.`,
        };
      }

      if (vel < 0 && popularity < 80) {
        return {
          dimension: 'spotify',
          state: 'declining',
          confidence: 0.7,
          reason: 'Negative 7d stream velocity and mid popularity.',
        };
      }

      return {
        dimension: 'spotify',
        state: 'stable',
        confidence: 0.5,
        reason: 'No strong velocity signal.',
      };
    }

    case 'tiktok': {
      const vids = features.tiktokVideoCount ?? 0;
      const growth = features.tiktokGrowth7d ?? 0;

      if (!vids) {
        return {
          dimension: 'tiktok',
          state: 'low_signal',
          confidence: 0.4,
          reason: 'No TikTok videos counted.',
        };
      }

      if (growth > 0.2) {
        return {
          dimension: 'tiktok',
          state: 'rising',
          confidence: 0.85,
          reason: `Strong positive 7d TikTok growth (${growth}).`,
        };
      }

      if (growth < -0.1) {
        return {
          dimension: 'tiktok',
          state: 'declining',
          confidence: 0.7,
          reason: `Negative 7d TikTok growth (${growth}).`,
        };
      }

      return {
        dimension: 'tiktok',
        state: 'stable',
        confidence: 0.5,
        reason: 'TikTok growth near zero.',
      };
    }

    case 'youtube': {
      const views = features.youtubeViews ?? 0;
      if (!views) {
        return {
          dimension: 'youtube',
          state: 'low_signal',
          confidence: 0.4,
          reason: 'No YouTube views.',
        };
      }
      // For now treat as stable; later add view velocity.
      return {
        dimension: 'youtube',
        state: 'stable',
        confidence: 0.4,
        reason: 'YouTube views present but no velocity metric yet.',
      };
    }

    case 'playlists': {
      const count = features.playlistCount ?? 0;
      const adds7d = features.playlistAdds7d ?? 0;

      if (!count && !adds7d) {
        return {
          dimension: 'playlists',
          state: 'low_signal',
          confidence: 0.4,
          reason: 'No playlist presence.',
        };
      }

      if (adds7d > 0) {
        return {
          dimension: 'playlists',
          state: 'rising',
          confidence: 0.8,
          reason: `${adds7d} playlist adds in last 7 days.`,
        };
      }

      return {
        dimension: 'playlists',
        state: 'stable',
        confidence: 0.5,
        reason: 'Playlist presence without recent adds.',
      };
    }

    case 'radio': {
      const spins = features.radioSpins7d ?? 0;
      if (!spins) {
        return {
          dimension: 'radio',
          state: 'low_signal',
          confidence: 0.4,
          reason: 'No recent radio spins.',
        };
      }

      // For now treat as rising if any recent spins; later add trend.
      return {
        dimension: 'radio',
        state: 'rising',
        confidence: 0.6,
        reason: 'Recent radio spins detected.',
      };
    }

    default:
      return {
        dimension: 'global',
        state: 'low_signal',
        confidence: 0.3,
        reason: 'Unknown dimension.',
      };
  }
}

export function aggregateTrajectory(
  features: ViralFeatures,
): TrackTrajectory {
  const dims: TrajectoryLabel[] = [
    classifyDimension('spotify', features),
    classifyDimension('tiktok', features),
    classifyDimension('youtube', features),
    classifyDimension('playlists', features),
    classifyDimension('radio', features),
  ];

  // Simple aggregation: count rising/declining/etc.
  const counts = dims.reduce(
    (acc, d) => {
      acc[d.state] = (acc[d.state] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  let overall: TrajectoryLabel;

  if ((counts['rising'] ?? 0) >= 2 && (counts['declining'] ?? 0) === 0) {
    overall = {
      dimension: 'global',
      state: 'rising',
      confidence: 0.85,
      reason: 'Multiple dimensions are rising and none are strongly declining.',
    };
  } else if ((counts['peaking'] ?? 0) >= 1 && (counts['rising'] ?? 0) === 0) {
    overall = {
      dimension: 'global',
      state: 'peaking',
      confidence: 0.8,
      reason: 'At least one dimension is peaking with no rising dimensions.',
    };
  } else if ((counts['declining'] ?? 0) >= 2) {
    overall = {
      dimension: 'global',
      state: 'declining',
      confidence: 0.8,
      reason: 'Multiple dimensions show decline.',
    };
  } else {
    overall = {
      dimension: 'global',
      state: 'stable',
      confidence: 0.6,
      reason: 'No strong consensus; treating as stable.',
    };
  }

  return {
    trackId: features.trackId,
    overall,
    dimensions: dims,
  };
}
