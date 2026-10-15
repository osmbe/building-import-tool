#!/bin/bash
set -euo pipefail

RUN_ID="${1:?Usage: restore-grb.sh <run_id> <repo>}"
REPO="${2:?Usage: restore-grb.sh <run_id> <repo>}"

WORK_DIR="/tmp/grb-restore"
trap "rm -rf ${WORK_DIR}" EXIT

echo "[restore-grb] Downloading artifact from run ${RUN_ID} (${REPO})..."
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"

gh run download "${RUN_ID}" -R "${REPO}" -n be2osm-dump -D "${WORK_DIR}"

DUMP_FILE="${WORK_DIR}/be2osm.sql.gz"
if [ ! -f "${DUMP_FILE}" ]; then
    echo "[restore-grb] ERROR: dump file not found at ${DUMP_FILE}" >&2
    exit 1
fi

echo "[restore-grb] Restoring to be2osm database..."

PSQL="psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d be2osm"
export PGPASSWORD="${POSTGRES_PASSWORD}"

# import_meta may not exist yet on older deployments; the data-only dump COPYs into it
${PSQL} -c "CREATE TABLE IF NOT EXISTS grb.import_meta (imported_at TIMESTAMPTZ NOT NULL);" || true
${PSQL} -c "TRUNCATE grb.import_meta;" || true
${PSQL} -c "TRUNCATE grb.building_polygons, grb.buildings, grb.addresses, grb.address_building_links, grb.polygon_building_rel RESTART IDENTITY CASCADE;" || true

# Bring the schema up to date before restoring: the data-only dump COPYs columns of the current schema
# (e.g. building_polygons.entity) and refreshes the materialized view. On the emptied tables this is instant.
for MIGRATION in $(ls "${COMPOSE_PROJECT_DIR}"/processing/sql/migrations/*.sql 2>/dev/null | sort); do
    echo "[restore-grb] Applying migration $(basename "${MIGRATION}")..."
    ${PSQL} -q -v ON_ERROR_STOP=1 -f "${MIGRATION}"
done

gunzip -c "${DUMP_FILE}" | ${PSQL}

${PSQL} -c "ANALYZE grb.building_polygons; ANALYZE grb.buildings; ANALYZE grb.addresses; ANALYZE grb.address_building_links; ANALYZE grb.polygon_building_rel;"

# The data-only dump carries no materialized view data: rebuild it from the restored tables (tiles + addresses).
# CONCURRENTLY keeps the previous contents readable while it runs (20-30 min for the full dataset).
echo "[restore-grb] Refreshing grb.buildings_with_addresses..."
${PSQL} -v ON_ERROR_STOP=1 -c "REFRESH MATERIALIZED VIEW CONCURRENTLY grb.buildings_with_addresses;"

echo "[restore-grb] Done."
