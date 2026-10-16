#!/bin/bash
# Restore the GRB dump of a CI import (GRB Import workflow).
#
# Current dumps hold the whole schema as grb_next: it is restored next to the live schema, checked and swapped in
# (processing/scripts/publish-schema.sh), then the GRB tile server is recreated so its tile cache does not serve
# the previous data. Tiles and the difference API keep serving the previous data until the swap.
#
# Data-only dumps of the previous workflow (artifacts are kept 7 days) are still restored the old way: empty the
# tables, migrate, load, refresh the view. GRB data is missing from tiles and diffs until that has finished.
set -euo pipefail

RUN_ID="${1:?Usage: restore-grb.sh <run_id> <repo>}"
REPO="${2:?Usage: restore-grb.sh <run_id> <repo>}"
DIR="${COMPOSE_PROJECT_DIR:?}"

WORK_DIR="/tmp/grb-restore"
trap 'rm -rf "${WORK_DIR}"' EXIT
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"

echo "[restore-grb] Downloading artifact from run ${RUN_ID} (${REPO})..."
gh run download "${RUN_ID}" -R "${REPO}" -n be2osm-dump -D "${WORK_DIR}"
DUMP_FILE="${WORK_DIR}/be2osm.sql.gz"
[ -f "${DUMP_FILE}" ] || {
    echo "[restore-grb] ERROR: dump file not found at ${DUMP_FILE}" >&2
    exit 1
}

export PGHOST="${POSTGRES_HOST}" PGPORT="${POSTGRES_PORT}" PGUSER="${POSTGRES_USER}" PGPASSWORD="${POSTGRES_PASSWORD}"
export PGDATABASE=be2osm
PSQL="psql -X -v ON_ERROR_STOP=1"

gunzip -t "${DUMP_FILE}" || {
    echo "[restore-grb] ERROR: ${DUMP_FILE} is not a valid gzip file" >&2
    exit 1
}

# (no pipefail here: grep -q stops reading early)
if (set +o pipefail; gunzip -c "${DUMP_FILE}" | head -c 2000000 | grep -q '^CREATE SCHEMA grb_next;'); then
    # The restored schema needs about as much disk as the live one, plus the unpacked dump
    live_kb=$(psql -X -tAq -c "SELECT (coalesce(sum(pg_total_relation_size(c.oid)), 0) / 1024)::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'grb'")
    dump_kb=$(($(stat -c %s "${DUMP_FILE}") / 1024))
    free_kb=$(df -Pk "${DIR}" | awk 'NR == 2 { print $4 }')
    need_kb=$((live_kb * 13 / 10 + dump_kb * 5 + 2 * 1024 * 1024))
    if [ "${free_kb}" -lt "${need_kb}" ]; then
        echo "[restore-grb] ERROR: $((free_kb / 1024)) MB free, about $((need_kb / 1024)) MB needed" >&2
        exit 1
    fi

    bash "${DIR}/processing/scripts/publish-schema.sh" grb "${DUMP_FILE}"

    if [ "${RESTART_TILES:-1}" = 1 ]; then
        docker compose -f "${DIR}/docker-compose.yml" --env-file "${DIR}/.env" \
            --project-name "${COMPOSE_PROJECT_NAME:-building-import-tool-local}" --project-directory "${DIR}" \
            up -d --no-deps --force-recreate grb-tiles
    fi
    echo "[restore-grb] Done."
    exit 0
fi

echo "[restore-grb] Data-only dump (previous import workflow): restoring in place..."

# Empty every GRB table the dump fills (import_meta included: it holds the dump's import time). The migration
# tracking table is not in the dump and stays.
${PSQL} -q <<'SQL'
DO $$
BEGIN
    EXECUTE (
        SELECT 'TRUNCATE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE'
        FROM pg_tables WHERE schemaname = 'grb' AND tablename <> 'schema_migrations'
    );
END $$;
SQL

# Bring the schema up to date: the data-only dump COPYs the columns of the current schema (e.g.
# building_polygons.entity). On the emptied tables even heavy migrations are instant.
bash "${DIR}/processing/sql/migrate.sh"

gunzip -c "${DUMP_FILE}" | ${PSQL} -q

${PSQL} -c "ANALYZE grb.building_polygons, grb.buildings, grb.addresses, grb.address_building_links, grb.polygon_building_rel, grb.kunstwerken;"

# The data-only dump carries no materialized view data: rebuild it from the restored tables (tiles + addresses).
# CONCURRENTLY keeps the previous contents readable while it runs (20-30 min for the full dataset).
echo "[restore-grb] Refreshing grb.buildings_with_addresses..."
${PSQL} -c "REFRESH MATERIALIZED VIEW CONCURRENTLY grb.buildings_with_addresses;"

echo "[restore-grb] Done."
