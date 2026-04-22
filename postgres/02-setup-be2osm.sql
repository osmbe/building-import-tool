-- BE2OSM Database Schema Setup
-- GRB Buildings in OSM-like format
-- Run this on the be2osm database

\c be2osm

\echo '======================================'
\echo 'BE2OSM Schema Setup'
\echo '======================================'
\echo ''

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gin;

\echo '✓ Extensions enabled'

-- Create schema for GRB buildings
CREATE SCHEMA IF NOT EXISTS grb;

\echo '✓ GRB schema created'

-- Building Polygons (GBG - Gebouwgeometrie)
-- 5M+ individual polygon geometries from GRB
CREATE TABLE IF NOT EXISTS grb.building_polygons (
    id BIGSERIAL PRIMARY KEY,

    -- GRB identifiers
    oidn BIGINT UNIQUE NOT NULL,      -- Unique polygon identifier from GRB
    uidn BIGINT,                      -- Universal identifier

    -- Building reference (from RltGbgGebouw relationship)
    gebouw_id BIGINT,                 -- Building ID (one building can have multiple polygons)

    -- Type information
    type_code INTEGER,                -- Building type code
    type_label VARCHAR(64),           -- Building type label (LBLTYPE)

    -- Measurements
    area_m2 REAL,                     -- Surface area in m² (OPPERVL)
    length_m REAL,                    -- Perimeter length in m (LENGTE)

    -- Versioning
    version INTEGER,                  -- Version number
    begin_date DATE,                  -- Begin date (BEGINDATUM)
    version_date DATE,                -- Version date (VERSDATUM)
    survey_date DATE,                 -- Survey date (OPNDATUM)

    -- Origin/inventory
    origin_code INTEGER,              -- Origin code (BGNINV)
    origin_label VARCHAR(32),         -- Origin label (LBLBGNINV)

    -- Temporary field for date conversion during import (DD/MM/YYYY text → DATE)
    opndatum_raw VARCHAR(10),         -- Raw date string from shapefile

    -- Geometry (WGS84 - EPSG:4326)
    geom GEOMETRY(Polygon, 4326) NOT NULL,

    -- Web Mercator for tile serving (EPSG:3857)
    geom_mercator GEOMETRY(Polygon, 3857),

    -- Import tracking
    source_file VARCHAR(255),
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kunstwerken Geometries (KNW - Structures)
CREATE TABLE IF NOT EXISTS grb.kunstwerken (
    id BIGSERIAL PRIMARY KEY,

    -- GRB identifiers
    oidn BIGINT UNIQUE NOT NULL,
    uidn BIGINT,

    -- Type information
    type_code INTEGER,
    type_label VARCHAR(96),

    -- Measurements
    area_m2 REAL,
    length_m REAL,

    -- Versioning
    version INTEGER,
    survey_date DATE,

    -- Origin/inventory
    origin_code INTEGER,
    origin_label VARCHAR(64),

    -- Temporary field for date conversion during import
    opndatum_raw VARCHAR(10),

    -- Source entity (always Knw)
    entity VARCHAR(8) DEFAULT 'Knw',

    -- Geometry (WGS84 - EPSG:4326)
    geom GEOMETRY(Geometry, 4326) NOT NULL,

    -- Web Mercator for tile serving (EPSG:3857)
    geom_mercator GEOMETRY(Geometry, 3857),

    -- Import tracking
    source_file VARCHAR(255),
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Buildings (Aggregated from building_polygons)
-- Represents logical buildings (one building may have multiple polygons)
CREATE TABLE IF NOT EXISTS grb.buildings (
    gebouw_id BIGINT PRIMARY KEY,     -- Building ID from RltGbgGebouw

    -- Statistics
    polygon_count INTEGER,            -- Number of polygons for this building
    total_area_m2 REAL,              -- Total area across all polygons

    -- Type (most common type among polygons)
    type_label VARCHAR(64),

    -- Aggregated geometry (union of all polygons)
    geom GEOMETRY(MultiPolygon, 4326),
    geom_mercator GEOMETRY(MultiPolygon, 3857),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Addresses (Adres - GRAR address points)
-- 1.3M+ address points with full address information
CREATE TABLE IF NOT EXISTS grb.addresses (
    id BIGSERIAL PRIMARY KEY,

    -- GRB identifiers
    oidn BIGINT UNIQUE NOT NULL,      -- Position OIDN (unique for this point location)
    adres_id BIGINT UNIQUE NOT NULL,  -- Address ID (ADRESID - the key identifier)
    id_string VARCHAR(128),           -- ID string representation

    -- Street information
    street_id BIGINT,                 -- Street name ID (STRAATNMID)
    street_name VARCHAR(80),          -- Street name (STRAATNM)

    -- Address components
    house_number VARCHAR(11),         -- House number (HUISNR)
    box_number VARCHAR(10),           -- Box/unit number (BUSNR)

    -- Location
    postcode VARCHAR(4),              -- Postal code
    nis_code VARCHAR(5),              -- Municipality code (NISCODE)
    municipality VARCHAR(40),         -- Municipality name (GEMEENTE)

    -- Full address
    full_address VARCHAR(254),        -- Complete address string (ADRESNAAM)

    -- Status and metadata
    position_spec_code INTEGER,       -- Position specification code
    position_spec VARCHAR(32),        -- Position specification label
    method_code INTEGER,              -- Method code
    method VARCHAR(32),               -- Method label
    status_code INTEGER,              -- Status code
    status VARCHAR(32),               -- Status label
    official_assignment_code INTEGER, -- Official assignment code
    official_assignment VARCHAR(32),  -- Official assignment label
    origin_code INTEGER,              -- Origin code
    origin_label VARCHAR(32),         -- Origin label

    -- Versioning
    version_id VARCHAR(32),           -- Version ID (VERSIEID)
    version INTEGER,                  -- Version number
    begin_date DATE,                  -- Begin date
    version_date DATE,                -- Version date

    -- Geometry (WGS84 - EPSG:4326)
    geom GEOMETRY(Point, 4326) NOT NULL,
    geom_mercator GEOMETRY(Point, 3857),

    -- Import tracking
    source_file VARCHAR(255),
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Address-Building Links (AdresGebouweenheidKoppelingen)
-- 3.9M+ links between addresses and building objects
CREATE TABLE IF NOT EXISTS grb.address_building_links (
    id BIGSERIAL PRIMARY KEY,

    -- Link fields
    adres_id BIGINT NOT NULL,         -- Address ID (links to addresses.adres_id)
    building_object_id VARCHAR(30),   -- Building object ID (adresobjid)
    object_type VARCHAR(20),          -- Object type (usually "Gebouweenheid")

    -- Import tracking
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Polygon-Building Relationships (RltGbgGebouw)
-- Maps individual polygon OIDN to logical building GEBOUWID
-- This table is essential for correctly aggregating polygons into buildings
CREATE TABLE IF NOT EXISTS grb.polygon_building_rel (
    ogc_fid SERIAL PRIMARY KEY,       -- Auto-generated by ogr2ogr

    -- Relationship fields (from RltGbgGebouw.dbf)
    oidn BIGINT NOT NULL,             -- Polygon OIDN (links to building_polygons.oidn)
    gebouw_id BIGINT NOT NULL         -- Building ID (the logical building this polygon belongs to)

    -- Note: no UNIQUE constraint on oidn - DBF source may have duplicates;
    -- _grb-update-gebouw-ids handles this via DISTINCT in the UPDATE join
);

\echo '✓ GRB tables created'

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Building Polygons indexes
CREATE INDEX IF NOT EXISTS idx_building_polygons_oidn ON grb.building_polygons(oidn);
CREATE INDEX IF NOT EXISTS idx_building_polygons_gebouw_id ON grb.building_polygons(gebouw_id) WHERE gebouw_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_building_polygons_type_code ON grb.building_polygons(type_code);
CREATE INDEX IF NOT EXISTS idx_building_polygons_type_label ON grb.building_polygons(type_label);
CREATE INDEX IF NOT EXISTS idx_building_polygons_imported ON grb.building_polygons(imported_at);
CREATE INDEX IF NOT EXISTS idx_building_polygons_geom ON grb.building_polygons USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_building_polygons_geom_mercator ON grb.building_polygons USING GIST(geom_mercator) WHERE geom_mercator IS NOT NULL;

-- Kunstwerken indexes
CREATE INDEX IF NOT EXISTS idx_kunstwerken_oidn ON grb.kunstwerken(oidn);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_type_code ON grb.kunstwerken(type_code);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_type_label ON grb.kunstwerken(type_label);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_survey_date ON grb.kunstwerken(survey_date);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_entity ON grb.kunstwerken(entity);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_imported ON grb.kunstwerken(imported_at);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_geom ON grb.kunstwerken USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_geom_mercator ON grb.kunstwerken USING GIST(geom_mercator) WHERE geom_mercator IS NOT NULL;

-- Buildings (aggregated) indexes
CREATE INDEX IF NOT EXISTS idx_buildings_type_label ON grb.buildings(type_label);
CREATE INDEX IF NOT EXISTS idx_buildings_polygon_count ON grb.buildings(polygon_count);
CREATE INDEX IF NOT EXISTS idx_buildings_total_area ON grb.buildings(total_area_m2);
CREATE INDEX IF NOT EXISTS idx_buildings_geom ON grb.buildings USING GIST(geom) WHERE geom IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_buildings_geom_mercator ON grb.buildings USING GIST(geom_mercator) WHERE geom_mercator IS NOT NULL;

-- Addresses indexes
CREATE INDEX IF NOT EXISTS idx_addresses_oidn ON grb.addresses(oidn);
CREATE INDEX IF NOT EXISTS idx_addresses_adres_id ON grb.addresses(adres_id);
CREATE INDEX IF NOT EXISTS idx_addresses_street_name ON grb.addresses(street_name);
CREATE INDEX IF NOT EXISTS idx_addresses_postcode ON grb.addresses(postcode);
CREATE INDEX IF NOT EXISTS idx_addresses_municipality ON grb.addresses(municipality);
CREATE INDEX IF NOT EXISTS idx_addresses_full_address ON grb.addresses(full_address);
CREATE INDEX IF NOT EXISTS idx_addresses_house_number ON grb.addresses(house_number);
CREATE INDEX IF NOT EXISTS idx_addresses_geom ON grb.addresses USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_addresses_geom_mercator ON grb.addresses USING GIST(geom_mercator) WHERE geom_mercator IS NOT NULL;

-- Address-Building Links indexes
CREATE INDEX IF NOT EXISTS idx_address_building_links_adres_id ON grb.address_building_links(adres_id);
CREATE INDEX IF NOT EXISTS idx_address_building_links_building_object_id ON grb.address_building_links(building_object_id);
CREATE INDEX IF NOT EXISTS idx_address_building_links_object_type ON grb.address_building_links(object_type);
-- Functional index for BIGINT cast used in buildings_with_addresses view join
CREATE INDEX IF NOT EXISTS idx_abl_building_obj_bigint ON grb.address_building_links ((building_object_id::bigint));

-- Polygon-Building Relationship indexes
CREATE INDEX IF NOT EXISTS idx_polygon_building_rel_oidn ON grb.polygon_building_rel(oidn);
CREATE INDEX IF NOT EXISTS idx_polygon_building_rel_gebouw_id ON grb.polygon_building_rel(gebouw_id);

-- ============================================================================
-- FOREIGN KEYS
-- ============================================================================

-- Building polygons -> Buildings
ALTER TABLE grb.building_polygons
    DROP CONSTRAINT IF EXISTS fk_building_polygons_gebouw_id,
    ADD CONSTRAINT fk_building_polygons_gebouw_id
    FOREIGN KEY (gebouw_id) REFERENCES grb.buildings(gebouw_id)
    ON DELETE SET NULL;

-- Address-Building Links -> Addresses
ALTER TABLE grb.address_building_links
    DROP CONSTRAINT IF EXISTS fk_address_building_links_adres_id,
    ADD CONSTRAINT fk_address_building_links_adres_id
    FOREIGN KEY (adres_id) REFERENCES grb.addresses(adres_id)
    ON DELETE CASCADE;

\echo '✓ Indexes and Foreign Keys created'

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Building Polygons trigger (auto-generate Web Mercator)
CREATE OR REPLACE FUNCTION update_building_polygon()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();

    -- Auto-generate Web Mercator geometry if missing
    IF NEW.geom IS NOT NULL AND NEW.geom_mercator IS NULL THEN
        NEW.geom_mercator = ST_Transform(NEW.geom, 3857);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER building_polygons_before_update
    BEFORE INSERT OR UPDATE ON grb.building_polygons
    FOR EACH ROW
    EXECUTE FUNCTION update_building_polygon();

-- Kunstwerken trigger (auto-generate Web Mercator)
CREATE OR REPLACE FUNCTION update_kunstwerk_polygon()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();

    IF NEW.geom IS NOT NULL AND NEW.geom_mercator IS NULL THEN
        NEW.geom_mercator = ST_Transform(NEW.geom, 3857);
    END IF;

    IF NEW.entity IS NULL OR NEW.entity = '' THEN
        NEW.entity = 'Knw';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kunstwerken_before_update
    BEFORE INSERT OR UPDATE ON grb.kunstwerken
    FOR EACH ROW
    EXECUTE FUNCTION update_kunstwerk_polygon();

-- Addresses trigger (auto-generate Web Mercator)
CREATE OR REPLACE FUNCTION update_address()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();

    -- Auto-generate Web Mercator geometry if missing
    IF NEW.geom IS NOT NULL AND NEW.geom_mercator IS NULL THEN
        NEW.geom_mercator = ST_Transform(NEW.geom, 3857);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER addresses_before_update
    BEFORE INSERT OR UPDATE ON grb.addresses
    FOR EACH ROW
    EXECUTE FUNCTION update_address();

-- Buildings (aggregated) trigger
CREATE OR REPLACE FUNCTION update_building()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();

    -- Auto-generate Web Mercator geometry if missing
    IF NEW.geom IS NOT NULL AND NEW.geom_mercator IS NULL THEN
        NEW.geom_mercator = ST_Transform(NEW.geom, 3857);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER buildings_before_update
    BEFORE INSERT OR UPDATE ON grb.buildings
    FOR EACH ROW
    EXECUTE FUNCTION update_building();

\echo '✓ Triggers created'

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Building polygons summary view
CREATE OR REPLACE VIEW grb.building_polygons_summary AS
SELECT
    type_label,
    COUNT(*) as polygon_count,
    COUNT(DISTINCT gebouw_id) as building_count,
    ROUND(AVG(area_m2)::numeric, 2) as avg_area_m2,
    ROUND(SUM(area_m2)::numeric, 2) as total_area_m2
FROM grb.building_polygons
WHERE gebouw_id IS NOT NULL
GROUP BY type_label
ORDER BY polygon_count DESC;

-- Addresses summary view
CREATE OR REPLACE VIEW grb.addresses_summary AS
SELECT
    municipality,
    postcode,
    COUNT(*) as address_count,
    COUNT(DISTINCT street_name) as street_count
FROM grb.addresses
GROUP BY municipality, postcode
ORDER BY municipality, postcode;

-- ============================================================================
-- MATERIALIZED VIEW: Building Polygons with Addresses and Parent Building Info
-- ============================================================================

-- This view joins building polygons with their addresses via spatial containment
-- (ST_Contains) and includes parent building aggregated stats for context.
-- Each row represents an individual polygon with oidn for OSM tagging.
--
-- Why spatial join instead of address_building_links?
-- The GEBOUWID in RltAdresGebouw (address links) uses a different ID namespace
-- than the GEBOUWID in RltGbgGebouw (polygon-building relationships), resulting
-- in only ~5% match rate. Spatial join reliably matches addresses to the polygon
-- that physically contains them. See docs/GRB_ADDRESS_JOIN.md for details.
DROP MATERIALIZED VIEW IF EXISTS grb.buildings_with_addresses CASCADE;

CREATE MATERIALIZED VIEW grb.buildings_with_addresses AS
-- Pre-aggregate addresses per polygon via spatial containment.
-- GIST indexes on both building_polygons.geom and addresses.geom make this efficient.
WITH addr_per_polygon AS (
    SELECT
        bp.oidn,
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
    GROUP BY bp.oidn
)
SELECT
    -- Polygon-level info (for OSM tagging with source:geometry:oidn)
    -- Cast oidn to BIGINT for Martin tile server (source is numeric(15,0))
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
    LEFT JOIN addr_per_polygon app ON bp.oidn = app.oidn;

-- Indexes on materialized view
CREATE UNIQUE INDEX idx_mv_buildings_with_addresses_oidn ON grb.buildings_with_addresses(oidn);
CREATE INDEX idx_mv_buildings_with_addresses_gebouw_id ON grb.buildings_with_addresses(gebouw_id);
CREATE INDEX idx_mv_buildings_with_addresses_polygon_type ON grb.buildings_with_addresses(polygon_type_label);
CREATE INDEX idx_mv_buildings_with_addresses_geom ON grb.buildings_with_addresses USING GIST(geom);
CREATE INDEX idx_mv_buildings_with_addresses_postcodes ON grb.buildings_with_addresses USING GIN(postcodes);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_buildings_with_addresses()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY grb.buildings_with_addresses;
END;
$$ LANGUAGE plpgsql;

\echo '✓ Views and Materialized View created'

-- Import statistics table (simplified)
CREATE TABLE IF NOT EXISTS grb.import_statistics (
    id SERIAL PRIMARY KEY,
    import_date TIMESTAMPTZ DEFAULT NOW(),
    source_file VARCHAR(255),
    buildings_count INTEGER,
    processing_time_seconds INTEGER,
    metadata JSONB
);

\echo '✓ Import statistics table created'

-- ============================================================================
-- DOCUMENTATION COMMENTS
-- ============================================================================

-- New normalized schema
COMMENT ON TABLE grb.building_polygons IS 'GRB building polygons (GBG) - 5M+ individual polygon geometries';
COMMENT ON COLUMN grb.building_polygons.oidn IS 'Unique polygon identifier from GRB';
COMMENT ON COLUMN grb.building_polygons.gebouw_id IS 'Building ID - one building can have multiple polygons';
COMMENT ON COLUMN grb.building_polygons.geom IS 'Geometry in WGS84 (EPSG:4326)';

COMMENT ON TABLE grb.kunstwerken IS 'GRB kunstwerken geometries (KNW) - non-building structures for OSM import support';
COMMENT ON COLUMN grb.kunstwerken.oidn IS 'Unique kunstwerk identifier from GRB';
COMMENT ON COLUMN grb.kunstwerken.type_label IS 'Kunstwerk type label (LBLTYPE)';
COMMENT ON COLUMN grb.kunstwerken.entity IS 'Source geometry entity identifier (Knw)';
COMMENT ON COLUMN grb.kunstwerken.geom IS 'Geometry in WGS84 (EPSG:4326)';

COMMENT ON TABLE grb.buildings IS 'GRB buildings (aggregated) - logical buildings with multiple polygons unified';
COMMENT ON COLUMN grb.buildings.gebouw_id IS 'Building ID from RltGbgGebouw relationship table';
COMMENT ON COLUMN grb.buildings.geom IS 'MultiPolygon geometry (union of all building polygons)';

COMMENT ON TABLE grb.addresses IS 'GRAR address points - 1.3M+ addresses with full metadata';
COMMENT ON COLUMN grb.addresses.adres_id IS 'Unique address identifier from GRAR';
COMMENT ON COLUMN grb.addresses.full_address IS 'Complete formatted address string';
COMMENT ON COLUMN grb.addresses.geom IS 'Point geometry in WGS84 (EPSG:4326)';

COMMENT ON TABLE grb.address_building_links IS 'Links between addresses and building objects - 3.9M+ links';
COMMENT ON COLUMN grb.address_building_links.adres_id IS 'Address ID (foreign key to addresses.adres_id)';
COMMENT ON COLUMN grb.address_building_links.building_object_id IS 'Building ID (GEBOUWID) — links to buildings.gebouw_id and building_polygons.gebouw_id';

\echo ''
\echo '======================================'
\echo 'BE2OSM schema setup complete!'
\echo ''
\echo 'Key features:'
\echo '  ✓ Normalized GRB schema (building_polygons, buildings, addresses, address_building_links)'
\echo '  ✓ WGS84 geometry (EPSG:4326) for all spatial data'
\echo '  ✓ Auto-generated Web Mercator (EPSG:3857) for tile serving'
\echo '  ✓ Foreign key relationships between tables'
\echo '  ✓ Materialized view for buildings with addresses'
\echo '  ✓ Comprehensive indexes on all key fields'
\echo '  ✓ Spatial indexes (GIST) on all geometries'

\echo ''
\echo 'Schema created:'
\echo '  - grb (GRB data schema)'
\echo ''
\echo 'Tables created:'
\echo '  - grb.building_polygons (5M+ building polygon geometries from GBG)'
\echo '  - grb.kunstwerken (KNW structures for non-building imports)'
\echo '  - grb.buildings (aggregated buildings with unified geometries)'
\echo '  - grb.addresses (1.3M+ GRAR address points)'
\echo '  - grb.address_building_links (3.9M+ address-building relationships)'
\echo '  - grb.import_statistics'
\echo ''
\echo 'Views created:'
\echo '  - grb.building_polygons_summary'
\echo '  - grb.addresses_summary'
\echo ''
\echo 'Materialized View created:'
\echo '  - grb.buildings_with_addresses'
\echo '    (denormalized view: building polygons + parent building stats + addresses)'
\echo '    - Polygon-level: oidn, polygon_area_m2, polygon_type_label'
\echo '    - Building-level: polygon_count, building_total_area_m2, building_type_label'
\echo '    - Addresses: arrays of full_address, street_names, postcodes, municipalities'
\echo '    Refresh with: SELECT refresh_buildings_with_addresses();'
\echo ''
\echo 'Data Model:'
\echo '  building_polygons.gebouw_id → buildings.gebouw_id (FK)'
\echo '  address_building_links.adres_id → addresses.adres_id (FK)'
\echo ''
\echo 'Next steps:'
\echo '  1. Run import tasks: just grb-full (from processing folder)'
\echo '  2. 04-setup-fdw.sql runs automatically next'
\echo '======================================'
