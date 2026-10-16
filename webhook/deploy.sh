#!/bin/bash
# Deploy a commit of main on the server: checkout, images, migrations, Martin, Caddy, the app and the webhook.
#
#   deploy.sh [<sha>]     (default: the head of main)
#
# Run by the webhook (POST /deploy, from the CI deploy job) under the global job lock, so it never overlaps
# a restore, import or update. Steps:
#   1. preflight: no image overrides in .env, free disk, database up, no local changes in the checkout
#   2. fetch main and check that <sha> is on it
#   3. pull the sha-<sha> images and tag them :deployed (the previous ones are kept as :previous)
#   4. reset the checkout to <sha> (as the owner of the checkout)
#   5. db-migrate --deploy (refuses heavy migrations: see docs/RUNBOOK.md)
#   6. recreate the Martin servers and Caddy whose config changed
#   7. recreate nuxt-app and wait until /api/health/ready reports <sha>
#   8. recreate the webhook itself if its image or the compose file changed, from a detached helper
# When step 5 or 7 fails, the checkout and the image tags go back to the previous release (migrations are
# expand-only, so the previous release works on the migrated schema) and the deploy fails.
set -euo pipefail

DIR="${COMPOSE_PROJECT_DIR:?COMPOSE_PROJECT_DIR is not set}"
PROJECT="${COMPOSE_PROJECT_NAME:-building-import-tool-local}"
REPO="${GH_REPO:-osmbe/building-import-tool}"
BRANCH="${DEPLOY_BRANCH:-main}"
GIT_URL="${DEPLOY_GIT_URL:-https://github.com/${REPO}.git}"
PREFIX="${IMAGE_PREFIX:-ghcr.io/${REPO,,}}"
IMAGES=(nuxt-app processing webhook)
MIN_FREE_GB="${DEPLOY_MIN_FREE_GB:-5}"
READY_URL="${DEPLOY_READY_URL:-http://nuxt-app:3000/api/health/ready}"
READY_TIMEOUT="${DEPLOY_READY_TIMEOUT:-180}"

COMPOSE=(docker compose -f "${DIR}/docker-compose.yml" --env-file "${DIR}/.env" --project-name "${PROJECT}"
    --project-directory "${DIR}")
# Martin service -> its config file
declare -A MARTIN=(
    [grb-tiles]=config/martin/grb-config.yaml
    [osm-tiles]=config/martin/osm-config.yaml
    [picc-tiles]=config/martin/picc-config.yaml
    [urbis-tiles]=config/martin/urbis-config.yaml
)

log() { echo "[deploy] $*"; }
die() {
    echo "[deploy] ERROR: $*" >&2
    exit 1
}

# git as the owner of the checkout, so the files keep their owner
OWNER="$(stat -c '%u:%g' "${DIR}")"
git_owner() { setpriv --reuid="${OWNER%:*}" --regid="${OWNER#*:}" --clear-groups env HOME=/tmp git -C "${DIR}" "$@"; }

# git fetch with the token in an environment-only config entry: never in argv or .git/config
git_fetch() {
    (
        if [ -n "${GH_TOKEN:-}" ]; then
            export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="http.https://github.com/.extraheader"
            GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "${GH_TOKEN}" | base64 -w0)"
            export GIT_CONFIG_VALUE_0
        fi
        git_owner fetch --quiet "${GIT_URL}" "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}"
    )
}

image_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null || true; }

# --- 1. preflight -----------------------------------------------------------------------------------------
log "preflight"
if grep -Eq '^[[:space:]]*(NUXT|PROCESSING|WEBHOOK)_IMAGE=' "${DIR}/.env" 2>/dev/null; then
    die ".env overrides NUXT_IMAGE/PROCESSING_IMAGE/WEBHOOK_IMAGE: remove them, deploys pin the :deployed tags"
fi
free_kb="$(df -Pk "${DIR}" | awk 'NR == 2 { print $4 }')"
[ "${free_kb}" -ge $((MIN_FREE_GB * 1024 * 1024)) ] ||
    die "only $((free_kb / 1024 / 1024)) GB free on the server disk, ${MIN_FREE_GB} GB needed"
pg_isready -q -h "${POSTGRES_HOST:-postgres}" -p "${POSTGRES_PORT:-5432}" || die "the database is not reachable"
[ -z "$(git_owner status --porcelain --untracked-files=no)" ] ||
    die "the checkout has local changes (git -C ${DIR} status): commit them to the repository or discard them"

# --- 2. which commit --------------------------------------------------------------------------------------
git_fetch || die "cannot fetch ${BRANCH}"
TARGET="${1:-origin/${BRANCH}}"
SHA="$(git_owner rev-parse --verify --quiet "${TARGET}^{commit}")" || die "unknown commit ${TARGET}"
git_owner merge-base --is-ancestor "${SHA}" "origin/${BRANCH}" || die "${SHA} is not on ${BRANCH}"
OLD="$(git_owner rev-parse HEAD)"
CHANGED="$(git_owner diff --name-only "${OLD}" "${SHA}")"
changed() { grep -qxF "$1" <<<"${CHANGED}"; }
log "deploying ${SHA} (running: ${OLD})"

# --- 3. images --------------------------------------------------------------------------------------------
TOKEN="${GH_TOKEN:-$(gh auth token 2>/dev/null || true)}"
if [ -n "${TOKEN}" ]; then
    printf '%s' "${TOKEN}" | docker login ghcr.io -u x-access-token --password-stdin >/dev/null
fi
declare -A PREVIOUS
for image in "${IMAGES[@]}"; do
    docker pull --quiet "${PREFIX}/${image}:sha-${SHA}" >/dev/null || die "image ${image}:sha-${SHA} is not available"
done
for image in "${IMAGES[@]}"; do
    PREVIOUS[${image}]="$(image_id "${PREFIX}/${image}:deployed")"
    [ -z "${PREVIOUS[${image}]}" ] || docker tag "${PREFIX}/${image}:deployed" "${PREFIX}/${image}:previous"
    docker tag "${PREFIX}/${image}:sha-${SHA}" "${PREFIX}/${image}:deployed"
done

RECREATED=()
rollback() {
    log "rolling back to ${OLD}"
    for image in "${IMAGES[@]}"; do
        [ -z "${PREVIOUS[${image}]}" ] || docker tag "${PREFIX}/${image}:previous" "${PREFIX}/${image}:deployed"
    done
    git_owner reset --quiet --hard "${OLD}"
    for service in "${RECREATED[@]}"; do
        "${COMPOSE[@]}" up -d --no-deps --force-recreate "${service}"
    done
    "${COMPOSE[@]}" up -d --no-deps nuxt-app
}

# --- 4. checkout ------------------------------------------------------------------------------------------
git_owner reset --quiet --hard "${SHA}"

# --- 5. migrations ----------------------------------------------------------------------------------------
log "migrations"
if ! "${COMPOSE[@]}" run --rm -T --no-deps processing just db-migrate --deploy; then
    rollback
    die "migrations failed"
fi

# --- 6. Martin and Caddy ----------------------------------------------------------------------------------
# Their config files are single-file bind mounts: the container keeps the old file until it is recreated
for service in "${!MARTIN[@]}"; do
    if changed "${MARTIN[${service}]}" || changed docker-compose.yml; then
        log "recreating ${service}"
        RECREATED+=("${service}")
        "${COMPOSE[@]}" up -d --no-deps --force-recreate "${service}"
    fi
done
if changed caddy/Caddyfile || changed docker-compose.yml; then
    log "recreating caddy"
    RECREATED+=(caddy)
    "${COMPOSE[@]}" up -d --no-deps --force-recreate caddy
fi

# --- 7. app and readiness ---------------------------------------------------------------------------------
log "recreating nuxt-app"
"${COMPOSE[@]}" up -d --no-deps nuxt-app
ready=""
for _ in $(seq 1 "${READY_TIMEOUT}"); do
    if body="$(curl -fsS --max-time 5 "${READY_URL}" 2>/dev/null)" &&
        python3 -c 'import json,sys; r=json.loads(sys.argv[1]); sys.exit(0 if r.get("ready") and r.get("sha") == sys.argv[2] else 1)' \
            "${body}" "${SHA}"; then
        ready=1
        break
    fi
    sleep 1
done
if [ -z "${ready}" ]; then
    log "last readiness answer: ${body:-none}"
    rollback
    die "the app did not report ready on ${SHA} within ${READY_TIMEOUT}s"
fi
log "the app is ready on ${SHA}"

# --- 8. the webhook itself --------------------------------------------------------------------------------
# Recreating it kills this script, so a detached container does it once this job has finished
if [ "$(image_id "${PREFIX}/webhook:deployed")" != "${PREVIOUS[webhook]}" ] || changed docker-compose.yml; then
    log "the webhook will be recreated in a few seconds"
    docker rm -f be2osm-webhook-recreate >/dev/null 2>&1 || true
    docker run -d --rm --name be2osm-webhook-recreate \
        -v /var/run/docker.sock:/var/run/docker.sock -v "${DIR}:${DIR}:ro" \
        --entrypoint sh "${PREFIX}/webhook:deployed" \
        -c "sleep 5; $(printf '%q ' "${COMPOSE[@]}") up -d --no-deps webhook" >/dev/null
fi

log "done: ${SHA}"
