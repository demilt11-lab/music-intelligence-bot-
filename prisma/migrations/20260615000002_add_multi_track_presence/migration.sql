-- Add multiTrackPresence signal to writer_producer_rising_scores
-- Tracks when a writer/producer is credited on multiple songs from the same
-- album, playlist, or within the same release week — a strong early-breakout signal.

ALTER TABLE "writer_producer_rising_scores"
  ADD COLUMN "multiTrackPresence" DOUBLE PRECISION;
