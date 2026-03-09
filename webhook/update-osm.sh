#!/bin/bash
# Local OSM update — runs incremental diff update on the server.
# Usage: ./update-osm.sh
# Can be triggered via webhook POST /update-osm or run directly on the server.
# Requires a prior full import (imposm3 cache must exist).
set -euo pipefail

PROJECT_DIR="${COMPOSE_PROJECT_DIR}"
COMPOSE="docker compose -f ${PROJECT_DIR}/docker-compose.yml --env-file ${PROJECT_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local}"

echo "[update-osm] Starting OSM incremental update..."
echo "[update-osm] $(date)"

# Run osm-update inside the processing container
${COMPOSE} run --rm processing just osm-update

# Refresh the FDW cache in be2osm
echo "[update-osm] Refreshing OSM buildings cache in be2osm..."
${COMPOSE} run --rm processing bash -c '
    export PGPASSWORD="${POSTGRES_PASSWORD}"
    psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d be2osm \
        -c "SELECT * FROM refresh_osm_cache();" || echo "[update-osm] WARNING: cache refresh failed (non-fatal)"
'

echo "[update-osm] Done. $(date)"
