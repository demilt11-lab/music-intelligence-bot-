-- Enable Row-Level Security on every public-schema table.
--
-- The application connects as the postgres superuser via DATABASE_URL, which
-- bypasses RLS — all backend, ETL, and ML operations are unaffected.
-- Supabase anon/authenticated roles receive no policies and are locked out.

-- ── Multi-tenant / auth tables ────────────────────────────────────────────────
ALTER TABLE "Tenant"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantUser"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Plan"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CatalogTrack"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RequestLog"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback        ENABLE ROW LEVEL SECURITY;

-- ── Core catalog entities ──────────────────────────────────────────────────────
ALTER TABLE tracks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE artists         ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums          ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE curators        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE countries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE songwriters     ENABLE ROW LEVEL SECURITY;

-- ── Junction / link tables ────────────────────────────────────────────────────
ALTER TABLE track_artists                ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_albums                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_curator_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE curator_playlists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_ids                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_membership_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE songwriter_tracks            ENABLE ROW LEVEL SECURITY;

-- ── Tags / moods / activities ─────────────────────────────────────────────────
ALTER TABLE tags          ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE moods         ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities    ENABLE ROW LEVEL SECURITY;

-- ── Flags ─────────────────────────────────────────────────────────────────────
ALTER TABLE curator_flags  ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_flags ENABLE ROW LEVEL SECURITY;

-- ── Platform statistics ───────────────────────────────────────────────────────
ALTER TABLE track_platform_stats_daily      ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_statistics_latest         ENABLE ROW LEVEL SECURITY;
ALTER TABLE spotify_playlist_metrics_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_playlist_metrics_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_metrics_latest         ENABLE ROW LEVEL SECURITY;
ALTER TABLE curator_metrics                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_video_metrics_daily      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ugc_track_metrics               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ugc_genre_metrics               ENABLE ROW LEVEL SECURITY;
ALTER TABLE genre_playlist_metrics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE genre_airplay_metrics           ENABLE ROW LEVEL SECURITY;

-- ── Radio ─────────────────────────────────────────────────────────────────────
ALTER TABLE radio_airplay_facts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Radio"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RadioSpin"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE radio_country_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE radio_city_markets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE radio_stations        ENABLE ROW LEVEL SECURITY;

-- ── Chart snapshots ───────────────────────────────────────────────────────────
ALTER TABLE chart_snapshots                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_rows                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_rank_stats                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_video_chart_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_video_chart_rows            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_video_chart_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_user_chart_snapshots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_user_chart_rows             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_user_chart_rank_stats       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_typed_track_chart_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tiktok_typed_track_chart_rows      ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_shorts_chart_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_shorts_chart_rows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE airplay_track_chart_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE airplay_track_chart_rows           ENABLE ROW LEVEL SECURITY;
ALTER TABLE airplay_track_chart_rank_stats     ENABLE ROW LEVEL SECURITY;

-- ── Audio features / clusters ─────────────────────────────────────────────────
ALTER TABLE track_audio_features   ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_version_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_audio_clusters   ENABLE ROW LEVEL SECURITY;

-- ── Luminate ──────────────────────────────────────────────────────────────────
ALTER TABLE luminate_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminate_sales   ENABLE ROW LEVEL SECURITY;
ALTER TABLE luminate_airplay ENABLE ROW LEVEL SECURITY;

-- ── Talent scout ──────────────────────────────────────────────────────────────
ALTER TABLE talent_scout_scores ENABLE ROW LEVEL SECURITY;

-- ── Artist stats / trajectory ─────────────────────────────────────────────────
ALTER TABLE "ArtistDailyStats"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ArtistTrajectorySnapshot"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_spotify_release_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_features_daily        ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_scores_daily          ENABLE ROW LEVEL SECURITY;

-- ── ML labels, predictions & model store ─────────────────────────────────────
ALTER TABLE track_trend_labels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_trend_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_outcomes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_accuracy_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_examples       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ml_models               ENABLE ROW LEVEL SECURITY;

-- ── Writers / producers ───────────────────────────────────────────────────────
ALTER TABLE writer_producer_rising_scores ENABLE ROW LEVEL SECURITY;

-- ── Operations ────────────────────────────────────────────────────────────────
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
