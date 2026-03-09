#!/bin/bash
# Local GRB import — runs directly on the server, no GitHub Actions needed.
# Usage: ./import-grb.sh
# Can be triggered via webhook POST /import-grb or run directly on the server.
# Requires DIGITAL_VLAANDEREN_API_KEY in .env
set -euo pipefail

PROJECT_DIR="${COMPOSE_PROJECT_DIR}"
COMPOSE="docker compose -f ${PROJECT_DIR}/docker-compose.yml --env-file ${PROJECT_DIR}/.env --project-name ${COMPOSE_PROJECT_NAME:-building-import-tool-local}"

echo "[import-grb] Starting local GRB import..."
echo "[import-grb] $(date)"

# Run the full GRB workflow: order → wait → download → import
${COMPOSE} run --rm processing just grb-full

echo "[import-grb] Done. $(date)"
