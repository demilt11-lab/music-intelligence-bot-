"""
ml/ar_feature_engineering.py
Predictive A&R — Feature Engineering
Computes ArtistFeaturesDaily rows from raw platform stats.

ASSUMPTION: artist_daily_stats uses camelCase columns as created by Prisma db push.
ASSUMPTION: ugc_track_metrics.trackId links to track_artists.trackId -> artistId.
ASSUMPTION: playlist_membership_events.trackId links similarly via track_artists.
TODO: Add Instagram engagement data when IG API integration is available.
"""

import os
import sys
import logging
from datetime import date, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras
import pandas as pd
import numpy as np
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("ar_feature_engineering")

# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

def _fetch_artist_daily_stats(conn, target_date: date) -> pd.DataFrame:
    """Pull artist_daily_stats for the rolling 90-day window ending on target_date."""
    start = target_date - timedelta(days=90)
    sql = """
        SELECT
            "artistId",
            "date",
            "totalListeners",
            "totalFollowers",
            "totalStreams",
            "airplayPlays",
            "platformStreams",
            "platformListeners"
        FROM artist_daily_stats
        WHERE "date" >= %(start)s AND "date" <= %(end)s
        ORDER BY "artistId", "date"
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {"start": start, "end": target_date})
        rows = cur.fetchall()
    return pd.DataFrame(rows) if rows else pd.DataFrame()


def _fetch_ugc_metrics(conn, target_date: date) -> pd.DataFrame:
    """Pull UGC (TikTok) track metrics, aggregated to artist level for last 7d."""
    start = target_date - timedelta(days=7)
    sql = """
        SELECT
            ta."artistId",
            SUM(u."videos7d")        AS total_videos7d,
            AVG(u."videos7dGrowth")  AS avg_videos7d_growth,
            SUM(u."views7d")         AS total_views7d,
            AVG(u."views7dGrowth")   AS avg_views7d_growth
        FROM ugc_track_metrics u
        JOIN track_artists ta ON ta."trackId" = u."trackId"
        WHERE u."date" >= %(start)s AND u."date" <= %(end)s
        GROUP BY ta."artistId"
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {"start": start, "end": target_date})
        rows = cur.fetchall()
    return pd.DataFrame(rows) if rows else pd.DataFrame()


def _fetch_playlist_adds(conn, target_date: date) -> pd.DataFrame:
    """Count playlist add events per artist over last 7d."""
    start = target_date - timedelta(days=7)
    sql = """
        SELECT
            ta."artistId",
            COUNT(*) AS playlist_adds7d
        FROM playlist_membership_events pme
        JOIN track_artists ta ON ta."trackId" = pme."trackId"
        WHERE pme."eventType" = 'add'
          AND pme."eventDate" >= %(start)s AND pme."eventDate" <= %(end)s
        GROUP BY ta."artistId"
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {"start": start, "end": target_date})
        rows = cur.fetchall()
    return pd.DataFrame(rows) if rows else pd.DataFrame()


def _fetch_track_platform_saves_streams(conn, target_date: date) -> pd.DataFrame:
    """Pull per-artist saves and streams from track_platform_stats_daily for last 30d."""
    start = target_date - timedelta(days=30)
    sql = """
        SELECT
            ta."artistId",
            SUM(COALESCE(t."saves", 0))   AS total_saves30d,
            SUM(COALESCE(t."streams", 0)) AS total_streams30d,
            SUM(COALESCE(t."comments", 0)) AS total_comments30d,
            SUM(COALESCE(t."videoViews", 0)) AS total_video_views30d
        FROM track_platform_stats_daily t
        JOIN track_artists ta ON ta."trackId" = t."trackId"
        WHERE t."date" >= %(start)s AND t."date" <= %(end)s
        GROUP BY ta."artistId"
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {"start": start, "end": target_date})
        rows = cur.fetchall()
    return pd.DataFrame(rows) if rows else pd.DataFrame()


def _fetch_chart_presence(conn, target_date: date) -> pd.DataFrame:
    """
    Pull per-artist chart presence/momentum from chart_rows for the last 7d,
    across every chart platform (billboard, applemusic, spotify, ...) —
    deliberately platform-agnostic so crawl4ai-sourced charts count the same
    as API-sourced ones.
    """
    start = target_date - timedelta(days=7)
    sql = """
        SELECT
            ta."artistId",
            COUNT(DISTINCT cs."chartName" || '|' || cs.platform) AS chart_presence_7d,
            AVG(cr."previousRank" - cr.rank)
                FILTER (WHERE cr."previousRank" IS NOT NULL)     AS chart_rank_improvement_7d
        FROM chart_rows cr
        JOIN chart_snapshots cs ON cs.id = cr."snapshotId"
        JOIN track_artists ta ON ta."trackId" = cr."trackId"
        WHERE cs."snapshotDate" >= %(start)s AND cs."snapshotDate" <= %(end)s
        GROUP BY ta."artistId"
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, {"start": start, "end": target_date})
        rows = cur.fetchall()
    return pd.DataFrame(rows) if rows else pd.DataFrame()


# ---------------------------------------------------------------------------
# Feature computation helpers
# ---------------------------------------------------------------------------

def _pct_change(new_val, old_val) -> Optional[float]:
    """Safe percentage change, returns None if old_val is zero/None."""
    if old_val is None or new_val is None:
        return None
    if float(old_val) == 0.0:
        return None
    return float((new_val - old_val) / abs(old_val) * 100.0)


def _compute_growth_window(grp: pd.DataFrame, col: str, days: int, ref_date: date) -> Optional[float]:
    """
    Given a group DataFrame sorted by date, compute percentage growth over `days`.
    """
    end_row = grp[grp["date"] == pd.Timestamp(ref_date)]
    start_date = ref_date - timedelta(days=days)
    start_row = grp[grp["date"] == pd.Timestamp(start_date)]
    if end_row.empty or start_row.empty:
        return None
    return _pct_change(end_row.iloc[0][col], start_row.iloc[0][col])


def _compute_velocity(grp: pd.DataFrame, col: str, days: int, ref_date: date) -> Optional[float]:
    """Average daily absolute change over last `days`."""
    window_start = pd.Timestamp(ref_date - timedelta(days=days))
    window = grp[grp["date"] >= window_start].sort_values("date")
    if len(window) < 2:
        return None
    diffs = window[col].diff().dropna()
    return float(diffs.mean())


def _compute_acceleration(grp: pd.DataFrame, col: str, days: int, ref_date: date) -> Optional[float]:
    """Difference between velocity in last `days` vs prior `days`."""
    v_curr = _compute_velocity(grp, col, days, ref_date)
    prior_end = ref_date - timedelta(days=days)
    v_prior = _compute_velocity(grp, col, days, prior_end)
    if v_curr is None or v_prior is None:
        return None
    return v_curr - v_prior


def _compute_growth_consistency(grp: pd.DataFrame, col: str, days: int, ref_date: date) -> Optional[float]:
    """
    Returns a 0–1 score reflecting how consistently the metric grew.
    Defined as fraction of days where delta > 0.
    """
    window_start = pd.Timestamp(ref_date - timedelta(days=days))
    window = grp[grp["date"] >= window_start].sort_values("date")
    if len(window) < 2:
        return None
    diffs = window[col].diff().dropna()
    if len(diffs) == 0:
        return None
    return float((diffs > 0).sum() / len(diffs))


def _cross_platform_spikes(platform_listeners: dict, platform_listeners_7d_ago: dict) -> int:
    """Count platforms with >20% listener growth."""
    count = 0
    if not platform_listeners or not platform_listeners_7d_ago:
        return 0
    for platform, curr in platform_listeners.items():
        prev = platform_listeners_7d_ago.get(platform)
        if prev and float(prev) > 0 and curr is not None:
            if float(curr) / float(prev) - 1 > 0.20:
                count += 1
    return count


# ---------------------------------------------------------------------------
# Main feature computation
# ---------------------------------------------------------------------------

def compute_artist_features_for_date(conn, target_date: date) -> None:
    """
    Compute ArtistFeaturesDaily features for all artists for target_date.
    Idempotent: uses INSERT ... ON CONFLICT DO UPDATE.

    Args:
        conn: psycopg2 connection
        target_date: The date to compute features for
    """
    logger.info(f"Computing artist features for {target_date}")

    # --- Load data ---
    ads_df = _fetch_artist_daily_stats(conn, target_date)
    ugc_df = _fetch_ugc_metrics(conn, target_date)
    playlist_df = _fetch_playlist_adds(conn, target_date)
    saves_df = _fetch_track_platform_saves_streams(conn, target_date)
    chart_df = _fetch_chart_presence(conn, target_date)

    if ads_df.empty:
        logger.warning("No artist_daily_stats found for date window, skipping.")
        return

    # Normalize date column
    ads_df["date"] = pd.to_datetime(ads_df["date"])
    ads_df["totalListeners"] = pd.to_numeric(ads_df["totalListeners"], errors="coerce")
    ads_df["totalFollowers"] = pd.to_numeric(ads_df["totalFollowers"], errors="coerce")
    ads_df["airplayPlays"] = pd.to_numeric(ads_df["airplayPlays"], errors="coerce")

    artist_ids = ads_df["artistId"].unique()
    logger.info(f"Found {len(artist_ids)} artists to process")

    rows_to_upsert = []

    for artist_id in artist_ids:
        grp = ads_df[ads_df["artistId"] == artist_id].sort_values("date").copy()

        feat: dict = {"artistId": int(artist_id), "date": target_date}

        # --- Listener growth ---
        for days_label, col in [
            ("listenersGrowth7d", 7),
            ("listenersGrowth14d", 14),
            ("listenersGrowth30d", 30),
            ("listenersGrowth90d", 90),
        ]:
            feat[days_label] = _compute_growth_window(grp, "totalListeners", col, target_date)

        # --- Follower growth ---
        feat["followersGrowth7d"] = _compute_growth_window(grp, "totalFollowers", 7, target_date)
        feat["followersGrowth30d"] = _compute_growth_window(grp, "totalFollowers", 30, target_date)

        # --- Radio airplay growth (crawl4ai crawl_radio_spins.ts -> RadioAirplayFact -> airplayPlays) ---
        feat["airplayGrowth7d"] = _compute_growth_window(grp, "airplayPlays", 7, target_date)
        feat["airplayGrowth30d"] = _compute_growth_window(grp, "airplayPlays", 30, target_date)

        # --- Chart presence/momentum (billboard, applemusic, spotify, ... — platform-agnostic) ---
        if not chart_df.empty and "artistId" in chart_df.columns:
            chart_row = chart_df[chart_df["artistId"] == artist_id]
            if not chart_row.empty:
                presence = chart_row.iloc[0]["chart_presence_7d"]
                improvement = chart_row.iloc[0]["chart_rank_improvement_7d"]
                feat["chartPresence7d"] = int(presence) if pd.notna(presence) else None
                feat["chartRankImprovement7d"] = float(improvement) if pd.notna(improvement) else None
            else:
                feat["chartPresence7d"] = None
                feat["chartRankImprovement7d"] = None
        else:
            feat["chartPresence7d"] = None
            feat["chartRankImprovement7d"] = None

        # --- Velocity & Acceleration ---
        feat["listenersVelocity7d"] = _compute_velocity(grp, "totalListeners", 7, target_date)
        feat["listenersAcceleration7d"] = _compute_acceleration(grp, "totalListeners", 7, target_date)

        # --- Growth consistency ---
        feat["growthConsistency30d"] = _compute_growth_consistency(grp, "totalListeners", 30, target_date)

        # --- Cross-platform spikes ---
        today_row = grp[grp["date"] == pd.Timestamp(target_date)]
        week_ago_row = grp[grp["date"] == pd.Timestamp(target_date - timedelta(days=7))]
        if not today_row.empty and not week_ago_row.empty:
            pl_today = today_row.iloc[0].get("platformListeners") or {}
            pl_week = week_ago_row.iloc[0].get("platformListeners") or {}
            feat["crossPlatformSpikes7d"] = _cross_platform_spikes(pl_today, pl_week)
        else:
            feat["crossPlatformSpikes7d"] = None

        # --- TikTok features ---
        if not ugc_df.empty and "artistId" in ugc_df.columns:
            ugc_row = ugc_df[ugc_df["artistId"] == artist_id]
            if not ugc_row.empty:
                total_videos7d = ugc_row.iloc[0]["total_videos7d"] or 0
                feat["tiktokVideosPerDay7d"] = float(total_videos7d) / 7.0
                feat["tiktokViewsGrowth7d"] = ugc_row.iloc[0]["avg_views7d_growth"]
            else:
                feat["tiktokVideosPerDay7d"] = None
                feat["tiktokViewsGrowth7d"] = None
        else:
            feat["tiktokVideosPerDay7d"] = None
            feat["tiktokViewsGrowth7d"] = None

        # --- Streams per playlist add ---
        if not saves_df.empty and "artistId" in saves_df.columns:
            saves_row = saves_df[saves_df["artistId"] == artist_id]
            streams30d = float(saves_row.iloc[0]["total_streams30d"]) if not saves_row.empty else None
            saves30d = float(saves_row.iloc[0]["total_saves30d"]) if not saves_row.empty else None
            comments30d = float(saves_row.iloc[0]["total_comments30d"]) if not saves_row.empty else None
            video_views30d = float(saves_row.iloc[0]["total_video_views30d"]) if not saves_row.empty else None
        else:
            streams30d = saves30d = comments30d = video_views30d = None

        if not playlist_df.empty and "artistId" in playlist_df.columns:
            pl_row = playlist_df[playlist_df["artistId"] == artist_id]
            adds7d = float(pl_row.iloc[0]["playlist_adds7d"]) if not pl_row.empty else None
        else:
            adds7d = None

        # Streams per playlist add (7d): use 7d streams derived from velocity
        streams7d = feat.get("listenersVelocity7d")  # approximate
        if adds7d and adds7d > 0 and streams7d:
            feat["streamsPerPlaylistAdd7d"] = float(streams7d * 7) / adds7d
        else:
            feat["streamsPerPlaylistAdd7d"] = None

        # Saves per stream (30d)
        if saves30d is not None and streams30d and streams30d > 0:
            feat["savesPerStream30d"] = saves30d / streams30d
        else:
            feat["savesPerStream30d"] = None

        # TODO: igEngagementPerFollower30d — requires Instagram API integration
        feat["igEngagementPerFollower30d"] = None

        # Comments per view (30d)
        if comments30d is not None and video_views30d and video_views30d > 0:
            feat["commentsPerView30d"] = comments30d / video_views30d
        else:
            feat["commentsPerView30d"] = None

        rows_to_upsert.append(feat)

    # --- Upsert ---
    if not rows_to_upsert:
        logger.info("No rows to upsert.")
        return

    upsert_sql = """
        INSERT INTO artist_features_daily (
            "artistId", date,
            "listenersGrowth7d", "listenersGrowth14d", "listenersGrowth30d", "listenersGrowth90d",
            "followersGrowth7d", "followersGrowth30d",
            "airplayGrowth7d", "airplayGrowth30d",
            "chartPresence7d", "chartRankImprovement7d",
            "listenersVelocity7d", "listenersAcceleration7d",
            "tiktokVideosPerDay7d", "tiktokViewsGrowth7d",
            "crossPlatformSpikes7d",
            "streamsPerPlaylistAdd7d", "savesPerStream30d",
            "igEngagementPerFollower30d", "commentsPerView30d",
            "growthConsistency30d",
            "createdAt", "updatedAt"
        )
        VALUES (
            %(artistId)s, %(date)s,
            %(listenersGrowth7d)s, %(listenersGrowth14d)s, %(listenersGrowth30d)s, %(listenersGrowth90d)s,
            %(followersGrowth7d)s, %(followersGrowth30d)s,
            %(airplayGrowth7d)s, %(airplayGrowth30d)s,
            %(chartPresence7d)s, %(chartRankImprovement7d)s,
            %(listenersVelocity7d)s, %(listenersAcceleration7d)s,
            %(tiktokVideosPerDay7d)s, %(tiktokViewsGrowth7d)s,
            %(crossPlatformSpikes7d)s,
            %(streamsPerPlaylistAdd7d)s, %(savesPerStream30d)s,
            %(igEngagementPerFollower30d)s, %(commentsPerView30d)s,
            %(growthConsistency30d)s,
            NOW(), NOW()
        )
        ON CONFLICT ("artistId", date) DO UPDATE SET
            "listenersGrowth7d"          = EXCLUDED."listenersGrowth7d",
            "listenersGrowth14d"         = EXCLUDED."listenersGrowth14d",
            "listenersGrowth30d"         = EXCLUDED."listenersGrowth30d",
            "listenersGrowth90d"         = EXCLUDED."listenersGrowth90d",
            "followersGrowth7d"          = EXCLUDED."followersGrowth7d",
            "followersGrowth30d"         = EXCLUDED."followersGrowth30d",
            "airplayGrowth7d"            = EXCLUDED."airplayGrowth7d",
            "airplayGrowth30d"           = EXCLUDED."airplayGrowth30d",
            "chartPresence7d"            = EXCLUDED."chartPresence7d",
            "chartRankImprovement7d"     = EXCLUDED."chartRankImprovement7d",
            "listenersVelocity7d"        = EXCLUDED."listenersVelocity7d",
            "listenersAcceleration7d"    = EXCLUDED."listenersAcceleration7d",
            "tiktokVideosPerDay7d"       = EXCLUDED."tiktokVideosPerDay7d",
            "tiktokViewsGrowth7d"        = EXCLUDED."tiktokViewsGrowth7d",
            "crossPlatformSpikes7d"      = EXCLUDED."crossPlatformSpikes7d",
            "streamsPerPlaylistAdd7d"    = EXCLUDED."streamsPerPlaylistAdd7d",
            "savesPerStream30d"          = EXCLUDED."savesPerStream30d",
            "igEngagementPerFollower30d" = EXCLUDED."igEngagementPerFollower30d",
            "commentsPerView30d"         = EXCLUDED."commentsPerView30d",
            "growthConsistency30d"       = EXCLUDED."growthConsistency30d",
            "updatedAt"                  = NOW()
    """

    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, upsert_sql, rows_to_upsert, page_size=200)
    conn.commit()
    logger.info(f"Upserted {len(rows_to_upsert)} artist_features_daily rows for {target_date}")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Compute ArtistFeaturesDaily for a given date.")
    parser.add_argument(
        "--date",
        type=lambda s: date.fromisoformat(s),
        default=date.today(),
        help="Target date in YYYY-MM-DD format (default: today)",
    )
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        logger.error("DATABASE_URL env var not set.")
        sys.exit(1)

    conn = psycopg2.connect(database_url)
    try:
        compute_artist_features_for_date(conn, args.date)
    finally:
        conn.close()
