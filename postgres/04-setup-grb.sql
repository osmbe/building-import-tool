-- GRB (Flanders) Schema Setup

\c be2osm

CREATE SCHEMA IF NOT EXISTS grb;

CREATE TABLE IF NOT EXISTS grb.import_meta (
    imported_at TIMESTAMPTZ NOT NULL
);

\echo '✓ GRB schema created'
\echo ''
\echo 'Next steps:'
\echo '  1. Create the tables: just db-migrate'
\echo '  2. Download and import: just grb-full'
