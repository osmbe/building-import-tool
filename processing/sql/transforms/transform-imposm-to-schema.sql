-- Transform imposm3 import data to match osm.osm_buildings schema
-- This script moves data from import.osm_buildings (imposm format) to osm.osm_buildings (our schema)

\echo '========================================'
\echo 'Transforming imposm3 data to OSM schema'
\echo '========================================'
\echo ''

-- First, backup existing osm schema if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'osm') THEN
        EXECUTE 'DROP SCHEMA IF EXISTS osm_backup CASCADE';
        EXECUTE 'CREATE SCHEMA osm_backup';
        EXECUTE 'CREATE TABLE osm_backup.osm_buildings AS SELECT * FROM osm.osm_buildings';
        RAISE NOTICE 'Backed up existing osm schema to osm_backup';
    END IF;
END $$;

\echo '✓ Backup created (if needed)'

-- Ensure osm schema exists
CREATE SCHEMA IF NOT EXISTS osm;

\echo '✓ OSM schema ready'

-- Drop and recreate osm.osm_buildings table (will be repopulated from import schema)
DROP TABLE IF EXISTS osm.osm_buildings CASCADE;

CREATE TABLE osm.osm_buildings (
    -- Internal primary key
    id BIGSERIAL PRIMARY KEY,

    -- OSM element ID
    osm_id BIGINT NOT NULL UNIQUE,

    -- Building data
    building_type VARCHAR(100),
    oidn VARCHAR(50),

    -- All tags stored as JSONB
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

\echo '✓ Table created'

-- Transform and insert data from imposm import schema
INSERT INTO osm.osm_buildings (
    osm_id,
    building_type,
    oidn,
    tags,
    geom,
    source_file
)
SELECT
    osm_id,
    building_type,
    oidn,
    -- Convert hstore to JSONB
    CASE
        WHEN tags IS NOT NULL THEN hstore_to_jsonb(tags)
        ELSE '{}'::jsonb
    END,
    -- imposm uses Web Mercator (3857), we need WGS84 (4326)
    ST_Transform(geometry, 4326),
    'belgium-latest.osm.pbf'
FROM import.osm_buildings;

\echo '✓ Data transformed and inserted'

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_osm_buildings_oidn ON osm.osm_buildings(oidn) WHERE oidn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_buildings_building_type ON osm.osm_buildings(building_type);
CREATE INDEX IF NOT EXISTS idx_osm_buildings_imported ON osm.osm_buildings(imported_at);
CREATE INDEX IF NOT EXISTS idx_osm_buildings_source_file ON osm.osm_buildings(source_file);

-- JSONB index for tag queries
CREATE INDEX IF NOT EXISTS idx_osm_buildings_tags ON osm.osm_buildings USING GIN(tags);

-- Specific tag indexes
CREATE INDEX IF NOT EXISTS idx_osm_buildings_tag_building ON osm.osm_buildings ((tags->>'building'));
CREATE INDEX IF NOT EXISTS idx_osm_buildings_tag_postcode ON osm.osm_buildings ((tags->>'addr:postcode'));
CREATE INDEX IF NOT EXISTS idx_osm_buildings_tag_street ON osm.osm_buildings ((tags->>'addr:street'));
CREATE INDEX IF NOT EXISTS idx_osm_buildings_tag_grb_ref ON osm.osm_buildings ((tags->>'source:geometry:ref'))
    WHERE tags ? 'source:geometry:ref';
CREATE INDEX IF NOT EXISTS idx_osm_buildings_tag_grb_oidn ON osm.osm_buildings ((tags->>'source:geometry:oidn'))
    WHERE tags ? 'source:geometry:oidn';

-- Spatial indexes
CREATE INDEX IF NOT EXISTS idx_osm_buildings_geom ON osm.osm_buildings USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_osm_buildings_geom_mercator ON osm.osm_buildings USING GIST(geom_mercator)
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

DROP TRIGGER IF EXISTS osm_buildings_before_update ON osm.osm_buildings;
CREATE TRIGGER osm_buildings_before_update
    BEFORE INSERT OR UPDATE ON osm.osm_buildings
    FOR EACH ROW
    EXECUTE FUNCTION update_osm_buildings();

\echo '✓ Triggers created'

-- Update geom_mercator for all rows
UPDATE osm.osm_buildings
SET geom_mercator = ST_Transform(geom, 3857)
WHERE geom IS NOT NULL AND geom_mercator IS NULL;

\echo '✓ Web Mercator geometries generated'

-- Import addresses from imposm schema (if available)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'import' AND table_name = 'osm_addresses') THEN
        RAISE NOTICE 'Importing OSM addresses...';

        -- Drop and recreate addresses table with proper schema
        DROP TABLE IF EXISTS osm.osm_addresses CASCADE;

        CREATE TABLE osm.osm_addresses (
            id BIGSERIAL PRIMARY KEY,
            osm_id BIGINT NOT NULL UNIQUE,
            housenumber TEXT,
            street TEXT,
            postcode TEXT,
            city TEXT,
            tags JSONB NOT NULL DEFAULT '{}',
            geom GEOMETRY(Point, 4326),
            imported_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Truncate and reimport
        TRUNCATE osm.osm_addresses;

        INSERT INTO osm.osm_addresses (osm_id, housenumber, street, postcode, city, tags, geom)
        SELECT
            osm_id,
            housenumber,
            street,
            postcode,
            city,
            CASE
                WHEN tags IS NOT NULL THEN hstore_to_jsonb(tags)
                ELSE '{}'::jsonb
            END,
            ST_Transform(geometry, 4326)
        FROM import.osm_addresses;

        -- Create spatial index
        CREATE INDEX IF NOT EXISTS idx_osm_addresses_geom ON osm.osm_addresses USING GIST(geom);
        CREATE INDEX IF NOT EXISTS idx_osm_addresses_street ON osm.osm_addresses(street);
        CREATE INDEX IF NOT EXISTS idx_osm_addresses_postcode ON osm.osm_addresses(postcode);

        RAISE NOTICE 'Address import complete: % addresses imported', (SELECT COUNT(*) FROM osm.osm_addresses);
    ELSE
        RAISE NOTICE 'No address data found in import schema - skipping address import';
    END IF;
END $$;

\echo '✓ Addresses imported (if available)'

-- Spatially join addresses to buildings and update building tags
DO $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'osm' AND table_name = 'osm_addresses') THEN
        RAISE NOTICE 'Spatially joining addresses to buildings (exact intersection)...';

        -- For each building, find addresses that intersect (are contained within) the building polygon
        WITH building_addresses AS (
            SELECT DISTINCT ON (b.osm_id)
                b.osm_id,
                a.tags
            FROM osm.osm_buildings b
            JOIN osm.osm_addresses a ON ST_Contains(b.geom, a.geom)
            WHERE a.tags IS NOT NULL AND a.tags != '{}'::jsonb
            ORDER BY b.osm_id, a.osm_id
        )
        UPDATE osm.osm_buildings b
        SET tags = b.tags || ba.tags
        FROM building_addresses ba
        WHERE b.osm_id = ba.osm_id;

        GET DIAGNOSTICS updated_count = ROW_COUNT;
        RAISE NOTICE 'Updated % buildings with address tags', updated_count;
    END IF;
END $$;

\echo '✓ Address tags merged into buildings'

-- Analyze table for query optimization
ANALYZE osm.osm_buildings;

\echo '✓ Table analyzed'
\echo ''
\echo '========================================'
\echo 'Transformation complete!'
\echo ''

-- Show statistics
SELECT
    'Total buildings' as metric,
    COUNT(*)::text as count
FROM osm.osm_buildings
UNION ALL
SELECT
    'With GRB OIDN' as metric,
    COUNT(*)::text as count
FROM osm.osm_buildings
WHERE oidn IS NOT NULL
UNION ALL
SELECT
    'With GRB reference' as metric,
    COUNT(*)::text as count
FROM osm.osm_buildings
WHERE tags ? 'source:geometry:ref'
UNION ALL
SELECT
    'With addresses' as metric,
    COUNT(*)::text as count
FROM osm.osm_buildings
WHERE tags ? 'addr:street'
UNION ALL
SELECT
    'Unique building types' as metric,
    COUNT(DISTINCT building_type)::text as count
FROM osm.osm_buildings;

\echo ''
\echo '========================================'
