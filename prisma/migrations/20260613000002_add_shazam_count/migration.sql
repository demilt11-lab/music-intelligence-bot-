-- Add shazamCount column that was added to schema but never migrated
ALTER TABLE "track_statistics_latest" ADD COLUMN "shazamCount" BIGINT;
