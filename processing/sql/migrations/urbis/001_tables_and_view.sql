-- migrate:no-transaction
-- migrate:heavy
-- UrbIS (Brussels) tables and view, owned by migrations instead of being created by ogr2ogr with the columns of
-- the GeoPackage. Imports load the layers into urbis._raw_* tables and call urbis.load_raw(), which resolves the
-- street and municipality ids through the PlaceNames / Municipalities layers, so only two tables are kept:
-- - urbis.buildings (building_id = the UrbIS inspire_id, block_id, geometry in EPSG:31370);
-- - urbis.addresses (street, house_number, box, postcode, municipality, the building it belongs to).
-- urbis.buildings_with_addresses keeps its columns (inspire_id stays an integer, building_id a bigint).
--
-- On a database imported by the older recipes, whose raw tables have the same names (urbis.buildings,
-- urbis.addresses, ...): they are renamed to urbis._legacy_* (the old view keeps reading them), their data is
-- loaded into the new tables, the new view is built next to the old one and swapped in, and the legacy tables
-- are dropped. Every step is idempotent, so the file can be re-run after a failure.

-- 1. Old raw tables out of the way (instant renames; the old view refers to them by oid)
BEGIN;
DO $$
DECLARE
    t TEXT;
BEGIN
    IF to_regclass('urbis.buildings') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass('urbis.buildings') AND attname = 'building_id' AND NOT attisdropped
    ) THEN
        FOREACH t IN ARRAY ARRAY['buildings', 'addresses', 'placenames', 'municipalities', 'postalzip'] LOOP
            IF to_regclass('urbis.' || t) IS NOT NULL THEN
                EXECUTE format('ALTER TABLE urbis.%I RENAME TO %I', t, '_legacy_' || t);
            END IF;
        END LOOP;
        RAISE WARNING 'urbis/001: old raw tables renamed to urbis._legacy_*';
    END IF;
END $$;
COMMIT;

-- 2. Tables
CREATE TABLE IF NOT EXISTS urbis.buildings (
    building_id BIGINT PRIMARY KEY,  -- UrbIS inspire_id
    block_id BIGINT,
    geom geometry(MultiPolygon, 31370) NOT NULL
);
CREATE INDEX IF NOT EXISTS urbis_buildings_geom_idx ON urbis.buildings USING GIST (geom);

CREATE TABLE IF NOT EXISTS urbis.addresses (
    address_id BIGINT PRIMARY KEY,   -- UrbIS inspire_id
    building_id BIGINT,              -- bu_id
    street TEXT,                     -- French name, else Dutch
    house_number TEXT,               -- policenum
    box TEXT,                        -- boxnumber
    postcode TEXT,
    municipality TEXT,               -- French name
    geom geometry(Point, 31370)
);
CREATE INDEX IF NOT EXISTS urbis_addresses_building_id_idx ON urbis.addresses (building_id);

-- 3. The mapping from the GeoPackage layers (raw ogr2ogr tables, FIDs preserved as inspire_id) to the tables.
-- Appends; the import recipe empties the tables first, in the same transaction.
CREATE OR REPLACE FUNCTION urbis.load_raw(raw_buildings regclass, raw_addresses regclass, raw_placenames regclass,
    raw_municipalities regclass)
RETURNS TABLE (buildings bigint, addresses bigint)
LANGUAGE plpgsql AS $fn$
DECLARE
    nb BIGINT;
    na BIGINT := 0;
BEGIN
    EXECUTE format($q$
        INSERT INTO urbis.buildings (building_id, block_id, geom)
        SELECT inspire_id::bigint, block_id::bigint, ST_Multi(ST_CollectionExtract(ST_Force2D(ST_SetSRID(geom, 31370)), 3))
        FROM %s
        WHERE geom IS NOT NULL
    $q$, raw_buildings);
    GET DIAGNOSTICS nb = ROW_COUNT;
    IF raw_addresses IS NOT NULL THEN
        IF raw_placenames IS NULL OR raw_municipalities IS NULL THEN
            RAISE EXCEPTION 'urbis.load_raw: addresses need the PlaceNames and Municipalities layers';
        END IF;
        EXECUTE format($q$
            INSERT INTO urbis.addresses (address_id, building_id, street, house_number, box, postcode, municipality, geom)
            SELECT a.inspire_id::bigint, a.bu_id::bigint, COALESCE(pn.namefre, pn.namedut), a.policenum::text,
                   a.boxnumber::text, a.zipcode_id::text, m.namefre,
                   CASE WHEN a.geom IS NOT NULL THEN ST_Force2D(ST_SetSRID(ST_GeometryN(a.geom, 1), 31370)) END
            FROM %s a
            LEFT JOIN %s pn ON a.street_id = pn.inspire_id
            LEFT JOIN %s m ON a.municipality_id = m.inspire_id
        $q$, raw_addresses, raw_placenames, raw_municipalities);
        GET DIAGNOSTICS na = ROW_COUNT;
    END IF;
    RETURN QUERY SELECT nb, na;
END;
$fn$;

-- 4. Data of the old raw tables, once
DO $$
BEGIN
    IF to_regclass('urbis._legacy_buildings') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM urbis.buildings) THEN
        PERFORM urbis.load_raw('urbis._legacy_buildings', to_regclass('urbis._legacy_addresses'),
            to_regclass('urbis._legacy_placenames'), to_regclass('urbis._legacy_municipalities'));
        RAISE WARNING 'urbis/001: % buildings and % addresses loaded from the old tables',
            (SELECT count(*) FROM urbis.buildings), (SELECT count(*) FROM urbis.addresses);
    END IF;
END $$;
ANALYZE urbis.buildings;
ANALYZE urbis.addresses;

-- 5. The view, under its final name when there is none yet, else as _v2 next to the old one
DO $$
DECLARE
    current_ok BOOLEAN := EXISTS (
        SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid = d.objid
        WHERE r.ev_class = to_regclass('urbis.buildings_with_addresses') AND d.refobjid = 'urbis.buildings'::regclass
    );
    target TEXT;
BEGIN
    IF current_ok THEN
        RETURN;
    END IF;
    target := CASE WHEN to_regclass('urbis.buildings_with_addresses') IS NULL
        THEN 'buildings_with_addresses' ELSE 'buildings_with_addresses_v2' END;
    IF to_regclass('urbis.' || target) IS NOT NULL THEN
        RETURN; -- built by an interrupted run (CREATE MATERIALIZED VIEW is atomic)
    END IF;
    EXECUTE format($view$CREATE MATERIALIZED VIEW urbis.%I AS
        WITH addr_per_building AS (
            SELECT
                a.building_id,
                COUNT(*) AS address_count,
                array_to_string(ARRAY_AGG(DISTINCT (
                    a.street || ' ' || a.house_number ||
                    CASE WHEN a.box IS NOT NULL AND a.box != '' THEN '/' || a.box ELSE '' END
                ) ORDER BY (
                    a.street || ' ' || a.house_number ||
                    CASE WHEN a.box IS NOT NULL AND a.box != '' THEN '/' || a.box ELSE '' END
                )) FILTER (WHERE a.street IS NOT NULL), '; ') AS addresses,
                array_to_string(ARRAY_AGG(DISTINCT a.street ORDER BY a.street)
                    FILTER (WHERE a.street IS NOT NULL), ', ') AS street_names,
                array_to_string(ARRAY_AGG(DISTINCT a.postcode ORDER BY a.postcode)
                    FILTER (WHERE a.postcode IS NOT NULL), ', ') AS postcodes,
                array_to_string(ARRAY_AGG(DISTINCT a.municipality ORDER BY a.municipality)
                    FILTER (WHERE a.municipality IS NOT NULL), ', ') AS municipalities
            FROM urbis.addresses a
            GROUP BY a.building_id
        )
        SELECT
            b.building_id,
            b.building_id::integer AS inspire_id,
            b.block_id,
            ST_Area(b.geom)::REAL AS area_m2,
            ST_Transform(b.geom, 3857)::geometry(Geometry, 3857) AS geom,
            COALESCE(apb.addresses, '') AS addresses,
            COALESCE(apb.street_names, '') AS street_names,
            COALESCE(apb.postcodes, '') AS postcodes,
            COALESCE(apb.municipalities, '') AS municipalities,
            COALESCE(apb.address_count, 0) AS address_count
        FROM urbis.buildings b
        LEFT JOIN addr_per_building apb ON apb.building_id = b.building_id$view$, target);
END $$;

SELECT CASE WHEN to_regclass('urbis.buildings_with_addresses_v2') IS NULL THEN '' ELSE '_v2' END AS sfx,
       CASE WHEN to_regclass('urbis.buildings_with_addresses_v2') IS NULL THEN 'buildings_with_addresses'
            ELSE 'buildings_with_addresses_v2' END AS mv \gset

CREATE UNIQUE INDEX IF NOT EXISTS urbis_bwa_building_id_idx:sfx ON urbis.:mv (building_id);
CREATE INDEX IF NOT EXISTS urbis_bwa_geom_idx:sfx ON urbis.:mv USING GIST (geom);
CREATE INDEX IF NOT EXISTS urbis_bwa_postcodes_idx:sfx ON urbis.:mv (postcodes);

-- 6. Swap, then drop the old raw tables
BEGIN;
DO $$
DECLARE
    idx TEXT;
BEGIN
    IF to_regclass('urbis.buildings_with_addresses_v2') IS NOT NULL THEN
        DROP MATERIALIZED VIEW IF EXISTS urbis.buildings_with_addresses CASCADE;
        ALTER MATERIALIZED VIEW urbis.buildings_with_addresses_v2 RENAME TO buildings_with_addresses;
        FOREACH idx IN ARRAY ARRAY['building_id', 'geom', 'postcodes'] LOOP
            EXECUTE format('ALTER INDEX urbis.%I RENAME TO %I', 'urbis_bwa_' || idx || '_idx_v2', 'urbis_bwa_' || idx || '_idx');
        END LOOP;
        RAISE WARNING 'urbis/001: urbis.buildings_with_addresses rebuilt on the new tables';
    END IF;
END $$;
DROP TABLE IF EXISTS urbis._legacy_buildings, urbis._legacy_addresses, urbis._legacy_placenames,
    urbis._legacy_municipalities, urbis._legacy_postalzip CASCADE;
COMMIT;
