-- Wire crawl4ai radio-spins and chart data into the A&R scoring feature set.
-- airplayGrowth* is derived from ArtistDailyStats.airplayPlays (radio_airplay_facts
-- rollup); chartPresence7d/chartRankImprovement7d are derived from chart_rows/
-- chart_snapshots across all platforms (billboard, applemusic, spotify, etc).
ALTER TABLE "artist_features_daily" ADD COLUMN "airplayGrowth7d" DOUBLE PRECISION;
ALTER TABLE "artist_features_daily" ADD COLUMN "airplayGrowth30d" DOUBLE PRECISION;
ALTER TABLE "artist_features_daily" ADD COLUMN "chartPresence7d" INTEGER;
ALTER TABLE "artist_features_daily" ADD COLUMN "chartRankImprovement7d" DOUBLE PRECISION;
