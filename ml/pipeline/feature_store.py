"""
Feature Store

Reads from the database (via direct PostgreSQL queries) and constructs
the TrackFeatureRow records used for both training and inference.

This is the single source of truth that connects:
  - TrackPlatformStatsDaily  (Spotify streams, velocities)
  - UgcTrackMetrics          (TikTok video counts, views, growth)
  - TrackStatisticsLatest    (Spotify popularity, TikTok count, YouTube views)
  - TrackAudioFeatures       (BPM, key, energy, danceability, etc.)
  - PlaylistTrack + events   (playlist count, adds)
  - RadioAirplayFact         (radio spins, market count)
  - TalentScoutScore         (viral score)
  - TrackTrendLabel          (training labels)
  - TrackTrendPrediction     (existing model outputs)
  - UserFeedback             (user-provided labels and corrections)

Usage:
    from ml.pipeline.feature_store import FeatureStore
    store = FeatureStore(db_url=os.environ["DATABASE_URL"])
    records = store.fetch_track_features(track_ids=[1, 2, 3])
    df = pd.DataFrame.from_records(records)
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pandas as pd
import psycopg2
import psycopg2.extras
from ml.config import configure_logging

logger = configure_logging(__name__)


class FeatureStore:
    def __init__(self, db_url: Optional[str] = None):
        self._db_url = db_url or os.environ["DATABASE_URL"]

    def _conn(self):
        return psycopg2.connect(self._db_url, cursor_factory=psycopg2.extras.RealDictCursor)

    # ── public interface ──────────────────────────────────────────────────

    def fetch_track_features(
        self,
        track_ids: Optional[List[int]] = None,
        since_days: int = 180,
        with_labels: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Assemble full feature rows for the given track IDs.
        If track_ids is None, fetches all tracks updated in the last `since_days`.
        """
        cutoff = datetime.utcnow() - timedelta(days=since_days)

        with self._conn() as conn:
            with conn.cursor() as cur:
                ids = self._resolve_track_ids(cur, track_ids, cutoff)
                if not ids:
                    logger.warning("No tracks found for feature extraction")
                    return []
                logger.info("Fetching features for %d tracks", len(ids))

                stats   = self._fetch_latest_stats(cur, ids)
                audio   = self._fetch_audio_features(cur, ids)
                ugc     = self._fetch_ugc_metrics(cur, ids)
                streams = self._fetch_stream_velocities(cur, ids, cutoff)
                radio   = self._fetch_radio_metrics(cur, ids)
                playlists = self._fetch_playlist_metrics(cur, ids)
                talent  = self._fetch_talent_scores(cur, ids)
                labels  = self._fetch_labels(cur, ids) if with_labels else {}
                feedback = self._fetch_user_feedback_labels(cur, ids) if with_labels else {}

        rows = []
        for tid in ids:
            s   = stats.get(tid, {})
            af  = audio.get(tid, {})
            u   = ugc.get(tid, {})
            sv  = streams.get(tid, {})
            r   = radio.get(tid, {})
            pl  = playlists.get(tid, {})
            t   = talent.get(tid, {})
            lbl = labels.get(tid, {})
            fb  = feedback.get(tid, {})

            # User feedback overrides ETL labels (user corrections have higher fidelity)
            trajectory_label = fb.get("trajectory_label") or lbl.get("trajectory_label")
            viral_label      = fb.get("viral_label") or lbl.get("viral_label")
            viral_7d         = fb.get("viral_7d") or lbl.get("viral_7d")
            viral_30d        = fb.get("viral_30d") or lbl.get("viral_30d")
            popular_30d      = fb.get("popular_30d") or lbl.get("popular_30d")

            row: Dict[str, Any] = {
                "trackId": tid,
                "isrc": s.get("isrc"),
                "collectedAt": datetime.utcnow().isoformat(),

                # Audio
                "bpm": af.get("tempo"),
                "musical_key": af.get("key"),
                "mode": af.get("mode"),
                "energy": af.get("energy"),
                "danceability": af.get("danceability"),
                "valence": af.get("valence"),
                "loudness": af.get("loudness"),
                "duration_ms": af.get("duration_ms"),
                "language": s.get("language"),
                "genre_primary": s.get("genre_primary"),

                # Spotify
                "spotify_streams": _to_float(s.get("spotify_streams")),
                "spotify_popularity": s.get("spotify_popularity"),
                "spotify_stream_velocity_7d": sv.get("velocity_7d"),
                "spotify_stream_velocity_30d": sv.get("velocity_30d"),
                "spotify_playlist_count": pl.get("total_count"),
                "spotify_editorial_playlist_count": pl.get("editorial_count"),

                # TikTok UGC
                "tiktok_video_count": _to_float(s.get("tiktok_video_count")),
                "tiktok_video_count_7d_delta": u.get("videos_7d_delta"),
                "tiktok_growth_rate_7d": u.get("videos_growth_7d"),
                "tiktok_growth_rate_30d": u.get("videos_growth_30d"),
                "tiktok_avg_views_per_video": u.get("avg_views_per_video"),
                "tiktok_avg_likes_per_video": u.get("avg_likes_per_video"),
                "tiktok_top_region": u.get("top_region"),
                "tiktok_region_diversity_score": u.get("region_diversity"),

                # YouTube
                "youtube_views": _to_float(s.get("youtube_views")),
                "youtube_shorts_views": _to_float(s.get("youtube_shorts_views")),
                "youtube_view_velocity_7d": sv.get("youtube_velocity_7d"),

                # Radio
                "radio_spins_7d": r.get("spins_7d"),
                "radio_spins_30d": r.get("spins_30d"),
                "radio_spin_velocity": r.get("spin_velocity"),
                "radio_market_count": r.get("market_count"),
                "radio_top_market": r.get("top_market"),

                # Playlists
                "playlist_total_count": pl.get("total_count"),
                "playlist_adds_7d": pl.get("adds_7d"),
                "playlist_adds_30d": pl.get("adds_30d"),
                "playlist_editorial_adds_7d": pl.get("editorial_adds_7d"),
                "playlist_avg_position": pl.get("avg_position"),

                # Geo
                "top_country_1": u.get("top_country_1"),
                "top_country_2": u.get("top_country_2"),
                "top_country_3": u.get("top_country_3"),
                "trigger_city_count": s.get("trigger_city_count"),

                # Talent/viral scores
                "viral_score": t.get("viral_score"),
                "playlist_streams7d": sv.get("playlist_streams_7d"),

                # Labels
                "trajectory_label": trajectory_label,
                "viral_label": viral_label,
                "viral_7d": viral_7d,
                "viral_30d": viral_30d,
                "popular_30d": popular_30d,
                "label": lbl.get("trend_label"),
            }
            rows.append(row)

        logger.info("Built %d feature rows", len(rows))
        return rows

    def to_parquet(self, rows: List[Dict[str, Any]], path: str):
        df = pd.DataFrame.from_records(rows)
        df.to_parquet(path, index=False)
        logger.info("Wrote %d rows to %s", len(df), path)

    # ── private query helpers ─────────────────────────────────────────────

    def _resolve_track_ids(self, cur, ids, cutoff: datetime) -> List[int]:
        if ids:
            cur.execute("SELECT id FROM tracks WHERE id = ANY(%s)", (ids,))
        else:
            cur.execute(
                """
                SELECT DISTINCT track_id AS id FROM track_platform_stats_daily
                WHERE date >= %s
                """,
                (cutoff.date(),),
            )
        return [r["id"] for r in cur.fetchall()]

    def _fetch_latest_stats(self, cur, ids: List[int]) -> Dict[int, Dict]:
        cur.execute(
            """
            SELECT
                t.id,
                t.isrc,
                tsl.spotify_streams,
                tsl.spotify_popularity,
                tsl.tiktok_video_count,
                tsl.youtube_views,
                tsl.stream_velocity_7d AS youtube_shorts_views
            FROM tracks t
            LEFT JOIN track_statistics_latest tsl ON tsl.track_id = t.id
            WHERE t.id = ANY(%s)
            """,
            (ids,),
        )
        return {r["id"]: dict(r) for r in cur.fetchall()}

    def _fetch_audio_features(self, cur, ids: List[int]) -> Dict[int, Dict]:
        cur.execute(
            """
            SELECT track_id, tempo, key, mode, energy, danceability,
                   valence, loudness, duration_ms, instrumentalness
            FROM track_audio_features
            WHERE track_id = ANY(%s)
            """,
            (ids,),
        )
        return {r["track_id"]: dict(r) for r in cur.fetchall()}

    def _fetch_ugc_metrics(self, cur, ids: List[int]) -> Dict[int, Dict]:
        """Latest UGC metrics per track (aggregate across regions)."""
        cur.execute(
            """
            SELECT
                track_id,
                SUM(videos_7d) AS videos_7d,
                SUM(views_7d) AS views_7d,
                AVG(videos_7d_growth) AS videos_growth_7d,
                COUNT(DISTINCT code2) AS region_count
            FROM ugc_track_metrics
            WHERE date = (
                SELECT MAX(date) FROM ugc_track_metrics
            )
            AND track_id = ANY(%s)
            GROUP BY track_id
            """,
            (ids,),
        )
        rows = {r["track_id"]: dict(r) for r in cur.fetchall()}

        # Compute region diversity (normalised region count)
        max_regions = 20.0
        for tid, v in rows.items():
            rc = v.get("region_count") or 0
            v["region_diversity"] = min(rc / max_regions, 1.0)

        return rows

    def _fetch_stream_velocities(self, cur, ids: List[int], cutoff: datetime) -> Dict[int, Dict]:
        """Compute 7d and 30d streaming velocities from daily stats."""
        cur.execute(
            """
            WITH daily AS (
                SELECT
                    track_id,
                    date,
                    SUM(streams) AS streams
                FROM track_platform_stats_daily
                WHERE track_id = ANY(%s)
                  AND platform = 'spotify'
                  AND date >= CURRENT_DATE - INTERVAL '31 days'
                GROUP BY track_id, date
            ),
            agg AS (
                SELECT
                    track_id,
                    SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days'  THEN streams ELSE 0 END) AS s7d,
                    SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '14 days' AND date < CURRENT_DATE - INTERVAL '7 days' THEN streams ELSE 0 END) AS s7d_prev,
                    SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '30 days' THEN streams ELSE 0 END) AS s30d,
                    SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '60 days' AND date < CURRENT_DATE - INTERVAL '30 days' THEN streams ELSE 0 END) AS s30d_prev
                FROM daily
                GROUP BY track_id
            )
            SELECT
                track_id,
                s7d,
                s7d_prev,
                s30d,
                s30d_prev,
                CASE WHEN s7d_prev > 0 THEN (s7d - s7d_prev)::float / s7d_prev ELSE 0 END AS velocity_7d,
                CASE WHEN s30d_prev > 0 THEN (s30d - s30d_prev)::float / s30d_prev ELSE 0 END AS velocity_30d
            FROM agg
            """,
            (ids,),
        )
        return {r["track_id"]: dict(r) for r in cur.fetchall()}

    def _fetch_radio_metrics(self, cur, ids: List[int]) -> Dict[int, Dict]:
        cur.execute(
            """
            SELECT
                track_id,
                SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '7 days'  THEN spins ELSE 0 END) AS spins_7d,
                SUM(CASE WHEN date >= CURRENT_DATE - INTERVAL '30 days' THEN spins ELSE 0 END) AS spins_30d,
                COUNT(DISTINCT station_id) AS market_count
            FROM radio_airplay_facts
            WHERE track_id = ANY(%s)
              AND date >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY track_id
            """,
            (ids,),
        )
        rows = {r["track_id"]: dict(r) for r in cur.fetchall()}
        for v in rows.values():
            s7d = v.get("spins_7d") or 0
            s30d = v.get("spins_30d") or 0
            # Simple velocity: 7d rate vs avg of 30d
            avg_daily = (s30d / 30.0) if s30d else 0
            daily_7d  = (s7d / 7.0)   if s7d  else 0
            v["spin_velocity"] = (daily_7d - avg_daily) / (avg_daily + 1e-3)
        return rows

    def _fetch_playlist_metrics(self, cur, ids: List[int]) -> Dict[int, Dict]:
        cur.execute(
            """
            SELECT
                pt.track_id,
                COUNT(*) AS total_count,
                SUM(CASE WHEN p.playlist_type = 'editorial' THEN 1 ELSE 0 END) AS editorial_count,
                AVG(pt.position) AS avg_position
            FROM playlist_tracks pt
            JOIN playlists p ON p.id = pt.playlist_id
            WHERE pt.track_id = ANY(%s)
            GROUP BY pt.track_id
            """,
            (ids,),
        )
        totals = {r["track_id"]: dict(r) for r in cur.fetchall()}

        # Recent adds
        cur.execute(
            """
            SELECT
                track_id,
                SUM(CASE WHEN added_at >= CURRENT_DATE - INTERVAL '7 days'  THEN 1 ELSE 0 END) AS adds_7d,
                SUM(CASE WHEN added_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END) AS adds_30d
            FROM playlist_membership_events
            WHERE track_id = ANY(%s)
              AND added_at >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY track_id
            """,
            (ids,),
        )
        for r in cur.fetchall():
            tid = r["track_id"]
            if tid not in totals:
                totals[tid] = {}
            totals[tid].update({"adds_7d": r["adds_7d"], "adds_30d": r["adds_30d"]})

        # Editorial adds
        cur.execute(
            """
            SELECT
                pme.track_id,
                SUM(CASE WHEN pme.added_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END) AS editorial_adds_7d
            FROM playlist_membership_events pme
            JOIN playlists p ON p.id = pme.playlist_id
            WHERE pme.track_id = ANY(%s)
              AND p.playlist_type = 'editorial'
              AND pme.added_at >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY pme.track_id
            """,
            (ids,),
        )
        for r in cur.fetchall():
            tid = r["track_id"]
            if tid not in totals:
                totals[tid] = {}
            totals[tid]["editorial_adds_7d"] = r["editorial_adds_7d"]

        return totals

    def _fetch_talent_scores(self, cur, ids: List[int]) -> Dict[int, Dict]:
        cur.execute(
            """
            SELECT track_id, MAX(viral_score) AS viral_score
            FROM talent_scout_scores
            WHERE track_id = ANY(%s)
              AND date >= CURRENT_DATE - INTERVAL '7 days'
            GROUP BY track_id
            """,
            (ids,),
        )
        return {r["track_id"]: dict(r) for r in cur.fetchall()}

    def _fetch_labels(self, cur, ids: List[int]) -> Dict[int, Dict]:
        cur.execute(
            """
            SELECT
                ttl.track_id,
                ttl.label AS trend_label,
                MAX(CASE WHEN ttl.label = 'VIRAL' THEN 1 ELSE 0 END) AS viral_label,
                MAX(CASE WHEN ttl.label = 'VIRAL' THEN 1 ELSE 0 END) AS viral_30d,
                MAX(CASE WHEN ttl.label IN ('POPULAR','VIRAL') THEN 1 ELSE 0 END) AS popular_30d
            FROM track_trend_labels ttl
            WHERE ttl.track_id = ANY(%s)
              AND ttl.last_seen_at >= CURRENT_DATE - INTERVAL '90 days'
            GROUP BY ttl.track_id, ttl.label
            """,
            (ids,),
        )
        return {r["track_id"]: dict(r) for r in cur.fetchall()}

    def _fetch_user_feedback_labels(self, cur, ids: List[int]) -> Dict[int, Dict]:
        """
        User-submitted feedback overrides ETL labels.
        Aggregates by majority vote when multiple feedback items exist.
        """
        try:
            cur.execute(
                """
                SELECT
                    track_id,
                    label AS trajectory_label,
                    is_viral::int AS viral_label,
                    is_popular::int AS popular_30d,
                    COUNT(*) AS votes
                FROM user_feedback
                WHERE track_id = ANY(%s)
                  AND created_at >= CURRENT_DATE - INTERVAL '30 days'
                GROUP BY track_id, label, is_viral, is_popular
                ORDER BY votes DESC
                """,
                (ids,),
            )
            rows = cur.fetchall()
            result: Dict[int, Dict] = {}
            for r in rows:
                tid = r["track_id"]
                if tid not in result:
                    result[tid] = dict(r)
            return result
        except Exception as e:
            # user_feedback table may not exist yet
            logger.debug("user_feedback query skipped: %s", e)
            return {}


# ── helpers ───────────────────────────────────────────────────────────────────

def _to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
