#!/bin/bash
# Local Urbis import — runs directly on the server, no GitHub Actions needed.
# Usage: ./import-urbis.sh
# Can be triggered via webhook POST /import-urbis or run directly on the server.
# Downloads the full Brussels dataset (GeoPackage), imports, creates matview.
set -euo pipefail

PROJECT_DIR="${COMPOSE_PROJECT_DIR}"
COMPOSE="docker compose -f ${PROJECT_DIR}/docker-compose.yml --env-file ${PROJECT_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local}"

echo "[import-urbis] Starting local Urbis import..."
echo "[import-urbis] $(date)"

# Ensure the Urbis schema exists
${COMPOSE} run --rm --no-deps processing bash -c '
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d be2osm -c "
        CREATE EXTENSION IF NOT EXISTS postgis;
        CREATE SCHEMA IF NOT EXISTS urbis;
    "
'

# Drop existing Urbis tables (clean slate)
echo "[import-urbis] Dropping existing Urbis tables..."
${COMPOSE} run --rm --no-deps processing bash -c '
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d be2osm -c "
        DROP MATERIALIZED VIEW IF EXISTS urbis.buildings_with_addresses CASCADE;
        DROP TABLE IF EXISTS urbis.buildings CASCADE;
        DROP TABLE IF EXISTS urbis.addresses CASCADE;
        DROP TABLE IF EXISTS urbis.placenames CASCADE;
        DROP TABLE IF EXISTS urbis.municipalities CASCADE;
        DROP TABLE IF EXISTS urbis.postalzip CASCADE;
    "
'

# Run the full Urbis workflow: download GeoPackage, import, create matview
${COMPOSE} run --rm --no-deps processing just urbis-full

echo "[import-urbis] Done. $(date)"
