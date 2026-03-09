#!/bin/bash
# Local PICC update — runs differential update via ArcGIS REST API.
# Usage: ./update-picc.sh
# Can be triggered via webhook POST /update-picc or run directly on the server.
# Requires a prior full import (picc-full must have been run first).
set -euo pipefail

PROJECT_DIR="${COMPOSE_PROJECT_DIR}"
COMPOSE="docker compose -f ${PROJECT_DIR}/docker-compose.yml --env-file ${PROJECT_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local}"

echo "[update-picc] Starting PICC differential update..."
echo "[update-picc] $(date)"

# Run the PICC differential update
${COMPOSE} run --rm processing just picc-update

echo "[update-picc] Done. $(date)"
