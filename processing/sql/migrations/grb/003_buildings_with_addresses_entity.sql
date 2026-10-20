-- migrate:no-transaction
-- migrate:heavy
-- GRB polygon entity, step 3: grb.buildings_with_addresses with `entity` and a unique `polygon_id` (the
-- vector tile feature id, since a GBG and a GBA polygon can share an OIDN).
--
-- Joins building polygons with their addresses via spatial containment (ST_Contains) and includes parent
-- building aggregated stats for context. Each row is one polygon.
--
-- Why spatial join instead of address_building_links?
-- The GEBOUWID in RltAdresGebouw (address links) uses a different ID namespace than the GEBOUWID in
-- RltGbgGebouw (polygon-building relationships), resulting in only ~5% match rate. Spatial join reliably
-- matches addresses to the polygon that physically contains them. See docs/GRB_ADDRESS_JOIN.md.
--
-- This file is the single source of truth for the view definition. It is heavy because, on a database that
-- has the old view (without entity), the new one is built next to it as buildings_with_addresses_v2 (about
-- 30 minutes on the full dataset) while tiles and the API keep reading the old one. The two are then swapped
-- in one short transaction. A re-run after a failure reuses a v2 that was already built.
-- On a fresh database (no view yet) the view is created directly; on empty tables that is instant.

DO $$
DECLARE
    current_ok BOOLEAN := EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('grb.buildings_with_addresses') AND attname = 'entity' AND NOT attisdropped
    );
    target TEXT;
BEGIN
    IF current_ok THEN
        RETURN;
    END IF;
    -- Build under the final name when there is no view yet, else next to the old one
    target := CASE WHEN to_regclass('grb.buildings_with_addresses') IS NULL
        THEN 'buildings_with_addresses' ELSE 'buildings_with_addresses_v2' END;
    IF to_regclass('grb.' || target) IS NOT NULL THEN
        RETURN; -- v2 left by an interrupted run: CREATE MATERIALIZED VIEW is atomic, so it is complete
    END IF;
    EXECUTE format($view$CREATE MATERIALIZED VIEW grb.%I AS
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
        LEFT JOIN addr_per_polygon app ON bp.id = app.polygon_id$view$, target);
END $$;

-- Indexes on the view being built (v2 when it exists), named like the final ones plus _v2
SELECT CASE WHEN to_regclass('grb.buildings_with_addresses_v2') IS NULL THEN '' ELSE '_v2' END AS sfx,
       CASE WHEN to_regclass('grb.buildings_with_addresses_v2') IS NULL THEN 'buildings_with_addresses'
            ELSE 'buildings_with_addresses_v2' END AS mv \gset

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_polygon_id:sfx ON grb.:mv (polygon_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_entity_oidn:sfx ON grb.:mv (entity, oidn);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_gebouw_id:sfx ON grb.:mv (gebouw_id);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_polygon_type:sfx ON grb.:mv (polygon_type_label);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_geom:sfx ON grb.:mv USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_postcodes:sfx ON grb.:mv USING GIN (postcodes);

-- Swap: drop the old view and give v2 (and its indexes) the final names, in one transaction. It waits at most
-- lock_timeout for running tile queries; the migration runner retries on a lock timeout.
BEGIN;
DO $$
DECLARE
    idx TEXT;
BEGIN
    IF to_regclass('grb.buildings_with_addresses_v2') IS NULL THEN
        RETURN;
    END IF;
    DROP MATERIALIZED VIEW IF EXISTS grb.buildings_with_addresses CASCADE;
    ALTER MATERIALIZED VIEW grb.buildings_with_addresses_v2 RENAME TO buildings_with_addresses;
    FOREACH idx IN ARRAY ARRAY['polygon_id', 'entity_oidn', 'gebouw_id', 'polygon_type', 'geom', 'postcodes'] LOOP
        EXECUTE format('ALTER INDEX grb.%I RENAME TO %I',
            'idx_mv_buildings_with_addresses_' || idx || '_v2', 'idx_mv_buildings_with_addresses_' || idx);
    END LOOP;
    RAISE WARNING 'grb/003: grb.buildings_with_addresses rebuilt with entity and polygon_id';
END $$;
COMMIT;

-- Refresh without blocking readers (needs the unique index on polygon_id)
CREATE OR REPLACE FUNCTION grb.refresh_buildings_with_addresses()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY grb.buildings_with_addresses;
END;
$$ LANGUAGE plpgsql;
