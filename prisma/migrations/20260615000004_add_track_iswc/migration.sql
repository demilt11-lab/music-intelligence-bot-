-- Add ISWC (International Standard Musical Work Code) to tracks.
-- ISWC identifies the musical composition (distinct from ISRC which identifies
-- the sound recording). Used to cross-reference MLC/ASCAP/BMI work registries.

ALTER TABLE "tracks"
  ADD COLUMN "iswc" TEXT;

CREATE UNIQUE INDEX "tracks_iswc_key" ON "tracks"("iswc") WHERE "iswc" IS NOT NULL;
