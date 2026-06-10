-- One trajectory snapshot per (artistId, date).
-- 1. Remove duplicates, keeping the most recently created row.
DELETE FROM "ArtistTrajectorySnapshot" a
USING "ArtistTrajectorySnapshot" b
WHERE a."artistId" = b."artistId"
  AND a."date" = b."date"
  AND a."id" < b."id";

-- 2. Replace the plain index with a unique constraint.
DROP INDEX IF EXISTS "ArtistTrajectorySnapshot_artistId_date_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "ArtistTrajectorySnapshot_artistId_date_key"
  ON "ArtistTrajectorySnapshot"("artistId", "date");

-- 3. Date-only index for "latest snapshot" queries.
CREATE INDEX IF NOT EXISTS "ArtistTrajectorySnapshot_date_idx"
  ON "ArtistTrajectorySnapshot"("date");
