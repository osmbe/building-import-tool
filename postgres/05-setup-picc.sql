-- PICC (Wallonia) Schema Setup
-- Tables are created by ogr2ogr during import (exact shapefile structure)
-- Materialized view is created by justfile task after import

\c be2osm

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS picc;

-- When this schema's data was last imported (shown in the app, Issue #59).
-- Written by the processing recipes; travels with the CI dump.
CREATE TABLE IF NOT EXISTS picc.import_meta (
    imported_at TIMESTAMPTZ NOT NULL
);

\echo '✓ PICC schema created'
\echo ''
\echo 'Next steps:'
\echo '  1. Download PICC data: just picc-download'
\echo '  2. Import data: just picc-import'
