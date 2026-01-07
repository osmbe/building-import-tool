-- Setup osmbe database (run against osmbe database)
\c osmbe

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS osm;

-- Grant privileges
GRANT ALL ON SCHEMA osm TO CURRENT_USER;

-- Verify PostGIS version
SELECT PostGIS_version();
