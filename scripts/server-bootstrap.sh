#!/usr/bin/env bash
# One-time switch of the production server to versioned migrations and automatic deploys (docs/RUNBOOK.md).
# Run it on the server, from the checkout, in tmux or screen (the heavy GRB migration takes about 30 minutes).
# The server checkout is older than this script, so fetch the script first (docs/RUNBOOK.md):
#
#   cd /opt/docker/buildings && bash /tmp/server-bootstrap.sh            # everything
#   bash /tmp/server-bootstrap.sh --report                               # steps 1-2 only, changes nothing
#   bash /tmp/server-bootstrap.sh --backup                               # also pg_dump -Fc the grb schema
#
# Idempotent: every step reports what it found and what it did, and running it again is safe.
#   1. report: disk, database sizes, running containers and images, the token's scopes
#   2. production schema snapshot (redacted) for the upgrade tests, in ~/be2osm-bootstrap/
#   3. optional backup of the grb schema
#   4. wait until no webhook or processing job is running
#   5. checkout: fetch main, save local changes as a patch, reset to main
#   6. .env: drop the image overrides, pin COMPOSE_PROJECT_NAME and COMPOSE_PROJECT_DIR
#   7. images: pull the sha-<main> images, tag them :deployed, recreate the webhook (job registry)
#   8. migrations, heavy ones included (old tiles are served meanwhile)
#   9. recreate the Martin servers, Caddy and nuxt-app
#  10. verify: readiness, every tile server, a difference request; print what to do next
set -euo pipefail

# The checkout: the current directory when it is one, else the one this script is in
if [ -f "$PWD/docker-compose.yml" ]; then DIR="$PWD"; else DIR="$(cd "$(dirname "$0")/.." && pwd)"; fi
OUT="${BOOTSTRAP_OUT:-$HOME/be2osm-bootstrap}"
REPO_DEFAULT=osmbe/building-import-tool
MIN_FREE_GB=10
IMAGES=(nuxt-app processing webhook)

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
warn() { printf '   \033[33m! %s\033[0m\n' "$*"; }
die() {
    printf '   \033[31mERROR: %s\033[0m\n' "$*" >&2
    exit 1
}

# --- helpers (also used by tests/db/cases/85-bootstrap.sh, which sources this file with BOOTSTRAP_LIB=1) ----

# Redact secrets from a schema-only dump (FDW user mappings carry the database password)
redact_schema() {
    sed -E "s/(password[[:space:]]+')[^']*'/\1REDACTED'/Ig"
}

# .env without image overrides and with the compose project pinned. Usage: normalise_env <.env> <project> <dir>
normalise_env() {
    local file="$1" project="$2" dir="$3"
    sed -i -E '/^[[:space:]]*(NUXT|PROCESSING|WEBHOOK)_IMAGE=/d' "$file"
    if grep -q '^COMPOSE_PROJECT_NAME=' "$file"; then
        sed -i -E "s|^COMPOSE_PROJECT_NAME=.*|COMPOSE_PROJECT_NAME=${project}|" "$file"
    else
        printf '\n# Compose project of the running stack (deploys recreate services in it)\nCOMPOSE_PROJECT_NAME=%s\n' "$project" >>"$file"
    fi
    if grep -q '^COMPOSE_PROJECT_DIR=' "$file"; then
        sed -i -E "s|^COMPOSE_PROJECT_DIR=.*|COMPOSE_PROJECT_DIR=${dir}|" "$file"
    else
        printf 'COMPOSE_PROJECT_DIR=%s\n' "$dir" >>"$file"
    fi
}

env_value() { # <key>: value from .env (last one wins), unquoted
    sed -n -E "s/^[[:space:]]*$1=//p" "$DIR/.env" | tail -1 | sed -E "s/^['\"]//; s/['\"]$//"
}

[ "${BOOTSTRAP_LIB:-0}" = 1 ] && return 0

REPORT_ONLY=0
BACKUP=0
for arg in "$@"; do
    case "$arg" in
    --report) REPORT_ONLY=1 ;;
    --backup) BACKUP=1 ;;
    *) die "unknown option $arg (use --report or --backup)" ;;
    esac
done

cd "$DIR"
[ -f .env ] || die "no .env in $DIR"
[ -f docker-compose.yml ] || die "run this from the server checkout"
mkdir -p "$OUT"
REPO="$(env_value GH_REPO)"
REPO="${REPO:-$REPO_DEFAULT}"
TOKEN="$(env_value GH_TOKEN)"
PG_USER="$(env_value POSTGRES_USER)"
PREFIX="ghcr.io/${REPO,,}"
# The compose project of the running containers (the stack was started from this directory)
PROJECT="$(docker inspect be2osm-postgres -f '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || true)"
[ -n "$PROJECT" ] || die "the be2osm-postgres container is not running"
COMPOSE=(docker compose --project-name "$PROJECT" --project-directory "$DIR" -f "$DIR/docker-compose.yml" --env-file "$DIR/.env")
psql_be2osm() { docker exec -i be2osm-postgres psql -U "$PG_USER" -d be2osm -X -q -tA -v ON_ERROR_STOP=1 "$@"; }

# --- 1. report ---------------------------------------------------------------------------------------------
say "1. Report"
DOCKER_ROOT="$(docker info -f '{{.DockerRootDir}}')"
free_gb() { df -Pk "$1" | awk 'NR == 2 { printf "%d", $4 / 1024 / 1024 }'; }
info "compose project: $PROJECT, checkout: $DIR at $(git -C "$DIR" rev-parse --short HEAD)"
info "free disk: $(free_gb "$DOCKER_ROOT") GB on the Docker root ($DOCKER_ROOT), $(free_gb "$DIR") GB on the checkout"
info "databases:"
docker exec be2osm-postgres psql -U "$PG_USER" -d be2osm -X -tA -c \
    "SELECT '     ' || datname || ': ' || pg_size_pretty(pg_database_size(datname)) FROM pg_database WHERE datname IN ('be2osm', 'osmbe')"
info "be2osm schemas:"
psql_be2osm -c "SELECT '     ' || n.nspname || ': ' || pg_size_pretty(sum(pg_total_relation_size(c.oid))::bigint)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('grb', 'picc', 'urbis') AND c.relkind IN ('r', 'm') GROUP BY n.nspname ORDER BY 1"
info "largest GRB relations:"
psql_be2osm -c "SELECT '     ' || c.relname || ': ' || pg_size_pretty(pg_total_relation_size(c.oid)) FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'grb' AND c.relkind IN ('r', 'm')
    ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 5"
info "migrations: $(psql_be2osm -c "SELECT CASE WHEN to_regclass('grb.schema_migrations') IS NULL THEN 'none tracked yet'
    ELSE (SELECT string_agg(version, ', ' ORDER BY version) FROM grb.schema_migrations) END")"
info "containers:"
docker ps --filter "label=com.docker.compose.project=$PROJECT" --format '     {{.Names}}: {{.Image}} ({{.Status}})'
if [ -n "$TOKEN" ]; then
    scopes="$(curl -fsSI -H "Authorization: token $TOKEN" https://api.github.com/ | tr -d '\r' |
        sed -n 's/^x-oauth-scopes: //Ip')" || scopes="(token rejected)"
    info "GH_TOKEN scopes: ${scopes:-none listed (fine-grained token: check repository contents, actions and packages read access)}"
    case "$scopes" in *repo*) ;; *) warn "a classic token needs 'repo' (private checkout and artifacts) and 'read:packages' (images)" ;; esac
    case "$scopes" in *packages*) ;; *) [ -z "$scopes" ] || warn "no packages scope: image pulls from GHCR will fail" ;; esac
else
    warn "GH_TOKEN is not set in .env: deploys cannot fetch the private repository or pull images"
fi

# --- 2. schema snapshot ------------------------------------------------------------------------------------
say "2. Production schema snapshot"
SNAPSHOT="$OUT/be2osm-production-schema.sql"
docker exec be2osm-postgres pg_dump -U "$PG_USER" --schema-only --no-owner --no-acl be2osm | redact_schema >"$SNAPSHOT"
info "written to $SNAPSHOT (passwords redacted)."
info "Copy it to tests/db/schemas/be2osm-production.sql in the repository and commit it: the upgrade test"
info "(tests/db/cases/25-upgrade-production.sh) then migrates exactly this schema."

[ "$REPORT_ONLY" = 1 ] && {
    say "Report only: nothing was changed"
    exit 0
}

# --- 3. backup ---------------------------------------------------------------------------------------------
say "3. Backup of the grb schema"
if [ "$BACKUP" = 1 ]; then
    grb_gb="$(psql_be2osm -c "SELECT ceil(sum(pg_total_relation_size(c.oid)) / 1024.0^3) FROM pg_class c JOIN pg_namespace n
        ON n.oid = c.relnamespace WHERE n.nspname = 'grb' AND c.relkind = 'r'")"
    [ "$(free_gb "$OUT")" -gt $((grb_gb + MIN_FREE_GB)) ] || die "not enough disk for a backup of about ${grb_gb} GB"
    docker exec be2osm-postgres pg_dump -U "$PG_USER" -Fc -n grb be2osm >"$OUT/grb-$(date +%Y%m%d).dump"
    info "written to $OUT/grb-$(date +%Y%m%d).dump"
else
    info "skipped (run with --backup to keep a pg_dump of the grb schema; a new CI import can always rebuild it)"
fi

# --- 4. no running jobs ------------------------------------------------------------------------------------
say "4. Waiting for running jobs"
running_jobs() {
    {
        docker ps --format '{{.Names}}' | grep -E 'processing-run|be2osm-processing' || true
        docker top be2osm-webhook -eo args 2>/dev/null | grep -E '(restore|import|update|deploy)[-a-z]*\.sh' || true
    } | sort -u
}
while [ -n "$(running_jobs)" ]; do
    info "still running: $(running_jobs | tr '\n' ' ')"
    sleep 30
done
info "nothing is running"

# --- 5. checkout -------------------------------------------------------------------------------------------
say "5. Checkout"
OLD_HEAD="$(git rev-parse HEAD)"
git_fetch() {
    (
        if [ -n "$TOKEN" ]; then
            export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="http.https://github.com/.extraheader"
            GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)"
            export GIT_CONFIG_VALUE_0
        fi
        git fetch --quiet "https://github.com/${REPO}.git" "+refs/heads/main:refs/remotes/origin/main"
    )
}
git_fetch || die "cannot fetch main (check GH_TOKEN)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    patch="$OUT/local-changes-$(date +%Y%m%d-%H%M%S).patch"
    git diff HEAD >"$patch"
    warn "local changes saved to $patch (deploys require a clean checkout)"
fi
git reset --quiet --hard origin/main
SHA="$(git rev-parse HEAD)"
info "checkout: $OLD_HEAD -> $SHA"

# --- 6. .env -----------------------------------------------------------------------------------------------
say "6. .env"
cp .env "$OUT/env-$(date +%Y%m%d-%H%M%S).bak"
normalise_env .env "$PROJECT" "$DIR"
info "image overrides removed, COMPOSE_PROJECT_NAME=$PROJECT, COMPOSE_PROJECT_DIR=$DIR (backup in $OUT)"

# --- 7. images ---------------------------------------------------------------------------------------------
say "7. Images"
[ -z "$TOKEN" ] || printf '%s' "$TOKEN" | docker login ghcr.io -u x-access-token --password-stdin >/dev/null
for image in "${IMAGES[@]}"; do
    docker pull --quiet "$PREFIX/$image:sha-$SHA" >/dev/null ||
        die "$PREFIX/$image:sha-$SHA is not available: wait until CI has built main, then run this again"
    docker tag "$PREFIX/$image:sha-$SHA" "$PREFIX/$image:deployed"
    info "$image: sha-$SHA tagged :deployed"
done
"${COMPOSE[@]}" up -d --no-deps webhook
info "webhook recreated (job registry, scripts from the checkout)"

# --- 8. migrations -----------------------------------------------------------------------------------------
say "8. Migrations"
"${COMPOSE[@]}" run --rm -T --no-deps processing just db-migrate --status || true
if [ -z "${TMUX:-}${STY:-}" ]; then
    warn "not running in tmux/screen: if this SSH session drops, run the script again (it resumes)"
fi
view_gb="$(psql_be2osm -c "SELECT ceil(coalesce(sum(pg_total_relation_size(c.oid)), 0) / 1024.0^3) FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'grb' AND c.relname LIKE 'buildings_with_addresses%'")"
# The PICC data is copied from the old raw tables into the new ones before the old ones are dropped
picc_gb="$(psql_be2osm -c "SELECT ceil(coalesce(sum(pg_total_relation_size(c.oid)), 0) / 1024.0^3) FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'picc' AND c.relkind IN ('r', 'm')")"
need=$((view_gb * 2 + picc_gb + MIN_FREE_GB))
[ "$(free_gb "$DOCKER_ROOT")" -ge "$need" ] ||
    die "the new GRB view and PICC tables are built next to the old ones: ${need} GB free needed, $(free_gb "$DOCKER_ROOT") GB available"
info "applying every pending migration (the GRB view rebuild takes about 30 minutes, PICC a few; the old views are served meanwhile)"
"${COMPOSE[@]}" run --rm -T --no-deps processing just db-migrate

# --- 9. services -------------------------------------------------------------------------------------------
say "9. Services"
"${COMPOSE[@]}" up -d --no-deps --force-recreate grb-tiles osm-tiles picc-tiles urbis-tiles
"${COMPOSE[@]}" up -d --no-deps nuxt-app
"${COMPOSE[@]}" up -d --no-deps --force-recreate caddy
info "Martin servers, nuxt-app and Caddy recreated"

# --- 10. verify --------------------------------------------------------------------------------------------
say "10. Verify"
in_webhook() { docker exec be2osm-webhook "$@"; }
ok=1
ready=""
for _ in $(seq 1 90); do
    ready="$(in_webhook curl -fsS --max-time 5 http://nuxt-app:3000/api/health/ready 2>/dev/null || true)"
    grep -q "\"sha\":\"$SHA\"" <<<"$ready" && break
    sleep 2
done
if grep -q "\"sha\":\"$SHA\"" <<<"$ready"; then info "app ready: $ready"; else
    warn "the app does not report $SHA: ${ready:-no answer}"
    ok=0
fi
for tiles in grb-tiles osm-tiles picc-tiles urbis-tiles; do
    if catalog="$(in_webhook curl -fsS --max-time 10 "http://$tiles:3000/catalog")" && grep -q '"tiles"' <<<"$catalog"; then
        info "$tiles: $(grep -o '"[a-z_]*buildings[a-z_]*"' <<<"$catalog" | sort -u | tr '\n' ' ')"
    else
        warn "$tiles does not serve its catalog"
        ok=0
    fi
done
# Antwerp centre, EPSG:3857
# (contract: CANDIDATES_CONTRACT of app/utils/candidates.ts, checked by its unit test)
body='{"bounds":[489583,6659946,490362,6660657],"dataSource":"grb","matchMode":"geometry","contract":1}'
if diff="$(in_webhook curl -fsS --max-time 60 -H 'Content-Type: application/json' -d "$body" \
    http://nuxt-app:3000/api/buildings/difference)"; then
    info "GRB difference: $(grep -o '"stats":{[^}]*}' <<<"$diff")"
else
    warn "the GRB difference request failed"
    ok=0
fi

say "Summary"
info "checkout and images: $SHA; migrations: $(psql_be2osm -c "SELECT string_agg(version, ', ' ORDER BY version) FROM grb.schema_migrations")"
if [ "$ok" = 1 ]; then
    info "Everything answers. Last steps:"
    info "  1. enable automatic deploys:  gh variable set DEPLOY_V2 --body true -R $REPO"
    info "     (optionally APP_URL too, e.g. https://buildings.osm.be, for the public readiness check)"
    info "  2. commit $SNAPSHOT as tests/db/schemas/be2osm-production.sql"
    info "  3. run a GRB Import workflow: it restores the GBA polygons that share an OIDN with a GBG polygon"
else
    warn "Some checks failed: see docs/RUNBOOK.md (Troubleshooting). Don't set DEPLOY_V2 yet."
    exit 1
fi
