-- Foreign Data Wrapper Setup
-- Connects be2osm database to osmbe database for seamless querying
-- Run this on the be2osm database

\c be2osm

\echo '======================================'
\echo 'Foreign Data Wrapper Setup'
\echo '======================================'
\echo ''

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

\echo '✓ Extensions enabled (hstore, postgres_fdw)'

-- Drop existing server if it exists
DROP SERVER IF EXISTS osmbe_server CASCADE;

-- Create foreign server connection to osmbe database
-- Both databases are on the same PostgreSQL instance
CREATE SERVER osmbe_server
    FOREIGN DATA WRAPPER postgres_fdw
    OPTIONS (dbname 'osmbe');

\echo '✓ Foreign server created (osmbe_server)'

-- Create user mapping
-- Replace 'CURRENT_USER' with your actual username if needed
CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
    SERVER osmbe_server;

\echo '✓ User mapping created'

-- Create schema to hold foreign tables
CREATE SCHEMA IF NOT EXISTS osm;

\echo '✓ Schema created (osm)'

-- Import the osm_buildings table from osmbe database
IMPORT FOREIGN SCHEMA osm LIMIT TO (osm_buildings)
    FROM SERVER osmbe_server INTO osm;

\echo '✓ Foreign table imported (osm.osm_buildings)'

-- Create local cache table for OSM buildings with GRB references
-- This dramatically improves performance for sync operations
CREATE TABLE IF NOT EXISTS osm_buildings_cache AS
SELECT
    osm_id,
    building_type,
    oidn,
    tags,
    geom,
    geom_mercator,
    source_file,
    imported_at,
    updated_at
FROM osm.osm_buildings
WHERE tags ? 'ref:be:grb'
   OR tags ? 'source:geometry:oidn'
   OR oidn IS NOT NULL
LIMIT 0;  -- Create structure only, will be populated by sync script

\echo '✓ OSM buildings cache table created (empty)'

-- Indexes on cache table
CREATE INDEX IF NOT EXISTS idx_osm_cache_osm_id ON osm_buildings_cache(osm_id);
CREATE INDEX IF NOT EXISTS idx_osm_cache_oidn ON osm_buildings_cache(oidn) WHERE oidn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osm_cache_tags ON osm_buildings_cache USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_osm_cache_geom ON osm_buildings_cache USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_osm_cache_geom_mercator ON osm_buildings_cache USING GIST(geom_mercator);

\echo '✓ Cache table indexes created'

-- Function to refresh OSM cache
CREATE OR REPLACE FUNCTION refresh_osm_cache()
RETURNS TABLE(
    buildings_cached BIGINT,
    duration_seconds NUMERIC
) AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    rows_cached BIGINT;
BEGIN
    start_time := clock_timestamp();

    -- Truncate and repopulate cache
    TRUNCATE osm_buildings_cache;

    INSERT INTO osm_buildings_cache
    SELECT
        osm_id,
        building_type,
        oidn,
        tags,
        geom,
        geom_mercator,
        source_file,
        imported_at,
        updated_at
    FROM osm.osm_buildings
    WHERE tags ? 'ref:be:grb'
       OR tags ? 'source:geometry:oidn'
       OR oidn IS NOT NULL;

    GET DIAGNOSTICS rows_cached = ROW_COUNT;
    end_time := clock_timestamp();

    RETURN QUERY SELECT rows_cached, EXTRACT(EPOCH FROM (end_time - start_time));
END;
$$ LANGUAGE plpgsql;

\echo '✓ Cache refresh function created'

-- Test the connection
\echo ''
\echo 'Testing foreign data wrapper connection...'

SELECT
    'Foreign table accessible' as status,
    COUNT(*) as osm_buildings_count
FROM osm.osm_buildings;

SELECT
    'GRB buildings available' as status,
    COUNT(*) as grb_buildings_count
FROM grb.buildings;

\echo ''
\echo '======================================'
\echo 'Foreign Data Wrapper setup complete!'
\echo ''
\echo 'Foreign server: osmbe_server'
\echo 'Foreign table: osm.osm_buildings'
\echo 'Cache table: osm_buildings_cache (empty)'
\echo ''
\echo 'To populate cache, run:'
\echo '  SELECT * FROM refresh_osm_cache();'
\echo ''
\echo 'Setup complete! Ready for sync operations.'
\echo '======================================'
