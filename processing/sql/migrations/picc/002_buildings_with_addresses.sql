-- migrate:no-transaction
-- migrate:heavy
-- picc.buildings_with_addresses on top of picc.buildings / picc.addresses (picc/001), with the same columns
-- as before plus `fid` (unique: the view can refresh concurrently, which a duplicate objectid prevented).
-- Single source of truth for the view, which the two recipes _picc-create-matview(-provinces) used to define
-- (differently).
--
-- On a database imported by the older recipes (raw ogr2ogr tables picc.constr_batiemprise / picc.icar_adr_pt):
-- 1. their data is loaded into the new tables (picc.load_raw);
-- 2. the new view is built next to the old one (buildings_with_addresses_v2), tiles keep reading the old one;
-- 3. the views are swapped in one short transaction (retried on lock timeouts) and the old tables dropped.
-- Every step is idempotent, so the file can be re-run after a failure.

-- 1. Data of the old raw tables, once
DO $$
BEGIN
    IF to_regclass('picc.constr_batiemprise') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM picc.buildings) THEN
        PERFORM picc.load_raw('picc.constr_batiemprise', to_regclass('picc.icar_adr_pt'));
        RAISE WARNING 'picc/002: % buildings and % addresses loaded from the old tables',
            (SELECT count(*) FROM picc.buildings), (SELECT count(*) FROM picc.addresses);
    END IF;
END $$;
ANALYZE picc.buildings;
ANALYZE picc.addresses;

-- 2. The view, under its final name when there is none yet, else as _v2 next to the old one
DO $$
DECLARE
    current_ok BOOLEAN := EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('picc.buildings_with_addresses') AND attname = 'fid' AND NOT attisdropped
    );
    target TEXT;
BEGIN
    IF current_ok THEN
        RETURN;
    END IF;
    target := CASE WHEN to_regclass('picc.buildings_with_addresses') IS NULL
        THEN 'buildings_with_addresses' ELSE 'buildings_with_addresses_v2' END;
    IF to_regclass('picc.' || target) IS NOT NULL THEN
        RETURN; -- built by an interrupted run (CREATE MATERIALIZED VIEW is atomic)
    END IF;
    EXECUTE format($view$CREATE MATERIALIZED VIEW picc.%I AS
        WITH addr_per_building AS (
            SELECT
                b.fid,
                COUNT(*) AS address_count,
                array_to_string(ARRAY_AGG(DISTINCT (a.street || ' ' || a.house_number)
                    ORDER BY (a.street || ' ' || a.house_number))
                    FILTER (WHERE a.street IS NOT NULL), '; ') AS addresses,
                array_to_string(ARRAY_AGG(DISTINCT a.street ORDER BY a.street)
                    FILTER (WHERE a.street IS NOT NULL), ', ') AS street_names,
                array_to_string(ARRAY_AGG(DISTINCT a.postcode ORDER BY a.postcode)
                    FILTER (WHERE a.postcode IS NOT NULL), ', ') AS postcodes,
                array_to_string(ARRAY_AGG(DISTINCT a.municipality ORDER BY a.municipality)
                    FILTER (WHERE a.municipality IS NOT NULL), ', ') AS municipalities
            FROM picc.buildings b
            JOIN picc.addresses a ON ST_Contains(b.geom, a.geom)
            GROUP BY b.fid
        )
        SELECT
            b.objectid,
            b.georef_id,
            b.natur_code,
            b.natur_desc,
            b.date_leve,
            b.date_modif,
            ST_Area(b.geom)::REAL AS area_m2,
            -- Explicit type so PostGIS registers SRID 3857 in geometry_columns (required by Martin)
            ST_Transform(b.geom, 3857)::geometry(Geometry, 3857) AS geom,
            COALESCE(apb.addresses, '') AS addresses,
            COALESCE(apb.street_names, '') AS street_names,
            COALESCE(apb.postcodes, '') AS postcodes,
            COALESCE(apb.municipalities, '') AS municipalities,
            COALESCE(apb.address_count, 0) AS address_count,
            b.fid
        FROM picc.buildings b
        LEFT JOIN addr_per_building apb ON apb.fid = b.fid$view$, target);
END $$;

SELECT CASE WHEN to_regclass('picc.buildings_with_addresses_v2') IS NULL THEN '' ELSE '_v2' END AS sfx,
       CASE WHEN to_regclass('picc.buildings_with_addresses_v2') IS NULL THEN 'buildings_with_addresses'
            ELSE 'buildings_with_addresses_v2' END AS mv \gset

CREATE UNIQUE INDEX IF NOT EXISTS picc_bwa_fid_idx:sfx ON picc.:mv (fid);
CREATE INDEX IF NOT EXISTS picc_bwa_objectid_idx:sfx ON picc.:mv (objectid);
CREATE INDEX IF NOT EXISTS picc_bwa_geom_idx:sfx ON picc.:mv USING GIST (geom);
CREATE INDEX IF NOT EXISTS picc_bwa_natur_code_idx:sfx ON picc.:mv (natur_code);
CREATE INDEX IF NOT EXISTS picc_bwa_postcodes_idx:sfx ON picc.:mv (postcodes);

-- 3. Swap, then drop the old raw tables (nothing reads them any more)
BEGIN;
DO $$
DECLARE
    idx TEXT;
BEGIN
    IF to_regclass('picc.buildings_with_addresses_v2') IS NOT NULL THEN
        DROP MATERIALIZED VIEW IF EXISTS picc.buildings_with_addresses CASCADE;
        ALTER MATERIALIZED VIEW picc.buildings_with_addresses_v2 RENAME TO buildings_with_addresses;
        FOREACH idx IN ARRAY ARRAY['fid', 'objectid', 'geom', 'natur_code', 'postcodes'] LOOP
            EXECUTE format('ALTER INDEX picc.%I RENAME TO %I', 'picc_bwa_' || idx || '_idx_v2', 'picc_bwa_' || idx || '_idx');
        END LOOP;
        RAISE WARNING 'picc/002: picc.buildings_with_addresses rebuilt on picc.buildings';
    END IF;
END $$;
DROP TABLE IF EXISTS picc.constr_batiemprise, picc.icar_adr_pt, picc.staging_buildings, picc.staging_addresses CASCADE;
COMMIT;
