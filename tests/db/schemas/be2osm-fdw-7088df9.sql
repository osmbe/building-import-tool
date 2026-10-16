-- postgres/04-setup-fdw.sql of commit 7088df9 (without its \c line): the be2osm -> osmbe foreign data wrapper and
-- cache every server created at init, for the tests that migrations drop them (tests/db/cases/10-fresh-init.sh).

-- Foreign Data Wrapper Setup
-- Connects be2osm database to osmbe database for seamless querying
-- Run this on the be2osm database


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
-- postgres_fdw opens a real TCP connection to osmbe and needs credentials.
-- POSTGRES_PASSWORD from .env is injected into the container, but SQL init scripts
-- can't read env vars directly. The password below must match POSTGRES_PASSWORD.
-- On a fresh deploy, if this script fails (e.g. osmbe not ready yet), re-run:
--   docker exec be2osm-postgres psql -U <user> -d be2osm -f /docker-entrypoint-initdb.d/04-setup-fdw.sql
CREATE USER MAPPING IF NOT EXISTS FOR CURRENT_USER
    SERVER osmbe_server
    OPTIONS (user 'be2osm', password 'be2osm');

\echo '✓ User mapping created'

-- Create schema to hold foreign tables
CREATE SCHEMA IF NOT EXISTS osm;

\echo '✓ Schema created (osm)'

-- Import osm_buildings and osm_addresses from osmbe.
-- Requires 03-setup-osmbe.sql to have run first (creates the tables in osmbe).
IMPORT FOREIGN SCHEMA osm LIMIT TO (osm_buildings, osm_addresses)
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
