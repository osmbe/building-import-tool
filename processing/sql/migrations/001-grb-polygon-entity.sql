-- Migration 001: GRB polygon entity (GBG vs GBA) + buildings_with_addresses materialized view
--
-- GBG (gebouw) and GBA (gebouwaanhorigheid) polygons share grb.building_polygons, but their OIDNs are only
-- unique per entity: Gbg/2664 and Gba/2664 are different objects. With a UNIQUE (oidn) constraint the GBA import
-- (ON CONFLICT DO NOTHING) silently dropped every GBA polygon whose OIDN was also used by a GBG polygon.
-- This migration adds an `entity` column, makes (entity, oidn) the unique key, and (re)creates the
-- grb.buildings_with_addresses materialized view with `entity` and a unique `polygon_id` (used as tile id).
--
-- Idempotent: safe to run on a fresh database, an old database, or an already migrated one. It runs as a
-- docker-entrypoint init script (fresh volumes), from the processing recipes (`just db-migrate`) and from
-- webhook/restore-grb.sh before a data-only GRB dump is restored.
--
-- This file is the single source of truth for the materialized view definition.

\set ON_ERROR_STOP on
-- Re-runs are expected: hide the "already exists, skipping" notices
SET client_min_messages = warning;

-- 1. entity column, backfilled from the type label on existing databases ----------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'grb' AND table_name = 'building_polygons' AND column_name = 'entity'
    ) THEN
        ALTER TABLE grb.building_polygons ADD COLUMN entity VARCHAR(3) NOT NULL DEFAULT 'Gbg';
        -- GBG has exactly three LBLTYPE values; every other label belongs to a GBA polygon.
        UPDATE grb.building_polygons
        SET entity = 'Gba'
        WHERE type_label IS NOT NULL
          AND lower(type_label) NOT IN ('hoofdgebouw', 'bijgebouw', 'gebouw afgezoomd met virtuele gevels');
        RAISE WARNING 'migration 001: grb.building_polygons.entity added and backfilled';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'building_polygons_entity_check') THEN
        ALTER TABLE grb.building_polygons
            ADD CONSTRAINT building_polygons_entity_check CHECK (entity IN ('Gbg', 'Gba'));
    END IF;
END $$;

-- 2. (entity, oidn) is the unique key ------------------------------------------------------------------------
ALTER TABLE grb.building_polygons DROP CONSTRAINT IF EXISTS building_polygons_oidn_key;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'building_polygons_entity_oidn_key') THEN
        ALTER TABLE grb.building_polygons
            ADD CONSTRAINT building_polygons_entity_oidn_key UNIQUE (entity, oidn);
    END IF;
END $$;

-- 3. Materialized view ------------------------------------------------------------------------------------
-- Joins building polygons with their addresses via spatial containment (ST_Contains) and includes parent
-- building aggregated stats for context. Each row is one polygon.
--
-- Why spatial join instead of address_building_links?
-- The GEBOUWID in RltAdresGebouw (address links) uses a different ID namespace than the GEBOUWID in
-- RltGbgGebouw (polygon-building relationships), resulting in only ~5% match rate. Spatial join reliably
-- matches addresses to the polygon that physically contains them. See docs/GRB_ADDRESS_JOIN.md.
--
-- An older view without `entity` is dropped and recreated. Creating it is instant on an empty table; on a
-- populated one it is a one-off full build (the import/update recipes refresh it afterwards anyway).
DO $$
BEGIN
    IF to_regclass('grb.buildings_with_addresses') IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM pg_attribute
           WHERE attrelid = to_regclass('grb.buildings_with_addresses') AND attname = 'entity' AND NOT attisdropped
       ) THEN
        DROP MATERIALIZED VIEW grb.buildings_with_addresses CASCADE;
        RAISE WARNING 'migration 001: grb.buildings_with_addresses recreated with entity (run a refresh if it was populated)';
    END IF;
END $$;

CREATE MATERIALIZED VIEW IF NOT EXISTS grb.buildings_with_addresses AS
WITH addr_per_polygon AS (
    SELECT
        bp.id AS polygon_id,
        COUNT(a.adres_id) AS address_count,
        array_to_string(ARRAY_AGG(DISTINCT a.full_address ORDER BY a.full_address)
            FILTER (WHERE a.full_address IS NOT NULL), '; ') AS addresses,
        array_to_string(ARRAY_AGG(DISTINCT a.street_name ORDER BY a.street_name)
            FILTER (WHERE a.street_name IS NOT NULL), ', ') AS street_names,
        array_to_string(ARRAY_AGG(DISTINCT a.postcode ORDER BY a.postcode)
            FILTER (WHERE a.postcode IS NOT NULL), ', ') AS postcodes,
        array_to_string(ARRAY_AGG(DISTINCT a.municipality ORDER BY a.municipality)
            FILTER (WHERE a.municipality IS NOT NULL), ', ') AS municipalities
    FROM grb.building_polygons bp
    JOIN grb.addresses a ON ST_Contains(bp.geom, a.geom)
    GROUP BY bp.id
)
SELECT
    -- Unique per polygon (OIDNs are only unique per entity); used as the vector tile feature id
    bp.id AS polygon_id,
    -- Polygon-level info (for OSM tagging: source:geometry:ref = <entity>/<oidn>)
    -- Cast oidn to BIGINT for Martin tile server (source is numeric(15,0))
    bp.entity,
    bp.oidn::BIGINT AS oidn,
    bp.gebouw_id,
    bp.area_m2::REAL AS polygon_area_m2,
    bp.type_label AS polygon_type_label,

    -- Survey date for source:geometry:date OSM tag (format: YYYY-MM-DD)
    TO_CHAR(bp.survey_date, 'YYYY-MM-DD') AS survey_date,

    -- Origin/inventory label (e.g. "terreinbezoek", "as-built plan")
    bp.origin_label,

    -- Transform to Web Mercator for tile serving (transform once at view creation, not per tile)
    -- Explicit cast so PostGIS registers SRID=3857 in geometry_columns (required by Martin)
    ST_Transform(bp.geom, 3857)::geometry(Geometry, 3857) AS geom,

    -- Parent building aggregated stats (for context)
    b.polygon_count,
    b.total_area_m2,
    b.type_label AS building_type_label,

    -- Address data (pre-aggregated per polygon via spatial join)
    COALESCE(app.addresses, '')     AS addresses,
    COALESCE(app.street_names, '')  AS street_names,
    COALESCE(app.postcodes, '')     AS postcodes,
    COALESCE(app.municipalities, '') AS municipalities,
    COALESCE(app.address_count, 0)  AS address_count
FROM
    grb.building_polygons bp
    LEFT JOIN grb.buildings b ON bp.gebouw_id = b.gebouw_id
    LEFT JOIN addr_per_polygon app ON bp.id = app.polygon_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_polygon_id ON grb.buildings_with_addresses(polygon_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_entity_oidn ON grb.buildings_with_addresses(entity, oidn);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_gebouw_id ON grb.buildings_with_addresses(gebouw_id);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_polygon_type ON grb.buildings_with_addresses(polygon_type_label);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_geom ON grb.buildings_with_addresses USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_postcodes ON grb.buildings_with_addresses USING GIN(postcodes);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_buildings_with_addresses()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY grb.buildings_with_addresses;
END;
$$ LANGUAGE plpgsql;
