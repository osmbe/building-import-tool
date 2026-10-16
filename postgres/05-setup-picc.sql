-- PICC (Wallonia) Schema Setup
-- The tables, picc.load_raw() and the materialized view come from the migrations in
-- processing/sql/migrations/picc/ (`just db-migrate`, also run by every PICC import recipe).

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
\echo '  1. Create the tables: just db-migrate'
\echo '  2. Download and import: just picc-full'
