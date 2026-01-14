#!/bin/bash
set -e

echo "=== BE2OSM Deployment Script ==="
echo "Started at: $(date)"

# Configuration
APP_DIR="${APP_DIR:-/opt/docker/buildings}"

cd "$APP_DIR"

# Pull latest Nuxt image from GHCR
echo "Pulling latest Docker images..."
docker compose pull nuxt-app

# Restart services with new image
echo "Restarting services..."
docker compose up -d

# Wait for services to be healthy
echo "Waiting for services to become healthy..."
sleep 10

# Show status
echo "=== Service Status ==="
docker compose ps

echo "=== Deployment Complete ==="
echo "Finished at: $(date)"
