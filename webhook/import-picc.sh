#!/bin/bash
# Local PICC import — runs directly on the server, no GitHub Actions needed.
# Usage: ./import-picc.sh
# Can be triggered via webhook POST /import-picc or run directly on the server.
# Downloads the full Wallonia dataset (FileGDB + addresses) and imports it: the tables are replaced in one
# transaction and the view refreshed concurrently, so the map keeps the previous data meanwhile.
set -euo pipefail

PROJECT_DIR="${COMPOSE_PROJECT_DIR}"
COMPOSE="docker compose -f ${PROJECT_DIR}/docker-compose.yml --env-file ${PROJECT_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local}"

echo "[import-picc] Starting local PICC import..."
echo "[import-picc] $(date)"

${COMPOSE} run --rm --no-deps processing just picc-full
${COMPOSE} up -d --no-deps --force-recreate picc-tiles

echo "[import-picc] Done. $(date)"
