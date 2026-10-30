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
${COMPOSE} run --rm --no-deps processing just osm-update

echo "[update-osm] Done. $(date)"
