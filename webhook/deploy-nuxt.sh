#!/bin/bash
set -euo pipefail

# Args passed by webhook server ($1=run_id $2=repo) — not needed for deploy
COMPOSE_DIR="${COMPOSE_PROJECT_DIR:-/compose}"
IMAGE="ghcr.io/osmbe/building-import-tool/nuxt-app:latest"

echo "[deploy-nuxt] Authenticating with GHCR..."
gh auth token | docker login ghcr.io -u oauth2accesstoken --password-stdin

echo "[deploy-nuxt] Pulling and recreating nuxt-app..."
docker compose -f "${COMPOSE_DIR}/docker-compose.yml" \
    --env-file "${COMPOSE_DIR}/.env" \
    up -d --pull always --no-build --no-deps nuxt-app

echo "[deploy-nuxt] Done. Container restarted with latest image."
