#!/bin/bash
set -e

# Create osmbe database (be2osm database is created by default via POSTGRES_DB env var)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    -- Create osmbe database
    CREATE DATABASE osmbe;
    GRANT ALL PRIVILEGES ON DATABASE osmbe TO $POSTGRES_USER;

    -- Create osm schema in osmbe database
    \c osmbe
    CREATE SCHEMA IF NOT EXISTS osm;
    GRANT ALL ON SCHEMA osm TO $POSTGRES_USER;

    -- Create import schema in be2osm database
    \c $POSTGRES_DB
    CREATE SCHEMA IF NOT EXISTS import;
    GRANT ALL ON SCHEMA import TO $POSTGRES_USER;
EOSQL

echo "Databases initialized successfully"
