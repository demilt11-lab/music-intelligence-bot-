-- The external_ids table is a POLYMORPHIC association: entityId points to a
-- track, artist, album, OR playlist depending on entityType. The generated
-- schema declared three foreign keys on the SAME entityId column (→ tracks,
-- artists, albums), so Postgres required every entityId to exist in ALL THREE
-- tables simultaneously. That made the table effectively impossible to
-- populate — e.g. a track's external id (entityId = track.id) was rejected
-- because no album shares that id — which is why URL-based search resolved
-- nothing and the seed could not insert external ids.
--
-- Drop the three FK constraints. Referential integrity for this polymorphic
-- column is enforced in application code (entityType + entityId pairing), the
-- standard pattern for polymorphic relations in Prisma.

ALTER TABLE "external_ids" DROP CONSTRAINT IF EXISTS "external_ids_track_fk";
ALTER TABLE "external_ids" DROP CONSTRAINT IF EXISTS "external_ids_artist_fk";
ALTER TABLE "external_ids" DROP CONSTRAINT IF EXISTS "external_ids_album_fk";
