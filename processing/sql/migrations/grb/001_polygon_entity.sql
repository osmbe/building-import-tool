-- migrate:no-transaction
-- GRB polygon entity (GBG vs GBA), step 1: the entity column.
--
-- GBG (gebouw) and GBA (gebouwaanhorigheid) polygons share grb.building_polygons, but their OIDNs are only
-- unique per entity: Gbg/2664 and Gba/2664 are different objects. With a UNIQUE (oidn) constraint the GBA import
-- (ON CONFLICT DO NOTHING) silently dropped every GBA polygon whose OIDN was also used by a GBG polygon.
-- Step 2 (002) makes (entity, oidn) the unique key, step 3 (003) rebuilds the materialized view with the entity.
--
-- Written to run online on the production table (5M+ rows) while tiles and the API keep reading it:
-- - ADD COLUMN with a constant default only changes the catalog (no table rewrite);
-- - the GBA backfill runs in committed batches, so it never holds row locks for long;
-- - the CHECK is added NOT VALID (instant), then validated without blocking reads or writes.
-- Every statement is idempotent, so the file can be re-run after a failure (it has no transaction).

ALTER TABLE grb.building_polygons ADD COLUMN IF NOT EXISTS entity VARCHAR(3) NOT NULL DEFAULT 'Gbg';

-- GBG has exactly three LBLTYPE values; every other label belongs to a GBA polygon. Re-running only touches
-- rows that are still wrong.
DO $$
DECLARE
    batch_size CONSTANT BIGINT := 50000;
    max_id BIGINT;
    from_id BIGINT := 0;
    updated BIGINT := 0;
    n BIGINT;
BEGIN
    SELECT coalesce(max(id), 0) INTO max_id FROM grb.building_polygons;
    WHILE from_id <= max_id LOOP
        UPDATE grb.building_polygons
        SET entity = 'Gba'
        WHERE id > from_id AND id <= from_id + batch_size
          AND entity = 'Gbg'
          AND type_label IS NOT NULL
          AND lower(type_label) NOT IN ('hoofdgebouw', 'bijgebouw', 'gebouw afgezoomd met virtuele gevels');
        GET DIAGNOSTICS n = ROW_COUNT;
        updated := updated + n;
        from_id := from_id + batch_size;
        COMMIT;
    END LOOP;
    IF updated > 0 THEN
        RAISE WARNING 'grb/001: % polygons marked as Gba', updated;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'building_polygons_entity_check' AND conrelid = 'grb.building_polygons'::regclass
    ) THEN
        ALTER TABLE grb.building_polygons
            ADD CONSTRAINT building_polygons_entity_check CHECK (entity IN ('Gbg', 'Gba')) NOT VALID;
    END IF;
END $$;

ALTER TABLE grb.building_polygons VALIDATE CONSTRAINT building_polygons_entity_check;
