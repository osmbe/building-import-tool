-- migrate:no-transaction
-- GRB polygon entity, step 2: (entity, oidn) replaces oidn as the unique key of grb.building_polygons.
--
-- The index is built CONCURRENTLY, so imports, tiles and the API keep working while it builds. A failed
-- concurrent build leaves an invalid index behind: it is dropped first, so the file can simply be re-run.
-- The imports use ON CONFLICT (entity, oidn), which only needs a unique index (not a constraint).
-- postgres/02-setup-be2osm.sql defines no key, so fresh databases get it here too.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_index
        WHERE indexrelid = to_regclass('grb.building_polygons_entity_oidn_key') AND NOT indisvalid
    ) THEN
        DROP INDEX grb.building_polygons_entity_oidn_key;
        RAISE WARNING 'grb/002: dropped the invalid index left by an interrupted run';
    END IF;
END $$;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS building_polygons_entity_oidn_key
    ON grb.building_polygons (entity, oidn);

ALTER TABLE grb.building_polygons DROP CONSTRAINT IF EXISTS building_polygons_oidn_key;
