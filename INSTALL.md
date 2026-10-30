# Installation Guide

This guide covers setting up the Building Import Tool on a fresh Linux server with HTTPS.

## Prerequisites

- Linux server (Debian 12+, Ubuntu 22.04+, or similar)
- Domain name pointing to server IP (e.g., `buildings.osm.be`)
- GitHub account with access to the private repository
- GitHub repository secrets configured (Settings → Secrets and variables → Actions):

| Secret                       | Description                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `OSM_CLIENT_ID`              | From OSM OAuth registration                                                                  |
| `OSM_CLIENT_SECRET`          | From OSM OAuth registration                                                                  |
| `OSM_REDIRECT_URI`           | OAuth callback URL                                                                           |
| `DIGITAL_VLAANDEREN_API_KEY` | API key for GRB data from Digital Vlaanderen                                                 |
| `WEBHOOK_SECRET`             | Shared secret for the server's webhook (same value as `WEBHOOK_SECRET` in the server `.env`) |

And these repository variables:

| Variable      | Description                                                   |
| ------------- | ------------------------------------------------------------- |
| `WEBHOOK_URL` | The server's webhook, e.g. `https://buildings.osm.be/webhook` |
| `APP_URL`     | Optional: public URL checked for readiness after each deploy  |

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

The images CI builds (`nuxt-app`, `processing`, `webhook`) are stored in GitHub Container Registry (private). Create a Personal Access Token (PAT) with `read:packages` scope and use it to authenticate Docker:

```bash
# Login to GitHub Container Registry (token will be saved for future pulls)
echo "YOUR_GHCR_PAT" | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

The `GH_TOKEN` of the next step (a classic PAT with `repo` and `read:packages`) works for this.

## Step 5: Configure Environment

```bash
cp .env.example .env
nano .env
```

Update the following variables:

| Variable                          | Description                                                                                                              | Example                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `POSTGRES_HOST`                   | Database host (use container name)                                                                                       | `postgres`                                       |
| `POSTGRES_PORT`                   | Database port                                                                                                            | `5432`                                           |
| `POSTGRES_USER`                   | Database username                                                                                                        | `be2osm`                                         |
| `POSTGRES_PASSWORD`               | Database password                                                                                                        | `secure-password-here`                           |
| `POSTGRES_DB`                     | Database name                                                                                                            | `be2osm`                                         |
| `DOMAIN`                          | Your domain name                                                                                                         | `buildings.osm.be`                               |
| `JWT_SECRET`                      | Random 32+ character string                                                                                              | `your-random-secret-here`                        |
| `OSM_CLIENT_ID`                   | From OSM OAuth registration                                                                                              | `your-client-id`                                 |
| `OSM_CLIENT_SECRET`               | From OSM OAuth registration                                                                                              | `your-client-secret`                             |
| `OSM_REDIRECT_URI`                | OAuth callback URL                                                                                                       | `https://buildings.osm.be/api/auth/osm-callback` |
| `OSM_REGION`                      | OSM region to download from Geofabrik                                                                                    | `europe/belgium`                                 |
| `DIGITAL_VLAANDEREN_API_KEY`      | API key for GRB data                                                                                                     | `your-api-key`                                   |
| `DIGITAL_VLAANDEREN_API_BASE_URL` | Digital Vlaanderen API URL                                                                                               | `https://download.api.vlaanderen.be/v2`          |
| `WEBHOOK_SECRET`                  | Shared with the GitHub secret `WEBHOOK_SECRET`                                                                           | `your-random-webhook-secret`                     |
| `GH_TOKEN`                        | Classic PAT with `repo` and `read:packages`: deploys fetch the private repository and pull images, restores download artifacts | `ghp_...`                                        |

Don't set `NUXT_IMAGE`, `PROCESSING_IMAGE` or `WEBHOOK_IMAGE`: deploys pin the images through their `:deployed` tags.
The bootstrap (next step) adds `COMPOSE_PROJECT_NAME` and `COMPOSE_PROJECT_DIR`.

To register an OSM OAuth application, visit: <https://www.openstreetmap.org/oauth2/applications>

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

## Step 8: Import Data

The full imports run on GitHub Actions runners, not on the server. Each workflow builds the data in a throwaway
database, uploads a dump, and then asks the server's webhook to restore it. The server swaps it in next to the live
data, so the site keeps working during an import. Start them from **Actions** on GitHub, or with `gh`:

```bash
gh workflow run "OSM Import" -R osmbe/building-import-tool       # 30-60 minutes
gh workflow run "GRB Import" -R osmbe/building-import-tool       # 1-2 hours, needs DIGITAL_VLAANDEREN_API_KEY
gh workflow run "PICC Import" -R osmbe/building-import-tool
gh workflow run "UrbIS Import" -R osmbe/building-import-tool
```

The workflow fails if the restore job fails; the job log is in the workflow output (see docs/RUNBOOK.md). Updates
run on their own afterwards: OSM daily and UrbIS monthly. GRB and PICC updates are started by hand for now.

Check the result:

```bash
docker compose run --rm processing just osm-status
docker compose run --rm processing just grb-status
curl -s https://buildings.osm.be/api/meta/data-dates
```

`docker compose run --rm processing just grb-import-remote` (also `osm-`, `picc-`) does the same from the server:
it starts the workflow, waits, downloads the artifact and restores it.

## Switching buildings.osm.be to this tool

The production domain is `buildings.osm.be`. When moving it from the old tool to this one
(the old tool is kept at `old-buildings-tool.osm.be`; hostname assumed from issue #8):

1. DNS (<https://github.com/osmbe/DNS>): point `old-buildings-tool.osm.be` to the old server, and
   `buildings.osm.be` to this server (currently `buildings.osm.be` is a CNAME to `grb.byteless.net`).
2. Reverse proxy (Nginx Proxy Manager): add a host for `old-buildings-tool.osm.be` forwarding to the old
   tool, and change the `buildings.osm.be` host to forward to this stack.
3. Register `https://buildings.osm.be/api/auth/osm-callback` as a redirect URI of the OSM OAuth2
   application (<https://www.openstreetmap.org/oauth2/applications>).
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
