-- talent_scout_scores.trackId had no foreign key, so deleting tracks (e.g.
-- the junk-track cleanup) left orphaned score rows behind — reconcile flagged
-- 153 of them in production as an ERROR-level integrity finding.
--
-- 1) Purge existing orphans (rows pointing at tracks that no longer exist).
DELETE FROM "talent_scout_scores" s
WHERE NOT EXISTS (SELECT 1 FROM "tracks" t WHERE t."id" = s."trackId");

-- 2) Enforce integrity going forward: cascade score deletion with the track.
ALTER TABLE "talent_scout_scores"
  ADD CONSTRAINT "talent_scout_scores_trackId_fkey"
  FOREIGN KEY ("trackId") REFERENCES "tracks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
