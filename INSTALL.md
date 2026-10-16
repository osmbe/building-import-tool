# Installation Guide

This guide covers setting up the Building Import Tool on a fresh Linux server with HTTPS.

## Prerequisites

- Linux server (Debian 12+, Ubuntu 22.04+, or similar)
- Domain name pointing to server IP (e.g., `buildings.osm.be`)
- GitHub account with access to the private repository
- GitHub repository secrets configured (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `OSM_CLIENT_ID` | From OSM OAuth registration |
| `OSM_CLIENT_SECRET` | From OSM OAuth registration |
| `OSM_REDIRECT_URI` | OAuth callback URL |
| `DIGITAL_VLAANDEREN_API_KEY` | API key for GRB data from Digital Vlaanderen |

These secrets are used by the CI/CD pipeline to build Docker images and run data imports.

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
| `POSTGRES_USER` | Database username | `be2osm` |
| `POSTGRES_PASSWORD` | Database password | `secure-password-here` |
| `POSTGRES_DB` | Database name | `be2osm` |
| `DOMAIN` | Your domain name | `buildings.osm.be` |
| `JWT_SECRET` | Random 32+ character string | `your-random-secret-here` |
| `OSM_CLIENT_ID` | From OSM OAuth registration | `your-client-id` |
| `OSM_CLIENT_SECRET` | From OSM OAuth registration | `your-client-secret` |
| `OSM_REDIRECT_URI` | OAuth callback URL | `https://buildings.osm.be/api/auth/osm-callback` |
| `OSM_REGION` | OSM region to download from Geofabrik | `europe/belgium` |
| `DIGITAL_VLAANDEREN_API_KEY` | API key for GRB data | `your-api-key` |
| `DIGITAL_VLAANDEREN_API_BASE_URL` | Digital Vlaanderen API URL | `https://download.api.vlaanderen.be/v2` |
| `WEBHOOK_SECRET` | Shared with the GitHub secret `WEBHOOK_SECRET` | `your-random-webhook-secret` |
| `GH_TOKEN` | Classic PAT with `repo` and `read:packages`: deploys fetch the private repo and pull images, restores download artifacts | `ghp_...` |

Don't set `NUXT_IMAGE`, `PROCESSING_IMAGE` or `WEBHOOK_IMAGE`: deploys pin the images through their `:deployed` tags.
The bootstrap (next step) adds `COMPOSE_PROJECT_NAME` and `COMPOSE_PROJECT_DIR`.

To register an OSM OAuth application, visit: https://www.openstreetmap.org/oauth2/applications

## Step 6: Start Services

Start the database, then let the bootstrap script pull the images built by CI, apply the migrations and start
everything else (see docs/RUNBOOK.md):

```bash
docker network create nginx-proxy-network 2>/dev/null || true
docker compose up -d postgres
bash scripts/server-bootstrap.sh
```

This starts every service:
- **postgres**: PostgreSQL database with PostGIS
- **nuxt-app**: Web application (image from GHCR)
- **grb-tiles**, **osm-tiles**, **picc-tiles**, **urbis-tiles**: vector tile servers (Martin)
- **webhook**: runs deploys, restores, imports and updates for GitHub Actions
- **caddy**: Reverse proxy

Then set the repository variable `DEPLOY_V2=true` (`gh variable set DEPLOY_V2 --body true`): every push to main is
deployed automatically from then on.

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
curl -f https://buildings.osm.be/api/health
curl -f https://buildings.osm.be/tiles/grb/health
curl -f https://buildings.osm.be/tiles/osm/health
```

## Step 8: Import Data (Remote Processing)

Data processing is offloaded to GitHub Actions runners (free compute). The VPS triggers the workflow, waits for completion, downloads the result, and restores to the local database.

### Prerequisites

Ensure GitHub CLI is authenticated on your VPS (required for private repo access):

```bash
gh auth login
```

This creates `~/.config/gh/` which is mounted into the processing container.

### Import OSM Data

```bash
cd /opt/docker/buildings
docker compose run --rm processing just osm-import-remote
```

This will:
1. Trigger the OSM Import workflow on GitHub Actions
2. Wait for the workflow to complete (30-60 minutes)
3. Download the database dump artifact
4. Restore to your local PostgreSQL

### Import GRB Data

```bash
docker compose run --rm processing just grb-import-remote
```

This will:
1. Trigger the GRB Import workflow on GitHub Actions
2. Wait for the workflow to complete (1-2 hours)
3. Download the database dump artifact
4. Restore to your local PostgreSQL

### Verify Data Import

```bash
# Check OSM building count
docker compose run --rm processing just osm-status

# Check GRB building count
docker compose run --rm processing just grb-status
```

### Required GitHub Secrets for Data Import

For GRB import, ensure this secret is configured (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `DIGITAL_VLAANDEREN_API_KEY` | API key for GRB data from Digital Vlaanderen |

Note: OSM import doesn't require any secrets.

### Manual Workflow Trigger (Alternative)

You can also trigger workflows manually from GitHub:

1. Go to the repository on GitHub
2. Navigate to **Actions** → **OSM Import** or **GRB Import**
3. Click **Run workflow** → **Run workflow**

Then download artifacts manually with:
```bash
gh run download <RUN_ID> -R osmbe/building-import-tool -n osmbe-dump
```

## Switching buildings.osm.be to this tool

The production domain is `buildings.osm.be`. When moving it from the old tool to this one
(the old tool is kept at `old-buildings-tool.osm.be`; hostname assumed from issue #8):

1. DNS (https://github.com/osmbe/dns): point `old-buildings-tool.osm.be` to the old server, and
   `buildings.osm.be` to this server (currently `buildings.osm.be` is a CNAME to `grb.byteless.net`).
2. Reverse proxy (Nginx Proxy Manager): add a host for `old-buildings-tool.osm.be` forwarding to the old
   tool, and change the `buildings.osm.be` host to forward to this stack.
3. Register `https://buildings.osm.be/api/auth/osm-callback` as a redirect URI of the OSM OAuth2
   application (https://www.openstreetmap.org/oauth2/applications).
4. Set `DOMAIN=buildings.osm.be` and `OSM_REDIRECT_URI=https://buildings.osm.be/api/auth/osm-callback`
   in the server `.env` and the GitHub secret `OSM_REDIRECT_URI` (it is baked in at build time), then redeploy.

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
