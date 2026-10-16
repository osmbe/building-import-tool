-- BE2OSM database: extensions and the GRB schema. Runs once, on the first init of a volume.
--
-- The GRB tables, indexes, triggers and views are created by the migrations
-- (processing/sql/migrations/grb/, starting with 000_baseline.sql): `just db-migrate`, which the import
-- recipes, deploys and the bootstrap run. Never add tables here: existing databases would not get them.

\c be2osm

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gin;

CREATE SCHEMA IF NOT EXISTS grb;

\echo '✓ be2osm: extensions and schema grb (tables: just db-migrate)'
