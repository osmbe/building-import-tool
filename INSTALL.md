# Installation Guide

This guide covers setting up the Building Import Tool on a fresh Linux server with HTTPS.

## Prerequisites

- Linux server (Debian 12+, Ubuntu 22.04+, or similar)
- Domain name pointing to server IP (e.g., `new.buildings.osm.be`)
- GitHub account with access to the private repository
- GitHub repository secrets configured (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `VPS_SSH_KEY` | Private SSH key for VPS access |
| `VPS_HOST` | VPS hostname or IP address |
| `VPS_USER` | SSH username on the VPS |
| `GHCR_PAT` | Personal Access Token with `read:packages` and `repo` scopes |
| `POSTGRES_PASSWORD` | Database password |
| `DOMAIN` | Your domain (e.g., `new.buildings.osm.be`) |
| `OSM_CLIENT_ID` | From OSM OAuth registration |
| `OSM_CLIENT_SECRET` | From OSM OAuth registration |
| `OSM_REDIRECT_URI` | OAuth callback URL |
| `JWT_SECRET` | Random 32+ character string |
| `DIGITAL_VLAANDEREN_API_KEY` | API key for GRB data updates |

To create the `GHCR_PAT`: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate with `read:packages` and `repo` scopes.

## Step 1: Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Log out and log back in for group changes to take effect.

## Step 2: Install GitHub CLI and Authenticate

```bash
sudo apt update && sudo apt install gh -y
gh auth login
```

Follow the prompts to authenticate via browser or personal access token.

## Step 3: Clone Repository

```bash
cd /opt/docker/buildings
gh repo clone osmbe/building-import-tool .
gh auth logout
```

## Step 4: Authenticate Docker with GHCR

The Nuxt application image is stored in GitHub Container Registry (private). Create a Personal Access Token (PAT) with `read:packages` scope and use it to authenticate Docker:

```bash
# Login to GitHub Container Registry (token will be saved for future pulls)
echo "YOUR_GHCR_PAT" | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

Replace `YOUR_GHCR_PAT` with the same PAT used in the GitHub secrets (`GHCR_PAT`).

## Step 5: Configure Environment

```bash
cp .env.example .env
nano .env
```

Update the following variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `POSTGRES_HOST` | Database host (use container name) | `postgres` |
| `POSTGRES_PORT` | Database port | `5432` |
| `POSTGRES_USER` | Database username | `myuser` |
| `POSTGRES_PASSWORD` | Database password | `secure-password-here` |
| `POSTGRES_DB` | Database name | `be2osm` |
| `DOMAIN` | Your domain name | `new.buildings.osm.be` |
| `JWT_SECRET` | Random 32+ character string | `your-random-secret-here` |
| `OSM_CLIENT_ID` | From OSM OAuth registration | `your-client-id` |
| `OSM_CLIENT_SECRET` | From OSM OAuth registration | `your-client-secret` |
| `OSM_REDIRECT_URI` | OAuth callback URL | `https://new.buildings.osm.be/api/auth/osm-callback` |
| `NUXT_IMAGE` | Pre-built Nuxt image from GHCR | `ghcr.io/osmbe/building-import-tool/nuxt-app:latest` |

To register an OSM OAuth application, visit: https://www.openstreetmap.org/oauth2/applications

## Step 6: Start Services

```bash
docker compose up -d
```

This will start all services:
- **postgres**: PostgreSQL database with PostGIS
- **nuxt-app**: Web application (pulled from GHCR)
- **grb-tiles**: GRB vector tile server
- **osm-tiles**: OSM vector tile server
- **caddy**: Reverse proxy with automatic HTTPS

## Step 7: Verify Installation

Check all services are running:

```bash
docker compose ps
```

All services should show status "running" or "healthy".

Verify PostgreSQL:

```bash
docker compose exec postgres pg_isready
```

Verify via public domain:

```bash
curl -f https://new.buildings.osm.be/api/health
curl -f https://new.buildings.osm.be/tiles/grb/health
curl -f https://new.buildings.osm.be/tiles/osm/health
```

## Troubleshooting

View logs for a specific service:

```bash
docker compose logs -f <service>
```

Restart a service:

```bash
docker compose restart <service>
```

Access the database:

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d be2osm
```

Check Caddy logs for SSL issues:

```bash
docker compose logs -f caddy
```
