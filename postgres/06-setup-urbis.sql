-- Urbis (Brussels-Capital Region) Schema Setup
-- The tables, urbis.load_raw() and the materialized view come from the migrations in
-- processing/sql/migrations/urbis/ (`just db-migrate`, also run by every Urbis import recipe).

\c be2osm

CREATE SCHEMA IF NOT EXISTS urbis;

-- When this schema's data was last imported (shown in the app, Issue #59).
-- Written by the processing recipes; travels with the CI dump.
CREATE TABLE IF NOT EXISTS urbis.import_meta (
    imported_at TIMESTAMPTZ NOT NULL
);

\echo '✓ Urbis schema created'
\echo ''
\echo 'Next steps:'
\echo '  1. Create the tables: just db-migrate'
\echo '  2. Download and import: just urbis-full'
