# ml/training/collect_features.py
"""
Enhanced feature collector.
Pulls track features, TikTok UGC signals, audio properties,
geo breakdowns, and playlist/radio momentum from the Music Intelligence API.
"""

import os
import json
import time
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import requests
from dataclasses import dataclass, asdict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_BASE = os.environ.get("API_BASE", "https://your-api-host.com")
API_KEY = os.environ.get("API_KEY", "")
HEADERS = {"x-api-key": API_KEY}
REQUEST_DELAY = 0.25  # seconds between API calls


@dataclass
class TrackFeatureRow:
    # Identity
    trackId: int
    isrc: Optional[str]
    collectedAt: str

    # Audio features (from audio analysis or metadata)
    bpm: Optional[float]
    musical_key: Optional[str]
    mode: Optional[str]           # major / minor
    energy: Optional[float]       # 0-1
    danceability: Optional[float] # 0-1
    valence: Optional[float]      # 0-1 (positive/negative mood)
    loudness: Optional[float]
    duration_ms: Optional[int]
    language: Optional[str]
    genre_primary: Optional[str]
    genre_tags: Optional[str]     # comma-separated

    # Spotify signals
    spotify_streams: Optional[float]
    spotify_popularity: Optional[int]
    spotify_stream_velocity_7d: Optional[float]
    spotify_stream_velocity_30d: Optional[float]
    spotify_playlist_count: Optional[int]
    spotify_editorial_playlist_count: Optional[int]

    # TikTok UGC signals
    tiktok_video_count: Optional[int]
    tiktok_video_count_7d_delta: Optional[int]
    tiktok_video_count_30d_delta: Optional[int]
    tiktok_growth_rate_7d: Optional[float]
    tiktok_growth_rate_30d: Optional[float]
    tiktok_avg_views_per_video: Optional[float]
    tiktok_avg_likes_per_video: Optional[float]
    tiktok_top_region: Optional[str]
    tiktok_region_diversity_score: Optional[float]  # how many regions active

    # YouTube signals
    youtube_views: Optional[float]
    youtube_shorts_views: Optional[float]
    youtube_view_velocity_7d: Optional[float]

    # Radio signals
    radio_spins_7d: Optional[int]
    radio_spins_30d: Optional[int]
    radio_spin_velocity: Optional[float]
    radio_market_count: Optional[int]
    radio_top_market: Optional[str]

    # Playlist signals
    playlist_total_count: Optional[int]
    playlist_adds_7d: Optional[int]
    playlist_adds_30d: Optional[int]
    playlist_editorial_adds_7d: Optional[int]
    playlist_avg_position: Optional[float]

    # Geo breakdowns
    top_country_1: Optional[str]
    top_country_2: Optional[str]
    top_country_3: Optional[str]
    trigger_city_count: Optional[int]

    # Chart signals
    chart_count: Optional[int]
    chart_peak_rank: Optional[int]
    chart_days_on_chart: Optional[int]
    chart_rank_velocity: Optional[float]  # improving = negative

    # Label for training (set post-hoc)
    trajectory_label: Optional[str]       # rising/peaking/declining/resurging/stable
    viral_label: Optional[int]            # 1 = went viral within 30d, 0 = did not


def safe_get(
    endpoint: str,
    retries: int = 3,
    delay: float = REQUEST_DELAY,
) -> Optional[Dict]:
    url = f"{API_BASE}{endpoint}"
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=15)
            if resp.status_code == 200:
                return resp.json().get("obj")
            if resp.status_code == 404:
                return None
            if resp.status_code == 429:
                logger.warning("Rate limited; backing off.")
                time.sleep(5 * (attempt + 1))
                continue
        except Exception as e:
            logger.warning(f"Request error for {url}: {e}")
            time.sleep(delay * (attempt + 1))
    return None


def collect_track_features(track_id: int) -> Optional[TrackFeatureRow]:
    logger.info(f"Collecting features for track {track_id}...")

    # Core features
    feat = safe_get(f"/api/v1/tracks/{track_id}/features")
    if not feat:
        logger.warning(f"No features for {track_id}")
        return None

    # Trajectory state
    traj = safe_get(f"/api/v1/tracks/{track_id}/trajectory") or {}

    # Charts
    charts_data = safe_get(f"/api/v1/tracks/{track_id}/charts") or []
    chart_count = len(charts_data) if isinstance(charts_data, list) else 0
    chart_peak_rank = None
    chart_days_on_chart = 0
    if chart_count:
        ranks = [c.get("rank") for c in charts_data if c.get("rank")]
        chart_peak_rank = min(ranks) if ranks else None
        chart_days_on_chart = chart_count

    # Radio
    radio_data = safe_get(f"/api/v1/tracks/{track_id}/radio") or {}
    airplay = radio_data.get("airplayTotals") or {}
    markets = radio_data.get("broadcastMarkets") or []

    return TrackFeatureRow(
        trackId=track_id,
        isrc=feat.get("isrc"),
        collectedAt=datetime.utcnow().isoformat(),

        # Audio
        bpm=feat.get("bpm"),
        musical_key=feat.get("musicalKey"),
        mode=feat.get("mode"),
        energy=feat.get("energy"),
        danceability=feat.get("danceability"),
        valence=feat.get("valence"),
        loudness=feat.get("loudness"),
        duration_ms=feat.get("durationMs"),
        language=feat.get("language"),
        genre_primary=feat.get("genrePrimary"),
        genre_tags=",".join(feat.get("genreTags") or []),

        # Spotify
        spotify_streams=feat.get("spotifyStreams"),
        spotify_popularity=feat.get("spotifyPopularity"),
        spotify_stream_velocity_7d=feat.get("streamVelocity7d"),
        spotify_stream_velocity_30d=feat.get("streamVelocity30d"),
        spotify_playlist_count=feat.get("playlistCount"),
        spotify_editorial_playlist_count=feat.get("editorialPlaylistCount"),

        # TikTok UGC
        tiktok_video_count=feat.get("tiktokVideoCount"),
        tiktok_video_count_7d_delta=feat.get("tiktokVideoDelta7d"),
        tiktok_video_count_30d_delta=feat.get("tiktokVideoDelta30d"),
        tiktok_growth_rate_7d=feat.get("tiktokGrowth7d"),
        tiktok_growth_rate_30d=feat.get("tiktokGrowth30d"),
        tiktok_avg_views_per_video=feat.get("tiktokAvgViewsPerVideo"),
        tiktok_avg_likes_per_video=feat.get("tiktokAvgLikesPerVideo"),
        tiktok_top_region=feat.get("tiktokTopRegion"),
        tiktok_region_diversity_score=feat.get("tiktokRegionDiversity"),

        # YouTube
        youtube_views=feat.get("youtubeViews"),
        youtube_shorts_views=feat.get("youtubeShortsViews"),
        youtube_view_velocity_7d=feat.get("youtubeViewVelocity7d"),

        # Radio
        radio_spins_7d=feat.get("radioSpins7d"),
        radio_spins_30d=feat.get("radioSpins30d"),
        radio_spin_velocity=feat.get("radioSpinVelocity"),
        radio_market_count=len(markets),
        radio_top_market=markets[0].get("marketName") if markets else None,

        # Playlists
        playlist_total_count=feat.get("playlistCount"),
        playlist_adds_7d=feat.get("playlistAdds7d"),
        playlist_adds_30d=feat.get("playlistAdds30d"),
        playlist_editorial_adds_7d=feat.get("editorialPlaylistAdds7d"),
        playlist_avg_position=feat.get("playlistAvgPosition"),

        # Geo
        top_country_1=feat.get("topCountry1"),
        top_country_2=feat.get("topCountry2"),
        top_country_3=feat.get("topCountry3"),
        trigger_city_count=feat.get("triggerCityCount"),

        # Charts
        chart_count=chart_count,
        chart_peak_rank=chart_peak_rank,
        chart_days_on_chart=chart_days_on_chart,
        chart_rank_velocity=feat.get("chartRankVelocity"),

        # Labels (set post-hoc)
        trajectory_label=traj.get("overall", {}).get("state"),
        viral_label=None,
    )


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--track-ids-file", type=str, default=None)
    parser.add_argument("--output", type=str, default="output/data/features.json")
    args = parser.parse_args()

    if args.track_ids_file:
        with open(args.track_ids_file) as f:
            track_ids = [int(x.strip()) for x in f if x.strip().isdigit()]
    else:
        track_ids = []

    if not track_ids:
        logger.warning("No track IDs provided.")
        return

    rows = []
    for tid in track_ids:
        row = collect_track_features(tid)
        if row:
            rows.append(asdict(row))
        time.sleep(REQUEST_DELAY)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(rows, f, indent=2)

    logger.info(f"Saved {len(rows)} rows to {args.output}")


if __name__ == "__main__":
    main()
