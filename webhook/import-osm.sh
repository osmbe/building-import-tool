#!/bin/bash
# Local OSM import — runs directly on the server, no GitHub Actions needed.
# Usage: ./import-osm.sh
# Can be triggered via webhook POST /import-osm or run directly on the server.
set -euo pipefail

PROJECT_DIR="${COMPOSE_PROJECT_DIR}"
COMPOSE="docker compose -f ${PROJECT_DIR}/docker-compose.yml --env-file ${PROJECT_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local}"

echo "[import-osm] Starting local OSM import..."
echo "[import-osm] $(date)"

# Run osm-download + osm-import inside the processing container
${COMPOSE} run --rm --no-deps processing just osm-download osm-import

echo "[import-osm] Done. $(date)"
