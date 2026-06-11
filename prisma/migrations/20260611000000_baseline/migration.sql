-- CreateEnum
CREATE TYPE "TenantRole" AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "TenantEnvironment" AS ENUM ('SANDBOX', 'PROD');

-- CreateTable
CREATE TABLE "tracks" (
    "id" SERIAL NOT NULL,
    "isrc" TEXT,
    "title" TEXT NOT NULL,
    "durationMs" INTEGER,
    "explicit" BOOLEAN NOT NULL DEFAULT false,
    "releaseDate" TIMESTAMP(3),
    "previewUrl" TEXT,
    "coverUrl" TEXT,
    "popularity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artists" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "imageUrl" TEXT,
    "country" TEXT,
    "bio" TEXT,
    "popularity" INTEGER,
    "followersCount" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "albums" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "albumType" TEXT,
    "releaseDate" TIMESTAMP(3),
    "coverUrl" TEXT,
    "totalTracks" INTEGER,
    "label" TEXT,
    "popularity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlists" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "platform" TEXT NOT NULL,
    "externalId" TEXT,
    "isAlgorithmic" BOOLEAN NOT NULL DEFAULT false,
    "isOfficial" BOOLEAN NOT NULL DEFAULT false,
    "followerCount" BIGINT,
    "trackCount" INTEGER,
    "countryCode" TEXT,
    "playlistType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_tracks" (
    "id" SERIAL NOT NULL,
    "playlistId" INTEGER NOT NULL,
    "trackId" INTEGER NOT NULL,
    "position" INTEGER,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curators" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "platform" TEXT NOT NULL,
    "externalId" TEXT,
    "imageUrl" TEXT,
    "description" TEXT,
    "followerCount" BIGINT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "countryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "callSign" TEXT,
    "format" TEXT,
    "countryCode" TEXT,
    "cityId" INTEGER,
    "frequency" TEXT,
    "streamUrl" TEXT,
    "websiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "stateCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "subRegion" TEXT,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "environment" "TenantEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "planId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "notes" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_subscriptions" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "email" TEXT,
    "webhookUrl" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digest_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER,
    "metric" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "operator" TEXT NOT NULL DEFAULT 'gt',
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantUser" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "role" "TenantRole" NOT NULL,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" SERIAL NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "rowsWritten" INTEGER,
    "error" TEXT,
    "meta" JSONB,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "keyHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogTrack" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "clientTrackId" TEXT NOT NULL,
    "isrc" TEXT,
    "name" TEXT,
    "artistName" TEXT,
    "spotifyTrackId" TEXT,
    "tiktokSoundId" TEXT,
    "youtubeVideoId" TEXT,
    "canonicalTrackId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestLog" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_artists" (
    "trackId" INTEGER NOT NULL,
    "artistId" INTEGER NOT NULL,
    "role" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "track_artists_pkey" PRIMARY KEY ("trackId","artistId")
);

-- CreateTable
CREATE TABLE "track_albums" (
    "trackId" INTEGER NOT NULL,
    "albumId" INTEGER NOT NULL,
    "trackNumber" INTEGER,
    "discNumber" INTEGER,

    CONSTRAINT "track_albums_pkey" PRIMARY KEY ("trackId","albumId")
);

-- CreateTable
CREATE TABLE "playlist_curator_links" (
    "playlistId" INTEGER NOT NULL,
    "curatorId" INTEGER NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_curator_links_pkey" PRIMARY KEY ("playlistId","curatorId")
);

-- CreateTable
CREATE TABLE "curator_playlists" (
    "curatorId" INTEGER NOT NULL,
    "playlistId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curator_playlists_pkey" PRIMARY KEY ("curatorId","playlistId")
);

-- CreateTable
CREATE TABLE "external_ids" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,

    CONSTRAINT "external_ids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_tags" (
    "playlistId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "playlist_tags_pkey" PRIMARY KEY ("playlistId","tagId")
);

-- CreateTable
CREATE TABLE "track_tags" (
    "trackId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "track_tags_pkey" PRIMARY KEY ("trackId","tagId")
);

-- CreateTable
CREATE TABLE "moods" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "moods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curator_flags" (
    "id" SERIAL NOT NULL,
    "curatorId" INTEGER NOT NULL,
    "flagType" TEXT NOT NULL,
    "flagValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curator_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_flags" (
    "id" SERIAL NOT NULL,
    "playlistId" INTEGER NOT NULL,
    "flagType" TEXT NOT NULL,
    "flagValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_platform_stats_daily" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "streams" BIGINT,
    "downloads" BIGINT,
    "saves" BIGINT,
    "skips" BIGINT,
    "playlistAdds" BIGINT,
    "radioPlays" BIGINT,
    "videoViews" BIGINT,
    "likes" BIGINT,
    "shares" BIGINT,
    "comments" BIGINT,

    CONSTRAINT "track_platform_stats_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_statistics_latest" (
    "trackId" INTEGER NOT NULL,
    "totalStreams" BIGINT,
    "totalDownloads" BIGINT,
    "totalPlaylists" INTEGER,
    "totalCountries" INTEGER,
    "spotifyMonthlyListeners" BIGINT,
    "spotifyPopularity" INTEGER,
    "appleMusicPlays" BIGINT,
    "youtubeViews" BIGINT,
    "tiktokCreations" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "track_statistics_latest_pkey" PRIMARY KEY ("trackId")
);

-- CreateTable
CREATE TABLE "spotify_playlist_metrics_latest" (
    "playlistId" INTEGER NOT NULL,
    "followers" BIGINT,
    "monthlyListeners" BIGINT,
    "trackCount" INTEGER,
    "averagePopularity" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spotify_playlist_metrics_latest_pkey" PRIMARY KEY ("playlistId")
);

-- CreateTable
CREATE TABLE "youtube_playlist_metrics_latest" (
    "playlistId" INTEGER NOT NULL,
    "subscribers" BIGINT,
    "videoCount" INTEGER,
    "totalViews" BIGINT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_playlist_metrics_latest_pkey" PRIMARY KEY ("playlistId")
);

-- CreateTable
CREATE TABLE "playlist_metrics_latest" (
    "playlistId" INTEGER NOT NULL,
    "followerCount" BIGINT,
    "trackCount" INTEGER,
    "platform" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playlist_metrics_latest_pkey" PRIMARY KEY ("playlistId")
);

-- CreateTable
CREATE TABLE "curator_metrics" (
    "id" SERIAL NOT NULL,
    "curatorId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "followerCount" BIGINT,
    "playlistCount" INTEGER,
    "totalReach" BIGINT,
    "engagementRate" DOUBLE PRECISION,

    CONSTRAINT "curator_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_video_metrics_daily" (
    "id" SERIAL NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" BIGINT,
    "likes" BIGINT,
    "comments" BIGINT,
    "shares" BIGINT,
    "saves" BIGINT,
    "playTime" BIGINT,

    CONSTRAINT "tiktok_video_metrics_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ugc_track_metrics" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "code2" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "videos7d" INTEGER NOT NULL,
    "videos7dGrowth" DOUBLE PRECISION NOT NULL,
    "views7d" BIGINT NOT NULL,
    "views7dGrowth" DOUBLE PRECISION NOT NULL,
    "rankDelta7d" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ugc_track_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ugc_genre_metrics" (
    "id" SERIAL NOT NULL,
    "genre" TEXT NOT NULL,
    "code2" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "videos7d" INTEGER NOT NULL,
    "videos7dGrowth" DOUBLE PRECISION NOT NULL,
    "views7d" BIGINT NOT NULL,
    "views7dGrowth" DOUBLE PRECISION NOT NULL,
    "leadCountry" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ugc_genre_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genre_playlist_metrics" (
    "id" SERIAL NOT NULL,
    "genre" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "playlistType" TEXT NOT NULL,
    "streams7d" BIGINT NOT NULL,
    "streams7dGrowth" DOUBLE PRECISION NOT NULL,
    "adds7d" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genre_playlist_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "genre_airplay_metrics" (
    "id" SERIAL NOT NULL,
    "genre" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "formatId" TEXT,
    "spins7d" INTEGER NOT NULL,
    "spins7dGrowth" DOUBLE PRECISION NOT NULL,
    "audience7d" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genre_airplay_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_airplay_facts" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "stationId" INTEGER NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER,
    "countryCode" TEXT,
    "cityId" INTEGER,

    CONSTRAINT "radio_airplay_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Radio" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT,
    "market" TEXT,
    "genre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Radio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadioSpin" (
    "id" TEXT NOT NULL,
    "radioId" TEXT NOT NULL,
    "songUuid" TEXT NOT NULL,
    "airedAtUtc" TIMESTAMP(3) NOT NULL,
    "countryCode" TEXT,
    "payload" JSONB,

    CONSTRAINT "RadioSpin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_snapshots" (
    "id" SERIAL NOT NULL,
    "chartName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "countryCode" TEXT,
    "genre" TEXT,
    "snapshotDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_rows" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "trackId" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "previousRank" INTEGER,
    "peakRank" INTEGER,
    "weeksOnChart" INTEGER,
    "streamsToday" BIGINT,

    CONSTRAINT "chart_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_rank_stats" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "trackExternalId" TEXT NOT NULL,
    "peakRank" INTEGER,
    "currentRank" INTEGER,
    "weeksOnChart" INTEGER,

    CONSTRAINT "chart_rank_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_video_chart_snapshots" (
    "id" SERIAL NOT NULL,
    "chartName" TEXT NOT NULL,
    "countryCode" TEXT,
    "snapshotDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiktok_video_chart_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_video_chart_rows" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "videoId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "previousRank" INTEGER,
    "views" BIGINT,
    "likes" BIGINT,
    "shares" BIGINT,

    CONSTRAINT "tiktok_video_chart_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_video_chart_history" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "videoId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rank" INTEGER,

    CONSTRAINT "tiktok_video_chart_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_user_chart_snapshots" (
    "id" SERIAL NOT NULL,
    "chartName" TEXT NOT NULL,
    "countryCode" TEXT,
    "snapshotDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiktok_user_chart_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_user_chart_rows" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "artistId" INTEGER,
    "tiktokUserId" TEXT,
    "rank" INTEGER NOT NULL,
    "previousRank" INTEGER,
    "followers" BIGINT,
    "likes" BIGINT,

    CONSTRAINT "tiktok_user_chart_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_user_chart_rank_stats" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "tiktokUserId" TEXT NOT NULL,
    "peakRank" INTEGER,
    "currentRank" INTEGER,
    "weeksOnChart" INTEGER,

    CONSTRAINT "tiktok_user_chart_rank_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_typed_track_chart_snapshots" (
    "id" SERIAL NOT NULL,
    "chartName" TEXT NOT NULL,
    "chartType" TEXT NOT NULL,
    "countryCode" TEXT,
    "snapshotDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiktok_typed_track_chart_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiktok_typed_track_chart_rows" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "trackId" INTEGER,
    "tiktokSongId" TEXT,
    "rank" INTEGER NOT NULL,
    "previousRank" INTEGER,
    "creations" BIGINT,
    "views" BIGINT,

    CONSTRAINT "tiktok_typed_track_chart_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_shorts_chart_snapshots" (
    "id" SERIAL NOT NULL,
    "chartName" TEXT NOT NULL,
    "countryCode" TEXT,
    "snapshotDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "youtube_shorts_chart_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_shorts_chart_rows" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "videoId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "previousRank" INTEGER,
    "views" BIGINT,
    "likes" BIGINT,
    "comments" BIGINT,

    CONSTRAINT "youtube_shorts_chart_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airplay_track_chart_snapshots" (
    "id" SERIAL NOT NULL,
    "chartName" TEXT NOT NULL,
    "countryCode" TEXT,
    "format" TEXT,
    "snapshotDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "airplay_track_chart_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airplay_track_chart_rows" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "trackId" INTEGER,
    "rank" INTEGER NOT NULL,
    "previousRank" INTEGER,
    "spins" INTEGER,
    "audience" BIGINT,

    CONSTRAINT "airplay_track_chart_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airplay_track_chart_rank_stats" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "trackId" INTEGER,
    "peakRank" INTEGER,
    "currentRank" INTEGER,
    "weeksOnChart" INTEGER,
    "totalSpins" INTEGER,

    CONSTRAINT "airplay_track_chart_rank_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_country_markets" (
    "id" SERIAL NOT NULL,
    "countryCode" TEXT NOT NULL,
    "marketName" TEXT NOT NULL,
    "format" TEXT,
    "stationCount" INTEGER,

    CONSTRAINT "radio_country_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_city_markets" (
    "id" SERIAL NOT NULL,
    "cityId" INTEGER NOT NULL,
    "marketName" TEXT NOT NULL,
    "format" TEXT,
    "rank" INTEGER,

    CONSTRAINT "radio_city_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radio_stations" (
    "id" SERIAL NOT NULL,
    "stationId" INTEGER NOT NULL,
    "callSign" TEXT,
    "format" TEXT,
    "marketName" TEXT,
    "countryCode" TEXT,
    "cityName" TEXT,
    "weeklyAudience" BIGINT,

    CONSTRAINT "radio_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_membership_events" (
    "id" SERIAL NOT NULL,
    "playlistId" INTEGER NOT NULL,
    "trackId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "position" INTEGER,
    "eventDate" DATE NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_membership_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_audio_features" (
    "trackId" INTEGER NOT NULL,
    "danceability" DOUBLE PRECISION,
    "energy" DOUBLE PRECISION,
    "loudness" DOUBLE PRECISION,
    "speechiness" DOUBLE PRECISION,
    "acousticness" DOUBLE PRECISION,
    "instrumentalness" DOUBLE PRECISION,
    "liveness" DOUBLE PRECISION,
    "valence" DOUBLE PRECISION,
    "tempo" DOUBLE PRECISION,
    "timeSignature" INTEGER,
    "key" INTEGER,
    "mode" INTEGER,

    CONSTRAINT "track_audio_features_pkey" PRIMARY KEY ("trackId")
);

-- CreateTable
CREATE TABLE "track_version_clusters" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "clusterId" TEXT NOT NULL,
    "versionType" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "track_version_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "luminate_streams" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "locationId" TEXT,
    "marketId" INTEGER,
    "contentType" TEXT,
    "commercialModel" TEXT,
    "serviceType" TEXT,
    "streams" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "luminate_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "luminate_sales" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "locationId" TEXT,
    "marketId" INTEGER,
    "distributionChannel" TEXT,
    "purchaseMethod" TEXT,
    "storeStrata" TEXT,
    "productFormat" TEXT,
    "releaseType" TEXT,
    "units" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "luminate_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "luminate_airplay" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "locationId" TEXT,
    "marketId" INTEGER,
    "formatId" TEXT,
    "audience" TEXT,
    "spins" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "luminate_airplay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_scout_scores" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "code2" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "viralScore" DOUBLE PRECISION NOT NULL,
    "rightsComplexityScore" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_scout_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistDailyStats" (
    "id" BIGSERIAL NOT NULL,
    "artistId" BIGINT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalStreams" BIGINT NOT NULL,
    "totalListeners" BIGINT,
    "totalFollowers" BIGINT,
    "platformStreams" JSONB,
    "platformListeners" JSONB,
    "platformFollowers" JSONB,
    "playlistCount" INTEGER,
    "editorialPlaylistCount" INTEGER,
    "indiePlaylistCount" INTEGER,
    "playlistReach" BIGINT,
    "chartCountries" JSONB,
    "airplayPlays" BIGINT,
    "airplayMarkets" JSONB,
    "genres" TEXT[],
    "primaryCode2" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistDailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtistTrajectorySnapshot" (
    "id" SERIAL NOT NULL,
    "artistId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "streams7d" BIGINT NOT NULL,
    "streams28d" BIGINT NOT NULL,
    "streams90d" BIGINT NOT NULL,
    "streams7dDelta" DOUBLE PRECISION NOT NULL,
    "streams28dDelta" DOUBLE PRECISION NOT NULL,
    "streams90dDelta" DOUBLE PRECISION NOT NULL,
    "listeners28d" BIGINT,
    "listenersDelta28d" DOUBLE PRECISION,
    "followersDelta28d" DOUBLE PRECISION,
    "playlistsDelta28d" DOUBLE PRECISION,
    "editorialAdds28d" INTEGER,
    "removals28d" INTEGER,
    "tiktokVelocityScore" DOUBLE PRECISION,
    "chartVelocityScore" DOUBLE PRECISION,
    "airplayVelocityScore" DOUBLE PRECISION,
    "primaryGenre" TEXT,
    "primaryCode2" TEXT,
    "breakoutCities" JSONB,
    "status" TEXT NOT NULL,
    "statusScore" DOUBLE PRECISION NOT NULL,
    "breakProbability" DOUBLE PRECISION,
    "spotifyBreakProb" DOUBLE PRECISION,
    "spotifyModelName" TEXT,
    "spotifyModelVersion" TEXT,
    "maxTrackProbViral" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistTrajectorySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_spotify_release_stats" (
    "id" SERIAL NOT NULL,
    "artistId" INTEGER NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "numTracks" INTEGER NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "totalStreams" BIGINT NOT NULL,
    "avgStreams" DOUBLE PRECISION NOT NULL,
    "medianStreams" DOUBLE PRECISION NOT NULL,
    "maxStreams" BIGINT NOT NULL,
    "minStreams" BIGINT NOT NULL,
    "stdStreams" DOUBLE PRECISION NOT NULL,
    "numAbove100k" INTEGER NOT NULL,
    "numAbove1M" INTEGER NOT NULL,
    "latestTrackId" INTEGER,
    "latestReleaseDate" TIMESTAMP(3),
    "latestStreams28d" BIGINT,
    "latestTotalStreams" BIGINT,
    "avgDaysBetweenReleases" DOUBLE PRECISION,
    "popularWithin6m" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artist_spotify_release_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_trend_labels" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "genre" TEXT,
    "code2" TEXT,
    "label" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "track_trend_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_trend_predictions" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "genre" TEXT,
    "code2" TEXT,
    "label" TEXT NOT NULL,
    "probViral" DOUBLE PRECISION NOT NULL,
    "probTrending" DOUBLE PRECISION NOT NULL,
    "probPopular" DOUBLE PRECISION NOT NULL,
    "probNone" DOUBLE PRECISION NOT NULL,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "predictedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_trend_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prediction_outcomes" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER,
    "artistId" INTEGER,
    "predictionType" TEXT NOT NULL,
    "predictedValue" TEXT NOT NULL,
    "predictedAt" TIMESTAMP(3) NOT NULL,
    "evaluatedAt" TIMESTAMP(3),
    "actualValue" TEXT,
    "wasCorrect" BOOLEAN,
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prediction_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_accuracy_reports" (
    "id" SERIAL NOT NULL,
    "modelName" TEXT NOT NULL,
    "evaluationDate" TIMESTAMP(3) NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "totalPredictions" INTEGER NOT NULL,
    "correctPredictions" INTEGER NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "precision" DOUBLE PRECISION,
    "recall" DOUBLE PRECISION,
    "f1Score" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_accuracy_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_audio_clusters" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER NOT NULL,
    "clusterId" INTEGER NOT NULL,
    "isHotCluster" BOOLEAN NOT NULL DEFAULT false,
    "clusterViralMean" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_audio_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_log" (
    "id" SERIAL NOT NULL,
    "trackId" INTEGER,
    "artistId" INTEGER,
    "metric" TEXT NOT NULL,
    "zScore" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "baselineMean" DOUBLE PRECISION NOT NULL,
    "baselineStd" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "anomaly_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_features_daily" (
    "id" SERIAL NOT NULL,
    "artistId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "listenersGrowth7d" DOUBLE PRECISION,
    "listenersGrowth14d" DOUBLE PRECISION,
    "listenersGrowth30d" DOUBLE PRECISION,
    "listenersGrowth90d" DOUBLE PRECISION,
    "followersGrowth7d" DOUBLE PRECISION,
    "followersGrowth30d" DOUBLE PRECISION,
    "listenersVelocity7d" DOUBLE PRECISION,
    "listenersAcceleration7d" DOUBLE PRECISION,
    "tiktokVideosPerDay7d" DOUBLE PRECISION,
    "tiktokViewsGrowth7d" DOUBLE PRECISION,
    "crossPlatformSpikes7d" INTEGER,
    "streamsPerPlaylistAdd7d" DOUBLE PRECISION,
    "savesPerStream30d" DOUBLE PRECISION,
    "igEngagementPerFollower30d" DOUBLE PRECISION,
    "commentsPerView30d" DOUBLE PRECISION,
    "growthConsistency30d" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artist_features_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_scores_daily" (
    "id" SERIAL NOT NULL,
    "artistId" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "heatScore" DOUBLE PRECISION,
    "stabilityScore" DOUBLE PRECISION,
    "platformBalanceScore" DOUBLE PRECISION,
    "breakoutProb30d" DOUBLE PRECISION,
    "heatScoreRaw" DOUBLE PRECISION,
    "stabilityScoreRaw" DOUBLE PRECISION,
    "modelVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artist_scores_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_examples" (
    "id" SERIAL NOT NULL,
    "artistId" INTEGER NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "breakoutLabel" INTEGER NOT NULL,
    "listenersGrowth7d" DOUBLE PRECISION,
    "listenersGrowth30d" DOUBLE PRECISION,
    "listenersGrowth90d" DOUBLE PRECISION,
    "listenersVelocity7d" DOUBLE PRECISION,
    "listenersAcceleration7d" DOUBLE PRECISION,
    "tiktokVideosPerDay7d" DOUBLE PRECISION,
    "tiktokViewsGrowth7d" DOUBLE PRECISION,
    "crossPlatformSpikes7d" INTEGER,
    "streamsPerPlaylistAdd7d" DOUBLE PRECISION,
    "savesPerStream30d" DOUBLE PRECISION,
    "igEngagementPerFollower30d" DOUBLE PRECISION,
    "growthConsistency30d" DOUBLE PRECISION,
    "baselineMonthlyListeners" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tracks_isrc_key" ON "tracks"("isrc");

-- CreateIndex
CREATE UNIQUE INDEX "artists_slug_key" ON "artists"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_tracks_playlistId_trackId_key" ON "playlist_tracks"("playlistId", "trackId");

-- CreateIndex
CREATE UNIQUE INDEX "curators_slug_key" ON "curators"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "stations_callSign_key" ON "stations"("callSign");

-- CreateIndex
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_tenantId_entityType_entityId_key" ON "watchlist_items"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "TenantUser_email_idx" ON "TenantUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TenantUser_tenantId_email_key" ON "TenantUser"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "job_runs_jobName_startedAt_idx" ON "job_runs"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "job_runs_status_startedAt_idx" ON "job_runs"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogTrack_tenantId_clientTrackId_key" ON "CatalogTrack"("tenantId", "clientTrackId");

-- CreateIndex
CREATE UNIQUE INDEX "external_ids_entityType_entityId_platform_key" ON "external_ids"("entityType", "entityId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "moods_name_key" ON "moods"("name");

-- CreateIndex
CREATE UNIQUE INDEX "activities_name_key" ON "activities"("name");

-- CreateIndex
CREATE UNIQUE INDEX "track_platform_stats_daily_trackId_platform_date_key" ON "track_platform_stats_daily"("trackId", "platform", "date");

-- CreateIndex
CREATE UNIQUE INDEX "curator_metrics_curatorId_date_key" ON "curator_metrics"("curatorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_video_metrics_daily_videoId_date_key" ON "tiktok_video_metrics_daily"("videoId", "date");

-- CreateIndex
CREATE INDEX "ugc_track_metrics_date_views7d_idx" ON "ugc_track_metrics"("date", "views7d");

-- CreateIndex
CREATE UNIQUE INDEX "ugc_track_metrics_trackId_code2_date_key" ON "ugc_track_metrics"("trackId", "code2", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ugc_genre_metrics_genre_code2_date_key" ON "ugc_genre_metrics"("genre", "code2", "date");

-- CreateIndex
CREATE UNIQUE INDEX "genre_playlist_metrics_genre_country_date_playlistType_key" ON "genre_playlist_metrics"("genre", "country", "date", "playlistType");

-- CreateIndex
CREATE UNIQUE INDEX "genre_airplay_metrics_genre_country_date_formatId_key" ON "genre_airplay_metrics"("genre", "country", "date", "formatId");

-- CreateIndex
CREATE INDEX "radio_airplay_facts_trackId_playedAt_idx" ON "radio_airplay_facts"("trackId", "playedAt");

-- CreateIndex
CREATE INDEX "radio_airplay_facts_stationId_playedAt_idx" ON "radio_airplay_facts"("stationId", "playedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Radio_slug_key" ON "Radio"("slug");

-- CreateIndex
CREATE INDEX "RadioSpin_radioId_airedAtUtc_idx" ON "RadioSpin"("radioId", "airedAtUtc");

-- CreateIndex
CREATE INDEX "RadioSpin_songUuid_airedAtUtc_idx" ON "RadioSpin"("songUuid", "airedAtUtc");

-- CreateIndex
CREATE UNIQUE INDEX "chart_snapshots_chartName_platform_countryCode_snapshotDate_key" ON "chart_snapshots"("chartName", "platform", "countryCode", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "chart_rows_snapshotId_rank_key" ON "chart_rows"("snapshotId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_video_chart_snapshots_chartName_countryCode_snapshot_key" ON "tiktok_video_chart_snapshots"("chartName", "countryCode", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_video_chart_rows_snapshotId_rank_key" ON "tiktok_video_chart_rows"("snapshotId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_user_chart_snapshots_chartName_countryCode_snapshotD_key" ON "tiktok_user_chart_snapshots"("chartName", "countryCode", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_user_chart_rows_snapshotId_rank_key" ON "tiktok_user_chart_rows"("snapshotId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_typed_track_chart_snapshots_chartName_chartType_coun_key" ON "tiktok_typed_track_chart_snapshots"("chartName", "chartType", "countryCode", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "tiktok_typed_track_chart_rows_snapshotId_rank_key" ON "tiktok_typed_track_chart_rows"("snapshotId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_shorts_chart_snapshots_chartName_countryCode_snapsh_key" ON "youtube_shorts_chart_snapshots"("chartName", "countryCode", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_shorts_chart_rows_snapshotId_rank_key" ON "youtube_shorts_chart_rows"("snapshotId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "airplay_track_chart_snapshots_chartName_countryCode_format__key" ON "airplay_track_chart_snapshots"("chartName", "countryCode", "format", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "airplay_track_chart_rows_snapshotId_rank_key" ON "airplay_track_chart_rows"("snapshotId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "radio_country_markets_countryCode_marketName_key" ON "radio_country_markets"("countryCode", "marketName");

-- CreateIndex
CREATE UNIQUE INDEX "radio_city_markets_cityId_marketName_key" ON "radio_city_markets"("cityId", "marketName");

-- CreateIndex
CREATE INDEX "playlist_membership_events_playlistId_eventDate_idx" ON "playlist_membership_events"("playlistId", "eventDate");

-- CreateIndex
CREATE INDEX "playlist_membership_events_trackId_eventDate_idx" ON "playlist_membership_events"("trackId", "eventDate");

-- CreateIndex
CREATE INDEX "playlist_membership_events_trackId_addedAt_idx" ON "playlist_membership_events"("trackId", "addedAt");

-- CreateIndex
CREATE UNIQUE INDEX "track_version_clusters_trackId_clusterId_key" ON "track_version_clusters"("trackId", "clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "luminate_streams_unique_key" ON "luminate_streams"("entityType", "entityId", "date", "locationId", "marketId", "contentType", "commercialModel", "serviceType");

-- CreateIndex
CREATE UNIQUE INDEX "luminate_sales_unique_key" ON "luminate_sales"("entityType", "entityId", "date", "locationId", "marketId", "distributionChannel", "purchaseMethod", "storeStrata", "productFormat", "releaseType");

-- CreateIndex
CREATE UNIQUE INDEX "luminate_airplay_unique_key" ON "luminate_airplay"("entityType", "entityId", "date", "locationId", "marketId", "formatId");

-- CreateIndex
CREATE INDEX "talent_scout_scores_date_viralScore_idx" ON "talent_scout_scores"("date", "viralScore");

-- CreateIndex
CREATE UNIQUE INDEX "talent_scout_scores_trackId_code2_date_key" ON "talent_scout_scores"("trackId", "code2", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistDailyStats_artistId_date_key" ON "ArtistDailyStats"("artistId", "date");

-- CreateIndex
CREATE INDEX "ArtistTrajectorySnapshot_status_idx" ON "ArtistTrajectorySnapshot"("status");

-- CreateIndex
CREATE INDEX "ArtistTrajectorySnapshot_primaryGenre_idx" ON "ArtistTrajectorySnapshot"("primaryGenre");

-- CreateIndex
CREATE INDEX "ArtistTrajectorySnapshot_primaryCode2_idx" ON "ArtistTrajectorySnapshot"("primaryCode2");

-- CreateIndex
CREATE INDEX "ArtistTrajectorySnapshot_date_idx" ON "ArtistTrajectorySnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistTrajectorySnapshot_artistId_date_key" ON "ArtistTrajectorySnapshot"("artistId", "date");

-- CreateIndex
CREATE INDEX "artist_spotify_release_stats_artistId_snapshotDate_idx" ON "artist_spotify_release_stats"("artistId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "artist_spotify_release_stats_artistId_snapshotDate_key" ON "artist_spotify_release_stats"("artistId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "track_trend_labels_trackId_genre_code2_key" ON "track_trend_labels"("trackId", "genre", "code2");

-- CreateIndex
CREATE UNIQUE INDEX "track_trend_predictions_trackId_genre_code2_modelName_model_key" ON "track_trend_predictions"("trackId", "genre", "code2", "modelName", "modelVersion");

-- CreateIndex
CREATE INDEX "prediction_outcomes_trackId_predictedAt_idx" ON "prediction_outcomes"("trackId", "predictedAt");

-- CreateIndex
CREATE INDEX "prediction_outcomes_artistId_predictedAt_idx" ON "prediction_outcomes"("artistId", "predictedAt");

-- CreateIndex
CREATE INDEX "prediction_outcomes_predictionType_predictedAt_idx" ON "prediction_outcomes"("predictionType", "predictedAt");

-- CreateIndex
CREATE UNIQUE INDEX "model_accuracy_reports_modelName_evaluationDate_windowDays_key" ON "model_accuracy_reports"("modelName", "evaluationDate", "windowDays");

-- CreateIndex
CREATE UNIQUE INDEX "track_audio_clusters_trackId_key" ON "track_audio_clusters"("trackId");

-- CreateIndex
CREATE INDEX "track_audio_clusters_clusterId_idx" ON "track_audio_clusters"("clusterId");

-- CreateIndex
CREATE INDEX "track_audio_clusters_isHotCluster_idx" ON "track_audio_clusters"("isHotCluster");

-- CreateIndex
CREATE INDEX "anomaly_log_trackId_detectedAt_idx" ON "anomaly_log"("trackId", "detectedAt");

-- CreateIndex
CREATE INDEX "anomaly_log_severity_detectedAt_idx" ON "anomaly_log"("severity", "detectedAt");

-- CreateIndex
CREATE INDEX "artist_features_daily_artistId_date_idx" ON "artist_features_daily"("artistId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "artist_features_daily_artistId_date_key" ON "artist_features_daily"("artistId", "date");

-- CreateIndex
CREATE INDEX "artist_scores_daily_date_breakoutProb30d_idx" ON "artist_scores_daily"("date", "breakoutProb30d");

-- CreateIndex
CREATE INDEX "artist_scores_daily_date_heatScore_idx" ON "artist_scores_daily"("date", "heatScore");

-- CreateIndex
CREATE UNIQUE INDEX "artist_scores_daily_artistId_date_key" ON "artist_scores_daily"("artistId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "training_examples_artistId_snapshotDate_key" ON "training_examples"("artistId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tracks" ADD CONSTRAINT "playlist_tracks_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stations" ADD CONSTRAINT "stations_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_subscriptions" ADD CONSTRAINT "digest_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "TenantUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogTrack" ADD CONSTRAINT "CatalogTrack_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_artists" ADD CONSTRAINT "track_artists_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_albums" ADD CONSTRAINT "track_albums_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_albums" ADD CONSTRAINT "track_albums_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_curator_links" ADD CONSTRAINT "playlist_curator_links_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_curator_links" ADD CONSTRAINT "playlist_curator_links_curatorId_fkey" FOREIGN KEY ("curatorId") REFERENCES "curators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curator_playlists" ADD CONSTRAINT "curator_playlists_curatorId_fkey" FOREIGN KEY ("curatorId") REFERENCES "curators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curator_playlists" ADD CONSTRAINT "curator_playlists_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_ids" ADD CONSTRAINT "external_ids_track_fk" FOREIGN KEY ("entityId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_ids" ADD CONSTRAINT "external_ids_artist_fk" FOREIGN KEY ("entityId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_ids" ADD CONSTRAINT "external_ids_album_fk" FOREIGN KEY ("entityId") REFERENCES "albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tags" ADD CONSTRAINT "playlist_tags_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_tags" ADD CONSTRAINT "playlist_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_tags" ADD CONSTRAINT "track_tags_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_tags" ADD CONSTRAINT "track_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curator_flags" ADD CONSTRAINT "curator_flags_curatorId_fkey" FOREIGN KEY ("curatorId") REFERENCES "curators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_flags" ADD CONSTRAINT "playlist_flags_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_platform_stats_daily" ADD CONSTRAINT "track_platform_stats_daily_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_statistics_latest" ADD CONSTRAINT "track_statistics_latest_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spotify_playlist_metrics_latest" ADD CONSTRAINT "spotify_playlist_metrics_latest_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_playlist_metrics_latest" ADD CONSTRAINT "youtube_playlist_metrics_latest_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_metrics_latest" ADD CONSTRAINT "playlist_metrics_latest_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curator_metrics" ADD CONSTRAINT "curator_metrics_curatorId_fkey" FOREIGN KEY ("curatorId") REFERENCES "curators"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_airplay_facts" ADD CONSTRAINT "radio_airplay_facts_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_airplay_facts" ADD CONSTRAINT "radio_airplay_facts_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadioSpin" ADD CONSTRAINT "RadioSpin_radioId_fkey" FOREIGN KEY ("radioId") REFERENCES "Radio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_rows" ADD CONSTRAINT "chart_rows_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "chart_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_rows" ADD CONSTRAINT "chart_rows_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_rank_stats" ADD CONSTRAINT "chart_rank_stats_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "chart_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_video_chart_rows" ADD CONSTRAINT "tiktok_video_chart_rows_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "tiktok_video_chart_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_video_chart_history" ADD CONSTRAINT "tiktok_video_chart_history_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "tiktok_video_chart_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_user_chart_rows" ADD CONSTRAINT "tiktok_user_chart_rows_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "tiktok_user_chart_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_user_chart_rows" ADD CONSTRAINT "tiktok_user_chart_rows_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_user_chart_rank_stats" ADD CONSTRAINT "tiktok_user_chart_rank_stats_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "tiktok_user_chart_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_typed_track_chart_rows" ADD CONSTRAINT "tiktok_typed_track_chart_rows_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "tiktok_typed_track_chart_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiktok_typed_track_chart_rows" ADD CONSTRAINT "tiktok_typed_track_chart_rows_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_shorts_chart_rows" ADD CONSTRAINT "youtube_shorts_chart_rows_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "youtube_shorts_chart_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "airplay_track_chart_rows" ADD CONSTRAINT "airplay_track_chart_rows_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "airplay_track_chart_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "airplay_track_chart_rows" ADD CONSTRAINT "airplay_track_chart_rows_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "airplay_track_chart_rank_stats" ADD CONSTRAINT "airplay_track_chart_rank_stats_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "airplay_track_chart_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_country_markets" ADD CONSTRAINT "radio_country_markets_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_city_markets" ADD CONSTRAINT "radio_city_markets_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radio_stations" ADD CONSTRAINT "radio_stations_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_membership_events" ADD CONSTRAINT "playlist_membership_events_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_membership_events" ADD CONSTRAINT "playlist_membership_events_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_audio_features" ADD CONSTRAINT "track_audio_features_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_version_clusters" ADD CONSTRAINT "track_version_clusters_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_trend_labels" ADD CONSTRAINT "track_trend_labels_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_trend_predictions" ADD CONSTRAINT "track_trend_predictions_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_features_daily" ADD CONSTRAINT "artist_features_daily_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_scores_daily" ADD CONSTRAINT "artist_scores_daily_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_examples" ADD CONSTRAINT "training_examples_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

