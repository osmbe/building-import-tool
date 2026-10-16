#!/bin/bash
# Restore the Urbis dump of a CI import (Urbis Import workflow): it is restored as urbis_next next to the live
# schema, checked and swapped in (processing/scripts/publish-schema.sh), then the Urbis tile server is
# recreated so its tile cache does not serve the previous data.
set -euo pipefail

RUN_ID="${1:?Usage: restore-urbis.sh <run_id> <repo>}"
REPO="${2:?Usage: restore-urbis.sh <run_id> <repo>}"
DIR="${COMPOSE_PROJECT_DIR:?}"

WORK_DIR="/tmp/urbis-restore"
trap 'rm -rf "${WORK_DIR}"' EXIT
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"

echo "[restore-urbis] Downloading artifact from run ${RUN_ID} (${REPO})..."
gh run download "${RUN_ID}" -R "${REPO}" -n urbis-dump -D "${WORK_DIR}"
DUMP_FILE="${WORK_DIR}/urbis.sql.gz"
[ -f "${DUMP_FILE}" ] || {
    echo "[restore-urbis] ERROR: dump file not found at ${DUMP_FILE}" >&2
    exit 1
}

export PGHOST="${POSTGRES_HOST}" PGPORT="${POSTGRES_PORT}" PGUSER="${POSTGRES_USER}" PGPASSWORD="${POSTGRES_PASSWORD}"
export PGDATABASE=be2osm

# The restored schema needs about as much disk as the live one, plus the unpacked dump
live_kb=$(psql -X -tAq -c "SELECT (coalesce(sum(pg_total_relation_size(c.oid)), 0) / 1024)::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'urbis'")
dump_kb=$(($(stat -c %s "${DUMP_FILE}") / 1024))
free_kb=$(df -Pk "${DIR}" | awk 'NR == 2 { print $4 }')
need_kb=$((live_kb * 13 / 10 + dump_kb * 5 + 2 * 1024 * 1024))
if [ "${free_kb}" -lt "${need_kb}" ]; then
    echo "[restore-urbis] ERROR: $((free_kb / 1024)) MB free, about $((need_kb / 1024)) MB needed" >&2
    exit 1
fi

bash "${DIR}/processing/scripts/publish-schema.sh" urbis "${DUMP_FILE}"

if [ "${RESTART_TILES:-1}" = 1 ]; then
    docker compose -f "${DIR}/docker-compose.yml" --env-file "${DIR}/.env" \
        --project-name "${COMPOSE_PROJECT_NAME:-building-import-tool-local}" --project-directory "${DIR}" \
        up -d --no-deps --force-recreate urbis-tiles
fi
echo "[restore-urbis] Done."
