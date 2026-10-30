-- OSM Database Schema Setup
-- OSM-like structure matching .osm file format
-- Run this on the osmbe database

\c osmbe

\echo '======================================'
\echo 'OSMBE Schema Setup (OSM Format)'
\echo '======================================'
\echo ''

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;

\echo '✓ Extensions enabled'

-- Ensure schemas exist
CREATE SCHEMA IF NOT EXISTS osm;
CREATE SCHEMA IF NOT EXISTS import;

\echo '✓ Schemas created (osm, import)'

-- OSM Buildings table with JSONB tags
-- Imported from OSM via imposm3
CREATE TABLE IF NOT EXISTS osm.osm_buildings (
    -- Internal primary key
    id BIGSERIAL PRIMARY KEY,

    -- OSM element ID
    osm_id BIGINT NOT NULL UNIQUE,

    -- Building data
    building_type VARCHAR(100),
    oidn VARCHAR(50),

    -- All tags stored as JSONB (building, addr:*, source:*, name, etc.)
    tags JSONB NOT NULL DEFAULT '{}',

    -- Geometry (WGS84 - EPSG:4326)
    geom GEOMETRY(Geometry, 4326),

    -- Web Mercator for tile serving (auto-generated)
    geom_mercator GEOMETRY(Geometry, 3857),

    -- Import tracking
    source_file VARCHAR(255),
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

\echo '✓ OSM buildings table created (OSM format)'

-- OSM Addresses table
-- Imported from OSM via imposm3 (addr:* tags)
CREATE TABLE IF NOT EXISTS osm.osm_addresses (
    -- Internal primary key
    id BIGSERIAL PRIMARY KEY,

    -- OSM element ID
    osm_id BIGINT NOT NULL UNIQUE,

    -- Address fields
    housenumber TEXT,
    street TEXT,
    postcode TEXT,
    city TEXT,

    -- All tags stored as JSONB
    tags JSONB NOT NULL DEFAULT '{}',

    -- Geometry (WGS84 - EPSG:4326)
    geom GEOMETRY(Point, 4326),

    -- Import tracking
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

\echo '✓ OSM addresses table created'

-- Indexes for addresses
CREATE INDEX IF NOT EXISTS idx_osm_addresses_geom ON osm.osm_addresses USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_osm_addresses_street ON osm.osm_addresses(street);
CREATE INDEX IF NOT EXISTS idx_osm_addresses_postcode ON osm.osm_addresses(postcode);
CREATE INDEX IF NOT EXISTS idx_osm_addresses_tags ON osm.osm_addresses USING GIN(tags);

\echo '✓ Address indexes created'

-- Indexes for performance (osm_id already has unique index)
CREATE INDEX idx_osm_buildings_imported ON osm.osm_buildings(imported_at);

-- JSONB index for tag queries
CREATE INDEX idx_osm_buildings_tags ON osm.osm_buildings USING GIN(tags);

-- Specific tag indexes for common queries
CREATE INDEX idx_osm_buildings_tag_building ON osm.osm_buildings ((tags->>'building'));
CREATE INDEX idx_osm_buildings_tag_postcode ON osm.osm_buildings ((tags->>'addr:postcode'));
CREATE INDEX idx_osm_buildings_tag_street ON osm.osm_buildings ((tags->>'addr:street'));
CREATE INDEX idx_osm_buildings_tag_grb_ref ON osm.osm_buildings ((tags->>'source:geometry:ref'))
    WHERE tags ? 'source:geometry:ref';
CREATE INDEX idx_osm_buildings_tag_grb_oidn ON osm.osm_buildings ((tags->>'source:geometry:oidn'))
    WHERE tags ? 'source:geometry:oidn';

-- Spatial indexes
CREATE INDEX idx_osm_buildings_geom ON osm.osm_buildings USING GIST(geom);
CREATE INDEX idx_osm_buildings_geom_mercator ON osm.osm_buildings USING GIST(geom_mercator)
    WHERE geom_mercator IS NOT NULL;

\echo '✓ Indexes created'

-- Trigger to auto-update timestamps and Web Mercator geometry
CREATE OR REPLACE FUNCTION update_osm_buildings()
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

CREATE TRIGGER osm_buildings_before_update
    BEFORE INSERT OR UPDATE ON osm.osm_buildings
    FOR EACH ROW
    EXECUTE FUNCTION update_osm_buildings();

\echo '✓ Triggers created'

-- Useful views
CREATE OR REPLACE VIEW osm.buildings_with_grb_source AS
SELECT
    id,
    osm_id,
    tags->>'building' as building,
    tags->>'source:geometry:ref' as grb_ref,
    tags->>'source:geometry:oidn' as grb_oidn,
    tags->>'source:geometry:date' as grb_date,
    tags,
    geom
FROM osm.osm_buildings
WHERE tags ? 'source:geometry:ref'
    OR tags ? 'source:geometry:oidn'
    OR tags ? 'ref:be:grb';

CREATE OR REPLACE VIEW osm.buildings_summary AS
SELECT
    tags->>'building' as building_type,
    COUNT(*) as count,
    COUNT(*) FILTER (WHERE tags ? 'source:geometry:ref') as with_grb_ref
FROM osm.osm_buildings
GROUP BY tags->>'building'
ORDER BY count DESC;

CREATE OR REPLACE VIEW osm.buildings_with_addresses AS
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
FROM osm.osm_buildings
WHERE tags ? 'addr:street';

\echo '✓ Views created'

-- Import tracking table
CREATE TABLE IF NOT EXISTS osm.import_log (
    id SERIAL PRIMARY KEY,
    import_date TIMESTAMPTZ DEFAULT NOW(),
    import_type VARCHAR(20), -- 'initial', 'update', 'grb'
    source_file VARCHAR(255),
    buildings_before BIGINT,
    buildings_after BIGINT,
    buildings_added BIGINT,
    buildings_modified BIGINT,
    buildings_deleted BIGINT,
    processing_time_seconds INTEGER,
    metadata JSONB,
    notes TEXT
);

\echo '✓ Import log table created'

-- Comments for documentation
COMMENT ON TABLE osm.osm_buildings IS 'OSM buildings imported via imposm3 with JSONB tags';
COMMENT ON COLUMN osm.osm_buildings.osm_id IS 'OSM element ID';
COMMENT ON COLUMN osm.osm_buildings.tags IS 'All OSM tags as JSONB (building, addr:*, source:*, etc.)';
COMMENT ON COLUMN osm.osm_buildings.geom IS 'Geometry in WGS84 (EPSG:4326)';
COMMENT ON COLUMN osm.osm_buildings.geom_mercator IS 'Auto-generated Web Mercator (EPSG:3857) for tile serving';

\echo ''
\echo '======================================'
\echo 'OSMBE schema setup complete!'
\echo ''
\echo 'Key features:'
\echo '  ✓ OSM buildings with JSONB tags'
\echo '  ✓ All properties in JSONB tags (like .osm files)'
\echo '  ✓ WGS84 geometry (EPSG:4326, like .osm files)'
\echo '  ✓ Auto-generated Web Mercator for tile serving'
\echo '  ✓ GIN index on tags for fast JSONB queries'
\echo ''
\echo 'Tables created:'
\echo '  - osm.osm_buildings (OSM format with JSONB tags)'
\echo '  - osm.osm_addresses (OSM addresses with addr:* tags)'
\echo '  - osm.import_log'
\echo ''
\echo 'Views created:'
\echo '  - osm.buildings_with_grb_source'
\echo '  - osm.buildings_summary'
\echo '  - osm.buildings_with_addresses'
\echo ''
\echo 'Next: Run 05_foreign_data_wrapper.sql'
\echo '======================================'
