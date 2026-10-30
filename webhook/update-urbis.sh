#!/bin/bash
# Local UrbIS update — full re-download (no differential API available).
# Usage: ./update-urbis.sh
# Can be triggered via webhook POST /update-urbis or run directly on the server.
set -euo pipefail

PROJECT_DIR="${COMPOSE_PROJECT_DIR}"
COMPOSE="docker compose -f ${PROJECT_DIR}/docker-compose.yml --env-file ${PROJECT_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local}"

echo "[update-urbis] Starting UrbIS update (full re-download)..."
echo "[update-urbis] $(date)"

# UrbIS has no differential API — update = clean + full re-import
${COMPOSE} run --rm --no-deps processing just urbis-update
${COMPOSE} up -d --no-deps --force-recreate urbis-tiles

echo "[update-urbis] Done. $(date)"
