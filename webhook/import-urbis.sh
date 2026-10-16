#!/bin/bash
# Local Urbis import — runs directly on the server, no GitHub Actions needed.
# Usage: ./import-urbis.sh
# Can be triggered via webhook POST /import-urbis or run directly on the server.
# Downloads the Urbis GeoPackage and imports it: the tables are replaced in one transaction and the view
# refreshed concurrently, so the map keeps the previous data meanwhile.
set -euo pipefail

PROJECT_DIR="${COMPOSE_PROJECT_DIR}"
COMPOSE="docker compose -f ${PROJECT_DIR}/docker-compose.yml --env-file ${PROJECT_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local}"

echo "[import-urbis] Starting local Urbis import..."
echo "[import-urbis] $(date)"

${COMPOSE} run --rm --no-deps processing just urbis-full
${COMPOSE} up -d --no-deps --force-recreate urbis-tiles

echo "[import-urbis] Done. $(date)"
