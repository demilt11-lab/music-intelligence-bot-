-- Performance indexes for feature_store.py hot-path queries.
-- All indexes use CONCURRENTLY so the table stays readable/writable
-- while the index builds — safe to run on a live production database.
-- IF NOT EXISTS makes this idempotent (safe to re-run).

-- Speeds up the streaming velocity CTE in _fetch_stream_velocities():
-- aggregates 7d/30d Spotify stream counts filtered by track_id + platform + date.
-- Without this index the query does a full table scan on every training job
-- and every batch inference call.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tpsd_track_platform_date
  ON track_platform_stats_daily (track_id, platform, date DESC);

-- Speeds up _fetch_ugc_metrics() which filters ugc_track_metrics by
-- track_id and the MAX(date) subquery.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ugc_track_date
  ON ugc_track_metrics (track_id, date DESC);

-- Speeds up _fetch_playlist_metrics() adds_7d / adds_30d counts and the
-- editorial_adds_7d join inside the combined CTE query.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pme_track_added_at
  ON playlist_membership_events (track_id, added_at DESC);

-- Speeds up _fetch_radio_metrics() spins_7d / spins_30d aggregation and
-- the station_id COUNT DISTINCT used for market_count.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_radio_track_date
  ON radio_airplay_facts (track_id, date DESC);
