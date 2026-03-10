-- Urbis (Brussels-Capital Region) Schema Setup
-- Tables are created by ogr2ogr during import (exact GeoPackage structure)
-- Materialized view is created by justfile task after import

\c be2osm

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS urbis;

\echo '✓ Urbis schema created'
\echo ''
\echo 'Next steps:'
\echo '  1. Download Urbis data: just urbis-download'
\echo '  2. Import data: just urbis-import'
