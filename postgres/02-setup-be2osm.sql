-- Setup be2osm database (run against be2osm database)
\c be2osm

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS grb;
CREATE SCHEMA IF NOT EXISTS import;

-- Grant privileges
GRANT ALL ON SCHEMA grb TO CURRENT_USER;
GRANT ALL ON SCHEMA import TO CURRENT_USER;

-- Verify PostGIS version
SELECT PostGIS_version();
