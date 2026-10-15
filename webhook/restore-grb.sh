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

gunzip -c "${DUMP_FILE}" | ${PSQL}

${PSQL} -c "ANALYZE grb.building_polygons; ANALYZE grb.buildings; ANALYZE grb.addresses; ANALYZE grb.address_building_links; ANALYZE grb.polygon_building_rel;"

echo "[restore-grb] Done."
