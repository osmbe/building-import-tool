-- BE2OSM Database Creation Script
-- Run this as PostgreSQL superuser (postgres)
-- Creates both be2osm (GRB) and osmbe (OSM) databases

\echo '======================================'
\echo 'BE2OSM Database Creation'
\echo '======================================'
\echo ''

-- Terminate existing connections to databases (if they exist)
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname IN ('be2osm', 'osmbe')
  AND pid <> pg_backend_pid();

-- Drop databases if they exist (CAUTION: This will delete all data!)
DROP DATABASE IF EXISTS be2osm;
DROP DATABASE IF EXISTS osmbe;

\echo 'Creating databases...'

-- Create be2osm database (for GRB data and import management)
CREATE DATABASE be2osm
    WITH
    OWNER = CURRENT_USER
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE = template0;

-- Create osmbe database (for OSM data from Geofabrik)
CREATE DATABASE osmbe
    WITH
    OWNER = CURRENT_USER
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TEMPLATE = template0;

\echo '✓ Databases created'
\echo ''

-- Connect to be2osm and install PostGIS
\c be2osm

\echo 'Installing PostGIS in be2osm...'
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgres_fdw;

\echo '✓ PostGIS installed in be2osm'
\echo ''

-- Connect to osmbe and install PostGIS
\c osmbe

\echo 'Installing PostGIS in osmbe...'
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;

-- Create osm schema for Imposm3
CREATE SCHEMA IF NOT EXISTS osm;
CREATE SCHEMA IF NOT EXISTS import;

\echo '✓ PostGIS installed in osmbe'
\echo ''

\echo '======================================'
\echo 'Database setup complete!'
\echo ''
\echo 'Databases created:'
\echo '  - be2osm  (GRB data + import management)'
\echo '  - osmbe   (OSM data from Geofabrik)'
\echo ''
\echo 'Next steps:'
\echo '  1. Run 02_setup_be2osm.sql'
\echo '  2. Run 03_setup_osmbe.sql'
\echo '  3. Run 04_import_management.sql'
\echo '  4. Run 05_foreign_data_wrapper.sql'
\echo '======================================'
