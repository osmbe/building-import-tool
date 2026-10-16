#!/bin/bash
# Local Urbis update — full re-download (no differential API available).
# Usage: ./update-urbis.sh
# Can be triggered via webhook POST /update-urbis or run directly on the server.
set -euo pipefail

PROJECT_DIR="${COMPOSE_PROJECT_DIR}"
COMPOSE="docker compose -f ${PROJECT_DIR}/docker-compose.yml --env-file ${PROJECT_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local}"

echo "[update-urbis] Starting Urbis update (full re-download)..."
echo "[update-urbis] $(date)"

# Urbis has no differential API — update = clean + full re-import
${COMPOSE} run --rm --no-deps processing just urbis-update

echo "[update-urbis] Done. $(date)"
