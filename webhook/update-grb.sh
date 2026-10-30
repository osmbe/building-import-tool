#!/bin/bash
# Local GRB update — runs differential update on the server.
# Usage: ./update-grb.sh
# Can be triggered via webhook POST /update-grb or run directly on the server.
# Requires DIGITAL_VLAANDEREN_API_KEY in .env
set -euo pipefail

PROJECT_DIR="${COMPOSE_PROJECT_DIR}"
COMPOSE="docker compose -f ${PROJECT_DIR}/docker-compose.yml --env-file ${PROJECT_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local}"

echo "[update-grb] Starting GRB differential update..."
echo "[update-grb] $(date)"

# Run the GRB differential update
${COMPOSE} run --rm --no-deps processing just grb-update

echo "[update-grb] Done. $(date)"
