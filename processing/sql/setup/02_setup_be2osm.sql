-- BE2OSM Database Schema Setup
-- GRB Buildings in OSM-like format
-- Run this on the be2osm database

\c be2osm

\echo '======================================'
\echo 'BE2OSM Schema Setup (OSM Format)'
\echo '======================================'
\echo ''

-- Create schema for GRB buildings
CREATE SCHEMA IF NOT EXISTS grb;

\echo '✓ GRB schema created'

-- Legacy buildings table (GRB data in OSM format) - keeping for backward compatibility
CREATE TABLE IF NOT EXISTS grb.buildings_legacy (
    -- Internal primary key
    id BIGSERIAL PRIMARY KEY,

    -- OSM-compatible fields (for round-trip compatibility)
    osm_id BIGINT,                    -- Negative for generated IDs, positive if from OSM
    version INTEGER DEFAULT 1,        -- OSM version number
    changeset BIGINT,                 -- OSM changeset ID
    timestamp TIMESTAMPTZ DEFAULT NOW(), -- Last modification time
    uid INTEGER,                      -- OSM user ID
    "user" VARCHAR(255),              -- OSM username

    -- Quick lookup fields (indexed for performance, cached from tags)
    oidn VARCHAR(50),                 -- GRB unique identifier (from tags->>'source:geometry:oidn')
    building_type VARCHAR(100),       -- Cached from tags->>'building'

    -- All properties stored as JSONB (OSM-style tags)
    -- This includes all GRB properties: building, LBLTYPE, addr:*, source:geometry:*, etc.
    tags JSONB NOT NULL DEFAULT '{}',

    -- Geometry (WGS84 - EPSG:4326, like .osm files)
    geom GEOMETRY(Polygon, 4326),

    -- Optional: Web Mercator for tile serving (EPSG:3857)
    geom_mercator GEOMETRY(Polygon, 3857),

    -- Import tracking
    source_file VARCHAR(255),         -- Source shapefile name
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- NEW NORMALIZED GRB SCHEMA
-- ============================================================================

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
    id BIGSERIAL PRIMARY KEY,

    -- Relationship fields (from RltGbgGebouw.dbf)
    oidn BIGINT NOT NULL,             -- Polygon OIDN (links to building_polygons.oidn)
    gebouw_id BIGINT NOT NULL,        -- Building ID (the logical building this polygon belongs to)

    -- Import tracking
    imported_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one-to-one mapping
    CONSTRAINT uq_polygon_building_rel_oidn UNIQUE (oidn)
);

\echo '✓ GRB tables created'

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Legacy buildings table indexes
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_osm_id ON grb.buildings_legacy(osm_id) WHERE osm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_oidn ON grb.buildings_legacy(oidn) WHERE oidn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_building_type ON grb.buildings_legacy(building_type);
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_changeset ON grb.buildings_legacy(changeset) WHERE changeset IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_timestamp ON grb.buildings_legacy(timestamp);
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_imported ON grb.buildings_legacy(imported_at);
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_source_file ON grb.buildings_legacy(source_file);
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_tags ON grb.buildings_legacy USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_tag_postcode ON grb.buildings_legacy ((tags->>'addr:postcode'));
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_tag_street ON grb.buildings_legacy ((tags->>'addr:street'));
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_tag_source_ref ON grb.buildings_legacy ((tags->>'source:geometry:ref')) WHERE tags ? 'source:geometry:ref';
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_tag_source_date ON grb.buildings_legacy ((tags->>'source:geometry:date'));
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_tag_lbltype ON grb.buildings_legacy ((tags->>'LBLTYPE'));
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_geom ON grb.buildings_legacy USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_grb_buildings_legacy_geom_mercator ON grb.buildings_legacy USING GIST(geom_mercator) WHERE geom_mercator IS NOT NULL;

-- Building Polygons indexes
CREATE INDEX IF NOT EXISTS idx_building_polygons_oidn ON grb.building_polygons(oidn);
CREATE INDEX IF NOT EXISTS idx_building_polygons_gebouw_id ON grb.building_polygons(gebouw_id) WHERE gebouw_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_building_polygons_type_code ON grb.building_polygons(type_code);
CREATE INDEX IF NOT EXISTS idx_building_polygons_type_label ON grb.building_polygons(type_label);
CREATE INDEX IF NOT EXISTS idx_building_polygons_imported ON grb.building_polygons(imported_at);
CREATE INDEX IF NOT EXISTS idx_building_polygons_geom ON grb.building_polygons USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_building_polygons_geom_mercator ON grb.building_polygons USING GIST(geom_mercator) WHERE geom_mercator IS NOT NULL;

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

-- Legacy buildings table trigger
CREATE OR REPLACE FUNCTION update_buildings_legacy_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.timestamp = NOW();

    -- Auto-extract commonly queried fields from tags
    NEW.oidn = NEW.tags->>'source:geometry:oidn';
    NEW.building_type = NEW.tags->>'building';

    -- Auto-generate Web Mercator geometry if missing
    IF NEW.geom IS NOT NULL AND NEW.geom_mercator IS NULL THEN
        NEW.geom_mercator = ST_Transform(NEW.geom, 3857);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER grb_buildings_legacy_before_update
    BEFORE INSERT OR UPDATE ON grb.buildings_legacy
    FOR EACH ROW
    EXECUTE FUNCTION update_buildings_legacy_timestamp();

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

-- Legacy buildings summary view
CREATE OR REPLACE VIEW grb.buildings_legacy_summary AS
SELECT
    tags->>'building' as building_type,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE osm_id IS NOT NULL) as from_osm,
    COUNT(*) FILTER (WHERE tags ? 'source:geometry:oidn') as from_grb,
    MIN(timestamp) as oldest,
    MAX(timestamp) as newest
FROM grb.buildings_legacy
GROUP BY tags->>'building'
ORDER BY count DESC;

-- Legacy buildings with addresses view
CREATE OR REPLACE VIEW grb.buildings_legacy_with_addresses AS
SELECT
    id,
    osm_id,
    tags->>'building' as building,
    tags->>'addr:street' as street,
    tags->>'addr:housenumber' as housenumber,
    tags->>'addr:postcode' as postcode,
    tags->>'addr:city' as city,
    tags->>'source:geometry:ref' as grb_ref,
    geom
FROM grb.buildings_legacy
WHERE tags ? 'addr:street';

-- Recent imports view
CREATE OR REPLACE VIEW grb.recent_imports AS
SELECT
    source_file,
    COUNT(*) as buildings,
    MIN(imported_at) as import_started,
    MAX(imported_at) as import_completed,
    COUNT(*) FILTER (WHERE tags ? 'source:geometry:oidn') as grb_buildings
FROM grb.buildings_legacy
GROUP BY source_file
ORDER BY MAX(imported_at) DESC
LIMIT 20;

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

-- This view joins building polygons with their addresses via spatial proximity
-- and includes parent building aggregated stats for context
-- Each row represents an individual polygon with oidn for OSM tagging
DROP MATERIALIZED VIEW IF EXISTS grb.buildings_with_addresses CASCADE;

CREATE MATERIALIZED VIEW grb.buildings_with_addresses AS
SELECT
    -- Polygon-level info (for OSM tagging with source:geometry:oidn)
    -- Cast oidn to BIGINT for Martin tile server (source is numeric(15,0))
    bp.oidn::BIGINT as oidn,
    bp.gebouw_id,
    bp.area_m2::REAL as polygon_area_m2,
    bp.type_label as polygon_type_label,

    -- Survey date for source:geometry:date OSM tag (format: YYYY-MM-DD)
    TO_CHAR(bp.survey_date, 'YYYY-MM-DD') as survey_date,

    -- Transform to Web Mercator for tile serving (transform once at view creation, not per tile)
    ST_Transform(bp.geom, 3857) as geom,

    -- Parent building aggregated stats (for context)
    b.polygon_count,
    b.total_area_m2,
    b.type_label as building_type_label,

    -- Convert arrays to comma-separated strings for MVT compatibility
    array_to_string(ARRAY_AGG(DISTINCT a.full_address ORDER BY a.full_address) FILTER (WHERE a.full_address IS NOT NULL), '; ') as addresses,
    array_to_string(ARRAY_AGG(DISTINCT a.street_name ORDER BY a.street_name) FILTER (WHERE a.street_name IS NOT NULL), ', ') as street_names,
    array_to_string(ARRAY_AGG(DISTINCT a.postcode ORDER BY a.postcode) FILTER (WHERE a.postcode IS NOT NULL), ', ') as postcodes,
    array_to_string(ARRAY_AGG(DISTINCT a.municipality ORDER BY a.municipality) FILTER (WHERE a.municipality IS NOT NULL), ', ') as municipalities,

    -- Address count
    COUNT(DISTINCT a.adres_id) as address_count
FROM
    grb.building_polygons bp
    LEFT JOIN grb.buildings b ON bp.gebouw_id = b.gebouw_id
    LEFT JOIN grb.addresses a ON ST_DWithin(a.geom, bp.geom, 0.0001)  -- ~10m buffer for spatial proximity
GROUP BY
    bp.oidn,
    bp.gebouw_id,
    bp.area_m2,
    bp.type_label,
    bp.survey_date,
    bp.geom,
    b.polygon_count,
    b.total_area_m2,
    b.type_label;

-- Indexes on materialized view
CREATE INDEX idx_mv_buildings_with_addresses_oidn ON grb.buildings_with_addresses(oidn);
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
CREATE TABLE IF NOT EXISTS import_statistics (
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

COMMENT ON TABLE grb.buildings IS 'GRB buildings (aggregated) - logical buildings with multiple polygons unified';
COMMENT ON COLUMN grb.buildings.gebouw_id IS 'Building ID from RltGbgGebouw relationship table';
COMMENT ON COLUMN grb.buildings.geom IS 'MultiPolygon geometry (union of all building polygons)';

COMMENT ON TABLE grb.addresses IS 'GRAR address points - 1.3M+ addresses with full metadata';
COMMENT ON COLUMN grb.addresses.adres_id IS 'Unique address identifier from GRAR';
COMMENT ON COLUMN grb.addresses.full_address IS 'Complete formatted address string';
COMMENT ON COLUMN grb.addresses.geom IS 'Point geometry in WGS84 (EPSG:4326)';

COMMENT ON TABLE grb.address_building_links IS 'Links between addresses and building objects - 3.9M+ links';
COMMENT ON COLUMN grb.address_building_links.adres_id IS 'Address ID (foreign key to addresses.adres_id)';
COMMENT ON COLUMN grb.address_building_links.building_object_id IS 'Building object ID (Gebouweenheid)';

-- Legacy table
COMMENT ON TABLE grb.buildings_legacy IS 'LEGACY: GRB buildings in OSM format (id, version, changeset, timestamp, user, tags as JSONB) - use new normalized schema instead';
COMMENT ON COLUMN grb.buildings_legacy.osm_id IS 'OSM element ID (negative for generated, positive for actual OSM)';
COMMENT ON COLUMN grb.buildings_legacy.tags IS 'All properties as JSONB (building, addr:*, source:geometry:*, LBLTYPE, etc.)';
COMMENT ON COLUMN grb.buildings_legacy.geom IS 'Geometry in WGS84 (EPSG:4326) - matches .osm file format';
COMMENT ON COLUMN grb.buildings_legacy.geom_mercator IS 'Auto-generated Web Mercator (EPSG:3857) for tile serving';

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
\echo '  ✓ Legacy OSM-compatible table (buildings_legacy) for backward compatibility'
\echo ''
\echo 'Schema created:'
\echo '  - grb (GRB data schema)'
\echo ''
\echo 'Tables created:'
\echo '  - grb.building_polygons (5M+ building polygon geometries from GBG)'
\echo '  - grb.buildings (aggregated buildings with unified geometries)'
\echo '  - grb.addresses (1.3M+ GRAR address points)'
\echo '  - grb.address_building_links (3.9M+ address-building relationships)'
\echo '  - grb.buildings_legacy (legacy OSM-format table)'
\echo '  - import_statistics'
\echo ''
\echo 'Views created:'
\echo '  - grb.building_polygons_summary'
\echo '  - grb.addresses_summary'
\echo '  - grb.buildings_legacy_summary'
\echo '  - grb.buildings_legacy_with_addresses'
\echo '  - grb.recent_imports'
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
\echo '  1. Run import tasks: just --justfile grb-justfile import-all'
\echo '  2. Run 04_foreign_data_wrapper.sql to access OSM data'
\echo '======================================'
