#!/bin/bash
# Local PICC import — runs directly on the server, no GitHub Actions needed.
# Usage: ./import-picc.sh
# Can be triggered via webhook POST /import-picc or run directly on the server.
# Downloads the full Wallonia dataset (FileGDB + addresses), imports, creates matview.
set -euo pipefail

COMPOSE_DIR="${COMPOSE_PROJECT_DIR:-/compose}"
# HOST_PROJECT_DIR is the project path on the Docker host (for volume resolution)
HOST_DIR="${HOST_PROJECT_DIR:-${COMPOSE_DIR}}"
COMPOSE="docker compose -f ${COMPOSE_DIR}/docker-compose.yml --env-file ${COMPOSE_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local} --project-directory ${HOST_DIR}"

echo "[import-picc] Starting local PICC import..."
echo "[import-picc] $(date)"

# Ensure the PICC schema exists
${COMPOSE} run --rm processing bash -c '
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d be2osm -c "
        CREATE EXTENSION IF NOT EXISTS postgis;
        CREATE SCHEMA IF NOT EXISTS picc;
    "
'

# Drop existing PICC tables (clean slate)
echo "[import-picc] Dropping existing PICC tables..."
${COMPOSE} run --rm processing bash -c '
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d be2osm -c "
        DROP MATERIALIZED VIEW IF EXISTS picc.buildings_with_addresses CASCADE;
        DROP TABLE IF EXISTS picc.constr_batiemprise CASCADE;
        DROP TABLE IF EXISTS picc.icar_adr_pt CASCADE;
    "
'

# Run the full PICC workflow: download FileGDB + addresses, import, create matview
${COMPOSE} run --rm processing just picc-full

echo "[import-picc] Done. $(date)"
