-- Performance indexes for feature_store.py hot-path queries.
-- NOTE: CONCURRENTLY removed — Prisma wraps migrations in a transaction and
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- IF NOT EXISTS makes this idempotent (safe to re-run / re-deploy).

-- Speeds up streaming velocity aggregations in _fetch_stream_velocities()
CREATE INDEX IF NOT EXISTS idx_tpsd_track_platform_date
  ON track_platform_stats_daily (track_id, platform, date DESC);

-- Speeds up TikTok UGC metric lookups in _fetch_ugc_metrics()
CREATE INDEX IF NOT EXISTS idx_ugc_track_date
  ON ugc_track_metrics (track_id, date DESC);

-- Speeds up playlist adds counts in _fetch_playlist_metrics()
CREATE INDEX IF NOT EXISTS idx_pme_track_added_at
  ON playlist_membership_events (track_id, added_at DESC);

-- Speeds up radio spins aggregations in _fetch_radio_metrics()
CREATE INDEX IF NOT EXISTS idx_radio_track_date
  ON radio_airplay_facts (track_id, date DESC);
